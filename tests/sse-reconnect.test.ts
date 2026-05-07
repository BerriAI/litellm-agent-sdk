import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent, type RunEvent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

describe("SSE auto-reconnect", () => {
  let proxy: MockProxy;
  let baseUrl: string;

  beforeEach(async () => {
    proxy = new MockProxy({ apiKey: "k", dropAfterEvents: 2 });
    baseUrl = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it("reconnects with starting_seq, no events lost or duplicated", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    const run = await session.send("hi");

    const collected: RunEvent[] = [];
    for await (const ev of run.stream()) {
      collected.push(ev);
    }

    // mock emits 4 events (seq 0..3); drop after 2 forces a reconnect.
    expect(collected.length).toBe(4);
    expect(collected.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(collected[collected.length - 1]!.type).toBe("run.completed");
  });
});
