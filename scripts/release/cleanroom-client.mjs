#!/usr/bin/env node

// @spec spec://modules/distribution/INFRA-004-open-source-release#environments.clean-room
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = process.env.AOP_COORDINATOR_URL?.replace(/\/$/, "");
const token = process.env.AOP_DEVICE_TOKEN;
if (!baseUrl || !token) throw new Error("AOP_COORDINATOR_URL and AOP_DEVICE_TOKEN are required");
const [command, ...values] = process.argv.slice(2);

if (command === "tool") {
  const [name, rawArguments = "{}"] = values;
  if (!name) throw new Error("Usage: cleanroom-client.mjs tool NAME [JSON]");
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "agent-operator-clean-room", version: "1" });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: JSON.parse(rawArguments) });
    console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2));
  } finally {
    await client.close();
  }
} else if (command === "upload") {
  const [recipientAgentId, path, idempotencyKey = randomUUID()] = values;
  if (!recipientAgentId || !path) throw new Error("Usage: cleanroom-client.mjs upload RECIPIENT FILE [IDEMPOTENCY_KEY]");
  const content = await readFile(path);
  const response = await fetch(`${baseUrl}/v1/files`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/octet-stream",
      "x-agent-operator-recipient": recipientAgentId,
      "x-agent-operator-name": encodeURIComponent(basename(path)),
      "x-agent-operator-idempotency-key": idempotencyKey,
    },
    body: content,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  const attachment = await response.json();
  if (attachment.sha256 !== createHash("sha256").update(content).digest("hex")) throw new Error("Upload checksum mismatch");
  console.log(JSON.stringify(attachment, null, 2));
} else {
  throw new Error("Usage: cleanroom-client.mjs tool NAME [JSON] | upload RECIPIENT FILE [IDEMPOTENCY_KEY]");
}
