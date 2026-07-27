import { spawn } from "node:child_process";
import * as z from "zod/v4";

const ThreadIdSchema = z.uuid();

export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

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
