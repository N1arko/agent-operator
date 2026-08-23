import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createCoordinatorApp } from "../src/coordinator/server.js";
import { APP_VERSION } from "../src/shared/version.js";

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
  // @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.enroll
  it("gives one credential to concurrent enrollment consumers and enforces revoke", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const enrollment = store.createEnrollment({
      agentId: "studio-mac",
      agentName: "Studio Mac",
    });
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      maxWaitMs: 10,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const consume = () =>
      fetch(`${base}/v1/enrollment/consume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: enrollment.code,
          platform: "macos",
          workerVersion: APP_VERSION,
        }),
      });

    const responses = await Promise.all([consume(), consume()]);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [201, 403],
    );
    const successful = responses.find((response) => response.status === 201);
    assert.ok(successful);
    const credential = (await successful.json()) as {
      agentId: string;
      deviceToken: string;
    };
    assert.equal(credential.agentId, "studio-mac");

    const heartbeat = () =>
      fetch(`${base}/v1/worker/heartbeat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.deviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Studio Mac",
          platform: "macos",
          state: "idle",
          currentProjectId: null,
          currentActivity: null,
          projects: [],
          workerVersion: APP_VERSION,
        }),
      });
    assert.equal((await heartbeat()).status, 200);
    assert.equal(store.getAgent("studio-mac")?.name, "Studio Mac");
    const mcpInitialize = () =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.deviceToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "enrollment-test", version: "1.0.0" },
          },
        }),
      });
    assert.equal((await mcpInitialize()).status, 200);
    assert.equal(store.revokeDevice("studio-mac"), 1);
    const revoked = await heartbeat();
    assert.equal(revoked.status, 401);
    assert.deepEqual(await revoked.json(), { error: "device_revoked" });
    const revokedMcp = await mcpInitialize();
    assert.equal(revokedMcp.status, 401);
    assert.deepEqual(await revokedMcp.json(), { error: "device_revoked" });
  });

  it("keeps invalid enrollment responses generic and rate-limited", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const enrollment = store.createEnrollment({
      agentId: "windows-laptop",
      agentName: "Windows Laptop",
    });
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      enrollmentRateLimit: {
        windowMs: 60_000,
        perIpFailures: 2,
        globalFailures: 10,
      },
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const consume = (code: string, workerVersion = APP_VERSION) =>
      fetch(`${base}/v1/enrollment/consume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, platform: "windows", workerVersion }),
      });

    const unknown = await consume("aop_enroll_unknown-code-value");
    assert.equal(unknown.status, 403);
    assert.deepEqual(await unknown.json(), { error: "enrollment_denied" });
    const incompatible = await consume(enrollment.code, "0.0.1");
    assert.equal(incompatible.status, 409);
    assert.equal((await consume(enrollment.code)).status, 429);
    assert.equal(store.listDevices().length, 0);
  });

  it("does not reveal unknown, expired or consumed enrollment state", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const expired = store.createEnrollment({
      agentId: "expired-mac",
      agentName: "Expired Mac",
      now: "2000-01-01T00:00:00.000Z",
    });
    const current = store.createEnrollment({
      agentId: "current-mac",
      agentName: "Current Mac",
    });
    const app = createCoordinatorApp(store, { host: "127.0.0.1" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const consume = (code: string, workerVersion = APP_VERSION) =>
      fetch(`${base}/v1/enrollment/consume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, platform: "macos", workerVersion }),
      });

    assert.equal((await consume(current.code, "0.0.1")).status, 409);
    assert.equal((await consume(current.code)).status, 201);
    const denied = await Promise.all([
      consume("aop_enroll_unknown-code-value"),
      consume(expired.code),
      consume(current.code),
    ]);
    assert.deepEqual(
      denied.map((response) => response.status),
      [403, 403, 403],
    );
    assert.deepEqual(
      await Promise.all(denied.map((response) => response.json())),
      [
        { error: "enrollment_denied" },
        { error: "enrollment_denied" },
        { error: "enrollment_denied" },
      ],
    );
  });

  it("enforces the enrollment body limit before code validation", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const app = createCoordinatorApp(store, { host: "127.0.0.1" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/enrollment/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "x".repeat(5_000) }),
      },
    );
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "enrollment_denied" });
  });

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

  it("stores progress idempotently without completing the request", async () => {
    const store = new CoordinatorStore(":memory:");
    stores.push(store);
    const request = store.createMessage({
      kind: "start",
      fromAgentId: "mac",
      toAgentId: "windows",
      projectId: "project",
      text: "Long task",
    });
    const app = createCoordinatorApp(store, {
      host: "127.0.0.1",
      tokens: new Map([["windows-token", "windows"]]),
      maxWaitMs: 10,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const body = {
      rootMessageId: request.id,
      replyTo: request.id,
      toAgentId: "mac",
      threadId: "019f9ff2-42a3-7c43-92e9-ab1b9794e043",
      turnId: "turn-1",
      itemId: "commentary-1",
      revision: 1,
      phase: "commentary",
      text: "Checking files",
      plan: null,
      idempotencyKey: `${request.id}:turn-1:commentary-1:1`,
    };
    const publish = () =>
      fetch(`${base}/v1/worker/updates`, {
        method: "POST",
        headers: {
          authorization: "Bearer windows-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

    assert.equal((await publish()).status, 201);
    assert.equal((await publish()).status, 200);
    const updates = store
      .listMessages("mac")
      .filter((message) => message.kind === "update");
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.isFinal, false);
    assert.equal(updates[0].progress?.phase, "commentary");
    assert.equal(store.getMessage(request.id).status, "queued");
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
