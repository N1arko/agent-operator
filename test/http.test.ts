import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createCoordinatorApp } from "../src/coordinator/server.js";

const stores: CoordinatorStore[] = [];
const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  for (const store of stores.splice(0)) store.close();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Coordinator HTTP", () => {
  it("authenticates a worker heartbeat and exposes health", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens: new Map([["a-secure-test-token", "mac"]]),
      maxWaitMs: 10,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal(
      (
        await fetch(`${base}/v1/worker/heartbeat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    const heartbeat = await fetch(`${base}/v1/worker/heartbeat`, {
      method: "POST",
      headers: {
        authorization: "Bearer a-secure-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Mac",
        platform: "macos",
        state: "idle",
        currentProjectId: null,
        currentActivity: null,
        projects: [],
        workerVersion: "0.1.0",
      }),
    });
    assert.equal(heartbeat.status, 200);
    assert.equal(store.getAgent("mac")?.name, "Mac");
  });

  it("uploads, authorizes, downloads and acknowledges a temporary file", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("windows", {
      name: "Windows",
      platform: "windows",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [],
      workerVersion: "0.1.0",
    });
    const directory = await mkdtemp(join(tmpdir(), "aop-files-"));
    directories.push(directory);
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens: new Map([
        ["mac-token", "mac"],
        ["windows-token", "windows"],
        ["other-token", "other"],
      ]),
      temporaryFileDirectory: directory,
      temporaryFileMaxBytes: 32,
      temporaryFileQuotaBytes: 32,
      maxWaitMs: 10,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const content = new TextEncoder().encode("quarterly plan");

    const upload = await fetch(`${base}/v1/files`, {
      method: "POST",
      headers: {
        authorization: "Bearer mac-token",
        "content-type": "application/octet-stream",
        "x-agent-operator-recipient": "windows",
        "x-agent-operator-name": encodeURIComponent("plan Q3.xlsx"),
        "x-agent-operator-idempotency-key": "upload-plan-q3",
      },
      body: content,
    });
    assert.equal(upload.status, 201);
    const attachment = (await upload.json()) as {
      type: string;
      fileId: string;
      name: string;
      size: number;
      sha256: string;
      expiresAt: string;
    };
    assert.equal(attachment.type, "temporary_file");
    assert.equal(attachment.name, "plan Q3.xlsx");
    assert.equal(attachment.size, content.byteLength);
    assert.equal((await readdir(directory)).length, 1);
    const replay = await fetch(`${base}/v1/files`, {
      method: "POST",
      headers: {
        authorization: "Bearer mac-token",
        "content-type": "application/octet-stream",
        "x-agent-operator-recipient": "windows",
        "x-agent-operator-name": encodeURIComponent("plan Q3.xlsx"),
        "x-agent-operator-idempotency-key": "upload-plan-q3",
      },
      body: content,
    });
    assert.equal(replay.status, 201);
    assert.equal(
      ((await replay.json()) as { fileId: string }).fileId,
      attachment.fileId,
    );
    assert.equal((await readdir(directory)).length, 1);

    const forbidden = await fetch(
      `${base}/v1/files/${attachment.fileId}`,
      { headers: { authorization: "Bearer other-token" } },
    );
    assert.equal(forbidden.status, 403);

    const download = await fetch(
      `${base}/v1/files/${attachment.fileId}`,
      { headers: { authorization: "Bearer windows-token" } },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("x-agent-operator-sha256"), attachment.sha256);
    assert.deepEqual(
      new Uint8Array(await download.arrayBuffer()),
      content,
    );

    const acknowledged = await fetch(
      `${base}/v1/files/${attachment.fileId}/ack`,
      {
        method: "POST",
        headers: { authorization: "Bearer windows-token" },
      },
    );
    assert.equal(acknowledged.status, 200);
    assert.equal(store.getTemporaryFile(attachment.fileId), null);
    assert.deepEqual(await readdir(directory), []);
  });

  it("enforces temporary file size and owner quota", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("windows", {
      name: "Windows",
      platform: "windows",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [],
      workerVersion: "0.1.0",
    });
    const directory = await mkdtemp(join(tmpdir(), "aop-limits-"));
    directories.push(directory);
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens: new Map([["mac-token", "mac"]]),
      temporaryFileDirectory: directory,
      temporaryFileMaxBytes: 4,
      temporaryFileQuotaBytes: 5,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const upload = (name: string, content: string) =>
      fetch(`${base}/v1/files`, {
        method: "POST",
        headers: {
          authorization: "Bearer mac-token",
          "content-type": "application/octet-stream",
          "x-agent-operator-recipient": "windows",
          "x-agent-operator-name": name,
          "x-agent-operator-idempotency-key": `upload-${name}`,
        },
        body: content,
      });

    assert.equal((await upload("one.txt", "1234")).status, 201);
    assert.equal((await upload("two.txt", "12")).status, 413);
    assert.equal((await upload("large.txt", "12345")).status, 413);
  });

  it("removes expired temporary files during authenticated traffic", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    store.heartbeat("windows", {
      name: "Windows",
      platform: "windows",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [],
      workerVersion: "0.1.0",
    });
    const directory = await mkdtemp(join(tmpdir(), "aop-ttl-"));
    directories.push(directory);
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens: new Map([
        ["mac-token", "mac"],
        ["windows-token", "windows"],
      ]),
      temporaryFileDirectory: directory,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    const upload = await fetch(`${base}/v1/files`, {
      method: "POST",
      headers: {
        authorization: "Bearer mac-token",
        "content-type": "application/octet-stream",
        "x-agent-operator-recipient": "windows",
        "x-agent-operator-name": "expired.txt",
        "x-agent-operator-idempotency-key": "expired-file",
      },
      body: "old",
    });
    const attachment = (await upload.json()) as { fileId: string };
    store.db
      .prepare("UPDATE temporary_files SET expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", attachment.fileId);

    const download = await fetch(
      `${base}/v1/files/${attachment.fileId}`,
      { headers: { authorization: "Bearer windows-token" } },
    );
    assert.equal(download.status, 404);
    assert.equal(store.getTemporaryFile(attachment.fileId), null);
    assert.deepEqual(await readdir(directory), []);
  });
});
