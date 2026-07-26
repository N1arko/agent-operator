import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { CoordinatorStore } from "../src/coordinator/store.js";
import { createCoordinatorApp } from "../src/coordinator/server.js";

const stores: CoordinatorStore[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  for (const store of stores.splice(0)) store.close();
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
});
