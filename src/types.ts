export interface ClientOptions {
  apiKey: string;
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
  litellmApiKey?: string;
  litellmApiBase?: string;
  pfpUrl?: string;
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
