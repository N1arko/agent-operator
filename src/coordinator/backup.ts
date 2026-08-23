import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { APP_REVISION, APP_VERSION } from "../shared/version.js";
import { loadOrCreateCredentialKey } from "./credential-key.js";
import { CoordinatorStore } from "./store.js";

export type BackupManifest = {
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  appRevision: string;
  database: { file: string; sha256: string };
  credentialKey: { file: string; sha256: string };
  sqliteIntegrity: "ok";
};

const fileSha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const timestamp = (value: string): string =>
  `${value.replaceAll("-", "").replaceAll(":", "").replace(".", "")}-${randomUUID().slice(0, 8)}`;

const removeIfPresent = (path: string): void => {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const verifySqlite = (path: string): void => {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (result.integrity_check !== "ok") {
      throw new Error("SQLite backup integrity check failed");
    }
  } finally {
    database.close();
  }
};

// @spec spec://modules/coordinator/INFRA-001-coordinator-runtime#data
export const createBackup = async (
  store: CoordinatorStore,
  dataDir: string,
  outputDir = join(dataDir, "backups"),
  createdAt = new Date().toISOString(),
): Promise<string> => {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const id = `agent-operator-${timestamp(createdAt)}`;
  const databaseFile = `${id}.sqlite`;
  const keyFile = `${id}.credential.key`;
  const manifestFile = `${id}.json`;
  const databasePath = join(outputDir, databaseFile);
  const keyPath = join(outputDir, keyFile);
  const manifestPath = join(outputDir, manifestFile);
  const databasePartial = `${databasePath}.partial`;
  const keyPartial = `${keyPath}.partial`;
  const manifestPartial = `${manifestPath}.partial`;
  const sourceKey = join(dataDir, "credential.key");
  if (!existsSync(sourceKey)) throw new Error("Credential key is unavailable");

  try {
    await backup(store.db, databasePartial);
    verifySqlite(databasePartial);
    copyFileSync(sourceKey, keyPartial);
    chmodSync(databasePartial, 0o600);
    chmodSync(keyPartial, 0o600);
    const manifest: BackupManifest = {
      schemaVersion: 1,
      createdAt,
      appVersion: APP_VERSION,
      appRevision: APP_REVISION,
      database: {
        file: databaseFile,
        sha256: fileSha256(databasePartial),
      },
      credentialKey: {
        file: keyFile,
        sha256: fileSha256(keyPartial),
      },
      sqliteIntegrity: "ok",
    };
    writeFileSync(manifestPartial, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(databasePartial, databasePath);
    renameSync(keyPartial, keyPath);
    renameSync(manifestPartial, manifestPath);
    return manifestPath;
  } catch (error) {
    removeIfPresent(databasePartial);
    removeIfPresent(keyPartial);
    removeIfPresent(manifestPartial);
    throw error;
  }
};

const readManifest = (manifestPath: string): BackupManifest => {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid backup manifest");
  }
  const value = parsed as {
    schemaVersion?: unknown;
    sqliteIntegrity?: unknown;
    database?: { file?: unknown; sha256?: unknown };
    credentialKey?: { file?: unknown; sha256?: unknown };
  };
  if (
    value.schemaVersion !== 1 ||
    value.sqliteIntegrity !== "ok" ||
    typeof value.database?.file !== "string" ||
    typeof value.credentialKey?.file !== "string" ||
    typeof value.database.sha256 !== "string" ||
    typeof value.credentialKey.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.database.sha256) ||
    !/^[a-f0-9]{64}$/.test(value.credentialKey.sha256)
  ) {
    throw new Error("Invalid backup manifest");
  }
  for (const file of [value.database.file, value.credentialKey.file]) {
    if (file !== basename(file)) throw new Error("Unsafe backup manifest path");
  }
  return parsed as BackupManifest;
};

// @spec spec://modules/coordinator/INFRA-001-coordinator-runtime#rollout
export const restoreBackup = async (
  dataDir: string,
  manifestPath: string,
  confirmedStopped: boolean,
): Promise<{ restoredFrom: string; preRestoreManifest: string | null }> => {
  if (!confirmedStopped) {
    throw new Error("Restore requires --confirm-stopped after coordinator shutdown");
  }
  const absoluteManifest = resolve(manifestPath);
  const manifest = readManifest(absoluteManifest);
  const backupDir = dirname(absoluteManifest);
  const sourceDatabase = join(backupDir, manifest.database.file);
  const sourceKey = join(backupDir, manifest.credentialKey.file);
  if (
    fileSha256(sourceDatabase) !== manifest.database.sha256 ||
    fileSha256(sourceKey) !== manifest.credentialKey.sha256
  ) {
    throw new Error("Backup checksum verification failed");
  }
  verifySqlite(sourceDatabase);
  const keyValue = readFileSync(sourceKey, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(keyValue)) throw new Error("Invalid backup credential key");

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const currentDatabase = join(dataDir, "coordinator.sqlite");
  const currentKey = join(dataDir, "credential.key");
  const hasCurrentDatabase = existsSync(currentDatabase);
  const hasCurrentKey = existsSync(currentKey);
  if (hasCurrentDatabase !== hasCurrentKey) {
    throw new Error("Current coordinator state is incomplete");
  }
  let preRestoreManifest: string | null = null;
  if (hasCurrentDatabase && hasCurrentKey) {
    const currentStore = new CoordinatorStore(
      currentDatabase,
      undefined,
      loadOrCreateCredentialKey(currentKey),
    );
    try {
      preRestoreManifest = await createBackup(currentStore, dataDir);
    } finally {
      currentStore.close();
    }
  }
  removeIfPresent(`${currentDatabase}-wal`);
  removeIfPresent(`${currentDatabase}-shm`);

  const databasePartial = `${currentDatabase}.restore-${process.pid}`;
  const keyPartial = `${currentKey}.restore-${process.pid}`;
  const databaseRollback = `${currentDatabase}.rollback-${process.pid}`;
  const keyRollback = `${currentKey}.rollback-${process.pid}`;
  try {
    if (hasCurrentDatabase && hasCurrentKey) {
      copyFileSync(currentDatabase, databaseRollback);
      copyFileSync(currentKey, keyRollback);
      chmodSync(databaseRollback, 0o600);
      chmodSync(keyRollback, 0o600);
    }
    copyFileSync(sourceDatabase, databasePartial);
    copyFileSync(sourceKey, keyPartial);
    chmodSync(databasePartial, 0o600);
    chmodSync(keyPartial, 0o600);
    renameSync(databasePartial, currentDatabase);
    renameSync(keyPartial, currentKey);

    const restoredStore = new CoordinatorStore(
      currentDatabase,
      undefined,
      loadOrCreateCredentialKey(currentKey),
    );
    try {
      const result = restoredStore.db.prepare("PRAGMA integrity_check").get() as {
        integrity_check: string;
      };
      if (result.integrity_check !== "ok") {
        throw new Error("Restored SQLite integrity check failed");
      }
    } finally {
      restoredStore.close();
    }
    removeIfPresent(databaseRollback);
    removeIfPresent(keyRollback);
  } catch (error) {
    removeIfPresent(databasePartial);
    removeIfPresent(keyPartial);
    removeIfPresent(`${currentDatabase}-wal`);
    removeIfPresent(`${currentDatabase}-shm`);
    if (existsSync(databaseRollback) && existsSync(keyRollback)) {
      renameSync(databaseRollback, currentDatabase);
      renameSync(keyRollback, currentKey);
    }
    throw error;
  }
  return { restoredFrom: absoluteManifest, preRestoreManifest };
};
