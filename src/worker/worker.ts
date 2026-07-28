import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as z from "zod/v4";
import {
  ProjectDescriptorSchema,
  WorkerConfigFileSchema,
  type GitFileAttachment,
  type Message,
  type ModelDescriptor,
  type ProjectConfig,
  type TemporaryFileAttachment,
} from "../shared/protocol.js";
import type {
  LocalThread,
  TurnHandle,
  TurnOptions,
} from "./app-server.js";
import { CoordinatorClient } from "./client.js";
import { appendGitFilesToPrompt, resolveGitFile } from "./git-file.js";
import { loadState, saveState, type WorkerState } from "./state.js";
import {
  appendTemporaryFilesToPrompt,
  downloadTemporaryFiles,
  removeDownloadedTemporaryFiles,
  type DownloadedTemporaryFile,
} from "./temporary-file.js";

type WorkItem = {
  message: Message;
  mode: "start" | "resume" | "threads_query" | "thread_send" | "models_query";
};

type StartedWork = {
  handle: TurnHandle;
  activity: string;
  canSteer: boolean;
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
  temporaryDirectory: string;
  client: CoordinatorClient;
  appServer: {
    createThread(
      cwd: string,
      title: string,
      options?: TurnOptions,
    ): Promise<string>;
    startThread(
      cwd: string,
      prompt: string,
      title: string,
      options?: TurnOptions,
    ): Promise<TurnHandle>;
    resumeThread(
      threadId: string,
      cwd: string | undefined,
      prompt: string,
      options?: TurnOptions,
    ): Promise<TurnHandle>;
    listThreads(query: string | undefined, limit: number): Promise<LocalThread[]>;
    readThread(threadId: string): Promise<LocalThread>;
    listModels(): Promise<ModelDescriptor[]>;
    waitForTurn(
      threadId: string,
      turnId: string,
    ): Promise<{ status: string; text: string }>;
    steer(handle: TurnHandle, message: string): Promise<boolean>;
    interrupt(handle: TurnHandle): Promise<void>;
    stop(): Promise<void>;
  };
  desktopFollower?: {
    resumeThread(
      threadId: string,
      prompt: string,
      options?: TurnOptions,
      externalCompletion?: (
        threadId: string,
        turnId: string,
      ) => Promise<{ status: string; text: string }>,
    ): Promise<TurnHandle>;
    interrupt(handle: TurnHandle): Promise<void>;
  };
  heartbeatMs?: number;
};

