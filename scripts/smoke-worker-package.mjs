#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
// @spec spec://modules/worker/INFRA-003-release-and-recovery#acceptance
import { spawnSync, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CoordinatorStore } from "../dist/src/coordinator/store.js";
import { createCoordinatorApp } from "../dist/src/coordinator/server.js";

const execFile = promisify(execFileCallback);
const packageRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: smoke-worker-package.mjs PACKAGE_ROOT");
const targetPlatform = platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : null;
if (!targetPlatform) throw new Error("Package service smoke supports macOS and Windows");
const manifest = JSON.parse(await readFile(join(packageRoot, "manifest.json"), "utf8"));
if (manifest.platform !== targetPlatform) throw new Error(`Package is for ${manifest.platform}; runner is ${targetPlatform}`);

const temporary = await mkdtemp(join(tmpdir(), "aop-os-smoke-"));
const installRoot = join(temporary, "install");
const project = join(temporary, "user-project");
const previousVersion = `${manifest.version}-rollback-smoke`;
const codexHome = join(temporary, "codex-home");
const workerctl = join(packageRoot, "bin", "workerctl.mjs");
const plist = join(homedir(), "Library", "LaunchAgents", "org.agent-operator.worker.plist");
const store = new CoordinatorStore(":memory:");
const app = createCoordinatorApp(store, { host: "127.0.0.1", maxWaitMs: 50 });
const server = app.listen(0, "127.0.0.1");

const run = async (file, args) => {
  const result = await execFile(file, args, { maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
};
const serviceStatus = async () => {
  if (targetPlatform === "macos") {
    await run("launchctl", ["print", `gui/${process.getuid?.()}/org.agent-operator.worker`]);
  } else {
    await run("schtasks.exe", ["/Query", "/TN", "Agent Operator Worker"]);
  }
};
const stopResidualService = async () => {
  if (targetPlatform === "macos") {
    spawnSync("launchctl", ["bootout", `gui/${process.getuid?.()}`, plist], { stdio: "ignore" });
    await rm(plist, { force: true });
  } else {
    spawnSync("schtasks.exe", ["/End", "/TN", "Agent Operator Worker"], { stdio: "ignore" });
    spawnSync("schtasks.exe", ["/Delete", "/TN", "Agent Operator Worker", "/F"], { stdio: "ignore" });
  }
};

try {
  await new Promise((resolveListening) => server.once("listening", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Coordinator did not listen");
  const coordinatorUrl = `http://127.0.0.1:${address.port}`;
  const enrollment = store.createEnrollment({ agentId: `os-smoke-${targetPlatform}`, agentName: `OS Smoke ${targetPlatform}` });
  await mkdir(project);
  await writeFile(join(project, "user-file.txt"), "preserve\n");
  const fakeCodex = join(temporary, "codex.mjs");
  await writeFile(fakeCodex, `import { createInterface } from "node:readline";
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli os-smoke");
} else if (args[0] === "mcp") {
  process.exitCode = args[1] === "get" ? 1 : 0;
} else if (args[0] === "app-server") {
  const threadId = "019f9ff2-42a3-7c43-92e9-ab1b9794e043";
  let sequence = 0;
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
  createInterface({ input: process.stdin }).on("line", (line) => {
    const message = JSON.parse(line);
    if (typeof message.id !== "number") return;
    if (message.method === "thread/start") send({ id: message.id, result: { thread: { id: threadId } } });
    else if (message.method === "turn/start") {
      const turnId = "turn-os-smoke-" + (++sequence);
      send({ id: message.id, result: { turn: { id: turnId } } });
      setTimeout(() => send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", items: [{ id: "final", type: "agentMessage", phase: "final_answer", text: "package control complete" }] } } }), 20);
    } else send({ id: message.id, result: {} });
  });
} else {
  process.exitCode = 1;
}
`, { mode: 0o600 });

  if (targetPlatform === "macos") {
    await run(join(packageRoot, "bin", "macos", "install.sh"), ["--install-root", installRoot, "--coordinator-url", coordinatorUrl, "--enrollment-code", enrollment.code, "--project", project, "--codex-bin", process.execPath, "--codex-arg", fakeCodex, "--codex-home", codexHome]);
  } else {
    await run("pwsh", ["-NoLogo", "-NoProfile", "-File", join(packageRoot, "bin", "windows", "install-worker.ps1"), "-CoordinatorUrl", coordinatorUrl, "-EnrollmentCode", enrollment.code, "-Project", project, "-InstallRoot", installRoot, "-CodexBin", process.execPath, "-CodexArg", fakeCodex, "-CodexHome", codexHome]);
  }
  await serviceStatus();
  if (!store.getAgent(`os-smoke-${targetPlatform}`)) throw new Error("First authenticated heartbeat was not observed");
  if (!await readFile(join(codexHome, "skills", "coordinate-agents", "SKILL.md"), "utf8")) throw new Error("Codex skill was not installed");
  const request = store.createMessage({
    kind: "start",
    fromAgentId: "os-smoke-operator",
    toAgentId: `os-smoke-${targetPlatform}`,
    projectId: "user-project",
    text: "package control",
  });
  const resultDeadline = Date.now() + 15_000;
  let controlResult = null;
  while (Date.now() < resultDeadline && !controlResult) {
    controlResult = store.findResult(`os-smoke-${targetPlatform}`, request.id);
    if (!controlResult) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (controlResult?.text !== "package control complete" || controlResult.status !== "completed") throw new Error("Installed worker did not complete the control task");

  await cp(join(installRoot, "versions", manifest.version), join(installRoot, "versions", previousVersion), { recursive: true });
  await writeFile(join(installRoot, "config", "current.json"), `${JSON.stringify({ version: manifest.version, previousVersion, installedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  await writeFile(join(installRoot, "data", "preserved.txt"), "durable-state\n");
  await run("node", [workerctl, "rollback", "--install-root", installRoot]);
  await serviceStatus();
  const rolledBack = JSON.parse(await readFile(join(installRoot, "config", "current.json"), "utf8"));
  if (rolledBack.version !== previousVersion) throw new Error("Rollback pointer did not switch");
  await run("node", [workerctl, "update", "--package-root", packageRoot, "--install-root", installRoot, "--codex-home", codexHome]);
  await serviceStatus();
  const updated = JSON.parse(await readFile(join(installRoot, "config", "current.json"), "utf8"));
  if (updated.version !== manifest.version || updated.previousVersion !== previousVersion) throw new Error("Update pointers are incorrect");
  if (await readFile(join(installRoot, "data", "preserved.txt"), "utf8") !== "durable-state\n") throw new Error("Durable state changed during lifecycle");
  await run("node", [workerctl, "uninstall", "--install-root", installRoot, "--scope", "all", "--delete-config", "--delete-state"]);
  if (await readFile(join(project, "user-file.txt"), "utf8") !== "preserve\n") throw new Error("User project changed during uninstall");
  console.log(JSON.stringify({ ok: true, platform: targetPlatform, version: manifest.version, revision: manifest.revision, install: "passed", firstHeartbeat: "passed", controlTask: "passed", service: "passed", integration: "passed", update: "passed", rollback: "passed", uninstall: "passed", userProjectPreserved: true }));
} finally {
  await stopResidualService();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  store.close();
  await rm(temporary, { recursive: true, force: true });
}
