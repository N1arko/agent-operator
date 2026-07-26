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
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
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
          project_id, text, attachments_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.kind,
        input.fromAgentId,
        input.toAgentId,
        rootMessageId,
        input.replyTo ?? null,
        input.projectId ?? null,
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

  acknowledge(messageId: string): void {
    this.db
      .prepare(
        "UPDATE messages SET status = 'delivered' WHERE id = ? AND status = 'queued'",
      )
      .run(messageId);
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
      text: row.text,
      attachments: JSON.parse(row.attachments_json) as Attachment[],
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
