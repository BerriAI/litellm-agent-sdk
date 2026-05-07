import { Agent } from "@litellm/agent-sdk";

const agent = await Agent.create({
  apiKey: process.env.LITELLM_API_KEY!,
  baseUrl: process.env.LITELLM_BASE_URL!,
  name: "shin-cursor",
  model: { id: "claude-4.6-sonnet" },
  systemPrompt: "You are a coding agent.",
});

const session = await agent.createSession({
  repos: [{ url: "https://github.com/me/repo", startingRef: "main" }],
  envVars: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "" },
});

const run = await session.send("fix the failing test in tests/auth.test.ts");
for await (const ev of run.stream()) console.log(ev.seq, ev.type);

await session.followup("also handle the empty-input case");
