#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#release
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const directory = resolve(process.argv[2] ?? "release");
const evidencePath = resolve(process.argv[3] ?? "");
const evidenceBoundary = relative(resolve(root, "docs", "evidence"), evidencePath);
if (!process.argv[3] || evidenceBoundary.startsWith("..") || evidenceBoundary === "") {
  throw new Error("Clean-room evidence must be a file under docs/evidence");
}

const receiptPath = resolve(directory, "release-receipt.json");
const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const fail = (message) => { throw new Error(message); };

if (receipt.schemaVersion !== 1 || receipt.cleanRoom?.status !== "pending" || receipt.draft !== true) {
  fail("Release receipt is not an unaccepted draft");
}
if (evidence.schemaVersion !== 1 || evidence.status !== "passed") fail("Clean-room evidence is not passed");
for (const field of ["tag", "version", "commit"]) {
  if (evidence.release?.[field] !== receipt[field]) fail(`Clean-room ${field} does not match the release receipt`);
}
if (evidence.release?.imageDigest !== receipt.image?.digest) fail("Clean-room image digest does not match the release receipt");
if (receipt.provenance?.files?.mode !== "github-attestation" || receipt.provenance?.image?.mode !== "github-attestation") {
  fail("Final publication requires GitHub-attested files and image provenance");
}
if (!evidence.scenarios || Object.values(evidence.scenarios).some((value) => value !== "passed")) {
  fail("Every clean-room scenario must be passed");
}
const observedArtifacts = evidence.release?.artifacts;
if (!observedArtifacts || typeof observedArtifacts !== "object") fail("Clean-room artifact observations are required");
for (const artifact of receipt.artifacts ?? []) {
  if (observedArtifacts[artifact.name] !== artifact.sha256) fail(`Clean-room checksum mismatch for ${artifact.name}`);
}

const evidenceName = "clean-room-evidence.json";
const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
await writeFile(resolve(directory, evidenceName), evidenceBytes);
const finalReceipt = {
  ...receipt,
  draft: false,
  cleanRoom: {
    status: "passed",
    verifiedAt: evidence.verifiedAt,
    evidence: [{ name: evidenceName, sha256: evidenceSha256 }],
    scenarios: Object.keys(evidence.scenarios).sort(),
  },
  publication: {
    runId: process.env.GITHUB_RUN_ID ?? "local",
    evidenceRevision: process.env.GITHUB_SHA ?? "local",
  },
};
await writeFile(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, tag: receipt.tag, commit: receipt.commit, evidenceSha256 }));
