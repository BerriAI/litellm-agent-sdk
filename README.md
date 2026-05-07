# @litellm/agent-sdk

TypeScript client for LiteLLM agents. Three primitives: `Agent`, `Session`, `Run`.

```ts
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
  envVars: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! },
});

const run = await session.send("fix the failing test in tests/auth.test.ts");
for await (const ev of run.stream()) console.log(ev.seq, ev.type);

await session.followup("also handle the empty-input case");
```

## Install

```
npm i @litellm/agent-sdk
```

Node 20+. ESM only.

## API

| call | request |
| --- | --- |
| `Agent.create(opts)` | `POST /v1/agents` |
| `agent.createSession(opts)` | `POST /v1/agents/:id/sessions` |
| `agent.getSession(id)` | `GET /v1/sessions/:id` |
| `session.send(prompt)` | `POST /v1/sessions/:id/prompt_async` |
| `session.followup(prompt)` | `POST /v1/sessions/:id/prompt_async` |
| `run.stream()` | `GET /v1/runs/:id/events` (SSE) |

Auth: `Authorization: Bearer <apiKey>`. Wire format is snake_case; the SDK exposes camelCase. SSE reconnects on socket drop using `?starting_seq=N`.

## License

MIT
