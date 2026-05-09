/**
 * Two endpoints, two pairs of credentials. Don't conflate them.
 *
 *   LiteLLM Agent Platform (LAP)   — `apiKey` + `baseUrl` on `ClientOptions`
 *                                    The control plane this SDK talks to:
 *                                    `POST /v1/managed_agents/agents`,
 *                                    `POST /v1/managed_agents/sessions/:id/message`,
 *                                    etc.
 *
 *   LiteLLM Gateway                — `litellmApiKey` + `litellmApiBase` on
 *                                    `AgentCreateOptions`. The LLM gateway
 *                                    the harness *inside* the spawned sandbox
 *                                    calls for actual completions. The SDK
 *                                    doesn't talk to it directly — these
 *                                    fields are forwarded into the agent
 *                                    template so the harness uses them. When
 *                                    omitted, the harness inherits LAP's
 *                                    server-side default.
 */

/** Credentials for the LAP control plane. */
export interface ClientOptions {
  /** LAP master key. Sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /**
   * LAP base URL — must include the `/api` prefix when hitting the LAP
   * Render deployment. Example:
   * `https://litellm-agent-platform.onrender.com/api`.
   */
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface AgentCreateOptions extends ClientOptions {
  model: string;
  templateId: string;
  name?: string;
  prompt?: string;
  repoUrl?: string;
  branch?: string;
  tools?: unknown[];
  mcpServers?: string[];
  /**
   * Optional override for the **LiteLLM Gateway** the spawned harness calls
   * for LLM completions. Forwarded onto the agent template so the harness
   * picks it up at session-start time. Leave unset to use LAP's server-side
   * default gateway (the common case).
   */
  litellmApiKey?: string;
  /** See `litellmApiKey`. */
  litellmApiBase?: string;
  pfpUrl?: string;
  /** Optional. Picks the harness binary the managed platform spawns. Default `opencode`; other valid value: `claude-agent-sdk`. */
  harnessId?: string;
}

export interface CreateSessionOptions {
  initialPrompt?: string;
  title?: string;
  /**
   * Per-session env vars forwarded into the harness shell. Use for short-lived
   * secrets like `GITHUB_TOKEN` (gh pr create), `CIRCLECI_TOKEN`, etc. The
   * proxy enforces a reserved-keys list and size limits.
   */
  envVars?: Record<string, string>;
}

export interface SessionSnapshot {
  id: string;
  agentId: string;
  status: string;
  sandboxUrl?: string;
  taskArn?: string;
  response?: Record<string, unknown>;
  createdAt?: string;
}

export interface SessionEvent {
  type?: string;
  [key: string]: unknown;
}
