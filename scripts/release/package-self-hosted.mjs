#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#deployment
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const stage = join(root, "work", "self-hosted-package");
const release = join(root, "release");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
const capture = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} exited ${result.status}`);
  return result.stdout.trim();
};
const walk = async (directory, includeDirectories = false) => {
  const values = includeDirectories ? [directory] : [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(path, includeDirectories));
    else if (entry.isFile()) values.push(path);
  }
  return values.sort();
};
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(release, { recursive: true });
await cp(join(root, "deploy", "self-hosted"), join(stage, "self-hosted"), { recursive: true });
await cp(join(root, "LICENSE"), join(stage, "LICENSE"));
const repository = (process.env.GITHUB_REPOSITORY ?? new URL(packageJson.repository.url).pathname.replace(/^\//, "").replace(/\.git$/, "")).toLowerCase();
const stagedEnv = join(stage, "self-hosted", ".env.example");
const envExample = await readFile(stagedEnv, "utf8");
await writeFile(stagedEnv, envExample.replace(/^AOP_IMAGE=.*$/m, `AOP_IMAGE=ghcr.io/${repository}:${packageJson.version}`));
await rm(join(stage, "self-hosted", "Dockerfile"), { force: true });
await rm(join(stage, "self-hosted", "compose.build.yaml"), { force: true });
const files = {};
for (const path of await walk(stage)) files[relative(stage, path)] = await digest(path);
const revision = capture("git", ["rev-parse", "HEAD"]);
await writeFile(join(stage, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, product: "agent-operator-self-hosted", version: packageJson.version, revision, files }, null, 2)}\n`);
const sourceEpoch = Number(process.env.SOURCE_DATE_EPOCH ?? capture("git", ["show", "-s", "--format=%ct", "HEAD"]));
const sourceDate = new Date(sourceEpoch * 1000);
for (const path of await walk(stage, true)) await utimes(path, sourceDate, sourceDate);
const tarPath = join(release, `agent-operator-self-hosted-${packageJson.version}.tar`);
await rm(tarPath, { force: true });
await rm(`${tarPath}.gz`, { force: true });
run("tar", ["-cf", tarPath, "-C", stage, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
run("gzip", ["-n", "-f", tarPath]);
console.log(`${await digest(`${tarPath}.gz`)}  ${tarPath}.gz`);
