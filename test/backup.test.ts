import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { runAopctl } from "../src/coordinator/aopctl.js";
import { createBackup, restoreBackup } from "../src/coordinator/backup.js";
import { loadOrCreateCredentialKey } from "../src/coordinator/credential-key.js";
import { CoordinatorStore } from "../src/coordinator/store.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("coordinator backup", () => {
  // @spec spec://modules/coordinator/INFRA-001-coordinator-runtime#data
  it("restores devices, queue and schema from a verified manifest", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aop-backup-"));
    directories.push(dataDir);
    const keyPath = join(dataDir, "credential.key");
    const databasePath = join(dataDir, "coordinator.sqlite");
    const key = loadOrCreateCredentialKey(keyPath);
    const store = new CoordinatorStore(databasePath, undefined, key);
    const enrollment = store.createEnrollment({
      agentId: "backup-mac",
      agentName: "Backup Mac",
    });
    const credential = store.consumeEnrollment({
      code: enrollment.code,
      platform: "macos",
      workerVersion: "0.1.23",
    });
    const queued = store.createMessage({
      kind: "start",
      fromAgentId: "backup-mac",
      toAgentId: "windows-pc",
      projectId: "project",
      text: "Persist this queue item",
    });
    const manifestPath = await createBackup(
      store,
      dataDir,
      undefined,
      "2026-08-23T19:30:00.000Z",
    );
    store.revokeDevice("backup-mac");
    const postBackup = store.createMessage({
      kind: "start",
      fromAgentId: "backup-mac",
      toAgentId: "windows-pc",
      projectId: "project",
      text: "Created after backup",
    });
    store.close();

    await assert.rejects(
      restoreBackup(dataDir, manifestPath, false),
      /confirm-stopped/,
    );
    const restored = await restoreBackup(dataDir, manifestPath, true);
    assert.ok(restored.preRestoreManifest);
    const reopened = new CoordinatorStore(
      databasePath,
      undefined,
      loadOrCreateCredentialKey(keyPath),
    );
    assert.deepEqual(reopened.authenticateDevice(credential.deviceToken), {
      status: "active",
      agentId: "backup-mac",
    });
    assert.equal(reopened.getMessage(queued.id).text, "Persist this queue item");
    assert.throws(() => reopened.getMessage(postBackup.id), /Unknown message/);
    const tables = (
      reopened.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    assert.equal(tables.includes("device_credentials"), true);
    assert.equal(tables.includes("messages"), true);
    reopened.close();
  });

  it("rejects a modified backup and exposes a local doctor receipt", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aop-backup-tamper-"));
    directories.push(dataDir);
    const store = new CoordinatorStore(
      join(dataDir, "coordinator.sqlite"),
      undefined,
      loadOrCreateCredentialKey(join(dataDir, "credential.key")),
    );
    const manifestPath = await createBackup(store, dataDir);
    store.close();
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      credentialKey: { file: string };
    };
    writeFileSync(
      join(join(dataDir, "backups"), manifest.credentialKey.file),
      `${"0".repeat(64)}\n`,
    );
    await assert.rejects(
      restoreBackup(dataDir, manifestPath, true),
      /checksum verification failed/,
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    assert.equal(
      await runAopctl(
        ["doctor", "--json", "--offline"],
        { AOP_DATA_DIR: dataDir },
        {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        },
      ),
      0,
    );
    const doctor = JSON.parse(stdout[0] ?? "{}") as {
      ok: boolean;
      sqliteIntegrity: string;
      credentialKeyMode: string;
    };
    assert.deepEqual(doctor, {
      ...doctor,
      ok: true,
      sqliteIntegrity: "ok",
      credentialKeyMode: "600",
    });
    assert.deepEqual(stderr, []);
  });
});
