import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { CoordinatorStore } from "../src/coordinator/store.js";

const stores: CoordinatorStore[] = [];
const createStore = (): CoordinatorStore => {
  const store = new CoordinatorStore(":memory:");
  stores.push(store);
  return store;
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("CoordinatorStore", () => {
  it("publishes agent presence and path-free projects", () => {
    const store = createStore();
    store.heartbeat("mac", {
      name: "Mac Codex",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [
        { id: "agent-operator", name: "Agent Operator", tags: ["code"], available: true },
      ],
      workerVersion: "0.1.0",
    });

    assert.equal(store.listAgents()[0]?.id, "mac");
    assert.deepEqual(store.listProjects("mac"), [
      {
        id: "agent-operator",
        name: "Agent Operator",
        tags: ["code"],
        available: true,
      },
    ]);
    assert.equal(JSON.stringify(store.listProjects("mac")).includes("/Users"), false);
  });

  it("keeps a durable cursor and reply chain", () => {
    const store = createStore();
    const start = store.createMessage({
      kind: "start",
      fromAgentId: "windows",
      toAgentId: "mac",
      projectId: "agent-operator",
      text: "Inspect the project",
    });
    const result = store.createMessage({
      kind: "result",
      fromAgentId: "mac",
      toAgentId: "windows",
      rootMessageId: start.rootMessageId,
      replyTo: start.id,
      text: "Done",
      status: "completed",
    });

    assert.equal(store.listMessages("mac", 0)[0]?.id, start.id);
    assert.equal(store.listMessages("windows", 0)[0]?.id, result.id);
    assert.equal(result.rootMessageId, start.id);
    assert.ok(result.cursor > start.cursor);
  });

  it("delivers only queued worker messages and completes each request once", () => {
    const store = createStore();
    const start = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "local-project",
      text: "Inspect",
    });

    assert.deepEqual(
      store.listQueuedMessages("windows", 0).map((message) => message.id),
      [start.id],
    );
    store.acknowledge(start.id);
    assert.deepEqual(store.listQueuedMessages("windows", 0), []);
    assert.equal(store.listMessages("windows", 0)[0]?.status, "delivered");
    assert.equal(store.countOutstandingRequests("windows"), 1);

    const result = store.createMessage({
      kind: "result",
      fromAgentId: "windows",
      toAgentId: "mac",
      rootMessageId: start.rootMessageId,
      replyTo: start.id,
      text: "Done",
      status: "completed",
    });
    store.completeMessage(start.id, "completed");

    assert.equal(store.findResult("windows", start.id)?.id, result.id);
    assert.equal(store.getMessage(start.id).status, "completed");
    assert.equal(store.countOutstandingRequests("windows"), 0);
    assert.deepEqual(store.listQueuedMessages("windows", 0), []);
  });

  it("stores an exact target thread for projectless work", () => {
    const store = createStore();
    const message = store.createMessage({
      kind: "thread_send",
      fromAgentId: "mac",
      toAgentId: "windows",
      targetThreadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
      text: "Continue this task",
    });

    assert.equal(
      message.targetThreadId,
      "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
    );
    assert.equal(message.projectId, null);
  });

  it("expires abandoned requests and publishes one failed result", () => {
    const store = createStore();
    const request = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "local-project",
      text: "Long task",
      leaseExpiresAt: "2000-01-01T00:00:00.000Z",
    });

    const expired = store.expireRequests();
    const replay = store.expireRequests();

    assert.equal(expired.length, 1);
    assert.equal(replay.length, 0);
    assert.equal(store.getMessage(request.id).status, "failed");
    const result = expired[0];
    assert.ok(result);
    assert.equal(result.replyTo, request.id);
    assert.match(result.text, /lease expired/);
    assert.equal(store.countOutstandingRequests("windows"), 0);
  });

  it("cancels a delivered task idempotently and queues a worker interrupt", () => {
    const store = createStore();
    const request = store.createMessage({
      kind: "thread_send",
      fromAgentId: "mac",
      toAgentId: "windows",
      targetThreadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
      text: "Run until cancelled",
    });
    store.acknowledge(request.id);

    const cancelled = store.cancelRequest(request.id, "mac");
    const replay = store.cancelRequest(request.id, "mac");

    assert.equal(cancelled.request.status, "cancelled");
    assert.equal(cancelled.result.status, "cancelled");
    assert.ok(cancelled.cancellation);
    assert.equal(cancelled.cancellation.kind, "cancel");
    assert.equal(cancelled.cancellation.replyTo, request.id);
    assert.equal(replay.result.id, cancelled.result.id);
    assert.equal(replay.cancellation, null);
    assert.deepEqual(
      store.listQueuedMessages("windows").map((message) => message.kind),
      ["cancel"],
    );
  });

  it("adds the target thread column to an existing coordinator database", () => {
    const databasePath = join(tmpdir(), `aop-store-${randomUUID()}.sqlite`);
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        root_message_id TEXT NOT NULL,
        reply_to TEXT,
        project_id TEXT,
        text TEXT NOT NULL,
        attachments_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    legacy.close();

    const store = new CoordinatorStore(databasePath);
    const columns = store.db
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    assert.equal(
      columns.some((column) => column.name === "target_thread_id"),
      true,
    );
    store.close();
    unlinkSync(databasePath);
  });
});
