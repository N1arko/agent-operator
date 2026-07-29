import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  ModelDescriptorSchema,
  type ModelDescriptor,
  type ProgressPhase,
  type ProgressPlanStep,
  type ReasoningEffort,
} from "../shared/protocol.js";

type JsonObject = Record<string, unknown>;
type Pending = {
  resolve: (value: JsonObject) => void;
  reject: (error: Error) => void;
};
type Waiter = {
  predicate: (message: JsonObject) => boolean;
  resolve: (message: JsonObject) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type TurnHandle = {
  threadId: string;
  turnId: string;
  completed: Promise<{ status: string; text: string }>;
};

export type TurnOptions = {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  onProgress?: (update: TurnProgress) => Promise<void> | void;
};

export type TurnProgress = {
  threadId: string;
  turnId: string;
  itemId: string;
  revision: number;
  phase: ProgressPhase;
  text: string;
  plan: ProgressPlanStep[] | null;
};

export type LocalThread = {
  threadId: string;
  title: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  status: "notLoaded" | "idle" | "systemError" | "active" | "unknown";
  activeFlags: string[];
  source: string;
};

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null ? (value as JsonObject) : null;
const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const threadStatus = (
  value: unknown,
): Pick<LocalThread, "status" | "activeFlags"> => {
  const status = asObject(value);
  const type = status?.type;
  const known =
    type === "notLoaded" ||
    type === "idle" ||
    type === "systemError" ||
    type === "active"
      ? type
      : "unknown";
  return {
    status: known,
    activeFlags: Array.isArray(status?.activeFlags)
      ? status.activeFlags.map(String)
      : [],
  };
};

const threadSource = (value: unknown): string => {
  if (typeof value === "string") return value;
  const source = asObject(value);
  if (!source) return "unknown";
  if (typeof source.custom === "string") return source.custom;
  if ("subAgent" in source) return "subAgent";
  return "unknown";
};

const turnStatusValue = (turn: JsonObject): string => {
  if (typeof turn.status === "string") return turn.status;
  const status = asObject(turn.status);
  if (typeof status?.type === "string") return status.type;
  if (typeof status?.status === "string") return status.status;
  return "unknown";
};

export const successfulTurnStatus = (status: string): boolean =>
  ["completed", "complete", "done"].includes(status.toLowerCase());

export const parseLocalThread = (value: unknown): LocalThread => {
  const thread = asObject(value);
  if (!thread) throw new Error("Invalid thread response from app-server");
  return {
    threadId: String(thread.id),
    title: typeof thread.name === "string" ? thread.name : null,
    preview: typeof thread.preview === "string" ? thread.preview : "",
    cwd: String(thread.cwd),
    updatedAt:
      typeof thread.updatedAt === "number" ? thread.updatedAt : 0,
    ...threadStatus(thread.status),
    source: threadSource(thread.source),
  };
};

const agentMessageText = (items: JsonObject[]): string => {
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

export const extractCompletedTurnText = (
  completedTurn: JsonObject,
  notifications: JsonObject[],
  threadId: string,
  turnId: string,
): string => {
  const items = new Map<string, JsonObject>();
  let anonymousIndex = 0;
  const addItem = (value: unknown): void => {
    const item = asObject(value);
    if (!item) return;
    const key =
      typeof item.id === "string" ? item.id : `anonymous-${anonymousIndex++}`;
    items.set(key, item);
  };

  for (const notification of notifications) {
    if (notification.method !== "item/completed") continue;
    const params = asObject(notification.params);
    if (
      !params ||
      params.threadId !== threadId ||
      params.turnId !== turnId
    ) {
      continue;
    }
    addItem(params.item);
  }

  if (Array.isArray(completedTurn.items)) {
    for (const item of completedTurn.items) addItem(item);
  }

  return agentMessageText([...items.values()]);
};

const textInput = (text: string): JsonObject => ({
  type: "text",
  text,
  text_elements: [],
});

const progressActivity = (item: JsonObject): string | null => {
  switch (item.type) {
    case "commandExecution":
      return "Выполняет команды";
    case "fileChange":
      return "Работает с файлами";
    case "mcpToolCall":
    case "dynamicToolCall":
      return "Использует подключённый инструмент";
    case "webSearch":
      return "Ищет информацию";
    default:
      return null;
  }
};

const progressPlan = (value: unknown): ProgressPlanStep[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const step = asObject(entry);
    if (
      !step ||
      typeof step.step !== "string" ||
      typeof step.status !== "string"
    ) {
      return [];
    }
    return [{ step: step.step.slice(0, 500), status: step.status.slice(0, 50) }];
  });
};

