import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent, type RunEvent } from "../src/index.js";
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
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    expect(agent.id).toMatch(/^agent_/);

    const session = await agent.createSession({
      repos: [{ url: "https://github.com/me/r", startingRef: "main" }],
    });
    expect(session.agentId).toBe(agent.id);

    const run = await session.send("hi");
    const events: RunEvent[] = [];
    for await (const ev of run.stream()) events.push(ev);
    expect(events.map((e) => e.type)).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "run.completed",
    ]);

    const again = await agent.getSession(session.id);
    expect(again.id).toBe(session.id);
  });

  it("rejects on bad apiKey", async () => {
    await expect(
      Agent.create({ apiKey: "wrong", baseUrl, name: "x", model: { id: "n" }, systemPrompt: "p" }),
    ).rejects.toThrow(/401/);
  });
});
