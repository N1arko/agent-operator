import { chmod, readFile, writeFile } from "node:fs/promises";

const [tokenPath, repositoryPath, nodePath, codexPath] = process.argv.slice(2);
if (!tokenPath || !repositoryPath || !nodePath || !codexPath) {
  throw new Error(
    "Usage: configure-macos.mjs <token-file> <repository> <node> <codex>",
  );
}
const token = (await readFile(tokenPath, "utf8")).trim();
if (token.length < 16) throw new Error("Invalid device token");
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const env = [
  `AOP_COORDINATOR_URL=${shellQuote("https://agent-operator.188-241-197-83.sslip.io")}`,
  `AOP_AGENT_ID=${shellQuote("mac")}`,
  `AOP_AGENT_NAME=${shellQuote("Mac Codex")}`,
  `AOP_DEVICE_TOKEN=${shellQuote(token)}`,
  `AOP_PROJECTS_FILE=${shellQuote(`${repositoryPath}/projects.mac.json`)}`,
  `AOP_STATE_FILE=${shellQuote(`${repositoryPath}/data/mac-worker-state.json`)}`,
  `AOP_CODEX_BIN=${shellQuote(codexPath)}`,
  "",
].join("\n");
await writeFile(`${repositoryPath}/.env.mac`, env, { mode: 0o600 });
await chmod(`${repositoryPath}/.env.mac`, 0o600);

const projects = {
  projects: [
    {
      id: "agent-operator",
      name: "Agent Operator",
      path: repositoryPath,
      tags: ["code"],
    },
  ],
};
await writeFile(
  `${repositoryPath}/projects.mac.json`,
  `${JSON.stringify(projects, null, 2)}\n`,
);

const runner = `#!/bin/zsh
set -a
source "${repositoryPath}/.env.mac"
set +a
exec "${nodePath}" "${repositoryPath}/dist/src/worker/main.js"
`;
await writeFile(`${repositoryPath}/work/run-macos-worker.sh`, runner, {
  mode: 0o700,
});
await chmod(`${repositoryPath}/work/run-macos-worker.sh`, 0o700);
