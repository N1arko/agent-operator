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
        "agent_threads",
        "agent_thread_send",
        "agent_send",
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
});
