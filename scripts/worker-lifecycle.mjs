#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
// @spec spec://modules/worker/INFRA-003-release-and-recovery#recovery
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, platform as hostPlatform } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_LABEL = "org.agent-operator.worker";
const WINDOWS_TASK = "Agent Operator Worker";

const fail = (message) => {
  throw new Error(message);
};

const parseArgs = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) fail(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    const item = next && !next.startsWith("--") ? next : true;
    if (item !== true) index += 1;
    const existing = result.get(key);
    result.set(key, existing === undefined ? item : [...(Array.isArray(existing) ? existing : [existing]), item]);
  }
  return result;
};

const option = (args, name, fallback) => {
  const value = args.get(name);
  if (Array.isArray(value)) return value.at(-1);
  return value === undefined || value === true ? fallback : value;
};

const options = (args, name) => {
  const value = args.get(name);
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
};

const flag = (args, name) => args.get(name) === true;
const exists = async (path) => access(path).then(() => true, () => false);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value, mode = 0o600) => {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await rename(temporary, path);
  if (process.platform !== "win32") await chmod(path, mode);
};
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

const effectivePlatform = () => {
  const override = process.env.AOP_PLATFORM_OVERRIDE;
  if (override) {
    if (process.env.AOP_TEST_MODE !== "1") fail("Platform override is test-only");
    return override;
  }
  return hostPlatform() === "darwin" ? "macos" : hostPlatform() === "win32" ? "windows" : "unsupported";
};

const defaultInstallRoot = (platform) => platform === "macos"
  ? join(homedir(), "Library", "Application Support", "Agent Operator")
  : join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Agent Operator");

const pathsFor = (root) => ({
  root,
  bin: join(root, "bin"),
  versions: join(root, "versions"),
  config: join(root, "config"),
  data: join(root, "data"),
  backups: join(root, "backups"),
  current: join(root, "config", "current.json"),
  workerConfig: join(root, "config", "worker.json"),
  projects: join(root, "config", "projects.json"),
  integrationReceipt: join(root, "config", "integration.json"),
  lifecycle: join(root, "bin", "workerctl.mjs"),
});

const packageManifest = async (packageRoot, platform) => {
  const manifest = await readJson(join(packageRoot, "manifest.json"));
  if (manifest.schemaVersion !== 1 || manifest.product !== "agent-operator-worker") fail("Unsupported worker package manifest");
  if (manifest.platform !== platform) fail(`Package is for ${manifest.platform}; host is ${platform}`);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < manifest.nodeMajor) fail(`Node.js ${manifest.nodeMajor} or newer is required`);
  for (const [relativePath, expected] of Object.entries(manifest.files)) {
    const absolute = resolve(packageRoot, relativePath);
    const boundary = relative(resolve(packageRoot), absolute);
    if (boundary.startsWith("..") || isAbsolute(boundary)) fail(`Unsafe manifest path: ${relativePath}`);
    if ((await sha256(absolute)) !== expected) fail(`Package integrity check failed: ${relativePath}`);
  }
  return manifest;
};

const workerEnvironment = (paths, config) => ({
  ...process.env,
  AOP_COORDINATOR_URL: config.coordinatorUrl,
  AOP_AGENT_ID: config.agentId,
  AOP_AGENT_NAME: config.agentName,
  AOP_DEVICE_TOKEN: config.deviceToken,
  AOP_PROJECTS_FILE: paths.projects,
  AOP_STATE_FILE: join(paths.data, "worker-state.json"),
  AOP_TEMPORARY_DIR: join(paths.data, "temporary-files"),
  AOP_CODEX_BIN: config.codexBin,
  AOP_CODEX_ARGS_JSON: JSON.stringify(config.codexArgs ?? []),
});

