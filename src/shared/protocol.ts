import * as z from "zod/v4";

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

export const AttachmentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("git_file"),
    repository: z.string().min(1),
    revision: z.string().min(1),
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    type: z.literal("temporary_file"),
    fileId: z.uuid(),
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
  }),
]);
export type Attachment = z.infer<typeof AttachmentSchema>;

export const MessageKindSchema = z.enum(["start", "send", "result"]);
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
