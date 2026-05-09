import { createParser } from "eventsource-parser";
import type { Client } from "./http.js";
import type { SessionEvent } from "./types.js";
import { camel } from "./wire.js";

/**
 * Stream events for a session. The proxy passthrough's contract is opaque —
 * each `data:` line is JSON; we yield the parsed object as-is (camel-cased).
 */
export async function* streamSessionEvents(
  c: Client,
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<SessionEvent> {
  const res = await c.fetch(
    `${c.baseUrl}/v1/managed_agents/sessions/${sessionId}/events`,
    {
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        Accept: "text/event-stream",
      },
      signal,
    },
  );
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`SSE ${res.status} ${text}`.trim());
  }

  const queue: SessionEvent[] = [];
  const parser = createParser({
    onEvent(ev) {
      if (!ev.data) return;
      try {
        queue.push(camel(JSON.parse(ev.data)) as SessionEvent);
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
      while (queue.length) yield queue.shift()!;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
