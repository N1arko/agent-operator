import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Express, NextFunction, Request, Response } from "express";
import { createReadStream, existsSync } from "node:fs";
import { HeartbeatSchema, PublishResultSchema } from "../shared/protocol.js";
import { createMcpServer } from "./mcp.js";
import type { CoordinatorStore } from "./store.js";

export type CoordinatorServerOptions = {
  host: string;
  allowedHosts?: string[];
  tokens: Map<string, string>;
  maxWaitMs?: number;
  workerBundlePath?: string;
};

const bearerToken = (request: Request): string | null => {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length);
};

export const createCoordinatorApp = (
  store: CoordinatorStore,
  options: CoordinatorServerOptions,
): Express => {
  const app = createMcpExpressApp({
    host: options.host,
    ...(options.allowedHosts ? { allowedHosts: options.allowedHosts } : {}),
  });

  const authenticate = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const token = bearerToken(request);
    const agentId = token ? options.tokens.get(token) : undefined;
    if (!agentId) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    response.locals.agentId = agentId;
    next();
  };

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", version: "0.1.0" });
  });

  app.get("/v1/onboarding/worker.zip", authenticate, (_request, response) => {
    const path = options.workerBundlePath;
    if (!path || !existsSync(path)) {
      response.status(404).json({ error: "worker bundle is unavailable" });
      return;
    }
    response.type("application/zip");
    response.setHeader(
      "content-disposition",
      'attachment; filename="agent-operator-worker-0.1.1.zip"',
    );
    createReadStream(path).pipe(response);
  });

  app.post("/v1/worker/heartbeat", authenticate, (request, response) => {
    const heartbeat = HeartbeatSchema.parse(request.body);
    store.heartbeat(String(response.locals.agentId), heartbeat);
    response.json({ ok: true, serverTime: new Date().toISOString() });
  });

  app.get("/v1/worker/messages", authenticate, async (request, response) => {
    const agentId = String(response.locals.agentId);
    const after = Number(request.query.after ?? 0);
    const requestedWait = Number(request.query.waitMs ?? 0);
    const waitMs = Math.max(
      0,
      Math.min(requestedWait, options.maxWaitMs ?? 25_000),
    );
    const deadline = Date.now() + waitMs;
    let messages = store.listMessages(agentId, after);
    while (messages.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      messages = store.listMessages(agentId, after);
    }
    response.json({
      messages,
      nextCursor:
        messages.length > 0
          ? Math.max(...messages.map((message) => message.cursor))
          : after,
    });
  });

  app.post(
    "/v1/worker/messages/:messageId/ack",
    authenticate,
    (request, response) => {
      store.acknowledge(String(request.params.messageId));
      response.json({ ok: true });
    },
  );

  app.post("/v1/worker/results", authenticate, (request, response) => {
    const input = PublishResultSchema.parse(request.body);
    const result = store.createMessage({
      kind: "result",
      fromAgentId: String(response.locals.agentId),
      toAgentId: input.toAgentId,
      rootMessageId: input.rootMessageId,
      replyTo: input.replyTo,
      text: input.text,
      attachments: input.attachments,
      status: input.failed ? "failed" : "completed",
    });
    response.status(201).json(result);
  });

  app.post("/mcp", authenticate, async (request, response) => {
    const server = createMcpServer(store, String(response.locals.agentId));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error",
          },
          id: null,
        });
      }
    }
  });

  app.all("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  });

  return app;
};
