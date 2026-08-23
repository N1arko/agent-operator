#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#security
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const roots = process.argv.slice(2).map((path) => resolve(path));
if (roots.length === 0) throw new Error("Usage: verify-artifact-safety.mjs DIRECTORY...");
const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${path}`);
    if (metadata.isDirectory()) files.push(...await walk(path));
    else if (metadata.isFile()) files.push(path);
    else throw new Error(`Artifact contains an unsupported entry: ${path}`);
  }
  return files.sort();
};
const forbiddenNames = [
  ".env",
  "credential.key",
  "worker.json",
  "projects.json",
  "current.json",
  "worker-state.json",
  "config.toml",
];
const forbiddenExtensions = [".db", ".sqlite", ".sqlite3", ".log"];
const privatePatterns = [
  ["claw", "vpn"].join(""),
  ["agent-operator", ["188", "241", "197", "83"].join("-"), "sslip", "io"].join("."),
  ["/Users", "nikitaarhipov"].join("/"),
  ["C:", "Users", "nikit"].join("\\"),
];
const secretPatterns = [
  /aop_enroll_[A-Za-z0-9_-]{16,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[opsu]_[A-Za-z0-9]{20,}/,
];

let checkedFiles = 0;
for (const root of roots) {
  const files = await walk(root);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !manifest.files || typeof manifest.files !== "object") {
    throw new Error(`Invalid artifact manifest: ${manifestPath}`);
  }
  const observed = files.filter((path) => path !== manifestPath).map((path) => relative(root, path)).sort();
  const declared = Object.keys(manifest.files).sort();
  if (JSON.stringify(observed) !== JSON.stringify(declared)) throw new Error(`Artifact manifest file set mismatch: ${root}`);
  for (const path of files) {
    const name = basename(path).toLowerCase();
    if (forbiddenNames.includes(name) || forbiddenExtensions.some((extension) => name.endsWith(extension))) {
      throw new Error(`Artifact contains a runtime/private file: ${relative(root, path)}`);
    }
    const content = await readFile(path);
    const relativePath = relative(root, path);
    if (path !== manifestPath && manifest.files[relativePath] !== sha256(content)) {
      throw new Error(`Artifact manifest checksum mismatch: ${relativePath}`);
    }
    const text = content.toString("utf8");
    for (const pattern of privatePatterns) {
      if (text.includes(pattern)) throw new Error(`Artifact contains a private deployment reference: ${relativePath}`);
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) throw new Error(`Artifact contains credential-shaped content: ${relativePath}`);
    }
    checkedFiles += 1;
  }
}
console.log(JSON.stringify({ ok: true, roots: roots.length, checkedFiles }));
