import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import {
  CoordinatorStore,
  EnrollmentConflictError,
  EnrollmentDeniedError,
} from "../src/coordinator/store.js";

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
  // @spec spec://modules/coordinator/FEAT-007-device-enrollment#states.enrollment
  it("atomically consumes an enrollment once and revokes its device credential", () => {
    const store = createStore();
    const grant = store.createEnrollment({
      agentId: "studio-mac",
      agentName: "Studio Mac",
      now: "2026-08-23T12:00:00.000Z",
    });
    const first = store.consumeEnrollment({
      code: grant.code,
      platform: "macos",
      workerVersion: "0.1.23",
      now: "2026-08-23T12:00:01.000Z",
    });

    assert.throws(
      () =>
        store.consumeEnrollment({
          code: grant.code,
          platform: "macos",
          workerVersion: "0.1.23",
          now: "2026-08-23T12:00:02.000Z",
        }),
      EnrollmentDeniedError,
    );
    assert.deepEqual(store.authenticateDevice(first.deviceToken), {
      status: "active",
      agentId: "studio-mac",
    });
    assert.equal(store.listDevices()[0]?.tokenHint, first.tokenHint);
    assert.equal(store.revokeDevice("studio-mac"), 1);
    assert.deepEqual(store.authenticateDevice(first.deviceToken), {
      status: "revoked",
    });
    const replacement = store.createEnrollment({
      agentId: "studio-mac",
      agentName: "Studio Mac replacement",
    });
    assert.equal(replacement.agentId, "studio-mac");

    const persistentRows = JSON.stringify({
      enrollments: store.db.prepare("SELECT * FROM enrollment_codes").all(),
      credentials: store.db.prepare("SELECT * FROM device_credentials").all(),
    });
    assert.equal(persistentRows.includes(grant.code), false);
    assert.equal(persistentRows.includes(first.deviceToken), false);
  });

  it("rejects active identity conflicts and gives invalid codes one denial type", () => {
    const store = createStore();
    const active = store.createEnrollment({
      agentId: "windows-laptop",
      agentName: "Windows Laptop",
      now: "2026-08-23T12:00:00.000Z",
    });
    assert.throws(
      () =>
        store.createEnrollment({
          agentId: "windows-laptop",
          agentName: "Another name",
          now: "2026-08-23T12:00:01.000Z",
        }),
      EnrollmentConflictError,
    );
    assert.throws(
      () =>
        store.consumeEnrollment({
          code: active.code,
          platform: "windows",
          workerVersion: "0.1.23",
          now: "2026-08-23T12:11:00.000Z",
        }),
      EnrollmentDeniedError,
    );
    assert.throws(
      () =>
        store.consumeEnrollment({
          code: "aop_enroll_unknown-code-value",
          platform: "windows",
          workerVersion: "0.1.23",
        }),
      EnrollmentDeniedError,
    );
    assert.equal(store.revokeEnrollment(active.enrollmentId), true);
    assert.equal(store.revokeEnrollment(active.enrollmentId), false);
  });

  it("rolls back credential creation when enrollment consumption cannot commit", () => {
    const store = createStore();
    const enrollment = store.createEnrollment({
      agentId: "transaction-mac",
      agentName: "Transaction Mac",
    });
    store.db.exec(`
      CREATE TRIGGER fail_enrollment_consumption
      BEFORE UPDATE OF consumed_at ON enrollment_codes
      WHEN NEW.consumed_at IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'forced storage failure');
      END;
    `);

    assert.throws(
      () =>
        store.consumeEnrollment({
          code: enrollment.code,
          platform: "macos",
          workerVersion: "0.1.23",
        }),
      /forced storage failure/,
    );
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS count FROM device_credentials").get() as {
        count: number;
      }).count,
      0,
    );
    assert.equal(
      (
        store.db
          .prepare("SELECT consumed_at FROM enrollment_codes WHERE id = ?")
          .get(enrollment.enrollmentId) as { consumed_at: string | null }
      ).consumed_at,
      null,
    );
    store.db.exec("DROP TRIGGER fail_enrollment_consumption");
    assert.equal(
      store.consumeEnrollment({
        code: enrollment.code,
        platform: "macos",
        workerVersion: "0.1.23",
      }).agentId,
      "transaction-mac",
    );
  });

  it("restores credential authentication from a database and matching key", () => {
    const directory = mkdtempSync(join(tmpdir(), "aop-enrollment-"));
    const databasePath = join(directory, "coordinator.sqlite");
    const backupPath = join(directory, "restored.sqlite");
    const key = randomBytes(32);
    const original = new CoordinatorStore(databasePath, undefined, key);
    const enrollment = original.createEnrollment({
      agentId: "backup-mac",
      agentName: "Backup Mac",
    });
    const credential = original.consumeEnrollment({
      code: enrollment.code,
      platform: "macos",
      workerVersion: "0.1.23",
    });
    original.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    original.close();
    copyFileSync(databasePath, backupPath);

    const restored = new CoordinatorStore(backupPath, undefined, key);
    assert.deepEqual(restored.authenticateDevice(credential.deviceToken), {
      status: "active",
      agentId: "backup-mac",
    });
    restored.close();
    assert.equal(readFileSync(backupPath).includes(credential.deviceToken), false);
    rmSync(directory, { recursive: true });
  });

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

  it("atomically claims inbox messages across duplicate worker processes", () => {
    const store = createStore();
    const request = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "project",
      text: "Claim once",
    });
    const claimedAt = "2026-07-29T00:00:00.000Z";

    assert.deepEqual(
      store.claimQueuedMessages("windows", 0, claimedAt).map((message) => message.id),
      [request.id],
    );
    assert.deepEqual(
      store.claimQueuedMessages("windows", 0, claimedAt),
      [],
    );
    store.acknowledge(request.id);
    assert.deepEqual(
      store.claimQueuedMessages(
        "windows",
        0,
        "2026-07-29T00:01:00.000Z",
      ),
      [],
    );
  });

  it("reclaims an unacknowledged inbox delivery after its short lease", () => {
    const store = createStore();
    const request = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "project",
      text: "Recover delivery",
    });
    store.claimQueuedMessages(
      "windows",
      0,
      "2026-07-29T00:00:00.000Z",
      1_000,
    );

    assert.deepEqual(
      store.claimQueuedMessages(
        "windows",
        0,
        "2026-07-29T00:00:02.000Z",
        1_000,
      ).map((message) => message.id),
      [request.id],
    );
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

  it("deduplicates one caller intent and rejects key reuse for other work", () => {
    const store = createStore();
    const first = store.createMessage({
      kind: "thread_send",
      fromAgentId: "mac",
      toAgentId: "windows",
      targetThreadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
      text: "One intent",
      idempotencyKey: "intent-001",
    });
    const replay = store.createMessage({
      kind: "thread_send",
      fromAgentId: "mac",
      toAgentId: "windows",
      targetThreadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
      text: "One intent",
      idempotencyKey: "intent-001",
    });

    assert.equal(replay.id, first.id);
    assert.equal(store.countOutstandingRequests("windows"), 1);
    assert.throws(
      () =>
        store.createMessage({
          kind: "thread_send",
          fromAgentId: "mac",
          toAgentId: "windows",
          targetThreadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
          text: "Different intent",
          idempotencyKey: "intent-001",
        }),
      /already used/,
    );
  });

  it("cancels queued follow-ups together with their root request", () => {
    const store = createStore();
    const root = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "project",
      text: "Root",
    });
    const followUp = store.createMessage({
      kind: "send",
      fromAgentId: "mac",
      toAgentId: "windows",
      rootMessageId: root.id,
      replyTo: root.id,
      projectId: "project",
      text: "Follow-up",
    });

    const cancelled = store.cancelRequest(root.id, "mac");

    assert.equal(cancelled.cancelledRelated.length, 1);
    assert.equal(cancelled.cancelledRelated[0]?.request.id, followUp.id);
    assert.equal(store.getMessage(followUp.id).status, "cancelled");
    assert.deepEqual(
      store
        .listQueuedMessages("windows")
        .filter((message) => message.kind === "cancel")
        .map((message) => message.replyTo),
      [root.id, followUp.id],
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

    const store = new CoordinatorStore(databasePath, undefined, randomBytes(32));
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
