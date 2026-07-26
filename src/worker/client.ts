import {
  HeartbeatSchema,
  MessageSchema,
  PublishResultSchema,
  type Heartbeat,
  type Message,
} from "../shared/protocol.js";
import * as z from "zod/v4";

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

  private async request(
    path: string | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    headers.set("content-type", "application/json");
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
