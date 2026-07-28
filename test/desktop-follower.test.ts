import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";
import { CodexDesktopFollower } from "../src/worker/desktop-follower.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const encode = (message: Record<string, unknown>): Buffer => {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs = 1_000,
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("test timeout")), timeoutMs),
    ),
  ]);

describe("Codex Desktop follower", () => {
  it("starts a turn in Desktop and waits for its completed thread state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-desktop-follower-"));
    temporaryDirectories.push(directory);
    const endpoint = join(directory, "codex-ipc.sock");
    const received: Array<Record<string, unknown>> = [];
    const threadId = "019f9ff2-42a3-7c43-92e9-ab1b9794e043";
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const length = buffer.readUInt32LE(0);
          if (buffer.length < 4 + length) return;
          const message = JSON.parse(
            buffer.subarray(4, 4 + length).toString("utf8"),
          ) as Record<string, unknown>;
          buffer = buffer.subarray(4 + length);
          received.push(message);
          const respond = (result: Record<string, unknown>): void => {
            socket.write(
              encode({
                type: "response",
                requestId: message.requestId,
                resultType: "success",
                result,
              }),
            );
          };
          if (message.method === "initialize") {
            respond({ clientId: randomUUID() });
            continue;
          }
          if (message.method === "thread-stream-following-changed") {
            const params = message.params as
              | Record<string, unknown>
              | undefined;
            if (params?.following === true) {
              socket.write(
                encode({
                  type: "broadcast",
                  sourceClientId: "desktop-owner",
                  method: "thread-stream-state-changed",
                  version: 11,
                  params: {
                    conversationId: threadId,
                    hostId: "local",
                    change: {
                      type: "snapshot",
                      revision: 1,
                      conversationState: {
                        turns: Array.from({ length: 27 }, (_, index) => ({
                          id: `existing-${index}`,
                          status: "completed",
                          items: [],
                        })),
                      },
                    },
                  },
                }),
              );
            }
            continue;
          }
          if (message.method === "thread-follower-start-turn") {
            respond({
              result: {
                turn: { id: "new-turn", status: "inProgress" },
              },
            });
            setTimeout(() => {
              socket.write(
                encode({
                  type: "broadcast",
                  method: "thread-stream-state-changed",
                  version: 6,
                  params: {
                    conversationId: threadId,
                    hostId: "local",
                    change: {
                      type: "patches",
                      patches: [
                        {
                          op: "add",
                          path: ["turns", 27],
                          value: {
                            id: "new-turn",
                            status: "inProgress",
                            items: [],
                          },
                        },
                      ],
                    },
                  },
                }),
              );
            }, 1);
            setTimeout(() => {
              socket.write(
                encode({
                  type: "broadcast",
                  method: "thread-stream-state-changed",
                  version: 6,
                  params: {
                    conversationId: threadId,
                    hostId: "local",
                    change: {
                      type: "patches",
                      patches: [
                        {
                          op: "replace",
                          path: ["turns", 27, "status"],
                          value: "completed",
                        },
                        {
                          op: "add",
                          path: ["turns", 27, "items", 0],
                          value: {
                            type: "agentMessage",
                            phase: "final_answer",
                            text: "DESKTOP_FOLLOWER_OK",
                          },
                        },
                      ],
                    },
                  },
                }),
              );
            }, 3);
            continue;
          }
          if (message.method === "thread-follower-interrupt-turn") {
            respond({ interruptedTurnId: "new-turn", ok: true });
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));

    const opened: string[] = [];
    const follower = new CodexDesktopFollower(
      endpoint,
      1,
      1_000,
      5_000,
      (selectedThreadId) => {
        opened.push(selectedThreadId);
        return Promise.resolve();
      },
    );

    try {
      const handle = await follower.resumeThread(
        threadId,
        "Reply exactly OK",
        { model: "gpt-test", reasoningEffort: "high" },
      );
      const result = await handle.completed;
      assert.deepEqual(result, {
        status: "completed",
        text: "DESKTOP_FOLLOWER_OK",
      });
      await follower.interrupt(handle);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    assert.deepEqual(opened, [threadId, threadId]);
    const followerRequest = received.find(
      (message) => message.method === "thread-follower-start-turn",
    );
    assert.deepEqual(
      {
        version: followerRequest?.version,
        params: followerRequest?.params,
      },
      {
        version: 1,
        params: {
          conversationId: threadId,
          turnStartParams: {
            input: [
              {
                type: "text",
                text: "Reply exactly OK",
                text_elements: [],
              },
            ],
            attachments: [],
            model: "gpt-test",
            effort: "high",
          },
        },
      },
    );
    const interruptRequest = received.find(
      (message) => message.method === "thread-follower-interrupt-turn",
    );
    assert.deepEqual(interruptRequest?.params, {
      conversationId: threadId,
      mode: "system",
    });
    assert.equal(
      received.some((message) => message.method === "send-cli-request-for-host"),
      false,
    );
    assert.deepEqual(
      received
        .filter(
          (message) =>
            message.method === "thread-stream-following-changed",
        )
        .map((message) => ({
          version: message.version,
          params: message.params,
        })),
      [
        {
          version: 1,
          params: {
            conversationId: threadId,
            hostId: "local",
            following: true,
          },
        },
        {
          version: 1,
          params: {
            conversationId: threadId,
            hostId: "local",
            following: false,
          },
        },
      ],
    );
  });

  it("keeps the follower connected until external completion settles", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-desktop-lifecycle-"));
    temporaryDirectories.push(directory);
    const endpoint = join(directory, "codex-ipc.sock");
    const threadId = "019fa858-eb2d-7c93-8a8d-a1d1cd9005c3";
    const received: Array<Record<string, unknown>> = [];
    let resolveClosed: (() => void) | undefined;
    const connectionClosed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("close", () => resolveClosed?.());
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const length = buffer.readUInt32LE(0);
          if (buffer.length < 4 + length) return;
          const message = JSON.parse(
            buffer.subarray(4, 4 + length).toString("utf8"),
          ) as Record<string, unknown>;
          buffer = buffer.subarray(4 + length);
          received.push(message);
          if (message.method === "initialize") {
            socket.write(
              encode({
                type: "response",
                requestId: message.requestId,
                resultType: "success",
                result: { clientId: randomUUID() },
              }),
            );
            continue;
          }
          if (message.method === "thread-stream-following-changed") {
            const params = message.params as
              | Record<string, unknown>
              | undefined;
            if (params?.following === true) {
              socket.write(
                encode({
                  type: "broadcast",
                  sourceClientId: "desktop-owner",
                  method: "thread-stream-state-changed",
                  version: 11,
                  params: {
                    conversationId: threadId,
                    hostId: "local",
                    change: {
                      type: "snapshot",
                      revision: 1,
                      conversationState: { turns: [] },
                    },
                  },
                }),
              );
            }
            continue;
          }
          if (message.method === "thread-follower-start-turn") {
            socket.write(
              encode({
                type: "response",
                requestId: message.requestId,
                resultType: "success",
                result: {
                  result: {
                    turn: { id: "external-turn", status: "inProgress" },
                  },
                },
              }),
            );
            continue;
          }
          if (
            message.method ===
            "thread-follower-load-complete-history"
          ) {
            socket.write(
              encode({
                type: "response",
                requestId: message.requestId,
                resultType: "success",
                result: { revision: 2 },
              }),
            );
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));

    let resolveCompletion:
      | ((value: { status: string; text: string }) => void)
      | undefined;
    const externalCompletion = new Promise<{ status: string; text: string }>(
      (resolve) => {
        resolveCompletion = resolve;
      },
    );
    const follower = new CodexDesktopFollower(
      endpoint,
      1,
      1_000,
      5_000,
      () => Promise.resolve(),
    );

    try {
      const handle = await follower.resumeThread(
        threadId,
        "Reply exactly OK",
        {},
        () => externalCompletion,
      );
      let closed = false;
      void connectionClosed.then(() => {
        closed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(closed, false);

      resolveCompletion?.({ status: "completed", text: "OK" });
      assert.deepEqual(await handle.completed, {
        status: "completed",
        text: "OK",
      });
      await withTimeout(connectionClosed);
      assert.equal(
        received.some(
          (message) =>
            message.method ===
            "thread-follower-load-complete-history",
        ),
        true,
      );
      assert.deepEqual(
        received
          .filter(
            (message) =>
              message.method === "thread-stream-following-changed",
          )
          .map(
            (message) =>
              (message.params as Record<string, unknown>).following,
          ),
        [true, false],
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
