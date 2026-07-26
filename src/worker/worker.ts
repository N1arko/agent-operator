import { access, readFile } from "node:fs/promises";
import {
  ProjectDescriptorSchema,
  WorkerConfigFileSchema,
  type Message,
  type ProjectConfig,
} from "../shared/protocol.js";
import type { TurnHandle } from "./app-server.js";
import { CoordinatorClient } from "./client.js";
import { loadState, saveState, type WorkerState } from "./state.js";

type WorkItem = {
  message: Message;
  mode: "start" | "resume";
};

export type WorkerOptions = {
  agentName: string;
  platform: "macos" | "windows" | "linux" | "unknown";
  projectsFile: string;
  stateFile: string;
  client: CoordinatorClient;
  appServer: {
    startThread(cwd: string, prompt: string): Promise<TurnHandle>;
    resumeThread(
      threadId: string,
      cwd: string,
      prompt: string,
    ): Promise<TurnHandle>;
    steer(handle: TurnHandle, message: string): Promise<boolean>;
    stop(): Promise<void>;
  };
  heartbeatMs?: number;
};

export class Worker {
  private state!: WorkerState;
  private projects: ProjectConfig[] = [];
  private queue: WorkItem[] = [];
  private active:
    | { item: WorkItem; handle: TurnHandle; activity: string }
    | undefined;
  private stopped = false;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: WorkerOptions) {}

  async start(): Promise<void> {
    this.state = await loadState(this.options.stateFile);
    this.projects = await this.loadProjects();
    await this.sendHeartbeat();
    this.heartbeatTimer = setInterval(
      () =>
        void this.sendHeartbeat().catch((error: unknown) =>
          console.error(error),
        ),
      this.options.heartbeatMs ?? 10_000,
    );
    while (!this.stopped) {
      try {
        const inbox = await this.options.client.messages(this.state.cursor);
        for (const message of inbox.messages) await this.receive(message);
        if (inbox.nextCursor > this.state.cursor) {
          this.state.cursor = inbox.nextCursor;
          await saveState(this.options.stateFile, this.state);
        }
      } catch (error) {
        console.error("[worker]", error);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.options.appServer.stop();
  }

  private async receive(message: Message): Promise<void> {
    await this.options.client.acknowledge(message.id);
    if (message.kind === "start") {
      this.queue.push({ message, mode: "start" });
      void this.runNext();
      return;
    }
    if (message.kind !== "send") return;
    if (
      this.active?.item.message.rootMessageId === message.rootMessageId &&
      (await this.options.appServer.steer(this.active.handle, message.text))
    ) {
      return;
    }
    this.queue.push({ message, mode: "resume" });
    void this.runNext();
  }

  private async runNext(): Promise<void> {
    if (this.active || this.queue.length === 0) return;
    const item = this.queue.shift();
    if (!item) return;
    try {
      const projectId =
        item.message.projectId ??
        this.state.threads[item.message.rootMessageId]?.projectId;
      const project = this.projects.find((entry) => entry.id === projectId);
      if (!project) throw new Error(`Unknown local project: ${projectId}`);
      await access(project.path);
      const activity = `${project.name}: ${item.message.text.slice(0, 160)}`;
      let handle: TurnHandle;
      if (item.mode === "start") {
        handle = await this.options.appServer.startThread(
          project.path,
          item.message.text,
        );
        this.state.threads[item.message.rootMessageId] = {
          threadId: handle.threadId,
          projectId: project.id,
          requesterAgentId: item.message.fromAgentId,
        };
        await saveState(this.options.stateFile, this.state);
      } else {
        const binding = this.state.threads[item.message.rootMessageId];
        if (!binding) {
          throw new Error(
            `No thread binding for ${item.message.rootMessageId}`,
          );
        }
        handle = await this.options.appServer.resumeThread(
          binding.threadId,
          project.path,
          item.message.text,
        );
      }
      this.active = { item, handle, activity };
      await this.sendHeartbeat();
      void handle.completed
        .then((result) => this.complete(item, result.status, result.text))
        .catch((error: unknown) =>
          this.complete(
            item,
            "failed",
            error instanceof Error ? error.message : String(error),
          ),
        );
    } catch (error) {
      await this.complete(
        item,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async complete(
    item: WorkItem,
    status: string,
    text: string,
  ): Promise<void> {
    const binding = this.state.threads[item.message.rootMessageId];
    const requesterAgentId =
      binding?.requesterAgentId ?? item.message.fromAgentId;
    await this.options.client.publishResult({
      rootMessageId: item.message.rootMessageId,
      replyTo: item.message.id,
      toAgentId: requesterAgentId,
      text,
      attachments: [],
      failed: status !== "completed",
    });
    if (this.active?.item.message.id === item.message.id) this.active = undefined;
    await this.sendHeartbeat();
    void this.runNext();
  }

  private async loadProjects(): Promise<ProjectConfig[]> {
    const parsed = WorkerConfigFileSchema.parse(
      JSON.parse(await readFile(this.options.projectsFile, "utf8")),
    );
    return parsed.projects;
  }

  private async sendHeartbeat(): Promise<void> {
    const descriptors = await Promise.all(
      this.projects.map(async (project) => {
        let available = true;
        try {
          await access(project.path);
        } catch {
          available = false;
        }
        return ProjectDescriptorSchema.parse({
          id: project.id,
          name: project.name,
          tags: project.tags,
          available,
        });
      }),
    );
    await this.options.client.heartbeat({
      name: this.options.agentName,
      platform: this.options.platform,
      state: this.active ? "busy" : "idle",
      currentProjectId:
        this.active?.item.message.projectId ??
        (this.active
          ? this.state.threads[this.active.item.message.rootMessageId]?.projectId
          : null) ??
        null,
      currentActivity: this.active?.activity ?? null,
      projects: descriptors,
      workerVersion: "0.1.1",
    });
  }
}
