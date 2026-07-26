import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const repositoryPath = process.argv[2];
if (!repositoryPath) {
  throw new Error("Usage: install-macos-launch-agent.mjs <repository>");
}
const label = "ru.agent-operator.worker";
const agentsDirectory = join(homedir(), "Library", "LaunchAgents");
const plistPath = join(agentsDirectory, `${label}.plist`);
const uid = process.getuid?.();
if (uid === undefined) throw new Error("Unable to determine macOS user id");

await mkdir(agentsDirectory, { recursive: true });
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>${repositoryPath}/work/run-macos-worker.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${repositoryPath}/data/mac-worker.log</string>
  <key>StandardErrorPath</key><string>${repositoryPath}/data/mac-worker.error.log</string>
</dict>
</plist>
`;
await writeFile(plistPath, plist);
spawnSync("launchctl", ["bootout", `gui/${uid}`, plistPath], {
  stdio: "ignore",
});
const loaded = spawnSync(
  "launchctl",
  ["bootstrap", `gui/${uid}`, plistPath],
  { encoding: "utf8" },
);
if (loaded.status !== 0) {
  throw new Error(loaded.stderr || `launchctl exited ${loaded.status}`);
}
console.log(plistPath);
