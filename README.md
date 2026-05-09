# @litellm/agent-sdk

TypeScript client for [LiteLLM managed agents](https://github.com/BerriAI/litellm/pull/27427). Two primitives: `Agent`, `Session`. The runtime is a Fargate sandbox in **your** AWS — the SDK doesn't host anything.

```ts
import { Agent } from "@litellm/agent-sdk";

const agent = await Agent.create({
  apiKey: process.env.LITELLM_API_KEY!,
  baseUrl: process.env.LITELLM_BASE_URL!,
  model: "anthropic/claude-haiku-4-5",
  templateId: "tpl_opencode_my_repo",
  prompt: "You are a senior reviewer.",
});

const session = await agent.createSession({
  initialPrompt: "In one sentence, what is this repo about?",
});

const reply = await session.send("Now show me the routes file.");

for await (const ev of session.events()) console.log(ev.type, ev);
```

## Install

```
npm i @litellm/agent-sdk
```

Node 20+. ESM only.

## API

| call                          | request                                              |
| ----------------------------- | ---------------------------------------------------- |
| `Agent.create(opts)`          | `POST /v1/managed_agents/agents`                     |
| `agent.createSession(opts)`   | `POST /v1/managed_agents/agents/:id/session`         |
| `agent.getSession(id)`        | `GET  /v1/managed_agents/sessions/:id`               |
| `session.send(text)`          | `POST /v1/managed_agents/sessions/:id/message`       |
| `session.events()`            | `GET  /v1/managed_agents/sessions/:id/events` (SSE)  |
| `session.refresh()`           | `GET  /v1/managed_agents/sessions/:id`               |

Auth: `Authorization: Bearer <apiKey>`. Wire format is snake_case; the SDK exposes camelCase. `createSession` blocks while the proxy boots a Fargate task (~50–90s). `send` is synchronous — the proxy passes through to the harness and returns the reply.

## License

MIT
