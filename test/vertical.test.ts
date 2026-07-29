import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createCoordinatorApp } from "../src/coordinator/server.js";
import type { TurnHandle } from "../src/worker/app-server.js";
import type { LocalThread } from "../src/worker/app-server.js";
import type { TurnOptions } from "../src/worker/app-server.js";
import type { ModelDescriptor } from "../src/shared/protocol.js";
import { CoordinatorClient } from "../src/worker/client.js";
import { Worker } from "../src/worker/worker.js";

class FakeAppServer {
  creates: Array<{ cwd: string; title: string }> = [];
  starts: Array<{ cwd: string; prompt: string; title: string }> = [];
  resumes: Array<{
    threadId: string;
    cwd: string | undefined;
    prompt: string;
  }> = [];
  listCalls: Array<{ query: string | undefined; limit: number }> = [];
  externalThread: LocalThread = {
    threadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
    title: "Windows setup",
    preview: "Update the Windows worker",
    cwd: "C:\\Users\\nikit\\Documents\\Codex\\projectless",
    updatedAt: 1_753_488_000,
    status: "notLoaded",
    activeFlags: [],
    source: "appServer",
  };
  private sequence = 0;
  readonly createdThreadId =
    "019fa0b8-1abc-73f0-8126-3f8b6d64466c";

  createThread(cwd: string, title: string): Promise<string> {
    this.creates.push({ cwd, title });
    return Promise.resolve(this.createdThreadId);
  }

  startThread(
    cwd: string,
    prompt: string,
    title: string,
  ): Promise<TurnHandle> {
    this.starts.push({ cwd, prompt, title });
    this.sequence += 1;
    return Promise.resolve(this.handle(this.createdThreadId, prompt));
  }

  resumeThread(
    threadId: string,
    cwd: string | undefined,
    prompt: string,
  ): Promise<TurnHandle> {
    this.resumes.push({ threadId, cwd, prompt });
    return Promise.resolve(this.handle(threadId, prompt));
  }

  listThreads(
    query: string | undefined,
    limit: number,
  ): Promise<LocalThread[]> {
    this.listCalls.push({ query, limit });
    return Promise.resolve([this.externalThread]);
  }

  readThread(threadId: string): Promise<LocalThread> {
    assert.equal(threadId, this.externalThread.threadId);
    return Promise.resolve(this.externalThread);
  }

  waitForTurn(
    threadId: string,
    turnId: string,
  ): Promise<{ status: string; text: string }> {
    assert.equal(threadId, this.externalThread.threadId);
    assert.ok(turnId);
    return Promise.resolve({ status: "completed", text: "observed" });
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([
      {
        id: "test-model",
        model: "test-model",
        displayName: "Test model",
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Fast" },
          { reasoningEffort: "medium", description: "Balanced" },
        ],
      },
    ]);
  }

  steer(): Promise<boolean> {
    return Promise.resolve(false);
  }

  interrupt(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  private handle(threadId: string, prompt: string): TurnHandle {
    return {
      threadId,
      turnId: `turn-${this.sequence}`,
      completed: new Promise((resolve) =>
        setTimeout(
          () => resolve({ status: "completed", text: `done: ${prompt}` }),
          30,
        ),
      ),
    };
  }
}

const servers: Server[] = [];
const stores: CoordinatorStore[] = [];
const directories: string[] = [];
const workers: Worker[] = [];
const execFileAsync = promisify(execFile);

