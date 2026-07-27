import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TemporaryFileAttachment } from "../shared/protocol.js";
import type { CoordinatorClient } from "./client.js";

export type DownloadedTemporaryFile = {
  attachment: TemporaryFileAttachment;
  path: string;
};

const sha256 = (content: Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

export const downloadTemporaryFiles = async (
  client: CoordinatorClient,
  rootDirectory: string,
  messageId: string,
  attachments: TemporaryFileAttachment[],
): Promise<DownloadedTemporaryFile[]> => {
  const messageDirectory = join(rootDirectory, messageId);
  const downloaded: DownloadedTemporaryFile[] = [];
  try {
    await rm(messageDirectory, { recursive: true, force: true });
    for (const attachment of attachments) {
      if (Date.parse(attachment.expiresAt) <= Date.now()) {
        throw new Error(`Temporary file has expired: ${attachment.fileId}`);
      }
      const content = await client.downloadTemporaryFile(attachment.fileId);
      if (content.byteLength !== attachment.size) {
        throw new Error(
          `Temporary file size mismatch: ${attachment.fileId}`,
        );
      }
      if (sha256(content) !== attachment.sha256) {
        throw new Error(
          `Temporary file checksum mismatch: ${attachment.fileId}`,
        );
      }
      const directory = join(messageDirectory, attachment.fileId);
      await mkdir(directory, { recursive: true });
      const path = join(directory, attachment.name);
      const partialPath = `${path}.${randomUUID()}.part`;
      await writeFile(partialPath, content, { flag: "wx", mode: 0o600 });
      await rename(partialPath, path);
      downloaded.push({ attachment, path });
    }
    return downloaded;
  } catch (error) {
    await rm(messageDirectory, { recursive: true, force: true });
    throw error;
  }
};

export const appendTemporaryFilesToPrompt = (
  prompt: string,
  files: DownloadedTemporaryFile[],
): string => {
  if (files.length === 0) return prompt;
  const manifest = files
    .map(
      ({ attachment, path }) =>
        `- ${attachment.name}: localPath=${JSON.stringify(path)}, sha256=${attachment.sha256}, expiresAt=${attachment.expiresAt}`,
    )
    .join("\n");
  return `${prompt}\n\nTemporary files supplied by Agent Operator:\n${manifest}`;
};

export const removeDownloadedTemporaryFiles = async (
  rootDirectory: string,
  messageId: string,
): Promise<void> => {
  await rm(join(rootDirectory, messageId), { recursive: true, force: true });
};
