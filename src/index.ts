export { Agent } from "./agent.js";
export { Session } from "./session.js";
export { createClaudeStream } from "./claude-stream.js";
export type {
  ClaudeStreamHandle,
  ClaudeStreamState,
  ClaudeStreamStatus,
  ClaudeStreamSubscriber,
  CreateClaudeStreamOptions,
} from "./claude-stream.js";
export { foldSdkMessages } from "./claude-fold.js";
export type { FoldedMessage } from "./claude-fold.js";
export type {
  AgentCreateOptions,
  ClientOptions,
  CreateSessionOptions,
  SessionEvent,
  SessionSnapshot,
} from "./types.js";
// Re-export the Anthropic SDKMessage type so consumers don't need to
// import @anthropic-ai/claude-agent-sdk separately just for the type.
export type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
