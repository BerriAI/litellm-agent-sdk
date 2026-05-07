import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

describe("Agent", () => {
  let proxy: MockProxy;
  let baseUrl: string;

  beforeEach(async () => {
    proxy = new MockProxy({ apiKey: "test-key" });
    baseUrl = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it("Agent.create posts to /v1/agents and returns a handle", async () => {
    const agent = await Agent.create({
      apiKey: "test-key",
      baseUrl,
      name: "shin-cursor",
      model: { id: "claude-4.6-sonnet" },
      systemPrompt: "you are helpful",
    });
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.name).toBe("shin-cursor");
    expect(agent.model.id).toBe("claude-4.6-sonnet");
  });

  it("Agent.get fetches existing agent", async () => {
    const created = await Agent.create({
      apiKey: "test-key",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const got = await Agent.get(created.id, { apiKey: "test-key", baseUrl });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("x");
  });

  it("rejects without apiKey", async () => {
    await expect(
      Agent.create({
        apiKey: "wrong",
        baseUrl,
        name: "x",
        model: { id: "noop" },
        systemPrompt: "p",
      })
    ).rejects.toThrow(/HTTP 401/);
  });
});
