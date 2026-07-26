import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { CoordinatorClient } from "../src/worker/client.js";
import { Worker } from "../src/worker/worker.js";

class FakeAppServer {
  starts: Array<{ cwd: string; prompt: string }> = [];
  resumes: Array<{ threadId: string; cwd: string; prompt: string }> = [];
  private sequence = 0;

  startThread(cwd: string, prompt: string): Promise<TurnHandle> {
    this.starts.push({ cwd, prompt });
    return Promise.resolve(this.handle(`thread-${++this.sequence}`, prompt));
  }

  resumeThread(
    threadId: string,
    cwd: string,
    prompt: string,
  ): Promise<TurnHandle> {
    this.resumes.push({ threadId, cwd, prompt });
    return Promise.resolve(this.handle(threadId, prompt));
  }

  steer(): Promise<boolean> {
    return Promise.resolve(false);
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
    });
    const httpServer = app.listen(0, "127.0.0.1");
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once("listening", resolve));
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const fakeAppServer = new FakeAppServer();
    const worker = new Worker({
      agentName: "Mac Codex",
      platform: "macos",
      projectsFile,
      stateFile: join(directory, "state.json"),
      client: new CoordinatorClient(baseUrl, "mac-token-secure-value"),
      appServer: fakeAppServer,
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

    const started = await client.callTool({
      name: "agent_start",
      arguments: {
        agentId: "mac",
        projectId: "local-project",
        message: "first",
        attachments: [
          {
            type: "git_file",
            repository: "https://github.com/example/local-project.git",
            revision: attachmentRevision,
            path: "docs/shared.md",
            sha256: attachmentSha256,
          },
        ],
      },
    });
    const startMessage = started.structuredContent as { id: string };
    const firstWait = await client.callTool({
      name: "agent_wait",
      arguments: { afterCursor: 0, timeoutMs: 5_000 },
    });
    const firstOutput = firstWait.structuredContent as {
      messages: Array<{ id: string; text: string; cursor: number }>;
      nextCursor: number;
    };
    assert.equal(firstOutput.messages[0]?.text.startsWith("done: first"), true);
    assert.match(fakeAppServer.starts[0]?.prompt ?? "", /docs\/shared\.md/);
    assert.match(fakeAppServer.starts[0]?.prompt ?? "", /git show/);

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
    };
    assert.equal(secondOutput.messages[0]?.text, "done: follow-up");
    assert.equal(fakeAppServer.starts.length, 1);
    assert.equal(fakeAppServer.resumes[0]?.threadId, "thread-1");

    await client.close();
    await worker.stop();
    await workerRun;
  });
});
