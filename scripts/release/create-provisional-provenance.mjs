#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.verification
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const kind = process.argv[2];
const output = resolve(process.argv[3] ?? "release/provenance.jsonl");
const source = resolve(process.argv[4] ?? "release");
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const subjects = [];

if (kind === "image") {
  const digest = required("AOP_PROVENANCE_SUBJECT_DIGEST");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid image digest");
  subjects.push({ name: required("AOP_PROVENANCE_SUBJECT_NAME"), digest: { sha256: digest.slice(7) } });
} else if (kind === "receipt") {
  subjects.push({ name: basename(source), digest: { sha256: await sha256(source) } });
} else if (kind === "files") {
  for (const name of (await readdir(source)).sort()) {
    if (name.startsWith(".") || name.startsWith("provenance-") || name === "SHA256SUMS") continue;
    const path = resolve(source, name);
    if ((await stat(path)).isFile()) subjects.push({ name, digest: { sha256: await sha256(path) } });
  }
} else {
  throw new Error("Usage: create-provisional-provenance.mjs <image|files|receipt> <output> [source]");
}
if (subjects.length === 0) throw new Error("No provenance subjects found");

const repository = required("GITHUB_REPOSITORY");
const runId = required("GITHUB_RUN_ID");
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: subjects,
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://github.com/Attestations/GitHubActionsWorkflow@v1",
      externalParameters: {
        workflow: process.env.GITHUB_WORKFLOW_REF ?? null,
        ref: process.env.GITHUB_REF ?? null
      },
      internalParameters: {
        repositoryVisibility: "private",
        signed: false,
        reason: "GitHub Free supports signed artifact attestations only for public repositories"
      },
      resolvedDependencies: [{ uri: `git+https://github.com/${repository}@${process.env.GITHUB_SHA ?? "unknown"}` }]
    },
    runDetails: {
      builder: { id: `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}/actions/runs/${runId}` },
      metadata: { invocationId: runId }
    }
  }
};
await writeFile(output, `${JSON.stringify(statement)}\n`);
console.log(JSON.stringify({ ok: true, kind, subjects: subjects.length, signed: false }));
