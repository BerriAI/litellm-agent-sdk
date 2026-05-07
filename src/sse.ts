import { createParser } from "eventsource-parser";
import type { Client } from "./http.js";
import type { RunEvent } from "./types.js";
import { camel } from "./wire.js";

const TERMINAL = new Set(["run.completed", "run.failed", "run.cancelled"]);

export async function* streamRun(
  c: Client,
  runId: string,
  signal?: AbortSignal,
): AsyncGenerator<RunEvent> {
  let lastSeq = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const q = lastSeq >= 0 ? `?starting_seq=${lastSeq + 1}` : "";
    const res = await c.fetch(`${c.baseUrl}/v1/runs/${runId}/events${q}`, {
      headers: { Authorization: `Bearer ${c.apiKey}`, Accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

    const queue: RunEvent[] = [];
    const parser = createParser({
      onEvent(ev) {
        if (!ev.data) return;
        try {
          const e = camel(JSON.parse(ev.data)) as RunEvent;
          if (typeof e.seq === "number" && e.seq > lastSeq) queue.push(e);
        } catch {
          /* skip malformed */
        }
      },
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
        while (queue.length) {
          const e = queue.shift()!;
          lastSeq = e.seq;
          yield e;
          if (TERMINAL.has(e.type)) return;
        }
      }
    } catch {
      if (signal?.aborted) return;
    }
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, Math.min(250 * 2 ** attempt, 5000)));
  }
}
