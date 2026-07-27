import * as z from "zod/v4";

const hasControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
};

export const AgentStateSchema = z.enum(["idle", "busy", "offline", "error"]);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const ProjectDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  available: z.boolean().default(true),
});
export type ProjectDescriptor = z.infer<typeof ProjectDescriptorSchema>;

export const AgentDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["macos", "windows", "linux", "unknown"]),
  state: AgentStateSchema,
  currentProjectId: z.string().nullable(),
  currentActivity: z.string().nullable(),
  lastSeenAt: z.string(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

const safeGitPath = (value: string): boolean => {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
};

export const GitFileAttachmentSchema = z.object({
  type: z.literal("git_file"),
  repository: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => !hasControlCharacter(value), "Invalid repository"),
  revision: z
    .string()
    .regex(/^[a-fA-F0-9]{7,64}$/, "Revision must be a Git commit hash")
    .transform((value) => value.toLowerCase()),
  path: z.string().min(1).max(1024).refine(safeGitPath, "Unsafe Git path"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type GitFileAttachment = z.infer<typeof GitFileAttachmentSchema>;

export const TemporaryFileAttachmentSchema = z.object({
  type: z.literal("temporary_file"),
  fileId: z.uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        !value.includes("/") &&
        !value.includes("\\") &&
        value !== "." &&
        value !== ".." &&
        !hasControlCharacter(value),
      "Unsafe temporary file name",
    ),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
});
export type TemporaryFileAttachment = z.infer<
  typeof TemporaryFileAttachmentSchema
>;

export const AttachmentSchema = z.discriminatedUnion("type", [
  GitFileAttachmentSchema,
  TemporaryFileAttachmentSchema,
]);
export type Attachment = z.infer<typeof AttachmentSchema>;

export const MessageKindSchema = z.enum([
  "start",
  "send",
  "threads_query",
  "thread_send",
  "result",
]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const MessageSchema = z.object({
  id: z.uuid(),
  cursor: z.number().int().positive(),
  kind: MessageKindSchema,
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  rootMessageId: z.uuid(),
  replyTo: z.uuid().nullable(),
  projectId: z.string().nullable(),
  targetThreadId: z.uuid().nullable(),
  text: z.string(),
  attachments: z.array(AttachmentSchema),
  status: z.enum(["queued", "delivered", "completed", "failed"]),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const HeartbeatSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["macos", "windows", "linux", "unknown"]),
  state: z.enum(["idle", "busy", "error"]),
  currentProjectId: z.string().nullable().default(null),
  currentActivity: z.string().max(240).nullable().default(null),
  projects: z.array(ProjectDescriptorSchema),
  workerVersion: z.string().min(1),
});
export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export const PublishResultSchema = z.object({
  rootMessageId: z.uuid(),
  replyTo: z.uuid(),
  toAgentId: z.string().min(1),
  threadId: z.uuid().nullable().default(null),
  text: z.string(),
  attachments: z.array(AttachmentSchema).default([]),
  failed: z.boolean().default(false),
});

export const ProjectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const WorkerConfigFileSchema = z.object({
  projects: z.array(ProjectConfigSchema),
});
