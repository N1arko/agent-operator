import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentDescriptor,
  Attachment,
  Heartbeat,
  Message,
  MessageKind,
  ProjectDescriptor,
  TemporaryFileAttachment,
} from "../shared/protocol.js";

type MessageRow = {
  seq: number;
  id: string;
  kind: MessageKind;
  from_agent_id: string;
  to_agent_id: string;
  root_message_id: string;
  reply_to: string | null;
  project_id: string | null;
  target_thread_id: string | null;
  text: string;
  attachments_json: string;
  status: Message["status"];
  created_at: string;
};

type AgentRow = {
  id: string;
  name: string;
  platform: AgentDescriptor["platform"];
  state: AgentDescriptor["state"];
  current_project_id: string | null;
  current_activity: string | null;
  last_seen_at: string;
};

type TemporaryFileRow = {
  id: string;
  owner_agent_id: string;
  recipient_agent_id: string | null;
  idempotency_key: string | null;
  name: string;
  path: string;
  size: number;
  sha256: string;
  expires_at: string;
  created_at: string;
};

export type TemporaryFileRecord = {
  id: string;
  ownerAgentId: string;
  recipientAgentId: string;
  idempotencyKey: string;
  name: string;
  path: string;
  size: number;
  sha256: string;
  expiresAt: string;
  createdAt: string;
};