export class Worker {
  private state!: WorkerState;
  private projects: ProjectConfig[] = [];
  private queue: WorkItem[] = [];
  private active:
    | {
        item: WorkItem;
        handle: TurnHandle;
        activity: string;
        canSteer: boolean;
        leaseTimer: NodeJS.Timeout | undefined;
      }
    | undefined;
  private stopped = false;
  private running = false;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private stateWrite: Promise<void> = Promise.resolve();
  private readonly temporaryFiles = new Map<
    string,
    DownloadedTemporaryFile[]
  >();
  private readonly settledMessages = new Set<string>();

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
    if (message.kind === "cancel") {
      await this.receiveCancellation(message);
      return;
    }
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
      this.active?.canSteer === true &&
      this.active.item.message.rootMessageId === message.rootMessageId
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
    if (message.kind === "models_query") {
      return { message, mode: "models_query" };
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
      if (item.mode === "models_query") {
        await this.findModels(item);
        return;
      }
      if (
        item.message.leaseExpiresAt &&
        Date.parse(item.message.leaseExpiresAt) <= Date.now()
      ) {
        await this.complete(
          item,
          "failed",
          `Request lease expired at ${item.message.leaseExpiresAt}`,
        );
        return;
      }

      await this.validateModelSelection(item.message);
      const { handle, activity, canSteer } =
        item.mode === "start"
          ? await this.startProjectThread(item)
          : item.mode === "thread_send"
            ? await this.startExistingThread(item)
            : await this.resumeBoundThread(item);
      this.active = {
        item,
        handle,
        activity,
        canSteer,
        leaseTimer: this.armLease(item, handle),
      };
      await this.sendHeartbeat();
      void handle.completed
        .then((result) => {
          if (this.settledMessages.has(item.message.id)) return;
          return this.complete(item, result.status, result.text);
        })
        .catch((error: unknown) =>
          this.settledMessages.has(item.message.id)
            ? undefined
            : this.complete(
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
  ): Promise<StartedWork> {
    const project = this.projects.find(
      (entry) => entry.id === item.message.projectId,
    );
    if (!project) {
      throw new Error(`Unknown local project: ${item.message.projectId}`);
    }
    await access(project.path);
    const prompt = await this.preparePrompt(item.message, project);
    const title = remoteThreadTitle(item.message);
    const desktopFollower = this.options.desktopFollower;
    let handle: TurnHandle;
    let desktopAccepted = false;
    if (desktopFollower) {
      const threadId = await this.options.appServer.createThread(
        project.path,
        title,
        this.turnOptions(item.message),
      );
      try {
        handle = await desktopFollower.resumeThread(
          threadId,
          prompt,
          this.turnOptions(item.message),
          (acceptedThreadId, turnId) =>
            this.options.appServer.waitForTurn(acceptedThreadId, turnId),
        );
        desktopAccepted = true;
      } catch (error) {
        console.warn(
          "[worker] Codex Desktop rejected the initial turn; using app-server",
          error,
        );
        handle = await this.options.appServer.resumeThread(
          threadId,
          project.path,
          prompt,
          this.turnOptions(item.message),
        );
      }
    } else {
      handle = await this.options.appServer.startThread(
        project.path,
        prompt,
        title,
        this.turnOptions(item.message),
      );
    }
    this.state.threads[item.message.rootMessageId] = {
      threadId: handle.threadId,
      projectId: project.id,
      requesterAgentId: item.message.fromAgentId,
    };
    await this.persistState();
    return {
      handle,
      activity: `${project.name}: ${item.message.text.slice(0, 160)}`,
      canSteer: !desktopAccepted,
    };
  }

  private async resumeBoundThread(
    item: WorkItem,
  ): Promise<StartedWork> {
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
    const desktopFollower = this.options.desktopFollower;
    if (desktopFollower) {
      try {
        return {
          handle: await desktopFollower.resumeThread(
            binding.threadId,
            prompt,
            this.turnOptions(item.message),
            (threadId, turnId) =>
              this.options.appServer.waitForTurn(threadId, turnId),
          ),
          activity: `${project?.name ?? "Existing task"}: ${item.message.text.slice(0, 160)}`,
          canSteer: false,
        };
      } catch (error) {
        console.warn(
          "[worker] Codex Desktop rejected the turn; using app-server",
          error,
        );
      }
    }
    return {
      handle: await this.options.appServer.resumeThread(
        binding.threadId,
        project?.path,
        prompt,
        this.turnOptions(item.message),
      ),
      activity: `${project?.name ?? "Existing task"}: ${item.message.text.slice(0, 160)}`,
      canSteer: true,
    };
  }

  private async startExistingThread(
    item: WorkItem,
  ): Promise<StartedWork> {
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
    const desktopFollower = this.options.desktopFollower;
    let handle: TurnHandle | undefined;
    let desktopAccepted = false;
    if (desktopFollower) {
      try {
        handle = await desktopFollower.resumeThread(
          threadId,
          prompt,
          this.turnOptions(item.message),
          (acceptedThreadId, turnId) =>
            this.options.appServer.waitForTurn(acceptedThreadId, turnId),
        );
        desktopAccepted = true;
      } catch (error) {
        console.warn(
          "[worker] Codex Desktop rejected the turn; using app-server",
          error,
        );
      }
    }
    handle ??= await this.options.appServer.resumeThread(
      threadId,
      undefined,
      prompt,
      this.turnOptions(item.message),
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
      canSteer: !desktopAccepted,
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

  private async findModels(item: WorkItem): Promise<void> {
    const models = await this.options.appServer.listModels();
    await this.complete(
      item,
      "completed",
      JSON.stringify({
        returned: models.length,
        models,
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
    const active = this.active;
    if (active?.item.message.id === item.message.id && active.leaseTimer) {
      clearTimeout(active.leaseTimer);
    }
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
        failed: status === "failed",
        cancelled: status === "cancelled",
      });
    } catch (error) {
      console.error("[worker] result delivery failed; retrying", error);
      setTimeout(
        () => void this.complete(item, status, text),
        2_000,
      );
      return;
    }
    await this.releaseTemporaryFiles(item.message.id);
    await this.removePending(item.message.id);
    if (this.active?.item.message.id === item.message.id) this.active = undefined;
    this.settledMessages.add(item.message.id);
    await this.sendHeartbeat();
    void this.runNext();
  }

  private async receiveCancellation(message: Message): Promise<void> {
    await this.options.client.acknowledge(message.id);
    const targetId = message.replyTo;
    if (!targetId) return;
    this.settledMessages.add(targetId);
    this.queue = this.queue.filter((item) => item.message.id !== targetId);
    await this.removePending(targetId);
    const active = this.active;
    if (active?.item.message.id === targetId) {
      if (active.leaseTimer) clearTimeout(active.leaseTimer);
      try {
        if (this.options.desktopFollower && !active.canSteer) {
          await this.options.desktopFollower.interrupt(active.handle);
        } else {
          await this.options.appServer.interrupt(active.handle);
        }
      } catch (error) {
        console.error("[worker] task interrupt failed", error);
      }
      await this.releaseTemporaryFiles(targetId);
      this.active = undefined;
      await this.sendHeartbeat();
      void this.runNext();
    }
  }

  private armLease(item: WorkItem, handle: TurnHandle): NodeJS.Timeout | undefined {
    const expiresAt = item.message.leaseExpiresAt;
    if (!expiresAt) return undefined;
    const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
    return setTimeout(
      () => void this.expireActive(item, handle),
      Math.min(remaining, 2_147_483_647),
    );
  }

  private async expireActive(
    item: WorkItem,
    handle: TurnHandle,
  ): Promise<void> {
    if (this.active?.item.message.id !== item.message.id) return;
    this.settledMessages.add(item.message.id);
    try {
      if (this.options.desktopFollower && !this.active.canSteer) {
        await this.options.desktopFollower.interrupt(handle);
      } else {
        await this.options.appServer.interrupt(handle);
      }
    } catch (error) {
      console.error("[worker] lease interrupt failed", error);
    }
    await this.complete(
      item,
      "failed",
      `Request lease expired at ${item.message.leaseExpiresAt}`,
    );
  }

  private turnOptions(message: Message): TurnOptions {
    return {
      ...(message.model ? { model: message.model } : {}),
      ...(message.reasoningEffort
        ? { reasoningEffort: message.reasoningEffort }
        : {}),
    };
  }

  private async validateModelSelection(message: Message): Promise<void> {
    if (!message.model && !message.reasoningEffort) return;
    const models = await this.options.appServer.listModels();
    const selected = message.model
      ? models.find(
          (candidate) =>
            candidate.id === message.model || candidate.model === message.model,
        )
      : models.find((candidate) => candidate.isDefault);
    if (message.model && !selected) {
      throw new Error(`Model is unavailable on this agent: ${message.model}`);
    }
    if (
      message.reasoningEffort &&
      selected &&
      !selected.supportedReasoningEfforts.some(
        (effort) => effort.reasoningEffort === message.reasoningEffort,
      )
    ) {
      throw new Error(
        `Reasoning effort ${message.reasoningEffort} is unavailable for ${selected.id}`,
      );
    }
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
    const gitAttachments = message.attachments.filter(
      (attachment): attachment is GitFileAttachment =>
        attachment.type === "git_file",
    );
    const temporaryAttachments = message.attachments.filter(
      (attachment): attachment is TemporaryFileAttachment =>
        attachment.type === "temporary_file",
    );
    if (gitAttachments.length > 0 && !project) {
      throw new Error(
        "Git attachments require a thread mapped to a published project",
      );
    }
    let prompt = message.text;
    if (project) {
      const files = [];
      for (const attachment of gitAttachments) {
        files.push(await resolveGitFile(project, attachment));
      }
      prompt = appendGitFilesToPrompt(prompt, files);
    }
    const temporaryFiles = await downloadTemporaryFiles(
      this.options.client,
      this.options.temporaryDirectory,
      message.id,
      temporaryAttachments,
    );
    this.temporaryFiles.set(message.id, temporaryFiles);
    return appendTemporaryFilesToPrompt(prompt, temporaryFiles);
  }

  private async releaseTemporaryFiles(messageId: string): Promise<void> {
    const files = this.temporaryFiles.get(messageId) ?? [];
    for (const file of files) {
      try {
        await this.options.client.acknowledgeTemporaryFile(
          file.attachment.fileId,
        );
      } catch (error) {
        console.error(
          `[worker] temporary file acknowledgement failed: ${file.attachment.fileId}`,
          error,
        );
      }
    }
    try {
      await removeDownloadedTemporaryFiles(
        this.options.temporaryDirectory,
        messageId,
      );
    } catch (error) {
      console.error(
        `[worker] temporary file cleanup failed: ${messageId}`,
        error,
      );
    }
    this.temporaryFiles.delete(messageId);
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
      workerVersion: "0.1.18",
    });
  }
}
