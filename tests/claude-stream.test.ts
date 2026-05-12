/**
 * End-to-end test for `createClaudeStream` — feeds the helper a scripted
 * SSE stream of `claude_sdk_message` envelopes wrapping real Anthropic
 * `SDKMessage` payloads, and asserts the resulting `ClaudeStreamState`
 * surfaces every message in order, then transitions to `idle`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Agent,
  createClaudeStream,
  foldSdkMessages,
  type SDKMessage,
} from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

let proxy: MockProxy;
let baseUrl: string;

beforeEach(async () => {
  proxy = new MockProxy({ apiKey: "k" });
  baseUrl = await proxy.start();
});
afterEach(() => proxy.stop());

async function provisionSession(): Promise<string> {
  const agent = await Agent.create({
    apiKey: "k",
    baseUrl,
    model: "anthropic/claude-haiku-4-5",
    templateId: "tpl_smoke",
  });
  const session = await agent.createSession({ initialPrompt: "go" });
  return session.id;
}

describe("createClaudeStream", () => {
  it("yields SDKMessages through to session.idle", async () => {
    proxy.opts.sessionEvents = [
      { type: "stream.opened" },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "system",
            subtype: "init",
            session_id: "ses_1",
          },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "assistant",
            message: {
              id: "msg_api_1",
              role: "assistant",
              content: [{ type: "text", text: "Hello!" }],
            },
            session_id: "ses_1",
          },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "result",
            subtype: "success",
            result: "Hello!",
            total_cost_usd: 0.001,
          },
        },
      },
      { type: "session.idle", properties: { sessionID: "ses_1" } },
    ];

    const sid = await provisionSession();
    const stream = createClaudeStream({
      apiKey: "k",
      baseUrl,
      sessionId: sid,
    });
    await stream.done();

    const final = stream.state();
    expect(final.status).toBe("idle");
    expect(final.messages).toHaveLength(3);
    expect(final.messages.map((m) => m.type)).toEqual([
      "system",
      "assistant",
      "result",
    ]);
  });

  it("ignores legacy message.part.* envelopes from the harness", async () => {
    // The harness emits both the new claude_sdk_message events AND the
    // legacy message.part.updated / .delta events during transition. The
    // native stream consumer must ignore the legacy stream.
    proxy.opts.sessionEvents = [
      { type: "stream.opened" },
      {
        type: "message.part.updated",
        properties: {
          messageID: "msg_legacy",
          part: { id: "p0", type: "text", text: "ignored" },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "assistant",
            message: {
              id: "msg_new",
              role: "assistant",
              content: [{ type: "text", text: "kept" }],
            },
            session_id: "ses_1",
          },
        },
      },
      { type: "session.idle", properties: { sessionID: "ses_1" } },
    ];

    const sid = await provisionSession();
    const stream = createClaudeStream({
      apiKey: "k",
      baseUrl,
      sessionId: sid,
    });
    await stream.done();
    expect(stream.state().messages).toHaveLength(1);
    expect(stream.state().messages[0].type).toBe("assistant");
  });

  it("session.error transitions to error with message", async () => {
    proxy.opts.sessionEvents = [
      { type: "stream.opened" },
      {
        type: "session.error",
        properties: { sessionID: "ses_1", message: "agent crashed" },
      },
    ];
    const sid = await provisionSession();
    const stream = createClaudeStream({
      apiKey: "k",
      baseUrl,
      sessionId: sid,
    });
    await stream.done();
    expect(stream.state().status).toBe("error");
    expect(stream.state().error).toBe("agent crashed");
  });

  it("works alongside foldSdkMessages for a clean rendering list", async () => {
    proxy.opts.sessionEvents = [
      { type: "stream.opened" },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "stream_event",
            event: {
              type: "message_start",
              message: {
                id: "msg_partial",
                role: "assistant",
                content: [],
              },
            },
          },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "stream_event",
            event: {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            },
          },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "Hello " },
            },
          },
        },
      },
      {
        type: "claude_sdk_message",
        properties: {
          message: {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "world" },
            },
          },
        },
      },
      { type: "session.idle", properties: { sessionID: "ses_1" } },
    ];
    const sid = await provisionSession();
    const stream = createClaudeStream({
      apiKey: "k",
      baseUrl,
      sessionId: sid,
    });
    await stream.done();
    const folded = foldSdkMessages(stream.state().messages);
    expect(folded).toHaveLength(1);
    const text = (
      folded[0] as { message: { content: { text?: string }[] } }
    ).message.content[0]?.text;
    expect(text).toBe("Hello world");
  });
});
