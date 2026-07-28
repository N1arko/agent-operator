import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import * as z from "zod/v4";

const MAX_FRAME_BYTES = 256 * 1024 * 1024;
const WINDOWS_CODEX_IPC = String.raw`\\.\pipe\codex-ipc`;
const ThreadIdSchema = z.uuid();

type IpcMessage = Record<string, unknown>;

const frame = (message: IpcMessage): Buffer => {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
};

const writeMessage = (socket: Socket, message: IpcMessage): void => {
  socket.write(frame(message));
};

export const invalidateCodexDesktopQueries = async (
  threadId: string,
  endpoint = WINDOWS_CODEX_IPC,
  timeoutMs = 1_500,
): Promise<void> => {
  const parsedThreadId = ThreadIdSchema.parse(threadId);
  const requestId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection(endpoint);
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(`Codex Desktop IPC timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );

    socket.once("error", (error) => finish(error));
    socket.once("connect", () => {
      writeMessage(socket, {
        type: "request",
        requestId,
        method: "initialize",
        version: 0,
        params: { clientType: "agent-operator-worker" },
      });
    });

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (length > MAX_FRAME_BYTES) {
          finish(new Error(`Codex Desktop IPC frame is too large: ${length}`));
          return;
        }
        if (buffer.length < 4 + length) return;
        const payload = buffer.subarray(4, 4 + length);
        buffer = buffer.subarray(4 + length);

        let message: IpcMessage;
        try {
          message = JSON.parse(payload.toString("utf8")) as IpcMessage;
        } catch {
          finish(new Error("Codex Desktop IPC returned invalid JSON"));
          return;
        }
        if (
          message.type !== "response" ||
          message.requestId !== requestId
        ) {
          continue;
        }
        if (message.error) {
          finish(
            new Error(
              `Codex Desktop IPC initialize failed: ${JSON.stringify(message.error)}`,
            ),
          );
          return;
        }

        writeMessage(socket, {
          type: "broadcast",
          method: "query-cache-invalidate",
          version: 0,
          params: { queryKey: ["tasks"] },
        });
        writeMessage(socket, {
          type: "broadcast",
          method: "query-cache-invalidate",
          version: 0,
          params: { queryKey: ["task", parsedThreadId] },
        });
        socket.end(() => finish());
        return;
      }
    });
  });
};
