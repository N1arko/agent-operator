import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCompletedTurnText,
  successfulTurnStatus,
} from "../src/worker/app-server.js";

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
