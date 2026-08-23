import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  AttachmentSchema,
  ExecutionProfileSchema,
  ReasoningEffortSchema,
  type Attachment,
  type Message,
  type TemporaryFileAttachment,
} from "../shared/protocol.js";
import { APP_VERSION } from "../shared/version.js";
import type { CoordinatorStore } from "./store.js";

const MAX_OUTSTANDING_REQUESTS = 3;

const response = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent:
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : { value },
});

const waitForMessages = async (
  store: CoordinatorStore,
  agentId: string,
  afterCursor: number,
  timeoutMs: number,
) => {
  const deadline = Date.now() + timeoutMs;
  let messages = store.listMessages(agentId, afterCursor);
  while (messages.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    messages = store.listMessages(agentId, afterCursor);
  }
  return messages;
};

const ensureQueueCapacity = (
  store: CoordinatorStore,
  agentId: string,
): void => {
  const outstanding = store.countOutstandingRequests(agentId);
  if (outstanding >= MAX_OUTSTANDING_REQUESTS) {
    throw new Error(
      `Agent ${agentId} already has ${outstanding} unfinished requests; wait for a result`,
    );
  }
};

const validateTemporaryAttachments = (
  store: CoordinatorStore,
  callerAgentId: string,
  recipientAgentId: string,
  attachments: Attachment[],
): void => {
  const temporaryAttachments = attachments.filter(
    (attachment): attachment is TemporaryFileAttachment =>
      attachment.type === "temporary_file",
  );
  store.assertTemporaryAttachments(
    callerAgentId,
    recipientAgentId,
    temporaryAttachments,
  );
};

// @spec spec://modules/coordinator/FEAT-002-task-coordination#execution-profile-selection
const modelSelectionSchema = {
  model: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  executionProfile: ExecutionProfileSchema.optional(),
  selectionReason: z.string().trim().min(1).max(500).optional(),
};

const idempotencySchema = {
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
};

// @spec spec://modules/coordinator/FEAT-002-task-coordination#followup-serialization
const queueRequest = (
  store: CoordinatorStore,
  recipientAgentId: string,
  input: Parameters<CoordinatorStore["createMessage"]>[0],
): Message => {
  if (
    !input.idempotencyKey ||
    !store.findMessageByIdempotency(input.fromAgentId, input.idempotencyKey)
  ) {
    ensureQueueCapacity(store, recipientAgentId);
  }
  return store.createMessage(input);
};

