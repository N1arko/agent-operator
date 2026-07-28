import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createMcpServer } from "../src/coordinator/mcp.js";

const stores: CoordinatorStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("Agent Operator MCP", () => {
  it("starts work and returns its result through the caller cursor", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("mac", {
      name: "Mac Codex",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [
        { id: "project-a", name: "Project A", tags: [], available: true },
      ],
      workerVersion: "0.1.0",
    });

    const server = createMcpServer(store, "windows");
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      [
        "agents_list",
        "agent_status",
        "agent_projects",
        "agent_start",
        "agent_models",
        "agent_threads",
        "agent_thread_send",
        "agent_send",
        "agent_cancel",
        "agent_wait",
      ],
    );

    const call = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "project-a",
        message: "Plan this",
      },
    });
    const start = call.structuredContent as {
      id: string;
      rootMessageId: string;
    };
    assert.equal(start.rootMessageId, start.id);

    const threadSearch = await client.callTool({
      name: "agent_threads",
      arguments: { agentId: "mac", query: "planning", limit: 5 },
    });
    const searchMessage = threadSearch.structuredContent as {
      kind: string;
      text: string;
    };
    assert.equal(searchMessage.kind, "threads_query");
    assert.deepEqual(JSON.parse(searchMessage.text), {
      query: "planning",
      limit: 5,
    });

    const threadSend = await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
        message: "Continue",
      },
    });
    assert.equal(
      (
        threadSend.structuredContent as {
          targetThreadId: string;
        }
      ).targetThreadId,
      "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
    );

    const blocked = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "project-a",
        message: "Fourth unfinished request",
      },
    });
    assert.equal(blocked.isError, true);
    const blockedContent = blocked.content as Array<{ text: string }>;
    assert.match(
      blockedContent[0]?.text ?? "",
      /already has 3 unfinished requests/,
    );

    store.createMessage({
      kind: "result",
      fromAgentId: "mac",
      toAgentId: "windows",
      rootMessageId: start.id,
      replyTo: start.id,
      text: "Ready",
      status: "completed",
    });
    const waited = await client.callTool({
      name: "agent_wait",
      arguments: { afterCursor: 0, timeoutMs: 0 },
    });
    const output = waited.structuredContent as {
      messages: Array<{ text: string }>;
    };
    assert.equal(output.messages[0]?.text, "Ready");

    await client.close();
    await server.close();
  });

  it("rejects temporary attachment metadata that was not uploaded for the route", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("mac", {
      name: "Mac Codex",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [
        { id: "project-a", name: "Project A", tags: [], available: true },
      ],
      workerVersion: "0.1.0",
    });
    const server = createMcpServer(store, "windows");
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const call = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "project-a",
        message: "Read the file",
        attachments: [
          {
            type: "temporary_file",
            fileId: "019fa0b8-1abc-73f0-8126-3f8b6d64466c",
            name: "draft.docx",
            size: 12,
            sha256:
              "c".repeat(64),
            expiresAt: "2026-07-28T12:00:00.000Z",
          },
        ],
      },
    });
    assert.equal(call.isError, true);
    const content = call.content as Array<{ text: string }>;
    assert.match(content[0]?.text ?? "", /Unknown temporary file/);
    assert.equal(store.countOutstandingRequests("mac"), 0);

    await client.close();
    await server.close();
  });

  it("preserves model selection and exposes explicit cancellation", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("mac", {
      name: "Mac Codex",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [
        { id: "project-a", name: "Project A", tags: [], available: true },
      ],
      workerVersion: "0.1.15",
    });
    const server = createMcpServer(store, "windows");
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const started = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "project-a",
        message: "Use selected settings",
        model: "gpt-test",
        reasoningEffort: "high",
      },
    });
    const message = started.structuredContent as {
      id: string;
      model: string;
      reasoningEffort: string;
      leaseExpiresAt: string;
    };
    assert.equal(message.model, "gpt-test");
    assert.equal(message.reasoningEffort, "high");
    assert.ok(Date.parse(message.leaseExpiresAt) > Date.now());

    const cancelled = await client.callTool({
      name: "agent_cancel",
      arguments: { messageId: message.id },
    });
    const cancellation = cancelled.structuredContent as {
      request: { status: string };
      result: { status: string };
      cancellation: { kind: string };
    };
    assert.equal(cancellation.request.status, "cancelled");
    assert.equal(cancellation.result.status, "cancelled");
    assert.equal(cancellation.cancellation.kind, "cancel");

    await client.close();
    await server.close();
  });
});
