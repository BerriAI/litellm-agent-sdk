export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface AgentModel {
  id: string;
  [k: string]: unknown;
}

export interface AgentTool {
  name: string;
  description?: string;
  [k: string]: unknown;
}

export interface AgentCreateOptions extends ClientOptions {
  name: string;
  model: AgentModel;
  systemPrompt: string;
  tools?: AgentTool[];
}

export interface AgentInfo {
  id: string;
  name: string;
  model: AgentModel;
  systemPrompt: string;
  tools?: AgentTool[];
  createdAt: string;
}

export interface RepoSpec {
  url: string;
  startingRef?: string;
}

export interface CreateSessionOptions {
  repos?: RepoSpec[];
  envVars?: Record<string, string>;
}

export type SessionStatus =
  | "provisioning"
  | "ready"
  | "busy"
  | "terminated"
  | "errored";

export interface SessionInfo {
  id: string;
  agentId: string;
  status: SessionStatus;
  sandboxUrl?: string;
  repos?: RepoSpec[];
  createdAt: string;
}

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface RunBranch {
  branch: string;
  prUrl: string | null;
}

export interface RunInfo {
  id: string;
  sessionId: string;
  status: RunStatus;
  result: string | null;
  git?: { branches: RunBranch[] };
  createdAt: string;
  completedAt?: string | null;
}

export interface RunEvent {
  seq: number;
  type: string;
  data: unknown;
  ts?: string;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
}

export interface ListResult<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface SDKImage {
  url?: string;
  base64?: string;
  mimeType?: string;
}

export type SendInput = string | { text: string; images?: SDKImage[] };

export interface ConversationTurn {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  ts?: string;
}

export interface RunResult {
  status: RunStatus;
  result: string | null;
  git?: { branches: RunBranch[] };
}
