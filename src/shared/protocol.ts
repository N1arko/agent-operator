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
  "models_query",
  "cancel",
  "update",
  "result",
]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const ReasoningEffortSchema = z.string().trim().min(1).max(32);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

// @spec spec://modules/coordinator/FEAT-002-task-coordination#execution-profile-selection
export const ExecutionProfileSchema = z.enum(["fast", "balanced", "deep"]);
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;

// @spec spec://modules/coordinator/FEAT-006-progress-updates#data
export const ProgressPhaseSchema = z.enum([
  "commentary",
  "plan",
  "activity",
]);
export type ProgressPhase = z.infer<typeof ProgressPhaseSchema>;

export const ProgressPlanStepSchema = z.object({
  step: z.string().min(1).max(500),
  status: z.string().min(1).max(50),
});
export type ProgressPlanStep = z.infer<typeof ProgressPlanStepSchema>;

export const ProgressUpdateSchema = z.object({
  turnId: z.string().min(1),
  itemId: z.string().min(1),
  revision: z.number().int().positive(),
  phase: ProgressPhaseSchema,
  plan: z.array(ProgressPlanStepSchema).max(50).nullable().default(null),
});
export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;

export const ModelDescriptorSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  displayName: z.string().min(1),
  isDefault: z.boolean(),
  defaultReasoningEffort: ReasoningEffortSchema.nullable(),
  supportedReasoningEfforts: z.array(
    z.object({
      reasoningEffort: ReasoningEffortSchema,
      description: z.string(),
    }),
  ),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

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
  model: z.string().min(1).nullable().default(null),
  reasoningEffort: ReasoningEffortSchema.nullable().default(null),
  executionProfile: ExecutionProfileSchema.nullable().default(null),
  selectionReason: z.string().max(500).nullable().default(null),
  idempotencyKey: z.string().min(1).max(200).nullable().default(null),
  progress: ProgressUpdateSchema.nullable().default(null),
  isFinal: z.boolean().default(false),
  leaseExpiresAt: z.iso.datetime().nullable().default(null),
  status: z.enum([
    "queued",
    "delivered",
    "completed",
    "failed",
    "cancelled",
  ]),
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

export const AgentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Invalid agent ID");

export const AgentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !hasControlCharacter(value), "Invalid agent name");

// @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.enroll
export const EnrollmentConsumeSchema = z
  .object({
    code: z.string().min(20).max(128),
    platform: z.enum(["macos", "windows", "linux", "unknown"]),
    workerVersion: z.string().trim().min(1).max(64),
  })
  .strict();
export type EnrollmentConsume = z.infer<typeof EnrollmentConsumeSchema>;

export const PublishResultSchema = z.object({
  rootMessageId: z.uuid(),
  replyTo: z.uuid(),
  toAgentId: z.string().min(1),
  threadId: z.uuid().nullable().default(null),
  text: z.string(),
  attachments: z.array(AttachmentSchema).default([]),
  failed: z.boolean().default(false),
  cancelled: z.boolean().default(false),
}).refine((value) => !(value.failed && value.cancelled), {
  message: "A result cannot be both failed and cancelled",
});

export const PublishUpdateSchema = z.object({
  rootMessageId: z.uuid(),
  replyTo: z.uuid(),
  toAgentId: z.string().min(1),
  threadId: z.uuid().nullable().default(null),
  turnId: z.string().min(1),
  itemId: z.string().min(1),
  revision: z.number().int().positive(),
  phase: ProgressPhaseSchema,
  text: z.string().min(1).max(4_000),
  plan: z.array(ProgressPlanStepSchema).max(50).nullable().default(null),
  idempotencyKey: z.string().min(1).max(200),
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
