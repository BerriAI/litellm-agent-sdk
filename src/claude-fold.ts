/**
 * `foldSdkMessages` — collapse Anthropic's raw `SDKMessage` stream into a
 * clean, in-order list that's ready to render.
 *
 * The Claude Agent SDK emits two flavors of assistant output during a
 * streaming turn:
 *
 *   - `SDKAssistantMessage` (`type: "assistant"`) — the authoritative
 *     snapshot for a given `message.id`, with the final content blocks.
 *   - `SDKPartialAssistantMessage` (`type: "stream_event"`) — raw
 *     Anthropic-API streaming frames (`message_start`,
 *     `content_block_start`, `content_block_delta`, `content_block_stop`,
 *     `message_delta`, `message_stop`). The `content_block_delta` frames
 *     carry the actual token-by-token text/thinking/JSON deltas.
 *
 * Most viewers want a single rolling list of assistant messages whose
 * `content` array grows as deltas arrive. This helper does that:
 *
 *   - `assistant` messages are appended (or upserted by `message.id`).
 *   - `stream_event` frames are spliced into the matching assistant
 *     message's content blocks. The text/thinking content grows in place;
 *     tool-use blocks accumulate their JSON input string from
 *     `input_json_delta` frames.
 *   - User, system, and result messages pass through verbatim.
 *
 * The output is `FoldedMessage[]`. Each is the same shape as `SDKMessage`
 * minus the `stream_event` variant — by the time you get the folded list,
 * the partial-assistant frames have been folded into their target.
 *
 * Pure: never mutates the input messages. Returns a new array each call.
 */

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from "@anthropic-ai/claude-agent-sdk";

/** Any SDKMessage variant that survives folding (no `stream_event`). */
export type FoldedMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | SDKSystemMessage
  // Other system-flavored SDKMessage variants the harness may forward;
  // we don't introspect them, just pass through.
  | (SDKMessage & { type: string });

/**
 * Fold a stream of raw SDKMessages into the canonical rendering list.
 * Replaces partial-assistant `stream_event`s with their merged content,
 * keyed by Anthropic message id.
 */
export function foldSdkMessages(stream: SDKMessage[]): FoldedMessage[] {
  // `assistantByApiId` maps Anthropic API message.id → index in `out`.
  // Used to find which folded assistant message a `stream_event` belongs to.
  const out: FoldedMessage[] = [];
  const assistantByApiId = new Map<string, number>();
  // Track the *latest* assistant-message API id we've seen via stream_event
  // `message_start`. content_block_* events that follow without their own
  // id reference belong to this current message.
  let currentApiId: string | null = null;

  for (const m of stream) {
    if (!m || typeof m !== "object") continue;

    if (m.type === "stream_event") {
      foldStreamEvent(m, out, assistantByApiId, (id) => {
        currentApiId = id;
      });
      continue;
    }

    if (m.type === "assistant") {
      const apiId = getAssistantApiId(m);
      if (apiId && assistantByApiId.has(apiId)) {
        // Authoritative snapshot — overlay onto the partial we already
        // built up. Keep growing-content compatibility: if the partial has
        // more characters in a text block than the snapshot, we still
        // overwrite, because the snapshot is the source of truth from the
        // SDK. Token deltas after this either reset (new message) or are
        // for a different content block.
        const idx = assistantByApiId.get(apiId)!;
        out[idx] = m;
      } else {
        const idx = out.push(m) - 1;
        if (apiId) assistantByApiId.set(apiId, idx);
      }
      currentApiId = apiId ?? currentApiId;
      continue;
    }

    // user, result, system, hook/notification/etc — pass through verbatim.
    out.push(m as FoldedMessage);
  }

  return out;
}

/**
 * Apply one `stream_event` frame to the rolling folded list. Creates a
 * placeholder assistant message when the first `message_start` arrives so
 * subsequent content_block_* deltas have a home.
 */
function foldStreamEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any,
  out: FoldedMessage[],
  assistantByApiId: Map<string, number>,
  setCurrentApiId: (id: string | null) => void,
): void {
  const event = m.event as Record<string, unknown> | undefined;
  if (!event || typeof event !== "object") return;
  const eventType = event.type;

  if (eventType === "message_start") {
    const message = event.message as Record<string, unknown> | undefined;
    const apiId = typeof message?.id === "string" ? message.id : null;
    if (!apiId) return;
    setCurrentApiId(apiId);
    if (assistantByApiId.has(apiId)) return;
    // Create a partial assistant message we'll grow into. Mirror the SDK
    // shape so consumers get a `type: "assistant"` from day one.
    const idx = out.push({
      type: "assistant",
      message: {
        ...((message as Record<string, unknown>) || {}),
        content: Array.isArray((message as Record<string, unknown>)?.content)
          ? ((message as Record<string, unknown>).content as unknown[])
          : [],
      },
      // session/parent fields preserved verbatim from the wrapper.
      ...{
        session_id: m.session_id,
        parent_tool_use_id: m.parent_tool_use_id ?? null,
        uuid: m.uuid,
      },
    } as unknown as FoldedMessage) - 1;
    assistantByApiId.set(apiId, idx);
    return;
  }

  if (eventType === "content_block_start") {
    const apiId = findCurrentApiId(out, assistantByApiId);
    if (!apiId) return;
    const idx = assistantByApiId.get(apiId)!;
    const cb = event.content_block as Record<string, unknown> | undefined;
    const blockIdx = typeof event.index === "number" ? event.index : -1;
    if (!cb || blockIdx < 0) return;
    setBlock(out, idx, blockIdx, cb);
    return;
  }

  if (eventType === "content_block_delta") {
    const apiId = findCurrentApiId(out, assistantByApiId);
    if (!apiId) return;
    const idx = assistantByApiId.get(apiId)!;
    const blockIdx = typeof event.index === "number" ? event.index : -1;
    const delta = event.delta as Record<string, unknown> | undefined;
    if (!delta || blockIdx < 0) return;
    appendDelta(out, idx, blockIdx, delta);
    return;
  }
  // content_block_stop / message_delta / message_stop / message_start →
  // either redundant (we overlay with the assistant snapshot when it
  // lands) or carry stop-reason metadata we don't render. Ignore for now.
}

