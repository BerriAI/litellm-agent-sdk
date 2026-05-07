# @litellm/agent-sdk

TypeScript SDK for LiteLLM Agents. Three-level hierarchy: **Agent → Session → Run**.

```ts
import { Agent } from "@litellm/agent-sdk";

const agent = await Agent.create({
  apiKey: process.env.LITELLM_API_KEY!,
  baseUrl: process.env.LITELLM_BASE_URL!,
  name: "shin-cursor",
  model: { id: "claude-4.6-sonnet" },
  systemPrompt: "You are a helpful coding agent.",
});

const session = await agent.createSession({
  repos: [{ url: "https://github.com/me/my-repo", startingRef: "main" }],
  envVars: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! },
});

const run = await session.send("Fix the failing test in tests/auth.test.ts");

for await (const ev of run.stream()) {
  console.log(ev.type, ev.data);
}

await session.followup("also handle the empty-input case");
```

## Install

```bash
npm i @litellm/agent-sdk
```

Requires Node.js 20+.

## Concepts

- **Agent** — definition (model, system prompt, tools). Created once, reused across many sessions.
- **Session** — a sandboxed VM with cloned repos and env vars. Bound to one agent.
- **Run** — a single send-followups-stream cycle within a session.

## API

### `Agent.create(options)`

```ts
const agent = await Agent.create({
  apiKey: string,
  baseUrl: string,
  name: string,
  model: { id: string },
  systemPrompt: string,
  tools?: AgentTool[],
});
```

Returns an `Agent` handle bound to the proxy.

### `Agent.get(agentId, options)`

Fetch an existing agent by id.

### `agent.createSession(options)`

```ts
const session = await agent.createSession({
  repos?: { url: string; startingRef?: string }[],
  envVars?: Record<string, string>,
});
```

Provisions a sandbox VM, clones repos, returns a `SessionHandle`.

### `agent.getSession(sessionId)`

Resume a previously-created session.

### `session.send(prompt)`

Starts a new `Run`. Throws 409 if a run is already active.

### `session.followup(message)`

Queues a message into the active run. No 409.

### `run.stream(opts?)`

Async iterator over the run's SSE event stream. Auto-reconnects on socket drops, resuming from the last seen `seq`.

```ts
for await (const ev of run.stream()) {
  // ev: { seq, type, data, ts }
}
```

### `await using session = …`

```ts
{
  await using session = await agent.createSession({});
  await session.send("hi");
} // VM torn down on scope exit
```

## Wire format

- `Authorization: Bearer <apiKey>` on every request
- `snake_case` JSON over the wire; SDK exposes `camelCase` to TS users
- SSE events: `{ seq, type, data, ts }`; reconnect with `?starting_seq=N`

## Endpoints

| SDK call | HTTP |
| --- | --- |
| `Agent.create()` | `POST /v1/agents` |
| `Agent.get(id)` | `GET /v1/agents/:id` |
| `agent.createSession()` | `POST /v1/agents/:id/sessions` |
| `agent.getSession(id)` | `GET /v1/sessions/:id` |
| `session.send()` | `POST /v1/sessions/:id/prompt_async` |
| `session.followup()` | `POST /v1/sessions/:id/prompt_async` |
| `run.stream()` | `GET /v1/runs/:id/events` (SSE) |

## License

MIT
