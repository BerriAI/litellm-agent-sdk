import { type Client, request } from "./http.js";
import { streamSessionEvents } from "./sse.js";
import type { SessionEvent, SessionSnapshot } from "./types.js";

export class Session {
  readonly id: string;
  readonly agentId: string;
  status: string;
  sandboxUrl?: string;
  response?: Record<string, unknown>;

  constructor(
    snap: SessionSnapshot,
    private readonly c: Client,
  ) {
    this.id = snap.id;
    this.agentId = snap.agentId;
    this.status = snap.status;
    this.sandboxUrl = snap.sandboxUrl;
    this.response = snap.response;
  }

  /** POST /sessions/:id/message — blocks until the harness returns the reply. */
  send(text: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      this.c,
      "POST",
      `/v1/managed_agents/sessions/${this.id}/message`,
      { text },
    );
  }

  /** GET /sessions/:id/events — SSE passthrough from the sandbox harness. */
  events(opts?: { signal?: AbortSignal }): AsyncIterable<SessionEvent> {
    const c = this.c;
    const id = this.id;
    const signal = opts?.signal;
    return { [Symbol.asyncIterator]: () => streamSessionEvents(c, id, signal) };
  }

  async refresh(): Promise<this> {
    const snap = await request<SessionSnapshot>(
      this.c,
      "GET",
      `/v1/managed_agents/sessions/${this.id}`,
    );
    this.status = snap.status;
    this.sandboxUrl = snap.sandboxUrl;
    this.response = snap.response;
    return this;
  }
}
