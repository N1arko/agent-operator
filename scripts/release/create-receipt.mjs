#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.verification
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "release");
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const image = JSON.parse(await readFile(resolve(directory, "coordinator-image.json"), "utf8"));
if (!/^sha256:[a-f0-9]{64}$/.test(image.digest)) throw new Error("Invalid coordinator image digest");
const artifacts = [];
for (const name of (await readdir(directory)).sort()) {
  if (name === "release-receipt.json" || name === "SHA256SUMS" || name.startsWith(".")) continue;
  const path = resolve(directory, name);
  if (!(await stat(path)).isFile()) continue;
  artifacts.push({ name: basename(path), sha256: createHash("sha256").update(await readFile(path)).digest("hex"), sizeBytes: (await stat(path)).size });
}
const receipt = {
  schemaVersion: 1,
  tag: required("AOP_RELEASE_TAG"),
  version: required("AOP_RELEASE_VERSION"),
  commit: required("AOP_RELEASE_COMMIT"),
  runId: required("GITHUB_RUN_ID"),
  repository: required("GITHUB_REPOSITORY"),
  draft: true,
  cleanRoom: { status: "pending", evidence: [] },
  image,
  artifacts,
  provenance: {
    files: {
      mode: required("AOP_FILES_PROVENANCE_MODE"),
      url: required("AOP_FILES_ATTESTATION_URL")
    },
    image: {
      mode: required("AOP_IMAGE_PROVENANCE_MODE"),
      url: required("AOP_IMAGE_ATTESTATION_URL")
    }
  },
  checks: {
    quality: "passed",
    security: "passed",
    macosPackage: "passed",
    windowsPackage: "passed",
    multiArchitectureImage: "passed"
  }
};
await writeFile(resolve(directory, "release-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, artifacts: artifacts.length, imageDigest: image.digest }));