// @spec spec://modules/coordinator/FEAT-006-progress-updates#event-sources
export const extractTurnProgressNotification = (
  event: JsonObject,
  threadId: string,
  turnId: string,
): Omit<TurnProgress, "revision"> | null => {
  const params = asObject(event.params);
  if (
    !params ||
    params.threadId !== threadId ||
    params.turnId !== turnId
  ) {
    return null;
  }
  if (event.method === "turn/plan/updated") {
    const plan = progressPlan(params.plan);
    return plan.length > 0
      ? {
          threadId,
          turnId,
          itemId: "plan",
          phase: "plan",
          text: plan.map((step) => `${step.status}: ${step.step}`).join("\n"),
          plan,
        }
      : null;
  }
  if (event.method !== "item/started" && event.method !== "item/completed") {
    return null;
  }
  const item = asObject(params.item);
  if (!item) return null;
  const itemId =
    typeof item.id === "string"
      ? item.id
      : typeof item.type === "string"
        ? item.type
        : "item";
  if (
    event.method === "item/completed" &&
    item.type === "agentMessage" &&
    item.phase === "commentary" &&
    typeof item.text === "string" &&
    item.text.trim()
  ) {
    return {
      threadId,
      turnId,
      itemId,
      phase: "commentary",
      text: item.text.trim().slice(0, 4_000),
      plan: null,
    };
  }
  const activity =
    event.method === "item/started" ? progressActivity(item) : null;
  return activity
    ? {
        threadId,
        turnId,
        itemId,
        phase: "activity",
        text: activity,
        plan: null,
      }
    : null;
};

