import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import * as z from "zod/v4";
import {
  type LocalThread,
  type TurnHandle,
  type TurnOptions,
  type TurnProgress,
} from "./app-server.js";

const MAX_FRAME_BYTES = 256 * 1024 * 1024;
const WINDOWS_CODEX_IPC = String.raw`\\.\pipe\codex-ipc`;
const ThreadIdSchema = z.uuid();

type JsonObject = Record<string, unknown>;
type PendingRequest = {
  resolve: (message: JsonObject) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null ? (value as JsonObject) : null;

const encodeFrame = (message: JsonObject): Buffer => {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
};

const turnStatus = (turn: JsonObject): string => {
  if (typeof turn.status === "string") return turn.status;
  const status = asObject(turn.status);
  if (typeof status?.type === "string") return status.type;
  if (typeof status?.status === "string") return status.status;
  return "unknown";
};

const terminalStatus = (status: string): boolean =>
  [
    "completed",
    "complete",
    "done",
    "failed",
    "cancelled",
    "canceled",
    "interrupted",
    "stopped",
  ].includes(status.toLowerCase());

const applyPatch = (target: JsonObject, patch: JsonObject): void => {
  const path: unknown[] = Array.isArray(patch.path) ? patch.path : [];
  if (path.length === 0) return;
  let parent: unknown = target;
  for (const [index, part] of path.slice(0, -1).entries()) {
    if (typeof parent !== "object" || parent === null) return;
    const container = parent as Record<string | number, unknown>;
    const key = part as string | number;
    if (container[key] === undefined || container[key] === null) {
      const nextPart = path[index + 1];
      container[key] =
        typeof nextPart === "number" || /^\d+$/.test(String(nextPart))
          ? []
          : {};
    }
    parent = container[key];
  }
  if (typeof parent !== "object" || parent === null) return;
  const key = path.at(-1) as string | number;
  if (patch.op === "remove") {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else Reflect.deleteProperty(parent, String(key));
    return;
  }
  if (patch.op === "add" && Array.isArray(parent)) {
    const arrayIndex = Number(key);
    if (arrayIndex > parent.length) parent.length = arrayIndex;
    parent.splice(arrayIndex, 0, patch.value);
    return;
  }
  if (patch.op === "add" || patch.op === "replace") {
    (parent as Record<string | number, unknown>)[key] = patch.value;
  }
};

const desktopLocalThread = (
  threadId: string,
  state: JsonObject,
): LocalThread => {
  const turns = Array.isArray(state.turns)
    ? state.turns
        .map(asObject)
        .filter((turn): turn is JsonObject => turn !== null)
    : [];
  const lastTurn = turns.at(-1);
  const params = asObject(lastTurn?.params);
  const status = lastTurn ? turnStatus(lastTurn) : turnStatus(state);
  return {
    threadId,
    title:
      typeof state.title === "string"
        ? state.title
        : typeof state.name === "string"
          ? state.name
          : null,
    preview: "",
    cwd:
      typeof params?.cwd === "string"
        ? params.cwd
        : typeof state.cwd === "string"
          ? state.cwd
          : "",
    updatedAt:
      typeof state.updatedAt === "number"
        ? state.updatedAt
        : typeof state.updated_at === "number"
          ? state.updated_at
          : 0,
    status: terminalStatus(status) || status.toLowerCase() === "idle"
      ? "idle"
      : "active",
    activeFlags: status.toLowerCase() === "idle" ? [] : [status],
    source: "cli",
  };
};

const turnText = (turn: JsonObject): string => {
  const items = Array.isArray(turn.items)
    ? turn.items.map(asObject).filter((item): item is JsonObject => item !== null)
    : [];
  const messages = items.filter(
    (item) => item.type === "agentMessage" && typeof item.text === "string",
  );
  const finalMessages = messages.filter(
    (item) => item.phase === "final_answer",
  );
  const unclassifiedMessages = messages.filter(
    (item) => item.phase === undefined || item.phase === null,
  );
  const selected =
    finalMessages.length > 0
      ? finalMessages
      : unclassifiedMessages.length > 0
        ? unclassifiedMessages
        : messages;
  return selected.map((item) => String(item.text)).join("\n");
};

// @spec spec://modules/coordinator/FEAT-006-progress-updates#event-sources
const desktopProgressItems = (
  threadId: string,
  turnId: string,
  turn: JsonObject,
): Array<Omit<TurnProgress, "revision">> => {
  const items = Array.isArray(turn.items)
    ? turn.items.map(asObject).filter((item): item is JsonObject => item !== null)
    : [];
  return items.flatMap<Omit<TurnProgress, "revision">>((item, index) => {
    const itemId =
      typeof item.id === "string" ? item.id : `${String(item.type)}-${index}`;
    if (
      item.type === "agentMessage" &&
      item.phase === "commentary" &&
      typeof item.text === "string" &&
      item.text.trim()
    ) {
      return [{
        threadId,
        turnId,
        itemId,
        phase: "commentary" as const,
        text: item.text.trim().slice(0, 4_000),
        plan: null,
      }];
    }
    const activity =
      item.type === "commandExecution"
        ? "Выполняет команды"
        : item.type === "fileChange"
          ? "Работает с файлами"
          : item.type === "mcpToolCall" || item.type === "dynamicToolCall"
            ? "Использует подключённый инструмент"
            : null;
    return activity
      ? [{
          threadId,
          turnId,
          itemId,
          phase: "activity" as const,
          text: activity,
          plan: null,
        }]
      : [];
  });
};

class DesktopIpcConnection {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private clientId: string | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly conversationStates = new Map<string, JsonObject>();

  constructor(
    private readonly endpoint: string,
    private readonly requestTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    if (this.socket?.writable) return;
    const socket = createConnection(this.endpoint);
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", (error) => this.rejectAll(error));
    socket.on("close", () =>
      this.rejectAll(new Error("Codex Desktop IPC connection closed")),
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const initialized = await this.request(
      "initialize",
      { clientType: "agent-operator-worker" },
      undefined,
    );
    const initializedResult = asObject(initialized.result);
    if (
      initialized.resultType !== undefined &&
      initialized.resultType !== "success"
    ) {
      throw new Error(
        `Codex Desktop IPC initialize failed: ${JSON.stringify(initialized)}`,
      );
    }
    if (typeof initializedResult?.clientId === "string") {
      this.clientId = initializedResult.clientId;
    }
  }

  async request(
    method: string,
    params: JsonObject,
    version = 0,
  ): Promise<JsonObject> {
    const socket = this.socket;
    if (!socket?.writable) throw new Error("Codex Desktop IPC is not connected");
    const requestId = randomUUID();
    const message: JsonObject = {
      type: "request",
      requestId,
      ...(this.clientId ? { sourceClientId: this.clientId } : {}),
      method,
      params,
      version,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Codex Desktop IPC ${method} timed out`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      socket.write(encodeFrame(message));
    });
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }

  conversationState(threadId: string): JsonObject | null {
    return this.conversationStates.get(threadId) ?? null;
  }

  setThreadFollowing(threadId: string, following: boolean): void {
    const socket = this.socket;
    if (!socket?.writable) {
      if (!following) return;
      throw new Error("Codex Desktop IPC is not connected");
    }
    socket.write(
      encodeFrame({
        type: "broadcast",
        ...(this.clientId ? { sourceClientId: this.clientId } : {}),
        method: "thread-stream-following-changed",
        version: 1,
        params: {
          conversationId: ThreadIdSchema.parse(threadId),
          hostId: "local",
          following,
        },
      }),
    );
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_FRAME_BYTES) {
        this.rejectAll(
          new Error(`Codex Desktop IPC frame is too large: ${length}`),
        );
        this.close();
        return;
      }
      if (this.buffer.length < 4 + length) return;
      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      let message: JsonObject;
      try {
        message = JSON.parse(payload.toString("utf8")) as JsonObject;
      } catch {
        this.rejectAll(new Error("Codex Desktop IPC returned invalid JSON"));
        this.close();
        return;
      }
      this.ingestConversationState(message);
      if (message.type !== "response" || typeof message.requestId !== "string") {
        continue;
      }
      const pending = this.pending.get(message.requestId);
      if (!pending) continue;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.error || message.resultType === "error") {
        pending.reject(
          new Error(
            `Codex Desktop IPC request failed: ${JSON.stringify(message)}`,
          ),
        );
      } else {
        pending.resolve(message);
      }
    }
  }

  private ingestConversationState(message: JsonObject): void {
    if (
      message.type !== "broadcast" ||
      message.method !== "thread-stream-state-changed"
    ) {
      return;
    }
    const params = asObject(message.params);
    const change = asObject(params?.change);
    if (
      typeof params?.conversationId !== "string" ||
      typeof change?.type !== "string"
    ) {
      return;
    }
    const threadId = params.conversationId;
    if (change.type === "snapshot") {
      const state = asObject(change.conversationState);
      if (state) this.conversationStates.set(threadId, state);
      return;
    }
    if (change.type === "patches") {
      if (!Array.isArray(change.patches)) return;
      const state =
        this.conversationStates.get(threadId) ?? ({ turns: [] } as JsonObject);
      this.conversationStates.set(threadId, state);
      for (const patch of change.patches) {
        const parsedPatch = asObject(patch);
        if (parsedPatch) applyPatch(state, parsedPatch);
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class CodexDesktopFollower {
  constructor(
    private readonly endpoint = WINDOWS_CODEX_IPC,
    private readonly pollMs = 500,
    private readonly requestTimeoutMs = 10_000,
    private readonly completionTimeoutMs = 24 * 60 * 60 * 1_000,
    private readonly onThreadReady: (threadId: string) => Promise<void> = () =>
      Promise.resolve(),
  ) {}

  async readThread(threadId: string): Promise<LocalThread> {
    const parsedThreadId = ThreadIdSchema.parse(threadId);
    const connection = new DesktopIpcConnection(
      this.endpoint,
      this.requestTimeoutMs,
    );
    await connection.connect();
    try {
      connection.setThreadFollowing(parsedThreadId, true);
      await this.onThreadReady(parsedThreadId);
      const state = await this.waitForConversationState(
        connection,
        parsedThreadId,
      );
      return desktopLocalThread(parsedThreadId, state);
    } finally {
      connection.setThreadFollowing(parsedThreadId, false);
      connection.close();
    }
  }

  async resumeThread(
    threadId: string,
    prompt: string,
    options: TurnOptions = {},
    externalCompletion?: (
      threadId: string,
      turnId: string,
      signal?: AbortSignal,
    ) => Promise<{ status: string; text: string }>,
  ): Promise<TurnHandle> {
    const parsedThreadId = ThreadIdSchema.parse(threadId);
    const connection = new DesktopIpcConnection(
      this.endpoint,
      this.requestTimeoutMs,
    );
    await connection.connect();
    try {
      connection.setThreadFollowing(parsedThreadId, true);
      await this.onThreadReady(parsedThreadId);
      const before = await this.waitForConversationState(
        connection,
        parsedThreadId,
      );
      const baselineTurnIds = new Set(
        (Array.isArray(before.turns) ? before.turns : [])
          .map(asObject)
          .filter((turn): turn is JsonObject => turn !== null)
          .map((turn) => String(turn.id)),
      );
      const started = await connection.request(
        "thread-follower-start-turn",
        {
          conversationId: parsedThreadId,
          turnStartParams: {
            input: [{ type: "text", text: prompt, text_elements: [] }],
            attachments: [],
            ...(options.model ? { model: options.model } : {}),
            ...(options.reasoningEffort
              ? { effort: options.reasoningEffort }
              : {}),
          },
        },
        1,
      );
      if (
        started.resultType !== undefined &&
        started.resultType !== "success"
      ) {
        throw new Error(
          `Codex Desktop refused the turn: ${JSON.stringify(started)}`,
        );
      }
      const startedResult = asObject(started.result);
      const handlerResult = asObject(startedResult?.result);
      const startedTurn = asObject(handlerResult?.turn);
      const turnId =
        typeof startedTurn?.id === "string"
          ? startedTurn.id
          : `desktop-${randomUUID()}`;
      const observationController = externalCompletion
        ? new AbortController()
        : undefined;
      const completed = externalCompletion
        ? this.waitForExternalCompletion(
            connection,
            parsedThreadId,
            turnId,
            externalCompletion,
            options.onProgress,
            observationController?.signal,
          )
        : this.waitForCompletion(
            connection,
            parsedThreadId,
            baselineTurnIds,
            turnId,
            options.onProgress,
          );
      return {
        threadId: parsedThreadId,
        turnId,
        completed,
        ...(observationController
          ? {
              cancelObservation: async (): Promise<void> => {
                observationController.abort();
                await completed.catch(() => undefined);
              },
            }
          : {}),
      };
    } catch (error) {
      connection.setThreadFollowing(parsedThreadId, false);
      connection.close();
      throw error;
    }
  }

  async interrupt(handle: TurnHandle): Promise<void> {
    const connection = new DesktopIpcConnection(
      this.endpoint,
      this.requestTimeoutMs,
    );
    try {
      await connection.connect();
      await this.onThreadReady(ThreadIdSchema.parse(handle.threadId));
      const interrupted = await connection.request(
        "thread-follower-interrupt-turn",
        {
          conversationId: handle.threadId,
          mode: "system",
        },
        1,
      );
      if (
        interrupted.resultType !== undefined &&
        interrupted.resultType !== "success"
      ) {
        throw new Error(
          `Codex Desktop refused the interrupt: ${JSON.stringify(interrupted)}`,
        );
      }
    } finally {
      connection.close();
    }
  }

  private async waitForConversationState(
    connection: DesktopIpcConnection,
    threadId: string,
  ): Promise<JsonObject> {
    const deadline = Date.now() + this.requestTimeoutMs;
    while (Date.now() < deadline) {
      const state = connection.conversationState(threadId);
      if (state) return state;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    throw new Error(
      `Codex Desktop did not stream conversation ${threadId}`,
    );
  }

  private async waitForCompletion(
    connection: DesktopIpcConnection,
    threadId: string,
    baselineTurnIds: Set<string>,
    expectedTurnId: string,
    onProgress?: TurnOptions["onProgress"],
  ): Promise<{ status: string; text: string }> {
    const deadline = Date.now() + this.completionTimeoutMs;
    const revisions = new Map<string, { value: string; revision: number }>();
    try {
      while (Date.now() < deadline) {
        const thread = connection.conversationState(threadId);
        if (!thread) {
          await new Promise((resolve) => setTimeout(resolve, this.pollMs));
          continue;
        }
        const turns = Array.isArray(thread.turns)
          ? thread.turns
              .map(asObject)
              .filter((turn): turn is JsonObject => turn !== null)
          : [];
        const turn =
          [...turns]
            .reverse()
            .find(
              (candidate) =>
                String(candidate.id) === expectedTurnId ||
                !baselineTurnIds.has(String(candidate.id)),
            ) ?? null;
        if (turn) {
          this.publishProgressSnapshot(
            threadId,
            String(turn.id),
            turn,
            revisions,
            onProgress,
          );
          const status = turnStatus(turn);
          if (terminalStatus(status)) {
            return { status, text: turnText(turn) };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
      throw new Error(
        `Codex Desktop turn did not complete within ${this.completionTimeoutMs}ms`,
      );
    } finally {
      connection.setThreadFollowing(threadId, false);
      connection.close();
    }
  }

  private async waitForExternalCompletion(
    connection: DesktopIpcConnection,
    threadId: string,
    turnId: string,
    externalCompletion: (
      threadId: string,
      turnId: string,
      signal?: AbortSignal,
    ) => Promise<{ status: string; text: string }>,
    onProgress?: TurnOptions["onProgress"],
    signal?: AbortSignal,
  ): Promise<{ status: string; text: string }> {
    const revisions = new Map<string, { value: string; revision: number }>();
    let monitoring = true;
    const monitor = async (): Promise<void> => {
      while (monitoring) {
        const state = connection.conversationState(threadId);
        const turns = Array.isArray(state?.turns)
          ? state.turns
              .map(asObject)
              .filter((turn): turn is JsonObject => turn !== null)
          : [];
        const turn = turns.find((candidate) => String(candidate.id) === turnId);
        if (turn) {
          this.publishProgressSnapshot(
            threadId,
            turnId,
            turn,
            revisions,
            onProgress,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
    };
    const monitoringPromise = monitor();
    try {
      const result = await externalCompletion(threadId, turnId, signal);
      await connection.request(
        "thread-follower-load-complete-history",
        { conversationId: threadId },
        1,
      );
      return result;
    } finally {
      monitoring = false;
      await monitoringPromise;
      connection.setThreadFollowing(threadId, false);
      connection.close();
    }
  }

  private publishProgressSnapshot(
    threadId: string,
    turnId: string,
    turn: JsonObject,
    revisions: Map<string, { value: string; revision: number }>,
    onProgress?: TurnOptions["onProgress"],
  ): void {
    for (const update of desktopProgressItems(threadId, turnId, turn)) {
      const value = JSON.stringify(update);
      const previous = revisions.get(update.itemId);
      if (previous?.value === value) continue;
      const revision = (previous?.revision ?? 0) + 1;
      revisions.set(update.itemId, { value, revision });
      void onProgress?.({ ...update, revision });
    }
  }
}
