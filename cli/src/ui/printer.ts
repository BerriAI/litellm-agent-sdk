import { foldSdkMessages, type SDKMessage } from "@litellm/agent-sdk";

type AssistantLike = { type: "assistant"; message: { content: unknown[] } };

function extractTextBlocks(content: unknown[]): string[] {
  const out: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type: string }).type === "text" &&
      "text" in block &&
      typeof (block as { text: string }).text === "string"
    ) {
      out.push((block as { text: string }).text);
    }
  }
  return out;
}

/** Extract displayable text from a folded SDKMessage array. */
export function renderMessages(messages: SDKMessage[]): string {
  const folded = foldSdkMessages(messages);
  const parts: string[] = [];
  for (const msg of folded) {
    if (msg.type !== "assistant") continue;
    const content = (msg as unknown as AssistantLike).message?.content;
    if (Array.isArray(content)) {
      parts.push(...extractTextBlocks(content));
    }
  }
  return parts.join("\n");
}

/** Extract text from a raw POST /message response. */
export function extractReplyText(reply: Record<string, unknown>): string {
  // try common shapes
  if (typeof reply.text === "string") return reply.text;
  if (typeof reply.response === "string") return reply.response;
  if (typeof reply.message === "string") return reply.message;

  const content = reply.content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        (block as { type: string }).type === "text" &&
        "text" in block &&
        typeof (block as { text: string }).text === "string"
      ) {
        texts.push((block as { text: string }).text);
      }
    }
    if (texts.length > 0) return texts.join("\n");
  }

  // try nested message.content
  const inner = reply.message;
  if (inner && typeof inner === "object") {
    return extractReplyText(inner as Record<string, unknown>);
  }

  return JSON.stringify(reply, null, 2);
}
