/**
 * v0 smoke test against the live LAP deployment.
 *
 * Run:
 *   LAP_BASE_URL=https://litellm-agent-platform.onrender.com/api \
 *   LAP_MASTER_KEY=sk-... \
 *   npx tsx examples/lap-smoke.ts
 *
 * Walks the four v0 success criteria:
 *   1. SDK builds + imports
 *   2. Agent.create   → returns {id}
 *   3. createSession  → blocks ~50–120s, returns {id, status}
 *   4. session.send   → blocks until harness reply, prints reply
 */

import { Agent } from "../src/index.js";

const baseUrl = process.env.LAP_BASE_URL;
const apiKey = process.env.LAP_MASTER_KEY;
if (!baseUrl) throw new Error("LAP_BASE_URL not set");
if (!apiKey) throw new Error("LAP_MASTER_KEY not set");

const t0 = Date.now();
const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

console.log(`[${ms()}] base=${baseUrl}`);

console.log(`[${ms()}] step 1 — Agent.create`);
const agent = await Agent.create({
  apiKey,
  baseUrl,
  model: "anthropic/claude-haiku-4-5",
  templateId: "tpl_opencode_default",
  name: "shin-cursor-smoke",
  prompt: "You are a helpful agent. Reply tersely.",
});
console.log(`[${ms()}] agent.id=${agent.id} model=${agent.model}`);

console.log(`[${ms()}] step 2 — createSession (cold-start ~50–120s)`);
const session = await agent.createSession({
  initialPrompt: "Reply with exactly the single word: ready",
  title: "v0 smoke",
});
console.log(
  `[${ms()}] session.id=${session.id} status=${session.status} ` +
    `initialResponse=${JSON.stringify(session.response)?.slice(0, 200)}`,
);

console.log(`[${ms()}] step 3 — session.send`);
const reply = await session.send("Reply with exactly the single word: hello");
console.log(`[${ms()}] reply=${JSON.stringify(reply).slice(0, 400)}`);

console.log(`[${ms()}] DONE — v0 success criteria met`);