const securePrivateStorage = async (platform, paths) => {
  if (platform === "macos" || process.env.AOP_TEST_MODE === "1") {
    if (process.platform !== "win32") {
      for (const directory of [paths.config, paths.data, paths.backups]) await chmod(directory, 0o700);
      for (const file of [paths.workerConfig, paths.projects, paths.current]) {
        if (await exists(file)) await chmod(file, 0o600);
      }
    }
    return;
  }
  const identity = spawnSync("whoami.exe", [], { encoding: "utf8" }).stdout.trim();
  if (!identity) fail("Unable to determine Windows user identity for ACL setup");
  for (const directory of [paths.config, paths.data, paths.backups]) {
    const result = spawnSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`], { encoding: "utf8" });
    if (result.status !== 0) fail(result.stderr || `Unable to secure ${directory}`);
  }
};

const secureWindowsFile = (path) => {
  if (effectivePlatform() !== "windows" || process.env.AOP_TEST_MODE === "1") return;
  const identity = spawnSync("whoami.exe", [], { encoding: "utf8" }).stdout.trim();
  const result = spawnSync("icacls.exe", [path, "/inheritance:r", "/grant:r", `${identity}:F`], { encoding: "utf8" });
  if (!identity || result.status !== 0) fail(result.stderr || `Unable to secure ${path}`);
};

const currentState = async (paths) => {
  if (!(await exists(paths.current))) fail("Worker is not installed");
  return readJson(paths.current);
};

const runtimeEntry = (paths, version) => join(paths.versions, version, "runtime", "src", "worker", "main.js");

const runWorker = async (paths, version, diagnose = false) => {
  const config = await readJson(paths.workerConfig);
  const child = spawn(process.execPath, [runtimeEntry(paths, version), ...(diagnose ? ["diagnose"] : [])], {
    env: workerEnvironment(paths, config),
    stdio: "inherit",
  });
  if (!diagnose) {
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  }
  const status = await new Promise((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveStatus(code ?? (signal ? 1 : 0)));
  });
  if (status !== 0) fail(`Worker ${diagnose ? "doctor" : "runtime"} exited ${status}`);
};

const stopService = (platform, paths) => {
  if (process.env.AOP_SERVICE_MODE === "skip") return;
  if (platform === "macos") {
    const uid = process.getuid?.();
    const plist = join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
    spawnSync("launchctl", ["bootout", `gui/${uid}`, plist], { stdio: "ignore" });
  } else {
    spawnSync("schtasks.exe", ["/End", "/TN", WINDOWS_TASK], { stdio: "ignore" });
  }
};

const installService = async (platform, paths) => {
  if (process.env.AOP_SERVICE_MODE === "skip") return;
  if (platform === "macos") {
    const uid = process.getuid?.();
    if (uid === undefined) fail("Unable to determine macOS user ID");
    const launchAgents = join(homedir(), "Library", "LaunchAgents");
    const plist = join(launchAgents, `${SERVICE_LABEL}.plist`);
    const logs = join(paths.data, "logs");
    await mkdir(launchAgents, { recursive: true });
    await mkdir(logs, { recursive: true });
    const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${SERVICE_LABEL}</string>\n<key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(paths.lifecycle)}</string><string>run</string><string>--install-root</string><string>${escape(paths.root)}</string></array>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\n<key>StandardOutPath</key><string>${escape(join(logs, "worker.log"))}</string>\n<key>StandardErrorPath</key><string>${escape(join(logs, "worker.error.log"))}</string>\n</dict></plist>\n`, { mode: 0o600 });
    stopService(platform, paths);
    const loaded = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, plist], { encoding: "utf8" });
    if (loaded.status !== 0) fail(loaded.stderr || `launchctl exited ${loaded.status}`);
  } else {
    const command = `\"${process.execPath}\" \"${paths.lifecycle}\" run --install-root \"${paths.root}\"`;
    const created = spawnSync("schtasks.exe", ["/Create", "/TN", WINDOWS_TASK, "/TR", command, "/SC", "ONLOGON", "/RL", "LIMITED", "/F"], { encoding: "utf8" });
    if (created.status !== 0) fail(created.stderr || `schtasks exited ${created.status}`);
    spawnSync("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK], { stdio: "ignore" });
  }
};

