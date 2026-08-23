#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.coordinator
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const digest = required("AOP_IMAGE_DIGEST");
if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid image digest");
const output = resolve(process.argv[2] ?? "release/coordinator-image.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  name: required("AOP_IMAGE_NAME"),
  digest,
  version: required("AOP_RELEASE_VERSION"),
  revision: required("AOP_RELEASE_COMMIT"),
  platforms: ["linux/amd64", "linux/arm64"],
  provenance: {
    mode: required("AOP_IMAGE_PROVENANCE_MODE"),
    url: required("AOP_IMAGE_ATTESTATION_URL")
  }
}, null, 2)}\n`);
