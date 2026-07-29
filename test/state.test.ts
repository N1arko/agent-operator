import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { loadState, saveState } from "../src/worker/state.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("loads a legacy worker state with an empty durable queue", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aop-state-"));
  directories.push(directory);
  const path = join(directory, "worker-state.json");
  await writeFile(path, JSON.stringify({ cursor: 42, threads: {} }));

  const state = await loadState(path);

  assert.equal(state.cursor, 42);
  assert.deepEqual(state.pendingMessages, []);
});

test("persists pending worker messages across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aop-state-"));
  directories.push(directory);
  const path = join(directory, "worker-state.json");
  const messageId = randomUUID();
  await saveState(path, {
    cursor: 7,
    threads: {},
    publishedProgressKeys: [],
    pendingMessages: [
      {
        id: messageId,
        cursor: 7,
        kind: "start",
        fromAgentId: "mac",
        toAgentId: "windows",
        rootMessageId: messageId,
        replyTo: null,
        projectId: "local-project",
        targetThreadId: null,
        text: "Inspect",
        attachments: [],
        model: null,
        reasoningEffort: null,
        executionProfile: null,
        selectionReason: null,
        idempotencyKey: null,
        progress: null,
        isFinal: false,
        leaseExpiresAt: "2026-07-28T14:00:00.000Z",
        status: "queued",
        createdAt: new Date(0).toISOString(),
      },
    ],
  });

  const restored = await loadState(path);

  assert.equal(restored.pendingMessages[0]?.id, messageId);
});

test("loads pending messages written before model and lease fields existed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aop-state-"));
  directories.push(directory);
  const path = join(directory, "worker-state.json");
  const messageId = randomUUID();
  await writeFile(
    path,
    JSON.stringify({
      cursor: 8,
      threads: {},
      pendingMessages: [
        {
          id: messageId,
          cursor: 8,
          kind: "start",
          fromAgentId: "mac",
          toAgentId: "windows",
          rootMessageId: messageId,
          replyTo: null,
          projectId: "local-project",
          targetThreadId: null,
          text: "Legacy",
          attachments: [],
          status: "delivered",
          createdAt: new Date(0).toISOString(),
        },
      ],
    }),
  );

  const restored = await loadState(path);
  const message = restored.pendingMessages[0];

  assert.ok(message);
  assert.equal(message.model, null);
  assert.equal(message.reasoningEffort, null);
  assert.equal(message.leaseExpiresAt, null);
});
