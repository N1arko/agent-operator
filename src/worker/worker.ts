import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as z from "zod/v4";
import {
  ProjectDescriptorSchema,
  WorkerConfigFileSchema,
  type GitFileAttachment,
  type Message,
  type ProjectConfig,
} from "../shared/protocol.js";
import type { LocalThread, TurnHandle } from "./app-server.js";
import { CoordinatorClient } from "./client.js";
import { appendGitFilesToPrompt, resolveGitFile } from "./git-file.js";
import { loadState, saveState, type WorkerState } from "./state.js";

type WorkItem = {
  message: Message;
  mode: "start" | "resume" | "threads_query" | "thread_send";
};

const ThreadsQuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(20),
});

const remoteThreadTitle = (message: Message): string => {
  const summary = message.text.replace(/\s+/g, " ").trim().slice(0, 64);
  return `[Agent Operator] ${summary}`;
};

export type WorkerOptions = {
  agentName: string;
  platform: "macos" | "windows" | "linux" | "unknown";
  projectsFile: string;
  stateFile: string;
  client: CoordinatorClient;
  appServer: {
    startThread(
      cwd: string,
      prompt: string,
      title: string,
    ): Promise<TurnHandle>;
    resumeThread(
      threadId: string,
      cwd: string | undefined,
      prompt: string,
    ): Promise<TurnHandle>;
    listThreads(query: string | undefined, limit: number): Promise<LocalThread[]>;
    readThread(threadId: string): Promise<LocalThread>;
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
  private running = false;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private stateWrite: Promise<void> = Promise.resolve();

  constructor(private readonly options: WorkerOptions) {}

  async start(): Promise<void> {
    this.state = await loadState(this.options.stateFile);
    this.projects = await this.loadProjects();
    for (const message of this.state.pendingMessages) {
      const item = this.workItem(message);
      if (item) this.enqueue(item);
    }
    await this.sendHeartbeat();
    void this.runNext();
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
          await this.persistState();
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
    const item = this.workItem(message);
    if (!item) {
      await this.options.client.acknowledge(message.id);
      return;
    }
    const alreadyPending = this.state.pendingMessages.some(
      (entry) => entry.id === message.id,
    );
    if (!alreadyPending) {
      this.state.pendingMessages.push(message);
      await this.persistState();
    }
    await this.options.client.acknowledge(message.id);
    if (
      item.mode === "resume" &&
      message.attachments.length === 0 &&
      this.active?.item.message.rootMessageId === message.rootMessageId
    ) {
      try {
        if (await this.options.appServer.steer(this.active.handle, message.text)) {
          await this.removePending(message.id);
          return;
        }
      } catch (error) {
        console.error("[worker] steering failed; queuing message", error);
      }
    }
    this.enqueue(item);
    void this.runNext();
  }

  private workItem(message: Message): WorkItem | null {
    if (message.kind === "start") return { message, mode: "start" };
    if (message.kind === "threads_query") {
      return { message, mode: "threads_query" };
    }
    if (message.kind === "thread_send") {
      return { message, mode: "thread_send" };
    }
    if (message.kind === "send") return { message, mode: "resume" };
    return null;
  }

  private enqueue(item: WorkItem): void {
    if (
      this.active?.item.message.id === item.message.id ||
      this.queue.some((entry) => entry.message.id === item.message.id)
    ) {
      return;
    }
    this.queue.push(item);
  }

  private async runNext(): Promise<void> {
    if (this.running || this.active || this.queue.length === 0) return;
    const item = this.queue.shift();
    if (!item) return;
    this.running = true;
    try {
      if (item.mode === "threads_query") {
        await this.findThreads(item);
        return;
      }

      const { handle, activity } =
        item.mode === "start"
          ? await this.startProjectThread(item)
          : item.mode === "thread_send"
            ? await this.startExistingThread(item)
            : await this.resumeBoundThread(item);
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
    } finally {
      this.running = false;
      if (!this.active) void this.runNext();
    }
  }

  private async startProjectThread(
    item: WorkItem,
  ): Promise<{ handle: TurnHandle; activity: string }> {
    const project = this.projects.find(
      (entry) => entry.id === item.message.projectId,
    );
    if (!project) {
      throw new Error(`Unknown local project: ${item.message.projectId}`);
    }
    await access(project.path);
    const prompt = await this.preparePrompt(item.message, project);
    const handle = await this.options.appServer.startThread(
      project.path,
      prompt,
      remoteThreadTitle(item.message),
    );
    this.state.threads[item.message.rootMessageId] = {
      threadId: handle.threadId,
      projectId: project.id,
      requesterAgentId: item.message.fromAgentId,
    };
    await this.persistState();
    return {
      handle,
      activity: `${project.name}: ${item.message.text.slice(0, 160)}`,
    };
  }

  private async resumeBoundThread(
    item: WorkItem,
  ): Promise<{ handle: TurnHandle; activity: string }> {
    const binding = this.state.threads[item.message.rootMessageId];
    if (!binding) {
      throw new Error(`No thread binding for ${item.message.rootMessageId}`);
    }
    const project = binding.projectId
      ? this.projects.find((entry) => entry.id === binding.projectId)
      : undefined;
    if (binding.projectId && !project) {
      throw new Error(`Unknown local project: ${binding.projectId}`);
    }
    if (project) await access(project.path);
    const prompt = await this.preparePrompt(item.message, project);
    return {
      handle: await this.options.appServer.resumeThread(
        binding.threadId,
        project?.path,
        prompt,
      ),
      activity: `${project?.name ?? "Existing task"}: ${item.message.text.slice(0, 160)}`,
    };
  }

  private async startExistingThread(
    item: WorkItem,
  ): Promise<{ handle: TurnHandle; activity: string }> {
    const threadId = item.message.targetThreadId;
    if (!threadId) throw new Error("Missing target thread ID");
    const thread = await this.options.appServer.readThread(threadId);
    if (thread.status === "active") {
      throw new Error(
        `Thread ${threadId} is active; wait until it becomes available`,
      );
    }
    const project = this.projectForCwd(thread.cwd);
    const prompt = await this.preparePrompt(item.message, project);
    const handle = await this.options.appServer.resumeThread(
      threadId,
      undefined,
      prompt,
    );
    this.state.threads[item.message.rootMessageId] = {
      threadId,
      projectId: project?.id ?? null,
      requesterAgentId: item.message.fromAgentId,
    };
    await this.persistState();
    return {
      handle,
      activity: `${project?.name ?? thread.title ?? "Existing task"}: ${item.message.text.slice(0, 160)}`,
    };
  }

  private async findThreads(item: WorkItem): Promise<void> {
    const input = ThreadsQuerySchema.parse(JSON.parse(item.message.text));
    const threads = await this.options.appServer.listThreads(
      input.query,
      input.limit,
    );
    const summaries = threads.map((thread) => {
      const project = this.projectForCwd(thread.cwd);
      return {
        threadId: thread.threadId,
        title: thread.title,
        preview: thread.preview.slice(0, 240),
        updatedAt:
          thread.updatedAt > 0
            ? new Date(thread.updatedAt * 1_000).toISOString()
            : null,
        status: thread.status,
        activeFlags: thread.activeFlags,
        source: thread.source,
        available:
          thread.status === "idle"
            ? true
            : thread.status === "active"
              ? false
              : null,
        project: project ? { id: project.id, name: project.name } : null,
      };
    });
    await this.complete(
      item,
      "completed",
      JSON.stringify({
        query: input.query ?? null,
        limit: input.limit,
        returned: summaries.length,
        threads: summaries,
      }),
    );
  }

  private projectForCwd(cwd: string): ProjectConfig | undefined {
    const threadPath = resolve(cwd);
    return this.projects.find((project) => {
      const child = relative(resolve(project.path), threadPath);
      return (
        child === "" ||
        (!isAbsolute(child) &&
          child !== ".." &&
          !child.startsWith(`..${sep}`))
      );
    });
  }

  private async complete(
    item: WorkItem,
    status: string,
    text: string,
  ): Promise<void> {
    const binding = this.state.threads[item.message.rootMessageId];
    const requesterAgentId =
      binding?.requesterAgentId ?? item.message.fromAgentId;
    try {
      await this.options.client.publishResult({
        rootMessageId: item.message.rootMessageId,
        replyTo: item.message.id,
        toAgentId: requesterAgentId,
        threadId:
          binding?.threadId ?? item.message.targetThreadId ?? null,
        text,
        attachments: [],
        failed: status !== "completed",
      });
    } catch (error) {
      console.error("[worker] result delivery failed; retrying", error);
      setTimeout(
        () => void this.complete(item, status, text),
        2_000,
      );
      return;
    }
    await this.removePending(item.message.id);
    if (this.active?.item.message.id === item.message.id) this.active = undefined;
    await this.sendHeartbeat();
    void this.runNext();
  }

  private async removePending(messageId: string): Promise<void> {
    const next = this.state.pendingMessages.filter(
      (message) => message.id !== messageId,
    );
    if (next.length === this.state.pendingMessages.length) return;
    this.state.pendingMessages = next;
    await this.persistState();
  }

  private persistState(): Promise<void> {
    this.stateWrite = this.stateWrite.then(() =>
      saveState(this.options.stateFile, this.state),
    );
    return this.stateWrite;
  }

  private async loadProjects(): Promise<ProjectConfig[]> {
    const parsed = WorkerConfigFileSchema.parse(
      JSON.parse(await readFile(this.options.projectsFile, "utf8")),
    );
    return parsed.projects;
  }

  private async preparePrompt(
    message: Message,
    project: ProjectConfig | undefined,
  ): Promise<string> {
    const unsupported = message.attachments.find(
      (attachment) => attachment.type !== "git_file",
    );
    if (unsupported) {
      throw new Error(`Unsupported attachment type: ${unsupported.type}`);
    }
    const attachments = message.attachments as GitFileAttachment[];
    if (attachments.length === 0) return message.text;
    if (!project) {
      throw new Error(
        "Git attachments require a thread mapped to a published project",
      );
    }
    const files = [];
    for (const attachment of attachments) {
      files.push(await resolveGitFile(project, attachment));
    }
    return appendGitFilesToPrompt(message.text, files);
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
      workerVersion: "0.1.6",
    });
  }
}
