import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createCoordinatorApp } from "../src/coordinator/server.js";

const execFile = promisify(execFileCallback);
const directories: string[] = [];
const servers: Server[] = [];
const stores: CoordinatorStore[] = [];

type InstalledState = { version: string; previousVersion: string | null };
type IntegrationReceipt = { codexHome: string };
type WorkerConfig = { serviceEnabled?: boolean };
const installedState = async (path: string): Promise<InstalledState> =>
  JSON.parse(await readFile(path, "utf8")) as InstalledState;

afterEach(async () => {
  if (process.env.AOP_OS_SERVICE_SMOKE === "1" && process.platform === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", "org.agent-operator.worker.plist");
    await execFile("launchctl", ["bootout", `gui/${process.getuid?.()}`, plist]).catch(() => undefined);
    await rm(plist, { force: true });
  }
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
  for (const store of stores.splice(0)) store.close();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const filesUnder = async (directory: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
};

const run = async (file: string, args: string[], env: NodeJS.ProcessEnv = {}) => execFile(file, args, {
  cwd: resolve("."),
  env: { ...process.env, ...env },
  maxBuffer: 10 * 1024 * 1024,
});

describe("worker release packages", () => {
  // @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
  // @spec spec://modules/worker/INFRA-003-release-and-recovery#recovery
  it("installs, diagnoses, updates, rolls back and uninstalls isolated macOS and Windows profiles", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "aop-worker-package-"));
    directories.push(temporary);
    const releaseVersion = (JSON.parse(await readFile("package.json", "utf8")) as { version: string }).version;
    const firstBuild = await run("node", ["scripts/package-workers.mjs", "both"]);
    const secondBuild = await run("node", ["scripts/package-workers.mjs", "both"]);
    assert.equal(firstBuild.stdout, secondBuild.stdout, "package archives must be reproducible");

    const macPackage = join(temporary, "macos");
    const windowsPackage = join(temporary, "windows");
    await mkdir(macPackage);
    await mkdir(windowsPackage);
    await run("tar", ["-xzf", `release/agent-operator-worker-macos-${releaseVersion}.tar.gz`, "-C", macPackage]);
    await run("unzip", ["-q", `release/agent-operator-worker-windows-${releaseVersion}.zip`, "-d", windowsPackage]);
    for (const packageRoot of [macPackage, windowsPackage]) {
      const relativeFiles = (await filesUnder(packageRoot)).map((path) => path.slice(packageRoot.length + 1));
      assert.ok(relativeFiles.includes("manifest.json"));
      assert.ok(relativeFiles.includes("runtime/src/worker/main.js"));
      assert.ok(relativeFiles.includes("integration/coordinate-agents/SKILL.md"));
      assert.equal(relativeFiles.some((path) => path.includes("coordinator") || path.includes("test/")), false);
      const searchable = await Promise.all((await filesUnder(packageRoot)).filter((path) => !path.includes("node_modules/zod/locales")).map((path) => readFile(path, "utf8").catch(() => "")));
      const formerEndpoint = ["agent-operator", ["188", "241", "197", "83"].join("-"), "sslip", "io"].join(".");
      const formerAlias = ["claw", "vpn"].join("");
      assert.equal(searchable.join("\n").includes(formerEndpoint), false);
      assert.equal(searchable.join("\n").includes(formerAlias), false);
    }

    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const macEnrollment = store.createEnrollment({ agentId: "package-mac", agentName: "Package Mac" });
    const windowsEnrollment = store.createEnrollment({ agentId: "package-windows", agentName: "Package Windows" });
    const windowsPathEnrollment = store.createEnrollment({ agentId: "package-windows-path", agentName: "Package Windows PATH" });
    const app = createCoordinatorApp(store, { host: "127.0.0.1", maxWaitMs: 10 });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolveListening) => server.once("listening", resolveListening));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const coordinatorUrl = `http://127.0.0.1:${address.port}`;

    const fakeCodex = join(temporary, "codex");
    const fakeCodexHomeLog = join(temporary, "codex-home.log");
    await writeFile(fakeCodex, `#!/bin/sh
if [ "$1" = "mcp" ]; then
  printf '%s\\n' "\${CODEX_HOME-}" >> "$AOP_FAKE_CODEX_HOME_LOG"
  if [ "$2" = "get" ]; then exit 1; fi
  exit 0
fi
echo 'codex-cli package-test'
`, { mode: 0o700 });
    await chmod(fakeCodex, 0o700);
    const project = join(temporary, "user-project");
    await mkdir(project);
    await writeFile(join(project, "user-file.txt"), "keep\n");
    const macRoot = join(temporary, "mac-install");
    const testEnv = { AOP_TEST_MODE: "1", AOP_SERVICE_MODE: "skip", AOP_PLATFORM_OVERRIDE: "macos" };
    const serviceSmoke = process.env.AOP_OS_SERVICE_SMOKE === "1" && process.platform === "darwin";
    const macEnv = serviceSmoke ? { AOP_TEST_MODE: "1" } : testEnv;
    const macCommandEnv = { ...macEnv, AOP_FAKE_CODEX_HOME_LOG: fakeCodexHomeLog };
    const macServiceArguments = serviceSmoke ? [] : ["--no-service"];
    const macCodexHome = join(temporary, "mac-codex-home");

    await run(join(macPackage, "bin", "macos", "install.sh"), ["--install-root", macRoot, "--coordinator-url", coordinatorUrl, "--enrollment-code", macEnrollment.code, "--project", project, "--codex-bin", fakeCodex, "--codex-home", macCodexHome, ...macServiceArguments], macCommandEnv);
    assert.equal(store.getAgent("package-mac")?.name, "Package Mac");
    if (serviceSmoke) {
      await run("launchctl", ["print", `gui/${process.getuid?.()}/org.agent-operator.worker`]);
      await run("launchctl", ["bootout", `gui/${process.getuid?.()}`, join(homedir(), "Library", "LaunchAgents", "org.agent-operator.worker.plist")]);
    }
    assert.ok((await readFile(fakeCodexHomeLog, "utf8")).trim().split("\n").every((value) => value === macCodexHome));
    assert.equal((JSON.parse(await readFile(join(macRoot, "config", "integration.json"), "utf8")) as IntegrationReceipt).codexHome, macCodexHome);
    assert.equal((await stat(join(macRoot, "config", "worker.json"))).mode & 0o777, 0o600);
    await writeFile(join(macRoot, "data", "worker-state.json"), "{\"cursor\":7}\n");
    const previousVersion = "0.1.22-test";
    await cp(join(macRoot, "versions", releaseVersion), join(macRoot, "versions", previousVersion), { recursive: true });
    await writeFile(join(macRoot, "config", "current.json"), `${JSON.stringify({ version: releaseVersion, previousVersion })}\n`);
    await run("node", [join(macRoot, "bin", "workerctl.mjs"), "rollback", "--install-root", macRoot, "--no-service"], testEnv);
    assert.equal((await installedState(join(macRoot, "config", "current.json"))).version, previousVersion);
    await run("node", [join(macPackage, "bin", "workerctl.mjs"), "update", "--package-root", macPackage, "--install-root", macRoot, "--no-service"], { ...testEnv, AOP_FAKE_CODEX_HOME_LOG: fakeCodexHomeLog });
    const updated = await installedState(join(macRoot, "config", "current.json"));
    assert.deepEqual([updated.version, updated.previousVersion], [releaseVersion, previousVersion]);
    assert.ok((await readFile(fakeCodexHomeLog, "utf8")).trim().split("\n").every((value) => value === macCodexHome));
    assert.equal(await readFile(join(macRoot, "data", "worker-state.json"), "utf8"), "{\"cursor\":7}\n");
    await run("node", [join(macPackage, "bin", "workerctl.mjs"), "uninstall", "--install-root", macRoot, "--scope", "integration"], { ...testEnv, AOP_FAKE_CODEX_HOME_LOG: fakeCodexHomeLog });
    assert.ok((await readFile(fakeCodexHomeLog, "utf8")).trim().split("\n").every((value) => value === macCodexHome));
    await run("node", [join(macPackage, "bin", "workerctl.mjs"), "uninstall", "--install-root", macRoot, "--scope", "runtime"], testEnv);
    assert.equal(await readFile(join(project, "user-file.txt"), "utf8"), "keep\n");
    assert.equal(await readFile(join(macRoot, "data", "worker-state.json"), "utf8"), "{\"cursor\":7}\n");

    const windowsRoot = join(temporary, "windows-install");
    await run("pwsh", ["-NoLogo", "-NoProfile", "-File", join(windowsPackage, "bin", "windows", "install-worker.ps1"), "-CoordinatorUrl", coordinatorUrl, "-EnrollmentCode", windowsEnrollment.code, "-Project", project, "-InstallRoot", windowsRoot, "-CodexBin", fakeCodex, "-NoService", "-NoIntegration"], { ...testEnv, AOP_PLATFORM_OVERRIDE: "windows" });
    assert.equal(store.getAgent("package-windows")?.name, "Package Windows");
    assert.equal((await installedState(join(windowsRoot, "config", "current.json"))).version, releaseVersion);
    assert.equal((JSON.parse(await readFile(join(windowsRoot, "config", "worker.json"), "utf8")) as WorkerConfig).serviceEnabled, false);
    const windowsPreviousVersion = "0.1.22-windows-test";
    await cp(join(windowsRoot, "versions", releaseVersion), join(windowsRoot, "versions", windowsPreviousVersion), { recursive: true });
    await writeFile(join(windowsRoot, "config", "current.json"), `${JSON.stringify({ version: releaseVersion, previousVersion: windowsPreviousVersion })}\n`);
    const fakeServiceBin = join(temporary, "fake-service-bin");
    const fakeTaskLog = join(temporary, "schtasks.log");
    await mkdir(fakeServiceBin);
    await writeFile(join(fakeServiceBin, "schtasks.exe"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$AOP_TASK_LOG\"\n", { mode: 0o700 });
    await chmod(join(fakeServiceBin, "schtasks.exe"), 0o700);
    const windowsNoServiceEnv = {
      AOP_TEST_MODE: "1",
      AOP_PLATFORM_OVERRIDE: "windows",
      AOP_TASK_LOG: fakeTaskLog,
      PATH: `${fakeServiceBin}:${process.env.PATH ?? ""}`,
    };
    await run("node", [join(windowsRoot, "bin", "workerctl.mjs"), "rollback", "--install-root", windowsRoot], windowsNoServiceEnv);
    await run("node", [join(windowsPackage, "bin", "workerctl.mjs"), "update", "--package-root", windowsPackage, "--install-root", windowsRoot, "--no-integration"], windowsNoServiceEnv);
    await run("node", [join(windowsPackage, "bin", "workerctl.mjs"), "uninstall", "--install-root", windowsRoot, "--scope", "all", "--delete-config", "--delete-state"], windowsNoServiceEnv);
    assert.equal(await readFile(fakeTaskLog, "utf8").catch(() => ""), "", "NoService lifecycle must not touch the global Scheduled Task");
    assert.equal(await readFile(join(project, "user-file.txt"), "utf8"), "keep\n");

    const fakeComSpec = join(temporary, "cmd.exe");
    await writeFile(fakeComSpec, "#!/bin/sh\necho 'codex-cli windows-path-test'\n", { mode: 0o700 });
    await chmod(fakeComSpec, 0o700);
    const windowsPathRoot = join(temporary, "windows-path-install");
    const windowsPathEnv = { ...testEnv, AOP_PLATFORM_OVERRIDE: "windows", ComSpec: fakeComSpec };
    await run("pwsh", ["-NoLogo", "-NoProfile", "-File", join(windowsPackage, "bin", "windows", "install-worker.ps1"), "-CoordinatorUrl", coordinatorUrl, "-EnrollmentCode", windowsPathEnrollment.code, "-Project", project, "-InstallRoot", windowsPathRoot, "-NoService", "-NoIntegration"], windowsPathEnv);
    const windowsPathConfig = JSON.parse(await readFile(join(windowsPathRoot, "config", "worker.json"), "utf8")) as { codexBin: string; codexArgs: string[] };
    assert.equal(windowsPathConfig.codexBin, fakeComSpec);
    assert.deepEqual(windowsPathConfig.codexArgs, ["/d", "/s", "/c", "codex"]);
    await run("node", [join(windowsPackage, "bin", "workerctl.mjs"), "doctor", "--install-root", windowsPathRoot], windowsPathEnv);
  });
});
