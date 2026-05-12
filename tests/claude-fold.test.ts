/**
 * Tests for `foldSdkMessages` — the helper that collapses the SDK's mixed
 * stream of `SDKAssistantMessage` snapshots and `SDKPartialAssistantMessage`
 * delta frames into a single rolling message list.
 *
 * Fixtures use the exact shapes from `@anthropic-ai/claude-agent-sdk`:
 *   - `type: "stream_event"` wrapping Anthropic's native `message_start`,
 *     `content_block_start`, `content_block_delta` frames.
 *   - `type: "assistant"` carrying the authoritative API message.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F = (m: any): any => m;
import { foldSdkMessages, type SDKMessage } from "../src/index.js";

describe("foldSdkMessages — passthrough", () => {
  it("returns user/result/system messages unchanged", () => {
    const stream: SDKMessage[] = [
      F({ type: "system", subtype: "init", session_id: "ses_1" }),
      F({ type: "user", message: { role: "user", content: "hi" } }),
      F({
        type: "result",
        subtype: "success",
        result: "done",
        total_cost_usd: 0.01,
      }),
    ];
    const out = foldSdkMessages(stream);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.type)).toEqual(["system", "user", "result"]);
  });

  it("passes through an authoritative assistant message verbatim", () => {
    const stream: SDKMessage[] = [
      F({
        type: "assistant",
        message: {
          id: "msg_api_1",
          role: "assistant",
          content: [{ type: "text", text: "complete" }],
        },
        session_id: "ses_1",
      }),
    ];
    const out = foldSdkMessages(stream);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("assistant");
    const content = (out[0] as { message?: { content?: unknown[] } }).message?.content ?? [];
    expect((content[0] as { text?: string })?.text).toBe("complete");
  });
});

describe("foldSdkMessages — partial-message reconciliation", () => {
  it("creates an assistant message from a message_start stream_event", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_api_2", role: "assistant", content: [] },
        },
        session_id: "ses_1",
      }),
    ];
    const out = foldSdkMessages(stream);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("assistant");
  });

  it("folds text_delta into the matching content block", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_api_3", role: "assistant", content: [] },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello " },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "world" },
        },
      }),
    ];
    const out = foldSdkMessages(stream);
    expect(out).toHaveLength(1);
    const text = (out[0] as { message: { content: { text?: string }[] } })
      .message.content[0]?.text;
    expect(text).toBe("Hello world");
  });

  it("folds thinking_delta into a thinking block", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_t", role: "assistant", content: [] },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "Let me " },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "check." },
        },
      }),
    ];
    const out = foldSdkMessages(stream);
    const block = (out[0] as { message: { content: { thinking?: string }[] } })
      .message.content[0];
    expect(block?.thinking).toBe("Let me check.");
  });

  it("captures input_json_delta into input_partial_json on a tool_use block", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_tool", role: "assistant", content: [] },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "tu_a",
            name: "Bash",
            input: {},
          },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"command":"' },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: 'ls"}' },
        },
      }),
    ];
    const out = foldSdkMessages(stream);
    const block = (
      out[0] as {
        message: {
          content: {
            type?: string;
            id?: string;
            name?: string;
            input_partial_json?: string;
          }[];
        };
      }
    ).message.content[0];
    expect(block?.type).toBe("tool_use");
    expect(block?.name).toBe("Bash");
    expect(block?.input_partial_json).toBe('{"command":"ls"}');
  });

  it("authoritative assistant snapshot overlays the partially-folded one", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_x", role: "assistant", content: [] },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "partial" },
        },
      }),
      F({
        type: "assistant",
        message: {
          id: "msg_x",
          role: "assistant",
          content: [{ type: "text", text: "final authoritative body" }],
        },
        session_id: "ses_x",
      }),
    ];
    const out = foldSdkMessages(stream);
    expect(out).toHaveLength(1);
    const text = (out[0] as { message: { content: { text?: string }[] } })
      .message.content[0]?.text;
    expect(text).toBe("final authoritative body");
  });

  it("interleaves text + tool_use blocks at distinct indices", () => {
    const stream: SDKMessage[] = [
      F({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_z", role: "assistant", content: [] },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Running..." },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "tu_z",
            name: "Read",
            input: {},
          },
        },
      }),
      F({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: {
            type: "input_json_delta",
            partial_json: '{"path":"x.py"}',
          },
        },
      }),
    ];
    const out = foldSdkMessages(stream);
    const content = (
      out[0] as {
        message: {
          content: { type?: string; text?: string; input_partial_json?: string }[];
        };
      }
    ).message.content;
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toBe("Running...");
    expect(content[1].type).toBe("tool_use");
    expect(content[1].input_partial_json).toBe('{"path":"x.py"}');
  });
});

describe("foldSdkMessages — purity", () => {
  it("does not mutate the input list", () => {
    const stream: SDKMessage[] = [
      F({ type: "system", subtype: "init", session_id: "ses_1" }),
    ];
    const before = JSON.stringify(stream);
    foldSdkMessages(stream);
    expect(JSON.stringify(stream)).toBe(before);
  });
});
