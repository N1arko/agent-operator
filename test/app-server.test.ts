import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  CodexAppServer,
  extractTurnProgressNotification,
  extractTurnProgressSnapshot,
  extractCompletedTurnText,
  successfulTurnStatus,
} from "../src/worker/app-server.js";

const fakeAppServerPath = resolve("test/fixtures/fake-app-server.ts");

test("does not finalize a Desktop-owned turn on transient read states", () => {
  assert.equal(successfulTurnStatus("interrupted"), false);
  assert.equal(successfulTurnStatus("failed"), false);
  assert.equal(successfulTurnStatus("cancelled"), false);
  assert.equal(successfulTurnStatus("completed"), true);
});

test("extracts an agent message from a completed turn payload", () => {
  const text = extractCompletedTurnText(
    {
      id: "turn-1",
      status: "completed",
      items: [
        {
          id: "message-1",
          type: "agentMessage",
          text: "ready",
        },
      ],
    },
    [],
    "thread-1",
    "turn-1",
  );

  assert.equal(text, "ready");
});

test("extracts the final message from item/completed notifications", () => {
  const text = extractCompletedTurnText(
    {
      id: "turn-1",
      status: "completed",
      items: [],
    },
    [
      {
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "commentary-1",
            type: "agentMessage",
            phase: "commentary",
            text: "Working",
          },
        },
      },
      {
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "message-1",
            type: "agentMessage",
            phase: "final_answer",
            text: "ready",
          },
        },
      },
    ],
    "thread-1",
    "turn-1",
  );

  assert.equal(text, "ready");
});

test("ignores completed items from other turns", () => {
  const text = extractCompletedTurnText(
    {
      id: "turn-1",
      status: "completed",
      items: [],
    },
    [
      {
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-2",
          item: {
            id: "message-2",
            type: "agentMessage",
            text: "wrong",
          },
        },
      },
    ],
    "thread-1",
    "turn-1",
  );

  assert.equal(text, "");
});

test("extracts bounded commentary, plan and activity progress", () => {
  const commentary = extractTurnProgressNotification(
    {
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "message-1",
          type: "agentMessage",
          phase: "commentary",
          text: "Checking the project",
        },
      },
    },
    "thread-1",
    "turn-1",
  );
  const plan = extractTurnProgressNotification(
    {
      method: "turn/plan/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        plan: [{ step: "Run tests", status: "in_progress" }],
      },
    },
    "thread-1",
    "turn-1",
  );
  const activity = extractTurnProgressNotification(
    {
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: { id: "command-1", type: "commandExecution" },
      },
    },
    "thread-1",
    "turn-1",
  );

  assert.equal(commentary?.phase, "commentary");
  assert.equal(commentary.text, "Checking the project");
  assert.deepEqual(plan?.plan, [
    { step: "Run tests", status: "in_progress" },
  ]);
  assert.equal(activity?.text, "Выполняет команды");
});

test("does not expose reasoning or final answers as progress", () => {
  for (const item of [
    { id: "reasoning-1", type: "reasoning", text: "private chain" },
    {
      id: "final-1",
      type: "agentMessage",
      phase: "final_answer",
      text: "Done",
    },
  ]) {
    assert.equal(
      extractTurnProgressNotification(
        {
          method: "item/completed",
          params: { threadId: "thread-1", turnId: "turn-1", item },
        },
        "thread-1",
        "turn-1",
      ),
      null,
    );
  }
});

test("extracts progress from read-only active turn snapshots", () => {
  const updates = extractTurnProgressSnapshot(
    {
      id: "turn-1",
      status: "inProgress",
      plan: [{ step: "Inspect", status: "in_progress" }],
      items: [
        {
          id: "commentary-1",
          type: "agentMessage",
          phase: "commentary",
          text: "Started",
        },
        {
          id: "command-1",
          type: "commandExecution",
          aggregatedOutput: "must stay local",
        },
        {
          id: "reasoning-1",
          type: "reasoning",
          text: "must stay private",
        },
      ],
    },
    "thread-1",
    "turn-1",
  );

  assert.deepEqual(
    updates.map((update) => [update.phase, update.text]),
    [
      ["plan", "in_progress: Inspect"],
      ["commentary", "Started"],
      ["activity", "Выполняет команды"],
    ],
  );
  assert.equal(JSON.stringify(updates).includes("must stay"), false);
});

// @spec spec://modules/worker/INFRA-002-worker-runtime#acceptance
test("keeps app-server alive until every read-only observer completes", async () => {
  const appServer = new CodexAppServer(
    process.execPath,
    40,
    [fakeAppServerPath],
  );
  try {
    const fast = appServer.waitForTurn("thread-1", "turn-fast");
    const slow = appServer.waitForTurn("thread-1", "turn-slow");

    assert.deepEqual(await fast, {
      status: "completed",
      text: "fast complete",
    });
    assert.deepEqual(await slow, {
      status: "completed",
      text: "slow complete",
    });
  } finally {
    await appServer.stop();
  }
});

// @spec spec://modules/worker/FEAT-005-desktop-visible-delivery#errors
test("restarts app-server and resumes a read-only observer after process loss", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "aop-app-server-"));
  const marker = resolve(directory, "crashed-once");
  const appServer = new CodexAppServer(process.execPath, 40, [
    fakeAppServerPath,
    "crash-once",
    marker,
  ]);
  try {
    assert.deepEqual(
      await appServer.waitForTurn("thread-1", "turn-recovered"),
      {
        status: "completed",
        text: "recovered complete",
      },
    );
  } finally {
    await appServer.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
