import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * @spec spec://modules/worker/INFRA-002-worker-runtime#acceptance
 */

type RequestMessage = {
  id?: number;
  method?: string;
};

const startedAt = Date.now();
const mode = process.argv[2] ?? "normal";
const marker = process.argv[3];
const lines = createInterface({ input: process.stdin });

const completedTurn = (id: string, text: string) => ({
  id,
  status: "completed",
  items: [{ id: `${id}-answer`, type: "agentMessage", text }],
});

const respond = (id: number, result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
};

lines.on("line", (line) => {
  const message = JSON.parse(line) as RequestMessage;
  if (typeof message.id !== "number") return;

  if (message.method === "initialize") {
    respond(message.id, {});
    return;
  }

  if (message.method === "thread/read") {
    if (mode === "crash-once" && marker && !existsSync(marker)) {
      writeFileSync(marker, "crashed\n");
      process.exit(17);
    }
    if (mode === "crash-once") {
      respond(message.id, {
        thread: {
          id: "thread-1",
          turns: [
            completedTurn("turn-recovered", "recovered complete"),
          ],
        },
      });
      return;
    }
    const slowComplete = Date.now() - startedAt >= 800;
    respond(message.id, {
      thread: {
        id: "thread-1",
        turns: [
          completedTurn("turn-fast", "fast complete"),
          slowComplete
            ? completedTurn("turn-slow", "slow complete")
            : { id: "turn-slow", status: "inProgress", items: [] },
        ],
      },
    });
    return;
  }

  respond(message.id, {});
});
