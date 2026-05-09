import { Agent } from "@litellm/agent-sdk";

const agent = await Agent.create({
  apiKey: process.env.LITELLM_API_KEY!,
  baseUrl: process.env.LITELLM_BASE_URL!,
  model: "anthropic/claude-haiku-4-5",
  templateId: process.env.LITELLM_TEMPLATE_ID!,
  prompt: "You are a senior reviewer.",
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
