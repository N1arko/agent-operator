#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#decisions
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) throw new Error("Release tag is required");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = packageJson.version;
const expectedTag = `v${version}`;
if (tag !== expectedTag) throw new Error(`Tag/version mismatch: tag=${tag} package=${version}`);
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);

const expectations = [
  ["src/shared/version.ts", `export const APP_VERSION = "${version}";`],
  ["deploy/self-hosted/Dockerfile", `ARG AOP_VERSION=${version}`],
  ["deploy/self-hosted/compose.build.yaml", `AOP_VERSION: \${AOP_VERSION:-${version}}`],
  ["deploy/self-hosted/.env.example", `AOP_VERSION=${version}`],
];
for (const [path, expected] of expectations) {
  const content = await readFile(resolve(root, path), "utf8");
  if (!content.includes(expected)) throw new Error(`Version mismatch in ${path}`);
}

console.log(JSON.stringify({ ok: true, tag, version }));
