import { join } from "node:path";
import { parseTokenMap } from "../shared/env.js";
import { loadOrCreateCredentialKey } from "./credential-key.js";
import { CoordinatorStore } from "./store.js";

type Environment = Record<string, string | undefined>;
type Output = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

const flag = (args: string[], name: string): string | null => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
};

const publicUrl = (env: Environment): string =>
  env.AOP_PUBLIC_URL ??
  `http://${env.AOP_HOST ?? "127.0.0.1"}:${env.AOP_PORT ?? "8787"}`;

const usage = `Usage:
  aopctl device create --id AGENT_ID --name "Device name"
  aopctl device list [--json]
  aopctl device revoke AGENT_ID
  aopctl enrollment revoke CODE_ID`;

// @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.cli
export const runAopctl = (
  args: string[],
  env: Environment = process.env,
  output: Output = {
    stdout: (value) => console.log(value),
    stderr: (value) => console.error(value),
  },
): number => {
  const dataDir = env.AOP_DATA_DIR ?? "./data";
  const store = new CoordinatorStore(
    join(dataDir, "coordinator.sqlite"),
    undefined,
    loadOrCreateCredentialKey(join(dataDir, "credential.key")),
  );
  try {
    const [resource, action, ...rest] = args;
    if (resource === "device" && action === "create") {
      const agentId = flag(rest, "--id");
      const agentName = flag(rest, "--name");
      if (!agentId || !agentName) throw new Error(usage);
      const grant = store.createEnrollment({ agentId, agentName });
      output.stdout(
        [
          `Enrollment ID: ${grant.enrollmentId}`,
          `Device: ${grant.agentId} (${grant.agentName})`,
          `Coordinator: ${publicUrl(env)}`,
          `Code: ${grant.code}`,
          `Expires: ${grant.expiresAt}`,
        ].join("\n"),
      );
      return 0;
    }

    if (resource === "device" && action === "list") {
      const enrolled = store.listDevices();
      const legacyTokens = env.AOP_DEVICE_TOKENS
        ? parseTokenMap(env.AOP_DEVICE_TOKENS)
        : new Map<string, string>();
      const legacyAgentIds = [...new Set(legacyTokens.values())].sort();
      const legacy = legacyAgentIds.map((agentId) => {
        const agent = store.getAgentRuntime(agentId);
        return {
          agentId,
          agentName: agent?.name ?? agentId,
          source: "legacy" as const,
          status: "active" as const,
          tokenHint: null,
          platform: agent?.platform ?? "unknown",
          workerVersion: agent?.workerVersion ?? null,
          lastSeenAt: agent?.lastSeenAt ?? null,
          lastUsedAt: null,
          enrolledAt: null,
          revokedAt: null,
        };
      });
      const devices = [...enrolled, ...legacy];
      if (rest.includes("--json")) {
        output.stdout(JSON.stringify(devices, null, 2));
      } else if (devices.length === 0) {
        output.stdout("No devices registered.");
      } else {
        output.stdout(
          [
            "AGENT ID\tNAME\tSOURCE\tSTATUS\tTOKEN HINT\tLAST SEEN",
            ...devices.map((device) =>
              [
                device.agentId,
                device.agentName,
                device.source,
                device.status,
                device.tokenHint ?? "—",
                device.lastSeenAt ?? "—",
              ].join("\t"),
            ),
          ].join("\n"),
        );
      }
      return 0;
    }

    if (resource === "device" && action === "revoke") {
      const agentId = rest[0];
      if (!agentId || agentId.startsWith("--")) throw new Error(usage);
      const revoked = store.revokeDevice(agentId);
      if (revoked === 0) {
        throw new Error(`No active enrolled credential for ${agentId}`);
      }
      output.stdout(`Revoked ${revoked} credential(s) for ${agentId}.`);
      return 0;
    }

    if (resource === "enrollment" && action === "revoke") {
      const enrollmentId = rest[0];
      if (!enrollmentId || enrollmentId.startsWith("--")) {
        throw new Error(usage);
      }
      if (!store.revokeEnrollment(enrollmentId)) {
        throw new Error(`No active enrollment found: ${enrollmentId}`);
      }
      output.stdout(`Revoked enrollment ${enrollmentId}.`);
      return 0;
    }

    throw new Error(usage);
  } catch (error) {
    output.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    store.close();
  }
};

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  process.exitCode = runAopctl(process.argv.slice(2));
}
