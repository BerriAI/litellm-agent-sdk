import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent, type RunEvent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

let proxy: MockProxy;
let baseUrl: string;

beforeEach(async () => {
  proxy = new MockProxy({ apiKey: "k", dropAfter: 2 });
  baseUrl = await proxy.start();
});
afterEach(() => proxy.stop());

describe("sse reconnect", () => {
  it("resumes from starting_seq, no loss or duplication", async () => {
    const agent = await Agent.create({ apiKey: "k", baseUrl, name: "x", model: { id: "n" }, systemPrompt: "p" });
    const session = await agent.createSession({});
    const run = await session.send("hi");

    const got: RunEvent[] = [];
    for await (const ev of run.stream()) got.push(ev);

    expect(got.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(got.at(-1)!.type).toBe("run.completed");
  });
});
