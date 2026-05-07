import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent, type RunEvent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

describe("Run streaming", () => {
  let proxy: MockProxy;
  let baseUrl: string;

  beforeEach(async () => {
    proxy = new MockProxy({ apiKey: "k" });
    baseUrl = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it("session.send returns a Run, stream() yields events through completion", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    const run = await session.send("hi");
    expect(run.id).toMatch(/^run_/);

    const events: RunEvent[] = [];
    for await (const ev of run.stream()) {
      events.push(ev);
    }
    expect(events.map((e) => e.type)).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "run.completed",
    ]);
    // seq is monotonic
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq);
    }
  });

  it("run.wait() drains the stream and returns final result", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    const run = await session.send("hi");
    const result = await run.wait();
    expect(result.status).toBe("completed");
    expect(result.result).toBe("hello world");
  });
});
