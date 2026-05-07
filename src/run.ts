import type { HttpClient } from "./client/http.js";
import { streamEvents } from "./client/sse.js";
import type {
  RunBranch,
  RunEvent,
  RunInfo,
  RunResult,
  RunStatus,
} from "./types.js";

export interface StreamOptions {
  startingSeq?: number;
  signal?: AbortSignal;
}

export class Run {
  readonly id: string;
  readonly sessionId: string;

  private _status: RunStatus;
  private _result: string | null;
  private _git?: { branches: RunBranch[] };
  private readonly http: HttpClient;

  constructor(http: HttpClient, info: RunInfo) {
    this.http = http;
    this.id = info.id;
    this.sessionId = info.sessionId;
    this._status = info.status;
    this._result = info.result ?? null;
    this._git = info.git;
  }

  get status(): RunStatus {
    return this._status;
  }

  get result(): string | null {
    return this._result;
  }

  get git(): { branches: RunBranch[] } | undefined {
    return this._git;
  }

  stream(opts?: StreamOptions): AsyncIterable<RunEvent> {
    const generate = () =>
      streamEvents({
        http: this.http,
        path: `/v1/runs/${encodeURIComponent(this.id)}/events`,
        startingSeq: opts?.startingSeq,
        signal: opts?.signal,
      });
    return {
      [Symbol.asyncIterator]: () => generate(),
    };
  }

  async refresh(): Promise<RunInfo> {
    const info = await this.http.request<RunInfo>({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(this.id)}`,
    });
    this._status = info.status;
    this._result = info.result ?? null;
    this._git = info.git;
    return info;
  }

  async wait(): Promise<RunResult> {
    for await (const _ of this.stream()) {
      // drain — terminal event ends the iterator
    }
    await this.refresh();
    return {
      status: this._status,
      result: this._result,
      git: this._git,
    };
  }

  async cancel(): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/v1/runs/${encodeURIComponent(this.id)}/cancel`,
    });
    await this.refresh();
  }
}
