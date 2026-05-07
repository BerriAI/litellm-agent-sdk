import type { HttpClient } from "./client/http.js";
import { Run } from "./run.js";
import type {
  ConversationTurn,
  ListOptions,
  ListResult,
  RunInfo,
  SendInput,
  SessionInfo,
  SessionStatus,
} from "./types.js";

export class Session {
  readonly id: string;
  readonly agentId: string;

  private _status: SessionStatus;
  private readonly http: HttpClient;

  constructor(http: HttpClient, info: SessionInfo) {
    this.http = http;
    this.id = info.id;
    this.agentId = info.agentId;
    this._status = info.status;
  }

  get status(): SessionStatus {
    return this._status;
  }

  async refresh(): Promise<SessionInfo> {
    const info = await this.http.request<SessionInfo>({
      method: "GET",
      path: `/v1/sessions/${encodeURIComponent(this.id)}`,
    });
    this._status = info.status;
    return info;
  }

  async send(input: SendInput): Promise<Run> {
    const body = normalizeSendInput(input);
    const info = await this.http.request<RunInfo>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(this.id)}/prompt_async`,
      body,
    });
    return new Run(this.http, info);
  }

  async followup(message: string): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(this.id)}/prompt_async`,
      body: { text: message, followup: true },
    });
  }

  async getRun(runId: string): Promise<Run> {
    const info = await this.http.request<RunInfo>({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(runId)}`,
    });
    return new Run(this.http, info);
  }

  async listRuns(opts?: ListOptions): Promise<ListResult<Run>> {
    const res = await this.http.request<ListResult<RunInfo>>({
      method: "GET",
      path: `/v1/sessions/${encodeURIComponent(this.id)}/runs`,
      query: { limit: opts?.limit, cursor: opts?.cursor },
    });
    return {
      items: res.items.map((info) => new Run(this.http, info)),
      nextCursor: res.nextCursor ?? null,
    };
  }

  async conversation(): Promise<ConversationTurn[]> {
    const res = await this.http.request<{ turns: ConversationTurn[] }>({
      method: "GET",
      path: `/v1/sessions/${encodeURIComponent(this.id)}/conversation`,
    });
    return res.turns;
  }

  async terminate(): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/v1/sessions/${encodeURIComponent(this.id)}`,
    });
    this._status = "terminated";
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.terminate();
  }
}

function normalizeSendInput(input: SendInput): { text: string; images?: unknown[] } {
  if (typeof input === "string") return { text: input };
  return { text: input.text, images: input.images };
}
