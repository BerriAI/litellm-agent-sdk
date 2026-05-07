import { Agent } from "@litellm/agent-sdk";

async function main() {
  const agent = await Agent.create({
    apiKey: process.env.LITELLM_API_KEY!,
    baseUrl: process.env.LITELLM_BASE_URL!,
    name: "shin-cursor",
    model: { id: "claude-4.6-sonnet" },
    systemPrompt: "You are a helpful coding agent.",
  });

  const session = await agent.createSession({
    repos: [{ url: "https://github.com/me/my-repo", startingRef: "main" }],
    envVars: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
    },
  });

  const run = await session.send("Fix the failing test in tests/auth.test.ts");

  for await (const ev of run.stream()) {
    console.log(`[${ev.seq}] ${ev.type}`, ev.data);
  }

  await session.followup("also handle the empty-input case");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
