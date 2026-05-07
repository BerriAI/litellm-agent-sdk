import { createParser, type EventSourceMessage } from "eventsource-parser";
import type { RunEvent } from "../types.js";
import { camelify } from "../wire.js";
import type { HttpClient } from "./http.js";

const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export interface SseStreamOptions {
  http: HttpClient;
  path: string;
  startingSeq?: number;
  signal?: AbortSignal;
}

export async function* streamEvents(
  opts: SseStreamOptions
): AsyncGenerator<RunEvent, void, void> {
  let lastSeq = opts.startingSeq ?? -1;
  let attempt = 0;

  while (true) {
    const query: Record<string, number> = {};
    if (lastSeq >= 0) query.starting_seq = lastSeq + 1;

    const url = opts.http.buildUrl(opts.path, query);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opts.http.apiKey}`,
          Accept: "text/event-stream",
        },
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (++attempt > MAX_RECONNECT_ATTEMPTS) throw err;
      await backoff(attempt);
      continue;
    }

    if (!res.ok || !res.body) {
      const text = await safeText(res);
      throw new Error(`SSE failed: HTTP ${res.status} — ${text}`);
    }

    attempt = 0;

    try {
      for await (const ev of parseSseStream(res.body, opts.signal)) {
        if (ev.type !== "event") continue;
        if (!ev.data) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          continue;
        }
        const evt = camelify(parsed) as RunEvent;
        if (typeof evt.seq !== "number") continue;
        if (evt.seq <= lastSeq) continue;
        lastSeq = evt.seq;
        yield evt;
        if (isTerminal(evt)) return;
      }
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (++attempt > MAX_RECONNECT_ATTEMPTS) throw err;
      await backoff(attempt);
      continue;
    }

    if (opts.signal?.aborted) return;
    if (++attempt > MAX_RECONNECT_ATTEMPTS) return;
    await backoff(attempt);
  }
}

function isTerminal(ev: RunEvent): boolean {
  return ev.type === "run.completed" || ev.type === "run.failed" || ev.type === "run.cancelled";
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<EventSourceMessage & { type: "event" }> {
  const queue: EventSourceMessage[] = [];
  const parser = createParser({
    onEvent(event) {
      queue.push(event);
    },
  });
  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
      while (queue.length) {
        const ev = queue.shift()!;
        yield { ...ev, type: "event" };
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_MS);
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
