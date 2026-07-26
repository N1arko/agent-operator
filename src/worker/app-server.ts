import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

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

const textInput = (text: string): JsonObject => ({
  type: "text",
  text,
  text_elements: [],
});

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly notifications: JsonObject[] = [];
  private readonly waiters: Waiter[] = [];
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly codexBin: string,
    private readonly idleTimeoutMs = 60_000,
  ) {}

  async startThread(cwd: string, prompt: string): Promise<TurnHandle> {
    await this.ensureStarted();
    const started = await this.request("thread/start", {
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      ephemeral: false,
    });
    const thread = started.thread as JsonObject;
    return this.startTurn(String(thread.id), prompt);
  }

  async resumeThread(
    threadId: string,
    cwd: string,
    prompt: string,
  ): Promise<TurnHandle> {
    await this.ensureStarted();
    await this.request("thread/resume", { threadId, cwd });
    return this.startTurn(threadId, prompt);
  }

  async steer(handle: TurnHandle, message: string): Promise<boolean> {
    await this.ensureStarted();
    try {
      await this.request("turn/steer", {
        threadId: handle.threadId,
        expectedTurnId: handle.turnId,
        input: [textInput(message)],
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("no active turn")) {
        return false;
      }
      throw error;
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
  ): Promise<TurnHandle> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const response = await this.request("turn/start", {
      threadId,
      input: [textInput(prompt)],
    });
    const turn = response.turn as JsonObject;
    const turnId = String(turn.id);
    const completed = this.waitFor(
      (event) =>
        event.method === "turn/completed" &&
        (event.params as JsonObject).threadId === threadId &&
        ((event.params as JsonObject).turn as JsonObject).id === turnId,
      24 * 60 * 60 * 1000,
    ).then((event) => {
      const completedTurn = (event.params as JsonObject).turn as JsonObject;
      const items = completedTurn.items as JsonObject[];
      const text = items
        .filter((item) => item.type === "agentMessage")
        .map((item) => String(item.text))
        .join("\n");
      this.scheduleIdleStop();
      return { status: String(completedTurn.status), text };
    });
    return { threadId, turnId, completed };
  }

  private async ensureStarted(): Promise<void> {
    if (this.child?.exitCode === null) return;
    this.child = spawn(this.codexBin, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
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
        version: "0.1.0",
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
}
