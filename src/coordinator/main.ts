import { join } from "node:path";
import { createCoordinatorApp } from "./server.js";
import { CoordinatorStore } from "./store.js";
import { parseTokenMap } from "../shared/env.js";
import { loadOrCreateCredentialKey } from "./credential-key.js";

const host = process.env.AOP_HOST ?? "127.0.0.1";
const port = Number(process.env.AOP_PORT ?? 8787);
const dataDir = process.env.AOP_DATA_DIR ?? "./data";
const tokens = process.env.AOP_DEVICE_TOKENS
  ? parseTokenMap(process.env.AOP_DEVICE_TOKENS)
  : new Map<string, string>();
const allowedHosts = process.env.AOP_ALLOWED_HOSTS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const requestLeaseMs = Number(
  process.env.AOP_REQUEST_LEASE_MS ?? 2 * 60 * 60 * 1_000,
);
if (!Number.isSafeInteger(requestLeaseMs) || requestLeaseMs < 60_000) {
  throw new Error("AOP_REQUEST_LEASE_MS must be an integer of at least 60000");
}

const store = new CoordinatorStore(
  join(dataDir, "coordinator.sqlite"),
  requestLeaseMs,
  loadOrCreateCredentialKey(join(dataDir, "credential.key")),
);
const app = createCoordinatorApp(store, {
  host,
  tokens,
  temporaryFileDirectory: join(dataDir, "files"),
  ...(allowedHosts?.length ? { allowedHosts } : {}),
  ...(process.env.AOP_WORKER_BUNDLE
    ? { workerBundlePath: process.env.AOP_WORKER_BUNDLE }
    : {}),
});
const server = app.listen(port, host, () => {
  console.log(`Agent Operator coordinator listening on ${host}:${port}`);
});

const shutdown = (): void => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