function findCurrentApiId(
  out: FoldedMessage[],
  assistantByApiId: Map<string, number>,
): string | null {
  // Most recent assistant message wins.
  for (const [apiId, idx] of [...assistantByApiId.entries()].reverse()) {
    if (out[idx]?.type === "assistant") return apiId;
  }
  return null;
}

/**
 * `unknown[]` is intentional. During streaming we hold partial content
 * blocks that don't yet satisfy the SDK's full structural types
 * (e.g. text blocks without `citations`, tool_use blocks before we've
 * parsed their `input` from `input_json_delta`). Once `setBlock` /
 * `appendDelta` are done growing them and the authoritative `assistant`
 * snapshot lands, the entries become real `SDKContentBlock`s. Consumers
 * cast to the SDK type at the render boundary.
 */
type LooseContentBlock = Record<string, unknown>;

function setBlock(
  out: FoldedMessage[],
  msgIdx: number,
  blockIdx: number,
  block: Record<string, unknown>,
): void {
  const msg = out[msgIdx] as SDKAssistantMessage & {
    message: { content: LooseContentBlock[] };
  };
  const content = (msg.message.content ?? []) as LooseContentBlock[];
  const next = content.slice();
  // For text/thinking blocks we initialize an empty buffer that deltas
  // will append into; for tool_use we keep the SDK's input shape but
  // capture the partial JSON string as `input_partial_json` until the
  // SDK gives us the parsed input.
  const blockType = typeof block.type === "string" ? block.type : "unknown";
  if (blockType === "text") {
    next[blockIdx] = {
      type: "text",
      text: typeof block.text === "string" ? block.text : "",
    };
  } else if (blockType === "thinking") {
    next[blockIdx] = {
      type: "thinking",
      thinking: typeof block.thinking === "string" ? block.thinking : "",
    };
  } else if (blockType === "tool_use") {
    next[blockIdx] = {
      type: "tool_use",
      id: typeof block.id === "string" ? block.id : "",
      name: typeof block.name === "string" ? block.name : "",
      input: (block.input as Record<string, unknown>) ?? {},
      input_partial_json: "",
    };
  } else {
    next[blockIdx] = block;
  }
  out[msgIdx] = {
    ...msg,
    message: { ...msg.message, content: next as unknown as SDKAssistantMessage["message"]["content"] },
  } as FoldedMessage;
}

function appendDelta(
  out: FoldedMessage[],
  msgIdx: number,
  blockIdx: number,
  delta: Record<string, unknown>,
): void {
  const msg = out[msgIdx] as SDKAssistantMessage & {
    message: { content: LooseContentBlock[] };
  };
  const content = ((msg.message.content ?? []) as LooseContentBlock[]).slice();
  const block = (content[blockIdx] ?? {}) as LooseContentBlock;
  const deltaType = delta.type;
  let updated: LooseContentBlock = { ...block };
  if (deltaType === "text_delta" && typeof delta.text === "string") {
    updated = {
      ...updated,
      type: "text",
      text: ((block.text as string) ?? "") + delta.text,
    };
  } else if (deltaType === "thinking_delta" && typeof delta.thinking === "string") {
    updated = {
      ...updated,
      type: "thinking",
      thinking: ((block.thinking as string) ?? "") + delta.thinking,
    };
  } else if (deltaType === "input_json_delta" && typeof delta.partial_json === "string") {
    updated = {
      ...updated,
      input_partial_json:
        ((block.input_partial_json as string) ?? "") + delta.partial_json,
    };
  }
  content[blockIdx] = updated;
  out[msgIdx] = {
    ...msg,
    message: { ...msg.message, content: content as unknown as SDKAssistantMessage["message"]["content"] },
  } as FoldedMessage;
}

function getAssistantApiId(m: SDKAssistantMessage): string | null {
  const id = (m as { message?: { id?: unknown } }).message?.id;
  return typeof id === "string" ? id : null;
}
