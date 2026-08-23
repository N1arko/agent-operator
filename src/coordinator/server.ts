import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { createReadStream, existsSync } from "node:fs";
import {
  EnrollmentConsumeSchema,
  HeartbeatSchema,
  PublishResultSchema,
  PublishUpdateSchema,
} from "../shared/protocol.js";
import { APP_REVISION, APP_VERSION } from "../shared/version.js";
import { createMcpServer } from "./mcp.js";
import { EnrollmentDeniedError, type CoordinatorStore } from "./store.js";
import {
  acknowledgeTemporaryFile,
  cleanupExpiredTemporaryFiles,
  createTemporaryFile,
  DEFAULT_TEMPORARY_FILE_MAX_BYTES,
  getTemporaryFileForDownload,
  TemporaryFileError,
} from "./temporary-files.js";

export type CoordinatorServerOptions = {
  host: string;
  allowedHosts?: string[];
  tokens?: Map<string, string>;
  maxWaitMs?: number;
  workerBundlePath?: string;
  temporaryFileDirectory?: string;
  temporaryFileMaxBytes?: number;
  temporaryFileQuotaBytes?: number;
  temporaryFileTtlMs?: number;
  enrollmentRateLimit?: {
    windowMs: number;
    perIpFailures: number;
    globalFailures: number;
  };
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
  const app = express();
  const allowedHosts =
    options.allowedHosts ??
    (["127.0.0.1", "localhost", "[::1]"].includes(options.host)
      ? ["127.0.0.1", "localhost", "[::1]"]
      : null);
  if (allowedHosts) {
    app.use((request, response, next) => {
      const host = request.headers.host;
      try {
        const hostname = host ? new URL(`http://${host}`).hostname : null;
        if (!hostname || !allowedHosts.includes(hostname)) {
          response.status(403).json({ error: "invalid_host" });
          return;
        }
      } catch {
        response.status(403).json({ error: "invalid_host" });
        return;
      }
      next();
    });
  }
  const enrollmentFailures: Array<{ ip: string; at: number }> = [];
  const enrollmentLimit = options.enrollmentRateLimit ?? {
    windowMs: 60_000,
    perIpFailures: 8,
    globalFailures: 100,
  };
  const trimEnrollmentFailures = (now: number): void => {
    const threshold = now - enrollmentLimit.windowMs;
    while (
      enrollmentFailures[0]?.at !== undefined &&
      enrollmentFailures[0].at <= threshold
    ) {
      enrollmentFailures.shift();
    }
  };
  const enrollmentIsLimited = (ip: string, now: number): boolean => {
    trimEnrollmentFailures(now);
    return (
      enrollmentFailures.length >= enrollmentLimit.globalFailures ||
      enrollmentFailures.filter((failure) => failure.ip === ip).length >=
        enrollmentLimit.perIpFailures
    );
  };
  const recordEnrollmentFailure = (ip: string): void => {
    const now = Date.now();
    trimEnrollmentFailures(now);
    enrollmentFailures.push({ ip, at: now });
  };

  // @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.enroll
  app.post(
    "/v1/enrollment/consume",
    express.json({ limit: "4kb", strict: true }),
    (request, response) => {
      const ip = request.ip || request.socket.remoteAddress || "unknown";
      if (enrollmentIsLimited(ip, Date.now())) {
        response.status(429).json({ error: "enrollment_denied" });
        return;
      }
      const parsed = EnrollmentConsumeSchema.safeParse(request.body);
      if (!parsed.success) {
        recordEnrollmentFailure(ip);
        response.status(400).json({ error: "enrollment_denied" });
        return;
      }
      if (parsed.data.workerVersion !== APP_VERSION) {
        recordEnrollmentFailure(ip);
        response.status(409).json({
          error: "incompatible_worker",
          coordinatorVersion: APP_VERSION,
        });
        return;
      }
      try {
        const grant = store.consumeEnrollment(parsed.data);
        response.status(201).json({
          agentId: grant.agentId,
          agentName: grant.agentName,
          deviceToken: grant.deviceToken,
          compatibility: {
            coordinatorVersion: APP_VERSION,
            workerVersion: APP_VERSION,
          },
        });
      } catch (error) {
        if (error instanceof EnrollmentDeniedError) {
          recordEnrollmentFailure(ip);
          response.status(403).json({ error: "enrollment_denied" });
          return;
        }
        console.error("[coordinator] enrollment storage failure");
        response.status(503).json({ error: "enrollment_unavailable" });
      }
    },
  );
  app.use(express.json());
  const temporaryFileDirectory =
    options.temporaryFileDirectory ?? "./data/files";
  const temporaryFileMaxBytes =
    options.temporaryFileMaxBytes ?? DEFAULT_TEMPORARY_FILE_MAX_BYTES;
  let lastTemporaryFileCleanupAt = 0;

  const maybeCleanupTemporaryFiles = (): void => {
    const now = Date.now();
    if (now - lastTemporaryFileCleanupAt < 60_000) return;
    lastTemporaryFileCleanupAt = now;
    void cleanupExpiredTemporaryFiles(store).catch((error: unknown) => {
      console.error("[coordinator] temporary file cleanup failed", error);
    });
  };

  const authenticate = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const token = bearerToken(request);
    const persistent = token
      ? store.authenticateDevice(token)
      : { status: "not_found" as const };
    if (persistent.status === "revoked") {
      response.status(401).json({ error: "device_revoked" });
      return;
    }
    const agentId =
      persistent.status === "active"
        ? persistent.agentId
        : token
          ? options.tokens?.get(token)
          : undefined;
    if (!agentId) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    response.locals.agentId = agentId;
    next();
  };

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      version: APP_VERSION,
      revision: APP_REVISION,
    });
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
      `attachment; filename="agent-operator-worker-${APP_VERSION}.zip"`,
    );
    createReadStream(path).pipe(response);
  });

  app.post("/v1/worker/heartbeat", authenticate, (request, response) => {
    const heartbeat = HeartbeatSchema.parse(request.body);
    store.heartbeat(String(response.locals.agentId), heartbeat);
    store.expireRequests();
    maybeCleanupTemporaryFiles();
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
    let messages = store.claimQueuedMessages(agentId, after);
    while (messages.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      messages = store.claimQueuedMessages(agentId, after);
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
    const agentId = String(response.locals.agentId);
    const existing = store.findResult(agentId, input.replyTo);
    if (existing) {
      response.status(200).json(existing);
      return;
    }
    const resultStatus = input.cancelled
      ? "cancelled"
      : input.failed
        ? "failed"
        : "completed";
    const result = store.createMessage({
      kind: "result",
      fromAgentId: agentId,
      toAgentId: input.toAgentId,
      rootMessageId: input.rootMessageId,
      replyTo: input.replyTo,
      targetThreadId: input.threadId,
      text: input.text,
      attachments: input.attachments,
      status: resultStatus,
      isFinal: true,
    });
    store.completeMessage(input.replyTo, resultStatus);
    response.status(201).json(result);
  });

  // @spec spec://modules/coordinator/FEAT-006-progress-updates#contracts
  app.post("/v1/worker/updates", authenticate, (request, response) => {
    const input = PublishUpdateSchema.parse(request.body);
    const agentId = String(response.locals.agentId);
    const original = store.getMessage(input.replyTo);
    if (
      original.toAgentId !== agentId ||
      original.fromAgentId !== input.toAgentId ||
      original.rootMessageId !== input.rootMessageId
    ) {
      response.status(403).json({ error: "invalid progress route" });
      return;
    }
    const existing = store.findMessageByIdempotency(
      agentId,
      input.idempotencyKey,
    );
    if (!existing && store.countProgressUpdates(input.replyTo) >= 200) {
      response.status(429).json({ error: "progress update quota reached" });
      return;
    }
    const update = store.createMessage({
      kind: "update",
      fromAgentId: agentId,
      toAgentId: input.toAgentId,
      rootMessageId: input.rootMessageId,
      replyTo: input.replyTo,
      targetThreadId: input.threadId,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
      progress: {
        turnId: input.turnId,
        itemId: input.itemId,
        revision: input.revision,
        phase: input.phase,
        plan: input.plan,
      },
      isFinal: false,
      status: "completed",
    });
    response.status(existing ? 200 : 201).json(update);
  });

  app.post(
    "/v1/files",
    authenticate,
    express.raw({
      type: "application/octet-stream",
      limit: temporaryFileMaxBytes,
    }),
    async (request, response) => {
      try {
        await cleanupExpiredTemporaryFiles(store);
        const recipientAgentId = request.header(
          "x-agent-operator-recipient",
        );
        const encodedName = request.header("x-agent-operator-name");
        const idempotencyKey = request.header(
          "x-agent-operator-idempotency-key",
        );
        if (!recipientAgentId || !encodedName || !idempotencyKey) {
          response.status(400).json({ error: "missing file metadata" });
          return;
        }
        if (idempotencyKey.length > 200) {
          response.status(400).json({ error: "invalid idempotency key" });
          return;
        }
        if (!Buffer.isBuffer(request.body)) {
          response.status(400).json({ error: "binary body is required" });
          return;
        }
        let name: string;
        try {
          name = decodeURIComponent(encodedName);
        } catch {
          throw new TemporaryFileError("invalid file name encoding", 400);
        }
        const attachment = await createTemporaryFile({
          store,
          directory: temporaryFileDirectory,
          ownerAgentId: String(response.locals.agentId),
          recipientAgentId,
          idempotencyKey,
          name,
          content: request.body,
          maxBytes: temporaryFileMaxBytes,
          quotaBytes: options.temporaryFileQuotaBytes,
          ttlMs: options.temporaryFileTtlMs,
        });
        response.status(201).json(attachment);
      } catch (error) {
        const status = error instanceof TemporaryFileError ? error.status : 500;
        response.status(status).json({
          error: error instanceof Error ? error.message : "file upload failed",
        });
      }
    },
  );

  app.get(
    "/v1/files/:fileId",
    authenticate,
    async (request, response) => {
      try {
        await cleanupExpiredTemporaryFiles(store);
        const record = getTemporaryFileForDownload(
          store,
          String(request.params.fileId),
          String(response.locals.agentId),
        );
        response.type("application/octet-stream");
        response.setHeader("content-length", String(record.size));
        response.setHeader("x-agent-operator-sha256", record.sha256);
        response.setHeader("x-agent-operator-expires-at", record.expiresAt);
        response.setHeader(
          "content-disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`,
        );
        createReadStream(record.path).pipe(response);
      } catch (error) {
        const status = error instanceof TemporaryFileError ? error.status : 500;
        response.status(status).json({
          error: error instanceof Error ? error.message : "file download failed",
        });
      }
    },
  );

  app.post(
    "/v1/files/:fileId/ack",
    authenticate,
    async (request, response) => {
      try {
        await acknowledgeTemporaryFile(
          store,
          String(request.params.fileId),
          String(response.locals.agentId),
        );
        response.json({ ok: true });
      } catch (error) {
        const status = error instanceof TemporaryFileError ? error.status : 500;
        response.status(status).json({
          error:
            error instanceof Error
              ? error.message
              : "file acknowledgement failed",
        });
      }
    },
  );

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

  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.too.large"
      ) {
        if (request.path === "/v1/enrollment/consume") {
          response.status(413).json({ error: "enrollment_denied" });
          return;
        }
        if (!request.path.startsWith("/v1/files")) {
          response.status(413).json({ error: "payload_too_large" });
          return;
        }
        response.status(413).json({
          error: `Temporary file exceeds ${temporaryFileMaxBytes} bytes`,
        });
        return;
      }
      next(error);
    },
  );

  return app;
};
