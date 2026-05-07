import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

describe("followup()", () => {
  let proxy: MockProxy;
  let baseUrl: string;

  beforeEach(async () => {
    // autoEmit:false -> run stays "running" so followups can land
    proxy = new MockProxy({ apiKey: "k", autoEmit: false });
    baseUrl = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it("queues a followup into the active run without 409", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    const run = await session.send("first");
    expect(run.status).toBe("running");

    await session.followup("also handle empties");

    const stored = proxy.runs.get(run.id)!;
    expect(stored.followups).toEqual(["also handle empties"]);
    expect(stored.events.some((e) => e.type === "message.followup")).toBe(true);
  });

  it("send() returns 409 when a run is already active", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    await session.send("first");
    await expect(session.send("second")).rejects.toThrow(/HTTP 409/);
  });
});
