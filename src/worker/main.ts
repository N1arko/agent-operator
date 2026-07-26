import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { requiredEnv } from "../shared/env.js";
import { WorkerConfigFileSchema } from "../shared/protocol.js";
import { CodexAppServer } from "./app-server.js";
import { CoordinatorClient } from "./client.js";
import { Worker } from "./worker.js";

const platform =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : process.platform === "linux"
        ? "linux"
        : "unknown";
const coordinatorUrl = requiredEnv("AOP_COORDINATOR_URL");
const token = requiredEnv("AOP_DEVICE_TOKEN");
const client = new CoordinatorClient(coordinatorUrl, token);
const projectsFile = resolve(process.env.AOP_PROJECTS_FILE ?? "./projects.json");
const stateFile = resolve(process.env.AOP_STATE_FILE ?? "./data/worker-state.json");
const codexBin = process.env.AOP_CODEX_BIN ?? "codex";

if (process.argv[2] === "diagnose") {
  const health = await client.health();
  const codex = spawnSync(codexBin, ["--version"], { encoding: "utf8" });
  const config = WorkerConfigFileSchema.parse(
    JSON.parse(await readFile(projectsFile, "utf8")),
  );
  const projects = await Promise.all(
    config.projects.map(async (project) => {
      let available = true;
      try {
        await access(project.path);
      } catch {
        available = false;
      }
      return {
        id: project.id,
        name: project.name,
        tags: project.tags,
        available,
      };
    }),
  );
  let authenticated = false;
  if (health.ok) {
    await client.heartbeat({
      name: process.env.AOP_AGENT_NAME ?? requiredEnv("AOP_AGENT_ID"),
      platform,
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects,
      workerVersion: "0.1.0",
    });
    authenticated = true;
  }
  const result = {
    coordinator: {
      url: coordinatorUrl,
      reachable: health.ok,
      status: health.status,
      authenticated,
    },
    codex: {
      command: codexBin,
      available: codex.status === 0,
      version: codex.stdout.trim(),
      error: codex.stderr.trim() || null,
    },
    projectsFile,
    projects: {
      count: projects.length,
      available: projects.filter((project) => project.available).length,
    },
    platform,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(
    health.ok &&
      authenticated &&
      codex.status === 0 &&
      projects.every((project) => project.available)
      ? 0
      : 1,
  );
}

const worker = new Worker({
  agentName: process.env.AOP_AGENT_NAME ?? requiredEnv("AOP_AGENT_ID"),
  platform,
  projectsFile,
  stateFile,
  client,
  appServer: new CodexAppServer(
    codexBin,
    Number(process.env.AOP_APP_SERVER_IDLE_MS ?? 60_000),
  ),
});

const shutdown = (): void => {
  void worker.stop().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await worker.start();
