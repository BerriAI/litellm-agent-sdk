/**
 * `createClaudeStream` — the only thing every viewer needs to call.
 *
 * Subscribes to LAP's `/sessions/:id/stream` SSE endpoint and yields
 * Anthropic's native `SDKMessage` objects, *unwrapped*. The harness on LAP
 * emits each message from `@anthropic-ai/claude-agent-sdk`'s `query()`
 * iterable as a `claude_sdk_message` envelope on the wire; this helper
 * peels the envelope so consumers see the exact same type they'd see if
 * they were running the SDK in-process.
 *
 * The Slack bot and the dashboard UI both call this. No viewer parses
 * harness events directly — they render `SDKMessage` using
 * `@anthropic-ai/claude-agent-sdk`'s own types.
 */

import { createParser } from "eventsource-parser";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ClientOptions } from "./types.js";

export interface CreateClaudeStreamOptions extends ClientOptions {
  /** LAP session id to subscribe to. */
  sessionId: string;
  /** Caller-controlled abort. Same semantics as fetch — abort closes the stream. */
  signal?: AbortSignal;
  /**
   * Optional callback fired on every transport-level error. The stream's
   * status will already be `error` when this fires; this is for callers
   * that want to surface the failure outside the rendered conversation
   * (toast, log, page error boundary).
   */
  onError?: (err: Error) => void;
}

/** Status of the live event stream. Mirrors the wire-level connection state. */
export type ClaudeStreamStatus =
  | "connecting"
  | "streaming"
  | "idle"
  | "aborted"
  | "error";

/**
 * Snapshot of the live conversation: the running tail of `SDKMessage`
 * objects, in order, plus connection-level status. Partial assistant
 * messages (`type: "stream_event"`) are included verbatim — consumers
 * choose whether to fold them in-place or render them separately.
 */
export interface ClaudeStreamState {
  status: ClaudeStreamStatus;
  error?: string;
  messages: SDKMessage[];
}

export type ClaudeStreamSubscriber = (state: ClaudeStreamState) => void;

export interface ClaudeStreamHandle {
  /** Current snapshot. */
  state(): ClaudeStreamState;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(cb: ClaudeStreamSubscriber): () => void;
  /** Abort the SSE connection. */
  abort(): void;
  /** Resolves when the stream terminates (idle / error / abort). */
  done(): Promise<void>;
}

/**
 * Subscribe to a LAP session's live event stream and surface each Anthropic
 * `SDKMessage` to subscribers as it arrives.
 *
 * The wire envelope is intentionally tiny: each SSE `data:` line is a JSON
 * object of shape `{ "type": "claude_sdk_message", "properties": { "message": SDKMessage } }`.
 * The harness also emits framing events on the same stream (`session.idle`,
 * `session.error`, `session.aborted`) which we use to transition this
 * helper's status; everything else passes through opaquely.
 */
export function createClaudeStream(
  opts: CreateClaudeStreamOptions,
): ClaudeStreamHandle {
  let state: ClaudeStreamState = { status: "connecting", messages: [] };
  const subscribers = new Set<ClaudeStreamSubscriber>();
  const ac = new AbortController();
  const onUpstreamAbort = (): void => ac.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", onUpstreamAbort, { once: true });
  }

  const setState = (next: ClaudeStreamState): void => {
    if (next === state) return;
    state = next;
    for (const cb of subscribers) {
      try {
        cb(state);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[claude-stream] subscriber threw: ${(err as Error).message}`,
        );
      }
    }
  };

  const fetchFn = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/managed_agents/sessions/${opts.sessionId}/stream`;

  const done = (async (): Promise<void> => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          Accept: "text/event-stream",
        },
        signal: ac.signal,
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      setState({ ...state, status: "error", error: message });
      opts.onError?.(err as Error);
      return;
    }

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      const message = `stream ${res.status} ${body}`.trim();
      setState({ ...state, status: "error", error: message });
      opts.onError?.(new Error(message));
      return;
    }

    const parser = createParser({
      onEvent(ev) {
        if (!ev.data) return;
        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(ev.data) as Record<string, unknown>;
        } catch {
          return;
        }
        applyWireEvent(raw);
      },
    });

    const applyWireEvent = (raw: Record<string, unknown>): void => {
      const t = raw.type;
      if (t === "claude_sdk_message") {
        const props = (raw.properties ?? raw) as Record<string, unknown>;
        const msg = props.message as SDKMessage | undefined;
        if (!msg) return;
        if (state.status === "connecting") {
          setState({ ...state, status: "streaming", messages: [...state.messages, msg] });
        } else {
          setState({ ...state, messages: [...state.messages, msg] });
        }
        return;
      }
      if (t === "stream.opened" || t === "server.connected" || t === "session.connected") {
        if (state.status === "connecting") setState({ ...state, status: "streaming" });
        return;
      }
      if (t === "session.idle") {
        setState({ ...state, status: "idle" });
        return;
      }
      if (t === "session.aborted") {
        setState({ ...state, status: "aborted" });
        return;
      }
      if (t === "session.error") {
        const props = (raw.properties ?? raw) as Record<string, unknown>;
        const message = typeof props.message === "string" ? props.message : "session error";
        setState({ ...state, status: "error", error: message });
        return;
      }
      // Anything else is a legacy event the harness still emits during
      // transition (`message.part.updated`, `message.part.delta`, etc.).
      // Native viewers ignore them — we read `SDKMessage` directly.
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setState({ ...state, status: "aborted" });
        return;
      }
      const message = (err as Error).message ?? String(err);
      setState({ ...state, status: "error", error: message });
      opts.onError?.(err as Error);
    } finally {
      if (opts.signal) opts.signal.removeEventListener("abort", onUpstreamAbort);
    }
  })();

  return {
    state: () => state,
    subscribe(cb) {
      subscribers.add(cb);
      try {
        cb(state);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[claude-stream] initial-state subscriber threw: ${(err as Error).message}`,
        );
      }
      return () => subscribers.delete(cb);
    },
    abort: () => ac.abort(),
    done: () => done,
  };
}
