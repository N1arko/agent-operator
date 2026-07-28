import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import * as z from "zod/v4";

const ThreadIdSchema = z.uuid();
const WINDOWS_CODEX_IPC = String.raw`\\.\pipe\codex-ipc`;

export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

export const desktopIpcEndpoint = (
  platform: DesktopPlatform,
  codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
): string => {
  if (platform === "macos") return join(codexHome, "ipc", "ipc.sock");
  if (platform === "windows") return WINDOWS_CODEX_IPC;
  throw new Error(`ChatGPT Desktop IPC is unsupported on ${platform}`);
};

export const desktopThreadUrl = (threadId: string): string =>
  `codex://threads/${ThreadIdSchema.parse(threadId)}`;

export const desktopLaunchCommand = (
  platform: DesktopPlatform,
  threadId: string,
): { command: string; args: string[] } => {
  const url = desktopThreadUrl(threadId);
  if (platform === "macos") return { command: "open", args: [url] };
  if (platform === "windows") {
    return { command: "explorer.exe", args: [url] };
  }
  throw new Error(`ChatGPT Desktop launch is unsupported on ${platform}`);
};

export const openDesktopThread = async (
  platform: DesktopPlatform,
  threadId: string,
): Promise<void> => {
  const launch = desktopLaunchCommand(platform, threadId);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
};
