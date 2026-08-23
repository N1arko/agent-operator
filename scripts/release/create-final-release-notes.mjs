#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.source
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "release");
const output = resolve(process.argv[3] ?? "work/final-release-notes.md");
const receipt = JSON.parse(await readFile(resolve(directory, "release-receipt.json"), "utf8"));
const evidence = JSON.parse(await readFile(resolve(directory, "clean-room-evidence.json"), "utf8"));
if (receipt.cleanRoom?.status !== "passed" || evidence.status !== "passed") throw new Error("Passed clean-room evidence is required");
const repository = process.env.GITHUB_REPOSITORY;
if (!repository) throw new Error("GITHUB_REPOSITORY is required");
const source = `https://github.com/${repository}/blob/${receipt.tag}`;
const notes = `# Agent Operator ${receipt.version}

Free self-hosted alpha release for coordinating Codex tasks across trusted macOS and Windows computers.

- Source revision: \`${receipt.commit}\`
- Coordinator image: \`${receipt.image.name}@${receipt.image.digest}\`
- Platforms: \`${receipt.image.platforms.join("\`, \`")}\`
- Supply chain: SHA256 checksums, SPDX SBOMs and GitHub attestations
- Acceptance: exact published artifacts passed the clean-room scenarios recorded in \`clean-room-evidence.json\`

Start with the [English Quick Start](${source}/docs/getting-started/QUICKSTART.md) or [русской инструкцией](${source}/docs/getting-started/QUICKSTART.ru.md).

Known alpha limitations: one trust domain, one active turn per worker, operator-managed TLS and backups, archive installers without native signing, and compatibility tied to the versions recorded in the acceptance evidence. See the [compatibility matrix](${source}/docs/getting-started/COMPATIBILITY.md) before installation.
`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, notes);
console.log(JSON.stringify({ ok: true, output, version: receipt.version }));
