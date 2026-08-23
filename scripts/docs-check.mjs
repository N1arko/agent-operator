#!/usr/bin/env node

// @spec spec://common/PROP-007-OPEN-SOURCE#documentation
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicFiles = [
  "README.md",
  "README.ru.md",
  "SECURITY.md",
  "SECURITY.ru.md",
  "CONTRIBUTING.md",
  "CONTRIBUTING.ru.md",
  "deploy/self-hosted/README.md",
  "deploy/self-hosted/README.ru.md",
  "packaging/worker/README.md",
  "packaging/worker/README.ru.md",
  "docs/README.md",
  "docs/README.ru.md",
  "docs/ARCHITECTURE.md",
  "docs/ARCHITECTURE.ru.md",
  "docs/OPERATIONS.md",
  "docs/OPERATIONS.ru.md",
  "docs/RELEASE_NOTES.md",
  "docs/RELEASE_NOTES.ru.md",
  "docs/getting-started/QUICKSTART.md",
  "docs/getting-started/QUICKSTART.ru.md",
  "docs/getting-started/COORDINATOR.md",
  "docs/getting-started/COORDINATOR.ru.md",
  "docs/getting-started/WORKER.md",
  "docs/getting-started/WORKER.ru.md",
  "docs/getting-started/COMPATIBILITY.md",
  "docs/getting-started/COMPATIBILITY.ru.md",
  "docs/getting-started/MIGRATION.md",
  "docs/getting-started/MIGRATION.ru.md",
  "docs/operations/TROUBLESHOOTING.md",
  "docs/operations/TROUBLESHOOTING.ru.md",
  "docs/security/SECURITY-MODEL.md",
  "docs/security/SECURITY-MODEL.ru.md",
];

const documents = new Map();
for (const path of publicFiles) {
  const absolute = resolve(root, path);
  await access(absolute).catch(() => { throw new Error(`Missing public document: ${path}`); });
  documents.set(path, await readFile(absolute, "utf8"));
}

const brokenLinks = [];
const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;
for (const [path, content] of documents) {
  for (const match of content.matchAll(linkPattern)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (!raw || raw.startsWith("#") || /^(?:https?:|mailto:)/.test(raw)) continue;
    const target = decodeURIComponent(raw.split("#", 1)[0].split("?", 1)[0]);
    const absolute = resolve(dirname(resolve(root, path)), target);
    if (!absolute.startsWith(`${root}/`) && absolute !== root) {
      brokenLinks.push(`${path}: unsafe link ${raw}`);
      continue;
    }
    await stat(absolute).catch(() => brokenLinks.push(`${path}: missing link ${raw}`));
  }
}
if (brokenLinks.length) throw new Error(`Broken public documentation links:\n${brokenLinks.join("\n")}`);

const pairs = [
  ["README.md", "README.ru.md", ["v0.2.0-alpha", "Docker Compose", "Apache License 2.0"]],
  ["docs/getting-started/QUICKSTART.md", "docs/getting-started/QUICKSTART.ru.md", ["agent-operator-self-hosted-${VERSION}.tar.gz", "SHA256SUMS", "agent_start", "agent_wait"]],
  ["docs/getting-started/COORDINATOR.md", "docs/getting-started/COORDINATOR.ru.md", ["AOP_PUBLIC_URL", "AOP_ALLOWED_HOSTS", "aopctl.sh device revoke", "credential.key"]],
  ["docs/getting-started/WORKER.md", "docs/getting-started/WORKER.ru.md", ["install.sh", "install-worker.ps1", "rollback", "--delete-state"]],
  ["docs/getting-started/COMPATIBILITY.md", "docs/getting-started/COMPATIBILITY.ru.md", ["amd64", "arm64", "Node.js 24", "10 MiB"]],
  ["docs/getting-started/MIGRATION.md", "docs/getting-started/MIGRATION.ru.md", ["0.1.23", "AOP_DEVICE_TOKENS", "credential.key", "SQLite"]],
  ["docs/ARCHITECTURE.md", "docs/ARCHITECTURE.ru.md", ["agent_start", "agent_wait", "SQLite", "idempotency"]],
  ["docs/OPERATIONS.md", "docs/OPERATIONS.ru.md", ["backup.sh", "restore.sh", "AOP_IMAGE", "agent_cancel"]],
  ["docs/operations/TROUBLESHOOTING.md", "docs/operations/TROUBLESHOOTING.ru.md", ["doctor --json --offline", "codex --version", "45"]],
  ["docs/security/SECURITY-MODEL.md", "docs/security/SECURITY-MODEL.ru.md", ["10", "50 MiB", "SHA256SUMS", "no-new-privileges"]],
  ["docs/RELEASE_NOTES.md", "docs/RELEASE_NOTES.ru.md", ["v0.2.0-alpha", "SPDX", "provenance", "release receipt"]],
];
for (const [english, russian, tokens] of pairs) {
  for (const token of tokens) {
    if (!documents.get(english).includes(token)) throw new Error(`${english} is missing parity token: ${token}`);
    if (!documents.get(russian).includes(token)) throw new Error(`${russian} is missing parity token: ${token}`);
  }
}

const publicSurface = [...documents.entries()].map(([path, content]) => `${path}\n${content}`).join("\n");
const tlsAllowedHosts = "AOP_ALLOWED_HOSTS=operator.example.com,127.0.0.1,localhost";
for (const path of [
  "deploy/self-hosted/README.md",
  "deploy/self-hosted/README.ru.md",
  "docs/getting-started/QUICKSTART.md",
  "docs/getting-started/QUICKSTART.ru.md",
  "docs/getting-started/COORDINATOR.md",
  "docs/getting-started/COORDINATOR.ru.md",
]) {
  if (!documents.get(path).includes(tlsAllowedHosts)) {
    throw new Error(`${path} must preserve loopback hosts required by the container healthcheck`);
  }
}
const privatePatterns = [
  ["claw", "vpn"].join(""),
  ["188", "241", "197", "83"].join("-"),
  "/Users/nikitaarhipov",
  "C:\\Users\\nikit",
];
for (const pattern of privatePatterns) {
  if (publicSurface.includes(pattern)) throw new Error(`Private deployment reference in public documentation: ${pattern}`);
}

console.log(JSON.stringify({ ok: true, documents: documents.size, pairs: pairs.length, brokenLinks: 0 }));