const git = async (directory: string, ...args: string[]): Promise<string> => {
  const result = await execFileAsync("git", ["-C", directory, ...args], {
    encoding: "utf8",
  });
  return result.stdout.trim();
};

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.stop()));
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  for (const store of stores.splice(0)) store.close();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("local vertical scenario", () => {
  it("discovers a worker, starts a task, waits and resumes its thread", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-vertical-"));
    directories.push(directory);
    await git(directory, "init");
    await git(directory, "config", "user.name", "Agent Operator Test");
    await git(directory, "config", "user.email", "test@example.invalid");
    await mkdir(join(directory, "docs"));
    const attachmentContent = "shared plan\n";
    await writeFile(join(directory, "docs", "shared.md"), attachmentContent);
    await git(directory, "add", "docs/shared.md");
    await git(directory, "commit", "-m", "Add shared plan");
    await git(
      directory,
      "remote",
      "add",
      "origin",
      "git@github.com:example/local-project.git",
    );
    const attachmentRevision = await git(directory, "rev-parse", "HEAD");
    const attachmentSha256 = createHash("sha256")
      .update(attachmentContent)
      .digest("hex");
    const projectsFile = join(directory, "projects.json");
    await writeFile(
      projectsFile,
      JSON.stringify({
        projects: [
          {
            id: "local-project",
            name: "Local Project",
            path: directory,
            tags: ["test"],
          },
        ],
      }),
    );

    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const tokens = new Map([
      ["windows-token-secure", "windows"],
      ["mac-token-secure-value", "mac"],
    ]);
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens,
      maxWaitMs: 20,
      temporaryFileDirectory: join(directory, "coordinator-files"),
    });
    const httpServer = app.listen(0, "127.0.0.1");
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once("listening", resolve));
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const fakeAppServer = new FakeAppServer();
    const desktopResumes: Array<{ threadId: string; prompt: string }> = [];
    const desktopOptions: TurnOptions[] = [];
    const desktopInterrupts: TurnHandle[] = [];
    const desktopFollower = {
      readThread(threadId: string): Promise<LocalThread> {
        if (threadId === fakeAppServer.createdThreadId) {
          return Promise.resolve({
            ...fakeAppServer.externalThread,
            threadId,
            title: "Created task",
            cwd: directory,
            status: "idle",
          });
        }
        assert.equal(threadId, fakeAppServer.externalThread.threadId);
        return Promise.resolve(fakeAppServer.externalThread);
      },
      resumeThread(
        threadId: string,
        prompt: string,
        options: TurnOptions = {},
      ): Promise<TurnHandle> {
        desktopResumes.push({ threadId, prompt });
        desktopOptions.push(options);
        if (prompt === "progress") {
          setTimeout(
            () =>
              void options.onProgress?.({
                threadId,
                turnId: `desktop-turn-${desktopResumes.length}`,
                itemId: "commentary-1",
                revision: 1,
                phase: "commentary",
                text: "Checking progress",
                plan: null,
              }),
            5,
          );
        }
        const handle: TurnHandle = {
          threadId,
          turnId: `desktop-turn-${desktopResumes.length}`,
          completed: new Promise<{ status: string; text: string }>((resolve) =>
            setTimeout(
              () => resolve({ status: "completed", text: `done: ${prompt}` }),
              prompt === "wait for cancellation"
                ? 5_000
                : prompt === "cancel during startup"
                  ? 5_000
                : prompt === "progress"
                  ? 300
                  : 30,
            ),
          ),
        };
        return prompt === "cancel during startup"
          ? new Promise((resolve) => setTimeout(() => resolve(handle), 100))
          : Promise.resolve(handle);
      },
      interrupt(handle: TurnHandle): Promise<void> {
        desktopInterrupts.push(handle);
        return Promise.resolve();
      },
    };
    const worker = new Worker({
      agentName: "Mac Codex",
      platform: "macos",
      projectsFile,
      stateFile: join(directory, "state.json"),
      temporaryDirectory: join(directory, "worker-files"),
      client: new CoordinatorClient(baseUrl, "mac-token-secure-value"),
      appServer: fakeAppServer,
      desktopFollower,
      heartbeatMs: 25,
    });
    workers.push(worker);
    const workerRun = worker.start();

    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      {
        requestInit: {
          headers: { authorization: "Bearer windows-token-secure" },
        },
      },
    );
    const client = new Client({ name: "windows-test", version: "1.0.0" });
    await client.connect(transport);

    const agents = await client.callTool({
      name: "agents_list",
      arguments: {},
    });
    assert.equal(
      (
        agents.structuredContent as {
          agents: Array<{ id: string; state: string }>;
        }
      ).agents[0]?.id,
      "mac",
    );

    const temporaryContent = new TextEncoder().encode("local office draft\n");
    const temporaryAttachment = await new CoordinatorClient(
      baseUrl,
      "windows-token-secure",
    ).uploadTemporaryFile("mac", "draft.docx", temporaryContent);
    const started = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "local-project",
        message: "first",
        model: "test-model",
        reasoningEffort: "medium",
        attachments: [
          {
            type: "git_file",
            repository: "https://github.com/example/local-project.git",
            revision: attachmentRevision,
            path: "docs/shared.md",
            sha256: attachmentSha256,
          },
          temporaryAttachment,
        ],
      },
    });
    const startMessage = started.structuredContent as { id: string };
    const firstWait = await client.callTool({
      name: "agent_wait",
      arguments: { afterCursor: 0, timeoutMs: 5_000 },
    });
    const firstOutput = firstWait.structuredContent as {
      messages: Array<{
        id: string;
        text: string;
        cursor: number;
        targetThreadId: string | null;
      }>;
      nextCursor: number;
    };
    assert.equal(firstOutput.messages[0]?.text.startsWith("done: first"), true);
    assert.equal(
      firstOutput.messages[0].targetThreadId,
      fakeAppServer.createdThreadId,
    );
    assert.match(desktopResumes[0]?.prompt ?? "", /docs\/shared\.md/);
    assert.match(desktopResumes[0]?.prompt ?? "", /git show/);
    assert.match(desktopResumes[0]?.prompt ?? "", /draft\.docx/);
    assert.match(
      desktopResumes[0]?.prompt ?? "",
      /worker-files/,
    );
    assert.equal(store.getTemporaryFile(temporaryAttachment.fileId), null);
    assert.deepEqual(
      await readdir(join(directory, "coordinator-files")),
      [],
    );
    assert.match(
      fakeAppServer.creates[0]?.title ?? "",
      /^\[Agent Operator\] first$/,
    );
    assert.equal(fakeAppServer.starts.length, 0);
    assert.equal(desktopResumes[0]?.threadId, fakeAppServer.createdThreadId);
    assert.equal(desktopOptions[0]?.model, "test-model");
    assert.equal(desktopOptions[0].reasoningEffort, "medium");
    assert.equal(typeof desktopOptions[0].onProgress, "function");

    await client.callTool({
      name: "agent_send",
      arguments: { replyTo: startMessage.id, message: "follow-up" },
    });
    const secondWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: firstOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const secondOutput = secondWait.structuredContent as {
      messages: Array<{ text: string }>;
      nextCursor: number;
    };
    assert.equal(secondOutput.messages[0]?.text, "done: follow-up");
    assert.equal(fakeAppServer.starts.length, 0);
    assert.equal(
      desktopResumes[1]?.threadId,
      fakeAppServer.createdThreadId,
    );

    await client.callTool({
      name: "agent_models",
      arguments: { agentId: "mac" },
    });
    const modelsWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: secondOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const modelsOutput = modelsWait.structuredContent as {
      messages: Array<{ text: string }>;
      nextCursor: number;
    };
    const modelsResult = JSON.parse(modelsOutput.messages[0]?.text ?? "{}") as {
      models: Array<{ id: string; defaultReasoningEffort: string }>;
    };
    assert.ok(modelsResult.models[0]);
    assert.equal(modelsResult.models[0].id, "test-model");
    assert.equal(
      modelsResult.models[0].defaultReasoningEffort,
      "medium",
    );

    await client.callTool({
      name: "agent_threads",
      arguments: { agentId: "mac", query: "Windows", limit: 7 },
    });
    const searchWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: modelsOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const searchOutput = searchWait.structuredContent as {
      messages: Array<{ text: string }>;
      nextCursor: number;
    };
    const searchResult = JSON.parse(searchOutput.messages[0]?.text ?? "{}") as {
      threads: Array<{
        threadId: string;
        project: unknown;
        preview: string;
      }>;
    };
    assert.deepEqual(fakeAppServer.listCalls, [
      { query: "Windows", limit: 7 },
    ]);
    assert.equal(
      searchResult.threads[0]?.threadId,
      fakeAppServer.externalThread.threadId,
    );
    assert.equal(searchResult.threads[0].project, null);
    assert.equal(
      JSON.stringify(searchResult).includes(
        fakeAppServer.externalThread.cwd,
      ),
      false,
    );

    const external = await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "report status",
      },
    });
    const externalMessage = external.structuredContent as { id: string };
    const externalWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: searchOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const externalOutput = externalWait.structuredContent as {
      messages: Array<{ text: string; rootMessageId: string }>;
      nextCursor: number;
    };
    assert.equal(externalOutput.messages[0]?.text, "done: report status");
    assert.equal(
      externalOutput.messages[0].rootMessageId,
      externalMessage.id,
    );
    assert.deepEqual(desktopResumes.at(-1), {
      threadId: fakeAppServer.externalThread.threadId,
      prompt: "report status",
    });

    await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "progress",
      },
    });
    const progressWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: externalOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const progressOutput = progressWait.structuredContent as {
      messages: Array<{
        kind: string;
        isFinal: boolean;
        text: string;
        cursor: number;
      }>;
      nextCursor: number;
    };
    assert.equal(progressOutput.messages[0]?.kind, "update");
    assert.equal(progressOutput.messages[0].isFinal, false);
    assert.equal(progressOutput.messages[0].text, "Checking progress");
    const progressFinalWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: progressOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const progressFinalOutput = progressFinalWait.structuredContent as {
      messages: Array<{ kind: string; isFinal: boolean; text: string }>;
      nextCursor: number;
    };
    assert.equal(progressFinalOutput.messages[0]?.kind, "result");
    assert.equal(progressFinalOutput.messages[0].isFinal, true);
    assert.equal(progressFinalOutput.messages[0].text, "done: progress");

    fakeAppServer.externalThread.status = "active";
    await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "do not interrupt",
      },
    });
    const activeWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: progressFinalOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const activeOutput = activeWait.structuredContent as {
      messages: Array<{ text: string; status: string }>;
      nextCursor: number;
    };
    const activeResult = activeOutput.messages[0];
    assert.ok(activeResult);
    assert.equal(activeResult.status, "failed");
    assert.match(activeResult.text, /is active/);
    assert.equal(fakeAppServer.resumes.length, 0);
    assert.equal(desktopResumes.length, 4);

    fakeAppServer.externalThread.status = "idle";
    const cancellable = await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "wait for cancellation",
      },
    });
    const cancellableMessage = cancellable.structuredContent as { id: string };
    const deliveryDeadline = Date.now() + 2_000;
    while (
      store.getMessage(cancellableMessage.id).status !== "delivered" &&
      Date.now() < deliveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(store.getMessage(cancellableMessage.id).status, "delivered");
    await client.callTool({
      name: "agent_cancel",
      arguments: { messageId: cancellableMessage.id },
    });
    const cancellationWait = await client.callTool({
      name: "agent_wait",
      arguments: {
        afterCursor: activeOutput.nextCursor,
        timeoutMs: 5_000,
      },
    });
    const cancellationOutput = cancellationWait.structuredContent as {
      messages: Array<{ status: string; replyTo: string }>;
      nextCursor: number;
    };
    assert.ok(cancellationOutput.messages[0]);
    assert.equal(cancellationOutput.messages[0].status, "cancelled");
    assert.equal(cancellationOutput.messages[0].replyTo, cancellableMessage.id);
    const interruptDeadline = Date.now() + 2_000;
    while (desktopInterrupts.length === 0 && Date.now() < interruptDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(desktopInterrupts.length, 1);
    assert.equal(store.countOutstandingRequests("mac"), 0);

    const startupCancellation = await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "cancel during startup",
      },
    });
    const startupCancellationMessage = startupCancellation.structuredContent as {
      id: string;
    };
    const startupDeadline = Date.now() + 2_000;
    while (
      !desktopResumes.some(
        (entry) => entry.prompt === "cancel during startup",
      ) &&
      Date.now() < startupDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      desktopResumes.some((entry) => entry.prompt === "cancel during startup"),
      true,
    );
    await client.callTool({
      name: "agent_cancel",
      arguments: { messageId: startupCancellationMessage.id },
    });
    const following = await client.callTool({
      name: "agent_thread_send",
      arguments: {
        agentId: "mac",
        threadId: fakeAppServer.externalThread.threadId,
        message: "after startup cancellation",
      },
    });
    const followingMessage = following.structuredContent as { id: string };
    let cursor = cancellationOutput.nextCursor;
    let followingResult:
      | { replyTo: string; status: string; text: string }
      | undefined;
    for (let attempt = 0; attempt < 5 && !followingResult; attempt += 1) {
      const waited = await client.callTool({
        name: "agent_wait",
        arguments: { afterCursor: cursor, timeoutMs: 5_000 },
      });
      const output = waited.structuredContent as {
        messages: Array<{ replyTo: string; status: string; text: string }>;
        nextCursor: number;
      };
      cursor = output.nextCursor;
      followingResult = output.messages.find(
        (message) => message.replyTo === followingMessage.id,
      );
    }
    assert.ok(followingResult);
    assert.equal(followingResult.status, "completed");
    assert.equal(followingResult.text, "done: after startup cancellation");
    assert.equal(desktopInterrupts.length, 2);
    assert.equal(store.countOutstandingRequests("mac"), 0);

    await client.close();
    await worker.stop();
    await workerRun;
  });
});
