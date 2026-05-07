import type { Client } from "./http.js";
import { streamRun } from "./sse.js";
import type { RunEvent } from "./types.js";

export class Run {
  constructor(
    readonly id: string,
    readonly sessionId: string,
    private readonly c: Client,
  ) {}

  stream(opts?: { signal?: AbortSignal }): AsyncIterable<RunEvent> {
    const c = this.c;
    const id = this.id;
    const signal = opts?.signal;
    return { [Symbol.asyncIterator]: () => streamRun(c, id, signal) };
  }
}