export const extractTurnProgressSnapshot = (
  turn: JsonObject,
  threadId: string,
  turnId: string,
): Array<Omit<TurnProgress, "revision">> => {
  const updates: Array<Omit<TurnProgress, "revision">> = [];
  const plan = progressPlan(turn.plan);
  if (plan.length > 0) {
    updates.push({
      threadId,
      turnId,
      itemId: "plan",
      phase: "plan",
      text: plan.map((step) => `${step.status}: ${step.step}`).join("\n"),
      plan,
    });
  }
  const items = Array.isArray(turn.items)
    ? turn.items.map(asObject).filter((item): item is JsonObject => item !== null)
    : [];
  for (const [index, item] of items.entries()) {
    const itemId =
      typeof item.id === "string" ? item.id : `${String(index)}-item`;
    if (
      item.type === "agentMessage" &&
      item.phase === "commentary" &&
      typeof item.text === "string" &&
      item.text.trim()
    ) {
      updates.push({
        threadId,
        turnId,
        itemId,
        phase: "commentary",
        text: item.text.trim().slice(0, 4_000),
        plan: null,
      });
      continue;
    }
    const activity = progressActivity(item);
    if (activity) {
      updates.push({
        threadId,
        turnId,
        itemId,
        phase: "activity",
        text: activity,
        plan: null,
      });
    }
  }
  return updates;
};

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly notifications: JsonObject[] = [];
  private readonly waiters: Waiter[] = [];
  private readonly notificationListeners = new Set<
    (message: JsonObject) => void
  >();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly codexBin: string,
    private readonly idleTimeoutMs = 60_000,
    private readonly codexArgs: string[] = [],
    private readonly onThreadReady: (threadId: string) => Promise<void> = () =>
      Promise.resolve(),
  ) {}

  async createThread(
    cwd: string,
    title: string,
    options: TurnOptions = {},
  ): Promise<string> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      const started = await this.request("thread/start", {
        cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        ephemeral: false,
        ...(options.model ? { model: options.model } : {}),
      });
      const thread = started.thread as JsonObject;
      const threadId = String(thread.id);
      await this.request("thread/name/set", { threadId, name: title });
      return threadId;
    } catch (error) {
      this.scheduleIdleStop();
      throw error;
    }
  }

  async startThread(
    cwd: string,
    prompt: string,
    title: string,
    options: TurnOptions = {},
  ): Promise<TurnHandle> {
    const threadId = await this.createThread(cwd, title, options);
    try {
      const handle = await this.startTurn(threadId, prompt, options);
      await this.showThread(threadId);
      return handle;
    } catch (error) {
      this.scheduleIdleStop();
      throw error;
    }
  }

  async resumeThread(
    threadId: string,
    cwd: string | undefined,
    prompt: string,
    options: TurnOptions = {},
  ): Promise<TurnHandle> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      await this.request("thread/resume", {
        threadId,
        ...(cwd ? { cwd } : {}),
      });
      const handle = await this.startTurn(threadId, prompt, options);
      await this.showThread(threadId);
      return handle;
    } catch (error) {
      this.scheduleIdleStop();
      throw error;
    }
  }

  async listThreads(query: string | undefined, limit: number): Promise<LocalThread[]> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      const response = await this.request("thread/list", {
        archived: false,
        limit: Math.min(Math.max(limit, 1), 20),
        useStateDbOnly: true,
        ...(query ? { searchTerm: query } : {}),
        sortKey: "recency_at",
        sortDirection: "desc",
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map(parseLocalThread);
    } finally {
      this.scheduleIdleStop();
    }
  }

  async readThread(threadId: string): Promise<LocalThread> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      const response = await this.request("thread/read", {
        threadId,
        includeTurns: false,
      });
      return parseLocalThread(response.thread);
    } finally {
      this.scheduleIdleStop();
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      const response = await this.request("model/list", {
        limit: 100,
        includeHidden: false,
      });
      const models = Array.isArray(response.data) ? response.data : [];
      return models.map((value) => {
        const model = asObject(value);
        const id = asString(model?.id);
        const modelName = asString(model?.model) || id;
        return ModelDescriptorSchema.parse({
          id,
          model: modelName,
          displayName: asString(model?.displayName) || modelName,
          isDefault: model?.isDefault === true,
          defaultReasoningEffort:
            typeof model?.defaultReasoningEffort === "string"
              ? model.defaultReasoningEffort
              : null,
          supportedReasoningEfforts: Array.isArray(
            model?.supportedReasoningEfforts,
          )
            ? model.supportedReasoningEfforts
            : [],
        });
      });
    } finally {
      this.scheduleIdleStop();
    }
  }

  async waitForTurn(
    threadId: string,
    turnId: string,
    onProgress?: TurnOptions["onProgress"],
  ): Promise<{ status: string; text: string }> {
    this.cancelIdleStop();
    await this.ensureStarted();
    const deadline = Date.now() + 24 * 60 * 60 * 1_000;
    const revisions = new Map<string, { value: string; revision: number }>();
    try {
      while (Date.now() < deadline) {
        const response = await this.request("thread/read", {
          threadId,
          includeTurns: true,
        });
        const thread = asObject(response.thread);
        const turns = Array.isArray(thread?.turns)
          ? thread.turns
              .map(asObject)
              .filter((turn): turn is JsonObject => turn !== null)
          : [];
        const turn = turns.find((candidate) => candidate.id === turnId);
        if (turn) {
          for (const update of extractTurnProgressSnapshot(
            turn,
            threadId,
            turnId,
          )) {
            const value = JSON.stringify(update);
            const previous = revisions.get(update.itemId);
            if (previous?.value === value) continue;
            const revision = (previous?.revision ?? 0) + 1;
            revisions.set(update.itemId, { value, revision });
            await onProgress?.({ ...update, revision });
          }
          const status = turnStatusValue(turn);
          if (successfulTurnStatus(status)) {
            return {
              status,
              text: extractCompletedTurnText(turn, [], threadId, turnId),
            };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(`Turn ${turnId} did not complete within 24 hours`);
    } finally {
      this.scheduleIdleStop();
    }
  }

  async steer(handle: TurnHandle, message: string): Promise<boolean> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      await this.request("turn/steer", {
        threadId: handle.threadId,
        expectedTurnId: handle.turnId,
        input: [textInput(message)],
      });
      await this.showThread(handle.threadId);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("no active turn")) {
        return false;
      }
      throw error;
    }
  }

  async interrupt(handle: TurnHandle): Promise<void> {
    this.cancelIdleStop();
    await this.ensureStarted();
    try {
      await this.request("turn/interrupt", {
        threadId: handle.threadId,
        turnId: handle.turnId,
      });
    } finally {
      this.scheduleIdleStop();
    }
  }

  async stop(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
    const stillRunning = (): boolean => child.exitCode === null;
    if (stillRunning()) child.kill("SIGKILL");
  }

  private async startTurn(
    threadId: string,
    prompt: string,
    options: TurnOptions = {},
  ): Promise<TurnHandle> {
    this.cancelIdleStop();
    const response = await this.request("turn/start", {
      threadId,
      input: [textInput(prompt)],
      ...(options.model ? { model: options.model } : {}),
      ...(options.reasoningEffort
        ? { effort: options.reasoningEffort }
        : {}),
    });
    const turn = response.turn as JsonObject;
    const turnId = String(turn.id);
    const revisions = new Map<string, { value: string; revision: number }>();
    const publish = (
      itemId: string,
      phase: ProgressPhase,
      text: string,
      plan: ProgressPlanStep[] | null = null,
    ): void => {
      const value = JSON.stringify({ phase, text, plan });
      const previous = revisions.get(itemId);
      if (previous?.value === value) return;
      const revision = (previous?.revision ?? 0) + 1;
      revisions.set(itemId, { value, revision });
      void options
        .onProgress?.({
          threadId,
          turnId,
          itemId,
          revision,
          phase,
          text,
          plan,
        });
    };
    const onNotification = (event: JsonObject): void => {
      const update = extractTurnProgressNotification(event, threadId, turnId);
      if (update) {
        publish(
          update.itemId,
          update.phase,
          update.text,
          update.plan,
        );
      }
    };
    this.notificationListeners.add(onNotification);
    const completed = this.waitFor(
      (event) =>
        event.method === "turn/completed" &&
        (event.params as JsonObject).threadId === threadId &&
        ((event.params as JsonObject).turn as JsonObject).id === turnId,
      24 * 60 * 60 * 1000,
    ).then(async (event) => {
      const completedTurn = (event.params as JsonObject).turn as JsonObject;
      const text = extractCompletedTurnText(
        completedTurn,
        this.notifications,
        threadId,
        turnId,
      );
      await this.showThread(threadId);
      this.scheduleIdleStop();
      return { status: String(completedTurn.status), text };
    }).finally(() => this.notificationListeners.delete(onNotification));
    return { threadId, turnId, completed };
  }

  private async ensureStarted(): Promise<void> {
    if (this.child?.exitCode === null) return;
    const env = { ...process.env };
    delete env.AOP_DEVICE_TOKEN;
    this.child = spawn(this.codexBin, [...this.codexArgs, "app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    const child = this.child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.onLine(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (/error|panic/i.test(chunk)) console.error("[app-server]", chunk.trim());
    });
    child.on("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      const error = new Error(
        `codex app-server exited: code=${code} signal=${signal}`,
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    });
    await this.request("initialize", {
      clientInfo: {
        name: "agent-operator-worker",
        title: "Agent Operator worker",
        version: "0.1.22",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
    this.notify("initialized");
  }

  private onLine(line: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      return;
    }
    if (
      typeof message.id === "number" &&
      ("result" in message || "error" in message)
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result as JsonObject);
      return;
    }
    if (typeof message.method === "string") {
      this.notifications.push(message);
      if (this.notifications.length > 500) this.notifications.shift();
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(message)) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
      for (const listener of this.notificationListeners) listener(message);
    }
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("app-server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  private notify(method: string): void {
    this.child?.stdin.write(`${JSON.stringify({ method })}\n`);
  }

  private waitFor(
    predicate: (message: JsonObject) => boolean,
    timeoutMs: number,
  ): Promise<JsonObject> {
    const found = this.notifications.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`app-server notification timeout: ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private scheduleIdleStop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.stop(), this.idleTimeoutMs);
  }

  private cancelIdleStop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async showThread(threadId: string): Promise<void> {
    try {
      await this.onThreadReady(threadId);
    } catch (error) {
      console.error("[app-server] unable to open ChatGPT Desktop task", error);
    }
  }
}
