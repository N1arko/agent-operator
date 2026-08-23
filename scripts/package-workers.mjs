#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.worker
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, chmod, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
const work = join(root, "work", "worker-packages");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const requested = process.argv[2] ?? "both";
const platforms = requested === "both" ? ["macos", "windows"] : [requested];
if (platforms.some((platform) => !["macos", "windows"].includes(platform))) {
  throw new Error("Usage: package-workers.mjs [macos|windows|both]");
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
const capture = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} exited ${result.status}`);
  return result.stdout.trim();
};
const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
};
const walkEntries = async (directory) => {
  const entries = [directory];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    entries.push(path);
    if (entry.isDirectory()) entries.push(...(await walkEntries(path)).slice(1));
  }
  return entries.sort();
};
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const copyRuntimeJs = async (source, target) => {
  for (const path of await walk(source)) {
    if (!path.endsWith(".js")) continue;
    const destination = join(target, relative(source, path));
    await mkdir(dirname(destination), { recursive: true });
    await cp(path, destination);
  }
};

run("pnpm", ["run", "build:production"]);
await mkdir(release, { recursive: true });
await mkdir(work, { recursive: true });
const revision = capture("git", ["rev-parse", "HEAD"]);
const sourceEpoch = Number(process.env.SOURCE_DATE_EPOCH ?? capture("git", ["show", "-s", "--format=%ct", "HEAD"]));
const sourceDate = new Date(sourceEpoch * 1000);
const results = [];

for (const platform of platforms) {
  const stage = join(work, platform);
  await rm(stage, { recursive: true, force: true });
  await mkdir(join(stage, "bin"), { recursive: true });
  await mkdir(join(stage, "runtime", "node_modules"), { recursive: true });
  await mkdir(join(stage, "integration"), { recursive: true });
  await cp(join(root, "scripts", "worker-lifecycle.mjs"), join(stage, "bin", "workerctl.mjs"));
  await copyRuntimeJs(join(root, "dist", "src", "worker"), join(stage, "runtime", "src", "worker"));
  await copyRuntimeJs(join(root, "dist", "src", "shared"), join(stage, "runtime", "src", "shared"));
  await cp(join(root, "node_modules", "zod"), join(stage, "runtime", "node_modules", "zod"), { recursive: true, dereference: true });
  await cp(join(root, "integrations", "skills", "coordinate-agents"), join(stage, "integration", "coordinate-agents"), { recursive: true });
  await cp(join(root, "LICENSE"), join(stage, "LICENSE"));
  await cp(join(root, "packaging", "worker", "README.md"), join(stage, "README.md"));
  await cp(join(root, "packaging", "worker", "README.ru.md"), join(stage, "README.ru.md"));
  await cp(join(root, "scripts", platform), join(stage, "bin", platform), { recursive: true });
  for (const path of await walk(join(stage, "bin"))) {
    if (platform === "macos" || path.endsWith(".mjs")) await chmod(path, 0o755);
  }
  const files = {};
  for (const path of await walk(stage)) files[relative(stage, path)] = await digest(path);
  const manifest = {
    schemaVersion: 1,
    product: "agent-operator-worker",
    version,
    revision,
    platform,
    nodeMajor: 24,
    dependencyVersions: { zod: packageJson.dependencies.zod },
    files,
  };
  await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const path of await walkEntries(stage)) await utimes(path, sourceDate, sourceDate);
  if (platform === "macos") {
    const tarPath = join(release, `agent-operator-worker-macos-${version}.tar`);
    await rm(tarPath, { force: true });
    await rm(`${tarPath}.gz`, { force: true });
    run("tar", ["-cf", tarPath, "-C", stage, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    run("gzip", ["-n", "-f", tarPath]);
    results.push(`${tarPath}.gz`);
  } else {
    const archive = join(release, `agent-operator-worker-windows-${version}.zip`);
    await rm(archive, { force: true });
    run("zip", ["-X", "-q", "-r", archive, "."], { cwd: stage });
    results.push(archive);
  }
}

for (const path of results) console.log(`${await digest(path)}  ${path}`);
