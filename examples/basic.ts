import { Agent } from "@litellm/agent-sdk";

const agent = await Agent.create({
  // LAP control plane (what this SDK talks to).
  apiKey: process.env.LITELLM_AGENT_PLATFORM_KEY!,
  baseUrl: process.env.LITELLM_AGENT_PLATFORM_URL!,
  model: "anthropic/claude-haiku-4-5",
  templateId: process.env.LITELLM_TEMPLATE_ID!,
  prompt: "You are a senior reviewer.",
  // Optional gateway override — forwarded into the harness for actual LLM
  // completions. Leave unset to use LAP's server-side default.
  litellmApiKey: process.env.LITELLM_GATEWAY_KEY,
  litellmApiBase: process.env.LITELLM_GATEWAY_URL,
});

// Boots a fresh Fargate task in your VPC. Returns once the sandbox is ready
// and (optionally) the initial prompt has produced a first reply.
const session = await agent.createSession({
  initialPrompt: "In one sentence, what is this repo about?",
});
console.log(`session ${session.id} ${session.status}`);

// Synchronous send — the proxy passes through to the harness and blocks
// until it returns the assistant's reply.
const reply = await session.send("Now show me the routes file.");
console.log(reply);

// Or stream events live (deltas, tool calls, completions) from the harness.
for await (const ev of session.events()) {
  console.log(ev.type, ev);
}
