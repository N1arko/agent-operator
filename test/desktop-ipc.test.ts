import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";
import { invalidateCodexDesktopQueries } from "../src/worker/desktop-ipc.js";

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

describe("Codex Desktop IPC", () => {
  it("initializes and invalidates the tasks and selected task queries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-desktop-ipc-"));
    temporaryDirectories.push(directory);
    const endpoint = join(directory, "codex-ipc.sock");
    const received: Array<Record<string, unknown>> = [];
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
          if (message.method === "initialize") {
            socket.write(
              encode({
                type: "response",
                requestId: message.requestId,
                result: { clientId: randomUUID() },
              }),
            );
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));

    const threadId = "019f9ff2-42a3-7c43-92e9-ab1b9794e043";
    try {
      await invalidateCodexDesktopQueries(threadId, endpoint);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    assert.deepEqual(
      received.map((message) => ({
        type: message.type,
        method: message.method,
        version: message.version,
        params: message.params,
      })),
      [
        {
          type: "request",
          method: "initialize",
          version: 0,
          params: { clientType: "agent-operator-worker" },
        },
        {
          type: "broadcast",
          method: "query-cache-invalidate",
          version: 0,
          params: { queryKey: ["tasks"] },
        },
        {
          type: "broadcast",
          method: "query-cache-invalidate",
          version: 0,
          params: { queryKey: ["task", threadId] },
        },
      ],
    );
  });
});
