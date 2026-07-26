import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { CoordinatorStore } from "./store.js";

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

export const createMcpServer = (
  store: CoordinatorStore,
  callerAgentId: string,
): McpServer => {
  const server = new McpServer({
    name: "agent-operator",
    version: "0.1.0",
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
        "Queue a fresh Codex task in a selected local project on another agent.",
      inputSchema: {
        agentId: z.string().min(1),
        projectId: z.string().min(1),
        message: z.string().min(1),
      },
    },
    ({ agentId, projectId, message }) => {
      if (!store.getAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
      const project = store
        .listProjects(agentId)
        .find((candidate) => candidate.id === projectId && candidate.available);
      if (!project) throw new Error(`Unavailable project: ${projectId}`);
      const queued = store.createMessage({
        kind: "start",
        fromAgentId: callerAgentId,
        toAgentId: agentId,
        projectId,
        text: message,
      });
      return Promise.resolve(response(queued));
    },
  );

  server.registerTool(
    "agent_send",
    {
      title: "Send a related message",
      description:
        "Send a clarification or follow-up to the Codex task related to a previous message.",
      inputSchema: {
        replyTo: z.uuid(),
        message: z.string().min(1),
      },
    },
    ({ replyTo, message }) => {
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
      const queued = store.createMessage({
        kind: "send",
        fromAgentId: callerAgentId,
        toAgentId,
        rootMessageId: previous.rootMessageId,
        replyTo,
        projectId: previous.projectId,
        text: message,
      });
      return Promise.resolve(response(queued));
    },
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
