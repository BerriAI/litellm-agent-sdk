import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/index.js";
import { MockProxy } from "./mock-proxy.js";

describe("Session", () => {
  let proxy: MockProxy;
  let baseUrl: string;

  beforeEach(async () => {
    proxy = new MockProxy({ apiKey: "k" });
    baseUrl = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it("createSession posts to /v1/agents/:id/sessions", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({
      repos: [{ url: "https://github.com/me/r", startingRef: "main" }],
      envVars: { FOO: "bar" },
    });
    expect(session.id).toMatch(/^session_/);
    expect(session.agentId).toBe(agent.id);
    expect(session.status).toBe("ready");
  });

  it("agent.getSession retrieves a created session", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const created = await agent.createSession({});
    const got = await agent.getSession(created.id);
    expect(got.id).toBe(created.id);
  });

  it("terminate marks session terminated and Symbol.asyncDispose calls it", async () => {
    const agent = await Agent.create({
      apiKey: "k",
      baseUrl,
      name: "x",
      model: { id: "noop" },
      systemPrompt: "p",
    });
    const session = await agent.createSession({});
    const sid = session.id;
    await session[Symbol.asyncDispose]();
    expect(session.status).toBe("terminated");
    const mock = proxy.sessions.get(sid)!;
    expect(mock.terminated).toBe(true);
  });
});