export class CoordinatorStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        state TEXT NOT NULL,
        current_project_id TEXT,
        current_activity TEXT,
        worker_version TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_projects (
        agent_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        available INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, project_id),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        root_message_id TEXT NOT NULL,
        reply_to TEXT,
        project_id TEXT,
        target_thread_id TEXT,
        text TEXT NOT NULL,
        attachments_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_target_cursor
        ON messages(to_agent_id, seq);
      CREATE TABLE IF NOT EXISTS temporary_files (
        id TEXT PRIMARY KEY,
        owner_agent_id TEXT NOT NULL,
        recipient_agent_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS temporary_files_expiry
        ON temporary_files(expires_at);
    `);
    const messageColumns = this.db
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    if (!messageColumns.some((column) => column.name === "target_thread_id")) {
      this.db.exec("ALTER TABLE messages ADD COLUMN target_thread_id TEXT");
    }
    const temporaryFileColumns = this.db
      .prepare("PRAGMA table_info(temporary_files)")
      .all() as Array<{ name: string }>;
    if (
      !temporaryFileColumns.some(
        (column) => column.name === "recipient_agent_id",
      )
    ) {
      this.db.exec(
        "ALTER TABLE temporary_files ADD COLUMN recipient_agent_id TEXT",
      );
    }
    if (
      !temporaryFileColumns.some(
        (column) => column.name === "idempotency_key",
      )
    ) {
      this.db.exec(
        "ALTER TABLE temporary_files ADD COLUMN idempotency_key TEXT",
      );
    }
    this.db.exec(`
      DELETE FROM temporary_files
      WHERE recipient_agent_id IS NULL OR idempotency_key IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS temporary_files_idempotency
        ON temporary_files(owner_agent_id, idempotency_key);
    `);
    this.db.exec(`
      UPDATE messages
      SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM messages AS result
          WHERE result.kind = 'result'
            AND result.reply_to = messages.id
            AND result.status = 'failed'
        ) THEN 'failed'
        ELSE 'completed'
      END
      WHERE kind != 'result'
        AND EXISTS (
          SELECT 1 FROM messages AS result
          WHERE result.kind = 'result'
            AND result.reply_to = messages.id
        )
    `);
  }

  heartbeat(agentId: string, input: Heartbeat): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO agents (
            id, name, platform, state, current_project_id, current_activity,
            worker_version, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, platform=excluded.platform, state=excluded.state,
            current_project_id=excluded.current_project_id,
            current_activity=excluded.current_activity,
            worker_version=excluded.worker_version,
            last_seen_at=excluded.last_seen_at
        `)
        .run(
          agentId,
          input.name,
          input.platform,
          input.state,
          input.currentProjectId,
          input.currentActivity,
          input.workerVersion,
          now,
        );
      this.db.prepare("DELETE FROM agent_projects WHERE agent_id = ?").run(agentId);
      const insert = this.db.prepare(`
        INSERT INTO agent_projects (
          agent_id, project_id, name, tags_json, available, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const project of input.projects) {
        insert.run(
          agentId,
          project.id,
          project.name,
          JSON.stringify(project.tags),
          project.available ? 1 : 0,
          now,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listAgents(offlineAfterMs = 45_000): AgentDescriptor[] {
    const rows = this.db
      .prepare("SELECT * FROM agents ORDER BY name")
      .all() as unknown as AgentRow[];
    const now = Date.now();
    return rows.map((row) => {
      const lastSeenAt = row.last_seen_at;
      const stale = now - Date.parse(lastSeenAt) > offlineAfterMs;
      return {
        id: row.id,
        name: row.name,
        platform: row.platform,
        state: stale ? "offline" : row.state,
        currentProjectId: row.current_project_id,
        currentActivity: row.current_activity,
        lastSeenAt,
      };
    });
  }

  getAgent(agentId: string): AgentDescriptor | null {
    return this.listAgents().find((agent) => agent.id === agentId) ?? null;
  }

  listProjects(agentId: string): ProjectDescriptor[] {
    const rows = this.db
      .prepare(
        "SELECT project_id, name, tags_json, available FROM agent_projects WHERE agent_id = ? ORDER BY name",
      )
      .all(agentId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.project_id),
      name: String(row.name),
      tags: JSON.parse(String(row.tags_json)) as string[],
      available: Number(row.available) === 1,
    }));
  }

  createMessage(input: {
    kind: MessageKind;
    fromAgentId: string;
    toAgentId: string;
    rootMessageId?: string;
    replyTo?: string | null;
    projectId?: string | null;
    targetThreadId?: string | null;
    text: string;
    attachments?: Attachment[];
    status?: Message["status"];
  }): Message {
    const id = randomUUID();
    const rootMessageId = input.rootMessageId ?? id;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO messages (
          id, kind, from_agent_id, to_agent_id, root_message_id, reply_to,
          project_id, target_thread_id, text, attachments_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.kind,
        input.fromAgentId,
        input.toAgentId,
        rootMessageId,
        input.replyTo ?? null,
        input.projectId ?? null,
        input.targetThreadId ?? null,
        input.text,
        JSON.stringify(input.attachments ?? []),
        input.status ?? "queued",
        createdAt,
      );
    return this.getMessage(id);
  }

  getMessage(id: string): Message {
    const row = this.db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(id) as MessageRow | undefined;
    if (!row) throw new Error(`Unknown message: ${id}`);
    return this.mapMessage(row);
  }

  listMessages(agentId: string, afterCursor = 0): Message[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE to_agent_id = ? AND seq > ? ORDER BY seq LIMIT 100",
      )
      .all(agentId, afterCursor) as unknown as MessageRow[];
    return rows.map((row) => this.mapMessage(row));
  }

  listQueuedMessages(agentId: string, afterCursor = 0): Message[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE to_agent_id = ? AND seq > ? AND status = 'queued'
         ORDER BY seq LIMIT 100`,
      )
      .all(agentId, afterCursor) as unknown as MessageRow[];
    return rows.map((row) => this.mapMessage(row));
  }

  countOutstandingRequests(agentId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM messages
         WHERE to_agent_id = ?
           AND kind != 'result'
           AND status IN ('queued', 'delivered')`,
      )
      .get(agentId) as { count: number };
    return row.count;
  }

  acknowledge(messageId: string): void {
    this.db
      .prepare(
        "UPDATE messages SET status = 'delivered' WHERE id = ? AND status = 'queued'",
      )
      .run(messageId);
  }

  findResult(fromAgentId: string, replyTo: string): Message | null {
    const row = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE from_agent_id = ? AND reply_to = ? AND kind = 'result'
         ORDER BY seq LIMIT 1`,
      )
      .get(fromAgentId, replyTo) as MessageRow | undefined;
    return row ? this.mapMessage(row) : null;
  }

  completeMessage(messageId: string, failed: boolean): void {
    this.db
      .prepare(
        `UPDATE messages SET status = ?
         WHERE id = ? AND status IN ('queued', 'delivered')`,
      )
      .run(failed ? "failed" : "completed", messageId);
  }

  createTemporaryFile(input: {
    id: string;
    ownerAgentId: string;
    recipientAgentId: string;
    idempotencyKey: string;
    name: string;
    path: string;
    size: number;
    sha256: string;
    expiresAt: string;
  }): TemporaryFileRecord {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO temporary_files (
           id, owner_agent_id, recipient_agent_id, idempotency_key, name, path,
           size, sha256, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ownerAgentId,
        input.recipientAgentId,
        input.idempotencyKey,
        input.name,
        input.path,
        input.size,
        input.sha256,
        input.expiresAt,
        createdAt,
      );
    const created = this.getTemporaryFile(input.id);
    if (!created) throw new Error(`Unable to create temporary file: ${input.id}`);
    return created;
  }

  getTemporaryFile(id: string): TemporaryFileRecord | null {
    const row = this.db
      .prepare("SELECT * FROM temporary_files WHERE id = ?")
      .get(id) as TemporaryFileRow | undefined;
    return row ? this.mapTemporaryFile(row) : null;
  }

  findTemporaryFileByIdempotency(
    ownerAgentId: string,
    idempotencyKey: string,
  ): TemporaryFileRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM temporary_files
         WHERE owner_agent_id = ? AND idempotency_key = ?`,
      )
      .get(ownerAgentId, idempotencyKey) as TemporaryFileRow | undefined;
    return row ? this.mapTemporaryFile(row) : null;
  }

  temporaryFileUsage(ownerAgentId: string, now: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(size), 0) AS size
         FROM temporary_files
         WHERE owner_agent_id = ? AND expires_at > ?`,
      )
      .get(ownerAgentId, now) as { size: number };
    return row.size;
  }

  deleteTemporaryFile(id: string): TemporaryFileRecord | null {
    const record = this.getTemporaryFile(id);
    if (!record) return null;
    this.db.prepare("DELETE FROM temporary_files WHERE id = ?").run(id);
    return record;
  }

  takeExpiredTemporaryFiles(now: string): TemporaryFileRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM temporary_files WHERE expires_at <= ?")
      .all(now) as unknown as TemporaryFileRow[];
    if (rows.length === 0) return [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM temporary_files WHERE expires_at <= ?")
        .run(now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return rows.map((row) => this.mapTemporaryFile(row));
  }

  assertTemporaryAttachments(
    ownerAgentId: string,
    recipientAgentId: string,
    attachments: TemporaryFileAttachment[],
  ): void {
    const now = Date.now();
    for (const attachment of attachments) {
      const record = this.getTemporaryFile(attachment.fileId);
      if (!record) {
        throw new Error(`Unknown temporary file: ${attachment.fileId}`);
      }
      if (
        record.ownerAgentId !== ownerAgentId ||
        record.recipientAgentId !== recipientAgentId
      ) {
        throw new Error(
          `Temporary file ${attachment.fileId} is not available for this route`,
        );
      }
      if (Date.parse(record.expiresAt) <= now) {
        throw new Error(`Temporary file ${attachment.fileId} has expired`);
      }
      if (
        record.name !== attachment.name ||
        record.size !== attachment.size ||
        record.sha256 !== attachment.sha256 ||
        record.expiresAt !== attachment.expiresAt
      ) {
        throw new Error(
          `Temporary file metadata mismatch: ${attachment.fileId}`,
        );
      }
    }
  }

  close(): void {
    this.db.close();
  }

  private mapMessage(row: MessageRow): Message {
    return {
      id: row.id,
      cursor: row.seq,
      kind: row.kind,
      fromAgentId: row.from_agent_id,
      toAgentId: row.to_agent_id,
      rootMessageId: row.root_message_id,
      replyTo: row.reply_to,
      projectId: row.project_id,
      targetThreadId: row.target_thread_id,
      text: row.text,
      attachments: JSON.parse(row.attachments_json) as Attachment[],
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private mapTemporaryFile(row: TemporaryFileRow): TemporaryFileRecord {
    if (!row.recipient_agent_id || !row.idempotency_key) {
      throw new Error(`Temporary file metadata is incomplete: ${row.id}`);
    }
    return {
      id: row.id,
      ownerAgentId: row.owner_agent_id,
      recipientAgentId: row.recipient_agent_id,
      idempotencyKey: row.idempotency_key,
      name: row.name,
      path: row.path,
      size: row.size,
      sha256: row.sha256,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
