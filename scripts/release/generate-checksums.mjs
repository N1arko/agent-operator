#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.verification
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "release");
const excluded = new Set(["SHA256SUMS"]);
const names = (await readdir(directory)).sort();
const lines = [];
for (const name of names) {
  if (excluded.has(name) || name.startsWith(".")) continue;
  const path = resolve(directory, name);
  if (!(await stat(path)).isFile()) continue;
  const hash = createHash("sha256").update(await readFile(path)).digest("hex");
  lines.push(`${hash}  ${basename(path)}`);
}
if (lines.length === 0) throw new Error("No release files found for SHA256SUMS");
await writeFile(resolve(directory, "SHA256SUMS"), `${lines.join("\n")}\n`);
console.log(`${lines.length} checksums written`);