const deleteService = async (platform) => {
  if (process.env.AOP_SERVICE_MODE === "skip") return;
  if (platform === "macos") {
    const plist = join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
    spawnSync("launchctl", ["bootout", `gui/${process.getuid?.()}`, plist], { stdio: "ignore" });
    await rm(plist, { force: true });
  } else {
    spawnSync("schtasks.exe", ["/End", "/TN", WINDOWS_TASK], { stdio: "ignore" });
    spawnSync("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK, "/F"], { stdio: "ignore" });
  }
};

const codexHome = (args) => resolve(option(args, "codex-home", process.env.CODEX_HOME ?? join(homedir(), ".codex")));

const replaceTokenLine = async (path, token) => {
  const original = (await exists(path)) ? await readFile(path, "utf8") : "";
  const lines = original.split(/\r?\n/).filter((line) => line && !/^\s*(?:export\s+)?AOP_DEVICE_TOKEN=/.test(line));
  lines.push(`AOP_DEVICE_TOKEN=${token}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
  return original.match(/^\s*(?:export\s+)?AOP_DEVICE_TOKEN=.*$/m)?.[0] ?? null;
};

const configureIntegration = async (paths, packageRoot, args) => {
  if (flag(args, "no-integration")) return;
  const config = await readJson(paths.workerConfig);
  const home = codexHome(args);
  const envPath = join(home, ".env");
  const skillTarget = join(home, "skills", "coordinate-agents");
  const receipt = (await exists(paths.integrationReceipt)) ? await readJson(paths.integrationReceipt) : null;
  const codex = config.codexBin;
  const existingMcp = spawnSync(codex, [...(config.codexArgs ?? []), "mcp", "get", "agent-operator"], { stdio: "ignore" }).status === 0;
  if (existingMcp && !receipt) fail("Codex MCP agent-operator already exists; remove it explicitly before install");
  const skillBackup = join(paths.backups, "coordinate-agents.before-install");
  if (!receipt && await exists(skillTarget)) {
    await mkdir(paths.backups, { recursive: true });
    await cp(skillTarget, skillBackup, { recursive: true });
  }
  const previousTokenLine = receipt?.previousTokenLine ?? await replaceTokenLine(envPath, config.deviceToken);
  if (receipt) await replaceTokenLine(envPath, config.deviceToken);
  secureWindowsFile(envPath);
  if (existingMcp) spawnSync(codex, [...(config.codexArgs ?? []), "mcp", "remove", "agent-operator"], { stdio: "ignore" });
  const added = spawnSync(codex, [...(config.codexArgs ?? []), "mcp", "add", "agent-operator", "--url", `${config.coordinatorUrl.replace(/\/$/, "")}/mcp`, "--bearer-token-env-var", "AOP_DEVICE_TOKEN"], { encoding: "utf8" });
  if (added.status !== 0) fail(added.stderr || "Unable to configure Agent Operator MCP");
  await rm(skillTarget, { recursive: true, force: true });
  await mkdir(dirname(skillTarget), { recursive: true });
  await cp(join(packageRoot, "integration", "coordinate-agents"), skillTarget, { recursive: true });
  await writeJson(paths.integrationReceipt, { codexHome: home, envPath, skillTarget, skillBackup: await exists(skillBackup) ? skillBackup : null, previousTokenLine });
};

const removeIntegration = async (paths) => {
  if (!(await exists(paths.integrationReceipt))) return;
  const receipt = await readJson(paths.integrationReceipt);
  const config = await readJson(paths.workerConfig);
  spawnSync(config.codexBin, [...(config.codexArgs ?? []), "mcp", "remove", "agent-operator"], { stdio: "ignore" });
  await rm(receipt.skillTarget, { recursive: true, force: true });
  if (receipt.skillBackup && await exists(receipt.skillBackup)) await cp(receipt.skillBackup, receipt.skillTarget, { recursive: true });
  if (await exists(receipt.envPath)) {
    const lines = (await readFile(receipt.envPath, "utf8")).split(/\r?\n/).filter((line) => line && !/^\s*(?:export\s+)?AOP_DEVICE_TOKEN=/.test(line));
    if (receipt.previousTokenLine) lines.push(receipt.previousTokenLine);
    await writeFile(receipt.envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  }
  await rm(paths.integrationReceipt, { force: true });
};

const projectConfig = async (args) => {
  const supplied = option(args, "projects-file");
  const result = supplied ? await readJson(resolve(supplied)) : (() => {
    const projectPaths = options(args, "project");
    if (projectPaths.length === 0) fail("Provide --project PATH or --projects-file FILE");
    return {
    projects: projectPaths.map((path, index) => {
      const absolute = resolve(path);
      const name = basename(absolute);
      const id = `${name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "project"}${index ? `-${index + 1}` : ""}`;
      return { id, name, path: absolute, tags: ["code"] };
    }),
    };
  })();
  if (!result || !Array.isArray(result.projects) || result.projects.length === 0) fail("Projects configuration must contain at least one project");
  const ids = new Set();
  for (const project of result.projects) {
    if (!project || typeof project.id !== "string" || typeof project.name !== "string" || typeof project.path !== "string") fail("Invalid project configuration");
    if (ids.has(project.id)) fail(`Duplicate project ID: ${project.id}`);
    ids.add(project.id);
    await access(resolve(project.path)).catch(() => fail(`Project path is unavailable: ${project.path}`));
  }
  return result;
};

const verifyCodex = (args) => {
  const requestedBin = option(args, "codex-bin", "codex");
  const requestedArgs = options(args, "codex-arg");
  const requiresCommandProcessor = effectivePlatform() === "windows" &&
    (requestedBin.toLowerCase() === "codex" || /\.(?:cmd|bat)$/i.test(requestedBin));
  const codexBin = requiresCommandProcessor ? (process.env.ComSpec || "cmd.exe") : requestedBin;
  const codexArgs = requiresCommandProcessor
    ? ["/d", "/s", "/c", requestedBin, ...requestedArgs]
    : requestedArgs;
  const result = spawnSync(codexBin, [...codexArgs, "--version"], { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || `Codex is unavailable: ${requestedBin}`);
  return { codexBin, codexArgs };
};

const enroll = async (manifest, args) => {
  const coordinatorUrl = option(args, "coordinator-url");
  const code = option(args, "enrollment-code");
  if (!coordinatorUrl || !code) fail("Install requires --coordinator-url and --enrollment-code");
  const response = await fetch(new URL("/v1/enrollment/consume", coordinatorUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, platform: manifest.platform, workerVersion: manifest.version }),
  });
  if (!response.ok) fail(`Enrollment failed (${response.status})`);
  const grant = await response.json();
  if (!grant.agentId || !grant.agentName || !grant.deviceToken) fail("Enrollment response is incomplete");
  return { coordinatorUrl, agentId: grant.agentId, agentName: grant.agentName, deviceToken: grant.deviceToken };
};

const installVersion = async (paths, packageRoot, manifest) => {
  const target = join(paths.versions, manifest.version);
  await mkdir(paths.versions, { recursive: true });
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(join(packageRoot, "runtime"), join(target, "runtime"), { recursive: true });
  await cp(join(packageRoot, "manifest.json"), join(target, "manifest.json"));
  await mkdir(paths.bin, { recursive: true });
  await cp(join(packageRoot, "bin", "workerctl.mjs"), paths.lifecycle);
  if (process.platform !== "win32") await chmod(paths.lifecycle, 0o700);
};

const installCommand = async (args, platform, paths) => {
  const packageRoot = resolve(option(args, "package-root", PACKAGE_ROOT));
  const manifest = await packageManifest(packageRoot, platform);
  if (await exists(paths.workerConfig)) fail("Worker is already installed; use update");
  const projects = await projectConfig(args);
  const codex = verifyCodex(args);
  const grant = await enroll(manifest, args);
  await Promise.all([paths.config, paths.data, paths.backups].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  await installVersion(paths, packageRoot, manifest);
  await writeJson(paths.projects, projects);
  await writeJson(paths.workerConfig, { ...grant, ...codex });
  await writeJson(paths.current, { version: manifest.version, previousVersion: null, installedAt: new Date().toISOString() });
  await securePrivateStorage(platform, paths);
  await configureIntegration(paths, packageRoot, args);
  await runWorker(paths, manifest.version, true);
  if (!flag(args, "no-service")) await installService(platform, paths);
  console.log(`Agent Operator worker ${manifest.version} installed for ${grant.agentName}.`);
};

const updateCommand = async (args, platform, paths) => {
  const packageRoot = resolve(option(args, "package-root", PACKAGE_ROOT));
  const manifest = await packageManifest(packageRoot, platform);
  const state = await currentState(paths);
  await installVersion(paths, packageRoot, manifest);
  await runWorker(paths, manifest.version, true);
  stopService(platform, paths);
  await writeJson(paths.current, { version: manifest.version, previousVersion: state.version === manifest.version ? state.previousVersion : state.version, installedAt: new Date().toISOString() });
  await securePrivateStorage(platform, paths);
  await configureIntegration(paths, packageRoot, args);
  if (!flag(args, "no-service")) await installService(platform, paths);
  console.log(`Agent Operator worker updated from ${state.version} to ${manifest.version}.`);
};

const rollbackCommand = async (args, platform, paths) => {
  const state = await currentState(paths);
  if (!state.previousVersion) fail("No previous version is available");
  if (!(await exists(runtimeEntry(paths, state.previousVersion)))) fail(`Previous version is missing: ${state.previousVersion}`);
  await runWorker(paths, state.previousVersion, true);
  stopService(platform, paths);
  await writeJson(paths.current, { version: state.previousVersion, previousVersion: state.version, installedAt: new Date().toISOString() });
  await securePrivateStorage(platform, paths);
  if (!flag(args, "no-service")) await installService(platform, paths);
  console.log(`Agent Operator worker rolled back to ${state.previousVersion}.`);
};

const uninstallCommand = async (args, platform, paths) => {
  const scope = option(args, "scope");
  if (!new Set(["integration", "runtime", "all"]).has(scope)) fail("Uninstall requires --scope integration, runtime or all");
  if (flag(args, "delete-config") && scope !== "all") fail("--delete-config requires --scope all so integration can be removed safely");
  if (scope === "integration" || scope === "all") await removeIntegration(paths);
  if (scope === "runtime" || scope === "all") {
    await deleteService(platform);
    await rm(paths.bin, { recursive: true, force: true });
    await rm(paths.versions, { recursive: true, force: true });
    if (flag(args, "delete-config")) await rm(paths.config, { recursive: true, force: true });
    if (flag(args, "delete-state")) await rm(paths.data, { recursive: true, force: true });
  }
  console.log(`Agent Operator uninstall completed for scope ${scope}.`);
};

const usage = `Usage: workerctl <command> [options]\n\nCommands:\n  install --coordinator-url URL --enrollment-code CODE --project PATH\n  update\n  doctor\n  status\n  rollback\n  uninstall --scope integration|runtime|all [--delete-config] [--delete-state]\n`;

const command = process.argv[2];
if (!command || command === "help" || command === "--help") {
  console.log(usage);
  process.exit(0);
}
const args = parseArgs(process.argv.slice(3));
const platform = effectivePlatform();
if (!new Set(["macos", "windows"]).has(platform)) fail("Worker packages support macOS and Windows");
const paths = pathsFor(resolve(option(args, "install-root", defaultInstallRoot(platform))));

if (command === "install") await installCommand(args, platform, paths);
else if (command === "update") await updateCommand(args, platform, paths);
else if (command === "rollback") await rollbackCommand(args, platform, paths);
else if (command === "doctor") await runWorker(paths, (await currentState(paths)).version, true);
else if (command === "run") await runWorker(paths, (await currentState(paths)).version, false);
else if (command === "status") console.log(JSON.stringify(await currentState(paths), null, 2));
else if (command === "uninstall") await uninstallCommand(args, platform, paths);
else fail(`Unknown command: ${command}\n${usage}`);