export const createMcpServer = (
  store: CoordinatorStore,
  callerAgentId: string,
): McpServer => {
  const server = new McpServer({
    name: "agent-operator",
    version: APP_VERSION,
  });

  server.registerTool(
    "agents_list",
    {
      title: "List worker agents",
      description:
        "List registered Codex worker agents and their current availability.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => Promise.resolve(response({ agents: store.listAgents() })),
  );

  server.registerTool(
    "agent_status",
    {
      title: "Get agent status",
      description: "Get the current status and safe activity summary of one agent.",
      inputSchema: { agentId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ agentId }) => {
      const agent = store.getAgent(agentId);
      if (!agent) throw new Error(`Unknown agent: ${agentId}`);
      return Promise.resolve(response(agent));
    },
  );

  server.registerTool(
    "agent_projects",
    {
      title: "List agent projects",
      description:
        "List stable project descriptors published by a selected worker. Local paths are not exposed.",
      inputSchema: { agentId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ agentId }) =>
      Promise.resolve(
        response({ agentId, projects: store.listProjects(agentId) }),
      ),
  );

  server.registerTool(
    "agent_start",
    {
      title: "Start a task on an agent",
      description:
        "Queue a fresh Codex task in a selected local project on another agent. Attachments may reference committed Git files or temporary uploaded files.",
      inputSchema: {
        agentId: z.string().min(1),
        projectId: z.string().min(1),
        message: z.string().min(1),
        attachments: z.array(AttachmentSchema).max(20).default([]),
        ...modelSelectionSchema,
        ...idempotencySchema,
      },
    },
    ({
      agentId,
      projectId,
      message,
      attachments,
      model,
      reasoningEffort,
      executionProfile,
      selectionReason,
      idempotencyKey,
    }) => {
      if (!store.getAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
      const project = store
        .listProjects(agentId)
        .find((candidate) => candidate.id === projectId && candidate.available);
      if (!project) throw new Error(`Unavailable project: ${projectId}`);
      validateTemporaryAttachments(
        store,
        callerAgentId,
        agentId,
        attachments,
      );
      const queued = queueRequest(store, agentId, {
        kind: "start",
        fromAgentId: callerAgentId,
        toAgentId: agentId,
        projectId,
        text: message,
        attachments,
        model,
        reasoningEffort,
        executionProfile,
        selectionReason,
        idempotencyKey,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_models",
    {
      title: "List models available on an agent",
      description:
        "Queue bounded local discovery of the Codex models and reasoning effort levels available on a selected agent. Read the result through agent_wait.",
      inputSchema: {
        agentId: z.string().min(1),
        ...idempotencySchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ agentId, idempotencyKey }) => {
      if (!store.getAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
      const queued = queueRequest(store, agentId, {
        kind: "models_query",
        fromAgentId: callerAgentId,
        toAgentId: agentId,
        text: "{}",
        idempotencyKey,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_threads",
    {
      title: "Find tasks on an agent",
      description:
        "Queue a bounded search of recent local Codex tasks by title. The worker reads only the Codex state database and returns up to 20 path-free summaries through agent_wait.",
      inputSchema: {
        agentId: z.string().min(1),
        query: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(20).default(10),
        ...idempotencySchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ agentId, query, limit, idempotencyKey }) => {
      if (!store.getAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
      const queued = queueRequest(store, agentId, {
        kind: "threads_query",
        fromAgentId: callerAgentId,
        toAgentId: agentId,
        text: JSON.stringify({ query, limit }),
        idempotencyKey,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_thread_send",
    {
      title: "Send a message to an existing task",
      description:
        "Queue a new turn in an existing local Codex task by its exact thread ID. A published project is not required. Temporary uploaded files may be attached.",
      inputSchema: {
        agentId: z.string().min(1),
        threadId: z.uuid(),
        message: z.string().min(1),
        attachments: z.array(AttachmentSchema).max(20).default([]),
        ...modelSelectionSchema,
        ...idempotencySchema,
      },
    },
    ({
      agentId,
      threadId,
      message,
      attachments,
      model,
      reasoningEffort,
      executionProfile,
      selectionReason,
      idempotencyKey,
    }) => {
      if (!store.getAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
      validateTemporaryAttachments(
        store,
        callerAgentId,
        agentId,
        attachments,
      );
      const queued = queueRequest(store, agentId, {
        kind: "thread_send",
        fromAgentId: callerAgentId,
        toAgentId: agentId,
        targetThreadId: threadId,
        text: message,
        attachments,
        model,
        reasoningEffort,
        executionProfile,
        selectionReason,
        idempotencyKey,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_send",
    {
      title: "Send a related message",
      description:
        "Send a clarification or follow-up to the Codex task related to a previous message. Attachments may reference committed Git files or temporary uploaded files.",
      inputSchema: {
        replyTo: z.uuid(),
        message: z.string().min(1),
        attachments: z.array(AttachmentSchema).max(20).default([]),
        ...modelSelectionSchema,
        ...idempotencySchema,
      },
    },
    ({
      replyTo,
      message,
      attachments,
      model,
      reasoningEffort,
      executionProfile,
      selectionReason,
      idempotencyKey,
    }) => {
      const previous = store.getMessage(replyTo);
      if (
        previous.fromAgentId !== callerAgentId &&
        previous.toAgentId !== callerAgentId
      ) {
        throw new Error("The referenced message does not belong to this agent");
      }
      const toAgentId =
        previous.fromAgentId === callerAgentId
          ? previous.toAgentId
          : previous.fromAgentId;
      validateTemporaryAttachments(
        store,
        callerAgentId,
        toAgentId,
        attachments,
      );
      const queued = queueRequest(store, toAgentId, {
        kind: "send",
        fromAgentId: callerAgentId,
        toAgentId,
        rootMessageId: previous.rootMessageId,
        replyTo,
        projectId: previous.projectId,
        targetThreadId: previous.targetThreadId,
        text: message,
        attachments,
        model,
        reasoningEffort,
        executionProfile,
        selectionReason,
        idempotencyKey,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_cancel",
    {
      title: "Cancel an agent task",
      description:
        "Cancel a queued or running task previously requested by this agent. A running Desktop turn is interrupted by its worker.",
      inputSchema: {
        messageId: z.uuid(),
      },
    },
    ({ messageId }) =>
      Promise.resolve(response(store.cancelRequest(messageId, callerAgentId))),
  );

  server.registerTool(
    "agent_wait",
    {
      title: "Wait for agent updates",
      description:
        "Wait for results or related messages addressed to this agent after an opaque numeric cursor.",
      inputSchema: {
        afterCursor: z.number().int().nonnegative().default(0),
        timeoutMs: z.number().int().min(0).max(30_000).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ afterCursor, timeoutMs }) => {
      const messages = await waitForMessages(
        store,
        callerAgentId,
        afterCursor,
        timeoutMs,
      );
      return response({
        messages,
        nextCursor:
          messages.length > 0
            ? Math.max(...messages.map((message) => message.cursor))
            : afterCursor,
      });
    },
  );

  return server;
};
