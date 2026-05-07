export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface AgentCreateOptions extends ClientOptions {
  name: string;
  model: { id: string };
  systemPrompt: string;
  tools?: unknown[];
}

export interface CreateSessionOptions {
  repos?: { url: string; startingRef?: string }[];
  envVars?: Record<string, string>;
}

export interface RunEvent {
  seq: number;
  type: string;
  data: unknown;
  ts?: string;
}
