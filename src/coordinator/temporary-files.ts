import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TemporaryFileAttachmentSchema,
  type TemporaryFileAttachment,
} from "../shared/protocol.js";
import {
  CoordinatorStore,
  type TemporaryFileRecord,
} from "./store.js";

export const DEFAULT_TEMPORARY_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_TEMPORARY_FILE_QUOTA_BYTES = 50 * 1024 * 1024;
export const DEFAULT_TEMPORARY_FILE_TTL_MS = 24 * 60 * 60 * 1_000;

export class TemporaryFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const createTemporaryFile = async (input: {
  store: CoordinatorStore;
  directory: string;
  ownerAgentId: string;
  recipientAgentId: string;
  idempotencyKey: string;
  name: string;
  content: Buffer;
  maxBytes?: number;
  quotaBytes?: number;
  ttlMs?: number;
}): Promise<TemporaryFileAttachment> => {
  const parsedName =
    TemporaryFileAttachmentSchema.shape.name.safeParse(input.name);
  if (!parsedName.success) {
    throw new TemporaryFileError("Invalid temporary file name", 400);
  }
  const name = parsedName.data;
  const maxBytes = input.maxBytes ?? DEFAULT_TEMPORARY_FILE_MAX_BYTES;
  const quotaBytes = input.quotaBytes ?? DEFAULT_TEMPORARY_FILE_QUOTA_BYTES;
  const ttlMs = input.ttlMs ?? DEFAULT_TEMPORARY_FILE_TTL_MS;
  if (input.content.byteLength > maxBytes) {
    throw new TemporaryFileError(
      `Temporary file exceeds ${maxBytes} bytes`,
      413,
    );
  }
  if (!input.store.getAgent(input.recipientAgentId)) {
    throw new TemporaryFileError(
      `Unknown recipient agent: ${input.recipientAgentId}`,
      404,
    );
  }
  const now = new Date();
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const existing = input.store.findTemporaryFileByIdempotency(
    input.ownerAgentId,
    input.idempotencyKey,
  );
  if (existing) {
    if (
      existing.recipientAgentId === input.recipientAgentId &&
      existing.name === name &&
      existing.size === input.content.byteLength &&
      existing.sha256 === sha256 &&
      Date.parse(existing.expiresAt) > now.getTime()
    ) {
      return TemporaryFileAttachmentSchema.parse({
        type: "temporary_file",
        fileId: existing.id,
        name: existing.name,
        size: existing.size,
        sha256: existing.sha256,
        expiresAt: existing.expiresAt,
      });
    }
    throw new TemporaryFileError(
      "Idempotency key is already used for another temporary file",
      409,
    );
  }
  const usage = input.store.temporaryFileUsage(
    input.ownerAgentId,
    now.toISOString(),
  );
  if (usage + input.content.byteLength > quotaBytes) {
    throw new TemporaryFileError(
      `Temporary file quota exceeds ${quotaBytes} bytes`,
      413,
    );
  }

  const id = randomUUID();
  const path = join(input.directory, id);
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  await mkdir(input.directory, { recursive: true });
  await writeFile(path, input.content, { flag: "wx", mode: 0o600 });
  try {
    input.store.createTemporaryFile({
      id,
      ownerAgentId: input.ownerAgentId,
      recipientAgentId: input.recipientAgentId,
      idempotencyKey: input.idempotencyKey,
      name,
      path,
      size: input.content.byteLength,
      sha256,
      expiresAt,
    });
  } catch (error) {
    await unlink(path).catch(() => undefined);
    const replay = input.store.findTemporaryFileByIdempotency(
      input.ownerAgentId,
      input.idempotencyKey,
    );
    if (
      replay &&
      replay.recipientAgentId === input.recipientAgentId &&
      replay.name === name &&
      replay.size === input.content.byteLength &&
      replay.sha256 === sha256
    ) {
      return TemporaryFileAttachmentSchema.parse({
        type: "temporary_file",
        fileId: replay.id,
        name: replay.name,
        size: replay.size,
        sha256: replay.sha256,
        expiresAt: replay.expiresAt,
      });
    }
    throw error;
  }
  return TemporaryFileAttachmentSchema.parse({
    type: "temporary_file",
    fileId: id,
    name,
    size: input.content.byteLength,
    sha256,
    expiresAt,
  });
};

export const getTemporaryFileForDownload = (
  store: CoordinatorStore,
  fileId: string,
  agentId: string,
): TemporaryFileRecord => {
  const record = store.getTemporaryFile(fileId);
  if (!record) throw new TemporaryFileError("Temporary file not found", 404);
  if (
    record.ownerAgentId !== agentId &&
    record.recipientAgentId !== agentId
  ) {
    throw new TemporaryFileError("Temporary file is unavailable", 403);
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    throw new TemporaryFileError("Temporary file has expired", 410);
  }
  return record;
};

export const acknowledgeTemporaryFile = async (
  store: CoordinatorStore,
  fileId: string,
  agentId: string,
): Promise<void> => {
  const record = store.getTemporaryFile(fileId);
  if (!record) return;
  if (record.recipientAgentId !== agentId) {
    throw new TemporaryFileError("Temporary file is unavailable", 403);
  }
  store.deleteTemporaryFile(fileId);
  await unlink(record.path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
};

export const cleanupExpiredTemporaryFiles = async (
  store: CoordinatorStore,
): Promise<number> => {
  const records = store.takeExpiredTemporaryFiles(new Date().toISOString());
  await Promise.all(
    records.map((record) =>
      unlink(record.path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }),
    ),
  );
  return records.length;
};
