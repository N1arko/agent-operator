import {
  HeartbeatSchema,
  MessageSchema,
  PublishResultSchema,
  TemporaryFileAttachmentSchema,
  type Heartbeat,
  type Message,
  type TemporaryFileAttachment,
} from "../shared/protocol.js";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";

const InboxSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.number().int().nonnegative(),
});

export class CoordinatorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  health(): Promise<Response> {
    return fetch(new URL("/health", this.baseUrl));
  }

  async heartbeat(input: Heartbeat): Promise<void> {
    HeartbeatSchema.parse(input);
    await this.request("/v1/worker/heartbeat", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async messages(after: number, waitMs = 20_000): Promise<{
    messages: Message[];
    nextCursor: number;
  }> {
    const url = new URL("/v1/worker/messages", this.baseUrl);
    url.searchParams.set("after", String(after));
    url.searchParams.set("waitMs", String(waitMs));
    const response = await this.request(url);
    return InboxSchema.parse(await response.json());
  }

  async acknowledge(messageId: string): Promise<void> {
    await this.request(`/v1/worker/messages/${messageId}/ack`, {
      method: "POST",
      body: "{}",
    });
  }

  async publishResult(
    input: z.input<typeof PublishResultSchema>,
  ): Promise<void> {
    const body = PublishResultSchema.parse(input);
    await this.request("/v1/worker/results", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async uploadTemporaryFile(
    recipientAgentId: string,
    name: string,
    content: Uint8Array,
    idempotencyKey = randomUUID(),
  ): Promise<TemporaryFileAttachment> {
    const response = await this.request("/v1/files", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-agent-operator-recipient": recipientAgentId,
        "x-agent-operator-name": encodeURIComponent(name),
        "x-agent-operator-idempotency-key": idempotencyKey,
      },
      body: content,
    });
    return TemporaryFileAttachmentSchema.parse(await response.json());
  }

  async downloadTemporaryFile(fileId: string): Promise<Uint8Array> {
    const response = await this.request(`/v1/files/${fileId}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async acknowledgeTemporaryFile(fileId: string): Promise<void> {
    await this.request(`/v1/files/${fileId}/ack`, {
      method: "POST",
      body: "{}",
    });
  }

  private async request(
    path: string | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(
      path instanceof URL ? path : new URL(path, this.baseUrl),
      {
        ...init,
        headers,
      },
    );
    if (!response.ok) {
      throw new Error(
        `Coordinator ${response.status}: ${await response.text()}`,
      );
    }
    return response;
  }
}
