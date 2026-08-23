import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFile = promisify(execFileCallback);
const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("open-source release pipeline", () => {
  // @spec spec://modules/distribution/INFRA-004-open-source-release#decisions
  it("fails closed when tag, package and runtime versions differ", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const accepted = await execFile("node", ["scripts/release/verify-version.mjs", `v${packageJson.version}`]);
    assert.match(accepted.stdout, /"ok":true/);
    await assert.rejects(execFile("node", ["scripts/release/verify-version.mjs", "v99.0.0"]), /Tag\/version mismatch/);
  });

  // @spec spec://modules/distribution/INFRA-004-open-source-release#ci
  // @spec spec://modules/distribution/PROP-102-distribution#rules
  it("keeps pull-request CI read-only and release publication tag-only draft", async () => {
    const ci = await readFile(".github/workflows/ci.yml", "utf8");
    const release = await readFile(".github/workflows/release.yml", "utf8");
    assert.match(ci, /permissions:\n {2}contents: read/);
    assert.doesNotMatch(ci, /secrets\./);
    assert.match(release, /tags: \["v\*"\]/);
    assert.doesNotMatch(release, /pull_request:/);
    assert.match(release, /git cat-file -t/);
    assert.match(release, /platforms: linux\/amd64,linux\/arm64/);
    assert.match(release, /actions\/attest@[a-f0-9]{40}/);
    assert.match(release, /visibility == 'public'/);
    assert.match(release, /create-provisional-provenance\.mjs/);
    assert.match(release, /--draft --prerelease --verify-tag/);
    assert.match(release, /release-receipt\.json/);
    for (const workflow of [ci, release, await readFile(".github/workflows/security.yml", "utf8")]) {
      assert.doesNotMatch(workflow, /uses:\s+[^\s]+@(?![a-f0-9]{40}\b)[^\s]+/);
    }
  });

  // @spec spec://modules/distribution/INFRA-004-open-source-release#release
  it("publishes only a public, checksummed draft with passed exact clean-room evidence", async () => {
    const workflow = await readFile(".github/workflows/publish-release.yml", "utf8");
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /test "\$AOP_VISIBILITY" = public/);
    assert.match(workflow, /sha256sum --check SHA256SUMS/);
    assert.match(workflow, /finalize-receipt\.mjs/);
    assert.match(workflow, /actions\/attest@[a-f0-9]{40}/);
    assert.match(workflow, /gh release upload[\s\S]+--clobber/);
    assert.match(workflow, /gh release edit "\$AOP_TAG" --draft=false --prerelease/);
    assert.match(workflow, /credential\.helper= clone/);
    assert.match(workflow, /docker buildx imagetools inspect/);
    assert.doesNotMatch(workflow, /pull_request:/);
  });

  // @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.verification
  it("creates deterministic self-hosted bundle, receipt and complete checksums", async () => {
    const first = await execFile("node", ["scripts/release/package-self-hosted.mjs"]);
    const second = await execFile("node", ["scripts/release/package-self-hosted.mjs"]);
    assert.equal(first.stdout, second.stdout);
    const directory = await mkdtemp(join(tmpdir(), "aop-release-receipt-"));
    directories.push(directory);
    await writeFile(join(directory, "coordinator-image.json"), `${JSON.stringify({ name: "ghcr.io/example/agent-operator", digest: `sha256:${"a".repeat(64)}`, platforms: ["linux/amd64", "linux/arm64"] })}\n`);
    await writeFile(join(directory, "worker.zip"), "worker\n");
    await mkdir(join(directory, "ignored-directory"));
    const env = {
      ...process.env,
      AOP_RELEASE_TAG: "v0.2.0-alpha.0",
      AOP_RELEASE_VERSION: "0.2.0-alpha.0",
      AOP_RELEASE_COMMIT: "b".repeat(40),
      GITHUB_RUN_ID: "1",
      GITHUB_REPOSITORY: "example/agent-operator",
      AOP_FILES_ATTESTATION_URL: "https://example.invalid/files",
      AOP_IMAGE_ATTESTATION_URL: "https://example.invalid/image",
      AOP_FILES_PROVENANCE_MODE: "github-attestation",
      AOP_IMAGE_PROVENANCE_MODE: "github-attestation"
    };
    await execFile("node", ["scripts/release/create-receipt.mjs", directory], { env });
    await execFile("node", ["scripts/release/create-provisional-provenance.mjs", "files", join(directory, "provenance-files.jsonl"), directory], { env });
    await execFile("node", ["scripts/release/generate-checksums.mjs", directory]);
    const receipt = JSON.parse(await readFile(join(directory, "release-receipt.json"), "utf8")) as { draft: boolean; cleanRoom: { status: string }; artifacts: unknown[] };
    assert.equal(receipt.draft, true);
    assert.equal(receipt.cleanRoom.status, "pending");
    assert.equal(receipt.artifacts.length, 2);
    const provenance = JSON.parse(await readFile(join(directory, "provenance-files.jsonl"), "utf8")) as { predicate: { buildDefinition: { internalParameters: { signed: boolean } } } };
    assert.equal(provenance.predicate.buildDefinition.internalParameters.signed, false);
    const sums = await readFile(join(directory, "SHA256SUMS"), "utf8");
    for (const name of ["coordinator-image.json", "release-receipt.json", "worker.zip"]) assert.match(sums, new RegExp(`${name.replace(".", "\\.")}\\n`));
    const bundle = (await readdir("release")).find((name) => name.startsWith("agent-operator-self-hosted-"));
    assert.ok(bundle?.endsWith(".tar.gz"));
  });

  // @spec spec://modules/distribution/INFRA-004-open-source-release#release
  it("binds only matching passed clean-room evidence to the final receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-final-receipt-"));
    directories.push(directory);
    const artifactSha = "c".repeat(64);
    await writeFile(join(directory, "release-receipt.json"), `${JSON.stringify({
      schemaVersion: 1,
      tag: "v0.2.0-alpha",
      version: "0.2.0-alpha",
      commit: "b".repeat(40),
      draft: true,
      cleanRoom: { status: "pending", evidence: [] },
      image: { digest: `sha256:${"a".repeat(64)}` },
      artifacts: [{ name: "worker.zip", sha256: artifactSha }],
      provenance: { files: { mode: "github-attestation" }, image: { mode: "github-attestation" } },
    }, null, 2)}\n`);
    const evidencePath = join(process.cwd(), "docs", "evidence", ".test-clean-room.json");
    const evidence = {
      schemaVersion: 1,
      status: "passed",
      verifiedAt: "2026-08-23T00:00:00Z",
      release: {
        tag: "v0.2.0-alpha",
        version: "0.2.0-alpha",
        commit: "b".repeat(40),
        imageDigest: `sha256:${"a".repeat(64)}`,
        artifacts: { "worker.zip": artifactSha },
      },
      scenarios: { install: "passed", task: "passed" },
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`);
    directories.push(evidencePath);
    await execFile("node", ["scripts/release/finalize-receipt.mjs", directory, evidencePath], {
      env: { ...process.env, GITHUB_RUN_ID: "2", GITHUB_SHA: "d".repeat(40) },
    });
    const finalReceipt = JSON.parse(await readFile(join(directory, "release-receipt.json"), "utf8")) as {
      draft: boolean;
      cleanRoom: { status: string; scenarios: string[] };
    };
    assert.equal(finalReceipt.draft, false);
    assert.equal(finalReceipt.cleanRoom.status, "passed");
    assert.deepEqual(finalReceipt.cleanRoom.scenarios, ["install", "task"]);

    evidence.release.imageDigest = `sha256:${"e".repeat(64)}`;
    await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`);
    await assert.rejects(
      execFile("node", ["scripts/release/finalize-receipt.mjs", directory, evidencePath]),
      /not an unaccepted draft|image digest/,
    );
  });
});
