import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const deploymentFiles = [
  "Dockerfile",
  "compose.yaml",
  "compose.build.yaml",
  "compose.tls.yaml",
  "Caddyfile",
  ".env.example",
  "compose.sh",
  "aopctl.sh",
  "bootstrap.sh",
  "backup.sh",
  "restore.sh",
  "README.md",
  "README.ru.md",
];

const deploymentPath = (name: string): string =>
  join(process.cwd(), "deploy", "self-hosted", name);

describe("self-hosted coordinator distribution", () => {
  // @spec spec://modules/distribution/INFRA-004-open-source-release#deployment
  it("contains no personal deployment values in the generic product surface", () => {
    const content = deploymentFiles
      .map((name) => readFileSync(deploymentPath(name), "utf8"))
      .join("\n");
    for (const forbidden of [
      ["claw", "vpn"].join(""),
      "sslip.io",
      ["188", "241", "197", "83"].join("-"),
      "C:\\Users\\",
      "/Users/",
      "AOP_DEVICE_TOKENS=mac:",
    ]) {
      assert.equal(content.includes(forbidden), false, forbidden);
    }
    assert.match(content, /operator\.example\.com/);
    assert.match(content, /AOP_PUBLIC_URL/);
    assert.match(content, /AOP_ALLOWED_HOSTS/);
  });

  it("pins base images and applies the container security boundary", () => {
    const dockerfile = readFileSync(deploymentPath("Dockerfile"), "utf8");
    const compose = readFileSync(deploymentPath("compose.yaml"), "utf8");
    const tls = readFileSync(deploymentPath("compose.tls.yaml"), "utf8");
    assert.match(dockerfile, /node:24\.19\.0-alpine3\.24@sha256:[a-f0-9]{64}/);
    assert.match(dockerfile, /FROM --platform=\$\{BUILDPLATFORM\} \$\{NODE_IMAGE\} AS build/);
    assert.match(tls, /caddy:2\.11\.4-alpine@sha256:[a-f0-9]{64}/);
    assert.match(dockerfile, /USER node/);
    assert.match(dockerfile, /\/usr\/local\/lib\/node_modules\/npm/);
    assert.match(dockerfile, /tsconfig\.production\.json/);
    assert.equal(dockerfile.includes("COPY test"), false);
    assert.match(compose, /read_only: true/);
    assert.match(compose, /no-new-privileges:true/);
    assert.match(compose, /cap_drop:/);
    assert.match(compose, /\.\/data:\/data/);
  });

  it("ships executable operator entrypoints", () => {
    for (const name of [
      "compose.sh",
      "aopctl.sh",
      "bootstrap.sh",
      "backup.sh",
      "restore.sh",
    ]) {
      assert.notEqual(statSync(deploymentPath(name)).mode & 0o111, 0, name);
    }
  });
});
