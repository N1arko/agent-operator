import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopIpcEndpoint,
  desktopLaunchCommand,
  desktopThreadUrl,
} from "../src/worker/desktop.js";

const threadId = "019f9ff2-42a3-7c43-92e9-ab1b9794e043";

test("builds a canonical ChatGPT Desktop thread deep link", () => {
  assert.equal(
    desktopThreadUrl(threadId),
    `codex://threads/${threadId}`,
  );
});

test("uses native URL dispatchers on macOS and Windows", () => {
  assert.deepEqual(desktopLaunchCommand("macos", threadId), {
    command: "open",
    args: [`codex://threads/${threadId}`],
  });
  assert.deepEqual(desktopLaunchCommand("windows", threadId), {
    command: "explorer.exe",
    args: [`codex://threads/${threadId}`],
  });
});

test("resolves native Desktop IPC endpoints on macOS and Windows", () => {
  assert.equal(
    desktopIpcEndpoint("macos", "/tmp/codex-home"),
    "/tmp/codex-home/ipc/ipc.sock",
  );
  assert.equal(
    desktopIpcEndpoint("windows", "C:\\unused"),
    String.raw`\\.\pipe\codex-ipc`,
  );
});

test("rejects invalid thread IDs and unsupported platforms", () => {
  assert.throws(() => desktopThreadUrl("not-a-thread"));
  assert.throws(() => desktopLaunchCommand("linux", threadId));
  assert.throws(() => desktopIpcEndpoint("linux"));
});
