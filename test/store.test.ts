import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CoordinatorStore } from "../src/coordinator/store.js";

const stores: CoordinatorStore[] = [];
const createStore = (): CoordinatorStore => {
  const store = new CoordinatorStore(":memory:");
  stores.push(store);
  return store;
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("CoordinatorStore", () => {
  it("publishes agent presence and path-free projects", () => {
    const store = createStore();
    store.heartbeat("mac", {
      name: "Mac Codex",
      platform: "macos",
      state: "idle",
      currentProjectId: null,
      currentActivity: null,
      projects: [
        { id: "agent-operator", name: "Agent Operator", tags: ["code"], available: true },
      ],
      workerVersion: "0.1.0",
    });

    assert.equal(store.listAgents()[0]?.id, "mac");
    assert.deepEqual(store.listProjects("mac"), [
      {
        id: "agent-operator",
        name: "Agent Operator",
        tags: ["code"],
        available: true,
      },
    ]);
    assert.equal(JSON.stringify(store.listProjects("mac")).includes("/Users"), false);
  });

  it("keeps a durable cursor and reply chain", () => {
    const store = createStore();
    const start = store.createMessage({
      kind: "start",
      fromAgentId: "windows",
      toAgentId: "mac",
      projectId: "agent-operator",
      text: "Inspect the project",
    });
    const result = store.createMessage({
      kind: "result",
      fromAgentId: "mac",
      toAgentId: "windows",
      rootMessageId: start.rootMessageId,
      replyTo: start.id,
      text: "Done",
      status: "completed",
    });

    assert.equal(store.listMessages("mac", 0)[0]?.id, start.id);
    assert.equal(store.listMessages("windows", 0)[0]?.id, result.id);
    assert.equal(result.rootMessageId, start.id);
    assert.ok(result.cursor > start.cursor);
  });
});
