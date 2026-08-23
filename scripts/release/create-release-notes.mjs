#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.source
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const version = process.env.AOP_RELEASE_VERSION;
const commit = process.env.AOP_RELEASE_COMMIT;
if (!version || !commit) throw new Error("Release version and commit are required");
const isPublic = process.env.AOP_REPOSITORY_VISIBILITY === "public";
const output = resolve(process.argv[2] ?? "work/release-notes.md");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `# Agent Operator ${version}\n\n${isPublic ? "Public" : "Private"} pipeline candidate for the free self-hosted open-source release.\n\n- Source revision: \`${commit}\`\n- Coordinator: multi-architecture GHCR image\n- Workers: macOS and Windows lifecycle packages\n- Verification: checksums, SPDX SBOMs, provenance and release receipt\n- Publication state: draft; clean-room acceptance pending\n\nThis candidate is awaiting final release acceptance.\n`);
