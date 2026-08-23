import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { runAopctl } from "../src/coordinator/aopctl.js";
import { loadOrCreateCredentialKey } from "../src/coordinator/credential-key.js";
import { CoordinatorStore } from "../src/coordinator/store.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("aopctl", () => {
  // @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.cli
  it("creates, lists and revokes an enrolled device without exposing tokens", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aopctl-"));
    directories.push(dataDir);
    const env = {
      AOP_DATA_DIR: dataDir,
      AOP_PUBLIC_URL: "https://operator.example.test",
      AOP_DEVICE_TOKENS: "legacy-mac:legacy-safe-token-value",
    };
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    };

    assert.equal(
      runAopctl(
        ["device", "create", "--id", "studio-mac", "--name", "Studio Mac"],
        env,
        output,
      ),
      0,
    );
    const code = stdout[0]?.match(/^Code: (.+)$/m)?.[1];
    assert.ok(code);
    assert.match(stdout[0] ?? "", /https:\/\/operator\.example\.test/);
    assert.equal(statSync(join(dataDir, "credential.key")).mode & 0o777, 0o600);

    const store = new CoordinatorStore(
      join(dataDir, "coordinator.sqlite"),
      undefined,
      loadOrCreateCredentialKey(join(dataDir, "credential.key")),
    );
    const credential = store.consumeEnrollment({
      code,
      platform: "macos",
      workerVersion: "0.1.23",
    });
    store.heartbeat("legacy-mac", {
      name: "Legacy Mac",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [],
      workerVersion: "0.1.23",
    });
    store.close();

    stdout.length = 0;
    assert.equal(runAopctl(["device", "list", "--json"], env, output), 0);
    const listingOutput = stdout[0] ?? "[]";
    const listed = JSON.parse(listingOutput) as Array<{
      agentId: string;
      source: string;
      workerVersion: string | null;
    }>;
    assert.deepEqual(
      listed.map((device) => [device.agentId, device.source]).sort(),
      [
        ["legacy-mac", "legacy"],
        ["studio-mac", "enrolled"],
      ],
    );
    assert.equal(
      listed.find((device) => device.agentId === "legacy-mac")?.workerVersion,
      "0.1.23",
    );
    assert.equal(listingOutput.includes(credential.deviceToken), false);
    assert.equal(listingOutput.includes("legacy-safe-token-value"), false);

    stdout.length = 0;
    assert.equal(runAopctl(["device", "revoke", "studio-mac"], env, output), 0);
    const reopened = new CoordinatorStore(
      join(dataDir, "coordinator.sqlite"),
      undefined,
      loadOrCreateCredentialKey(join(dataDir, "credential.key")),
    );
    assert.deepEqual(reopened.authenticateDevice(credential.deviceToken), {
      status: "revoked",
    });
    reopened.close();
    assert.deepEqual(stderr, []);
  });

  it("revokes an unused enrollment by its opaque ID", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aopctl-enrollment-"));
    directories.push(dataDir);
    const stdout: string[] = [];
    const output = {
      stdout: (value: string) => stdout.push(value),
      stderr: () => undefined,
    };
    const env = { AOP_DATA_DIR: dataDir };
    assert.equal(
      runAopctl(
        ["device", "create", "--id", "windows-pc", "--name", "Windows PC"],
        env,
        output,
      ),
      0,
    );
    const enrollmentId = stdout[0]?.match(/^Enrollment ID: (.+)$/m)?.[1];
    assert.ok(enrollmentId);
    assert.equal(
      runAopctl(["enrollment", "revoke", enrollmentId], env, output),
      0,
    );
  });
});
