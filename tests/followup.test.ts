import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

let proxy: MockProxy;
let baseUrl: string;

beforeEach(async () => {
  proxy = new MockProxy({ apiKey: "k", noAutoEmit: true });
  baseUrl = await proxy.start();
});
afterEach(() => proxy.stop());

describe("followup", () => {
  it("queues into the active run", async () => {
    const agent = await Agent.create({ apiKey: "k", baseUrl, name: "x", model: { id: "n" }, systemPrompt: "p" });
    const session = await agent.createSession({});
    const run = await session.send("first");

    await session.followup("also handle empties");

    const stored = proxy.runs.get(run.id)!;
    expect(stored.followups).toEqual(["also handle empties"]);
  });

  it("send returns 409 when a run is active", async () => {
    const agent = await Agent.create({ apiKey: "k", baseUrl, name: "x", model: { id: "n" }, systemPrompt: "p" });
    const session = await agent.createSession({});
    await session.send("first");
    await expect(session.send("second")).rejects.toThrow(/409/);
  });
});
