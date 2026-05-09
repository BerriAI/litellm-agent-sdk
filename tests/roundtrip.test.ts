import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent, type SessionEvent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

let proxy: MockProxy;
let baseUrl: string;

beforeEach(async () => {
  proxy = new MockProxy({ apiKey: "k" });
  baseUrl = await proxy.start();
});
afterEach(() => proxy.stop());

describe("roundtrip", () => {
  it("create → createSession → send → stream → getSession", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      model: "anthropic/claude-haiku-4-5",
      templateId: "tpl_smoke",
      name: "x",
      prompt: "be terse",
    });
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.model).toBe("anthropic/claude-haiku-4-5");
    expect(agent.templateId).toBe("tpl_smoke");

    const session = await agent.createSession({ initialPrompt: "hi" });
    expect(session.agentId).toBe(agent.id);
    expect(session.status).toBe("ready");

    const reply = await session.send("hello?");
    expect(reply).toEqual({ text: "echo: hello?" });

    const events: SessionEvent[] = [];
    for await (const ev of session.events()) events.push(ev);
    expect(events.map((e) => e.type)).toEqual([
      "session.started",
      "message.delta",
      "message.delta",
      "message.completed",
    ]);

    const again = await agent.getSession(session.id);
    expect(again.id).toBe(session.id);
  });

  it("forwards harnessId as snake_case harness_id on the wire", async () => {
    await Agent.create({
      apiKey: "k",
      baseUrl,
      model: "anthropic/claude-haiku-4-5",
      templateId: "tpl",
      harnessId: "claude-agent-sdk",
    });
    expect(proxy.lastCreateAgentBody?.harness_id).toBe("claude-agent-sdk");
  });

  it("omits harness_id when harnessId is unset (server picks default)", async () => {
    await Agent.create({
      apiKey: "k",
      baseUrl,
      model: "anthropic/claude-haiku-4-5",
      templateId: "tpl",
    });
    expect(proxy.lastCreateAgentBody).not.toHaveProperty("harness_id");
  });

  it("rejects on bad apiKey", async () => {
    await expect(
      Agent.create({
        apiKey: "wrong",
        baseUrl,
        model: "noop",
        templateId: "tpl",
      }),
    ).rejects.toThrow(/401/);
  });
});
