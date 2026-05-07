import { HttpClient } from "./client/http.js";
import { Session } from "./session.js";
import type {
  AgentCreateOptions,
  AgentInfo,
  AgentModel,
  AgentTool,
  ClientOptions,
  CreateSessionOptions,
  ListOptions,
  ListResult,
  SessionInfo,
} from "./types.js";

export class Agent {
  readonly id: string;
  readonly name: string;

  private readonly http: HttpClient;
  private _model: AgentModel;
  private _systemPrompt: string;
  private _tools?: AgentTool[];

  private constructor(http: HttpClient, info: AgentInfo) {
    this.http = http;
    this.id = info.id;
    this.name = info.name;
    this._model = info.model;
    this._systemPrompt = info.systemPrompt;
    this._tools = info.tools;
  }

  get model(): AgentModel {
    return this._model;
  }

  get systemPrompt(): string {
    return this._systemPrompt;
  }

  get tools(): AgentTool[] | undefined {
    return this._tools;
  }

  static async create(opts: AgentCreateOptions): Promise<Agent> {
    const http = new HttpClient(opts);
    const info = await http.request<AgentInfo>({
      method: "POST",
      path: "/v1/agents",
      body: {
        name: opts.name,
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        tools: opts.tools,
      },
    });
    return new Agent(http, info);
  }

  static async get(agentId: string, opts: ClientOptions): Promise<Agent> {
    const http = new HttpClient(opts);
    const info = await http.request<AgentInfo>({
      method: "GET",
      path: `/v1/agents/${encodeURIComponent(agentId)}`,
    });
    return new Agent(http, info);
  }

  static async list(
    opts: ClientOptions & ListOptions
  ): Promise<ListResult<AgentInfo>> {
    const http = new HttpClient(opts);
    return http.request<ListResult<AgentInfo>>({
      method: "GET",
      path: "/v1/agents",
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  async createSession(opts: CreateSessionOptions = {}): Promise<Session> {
    const info = await this.http.request<SessionInfo>({
      method: "POST",
      path: `/v1/agents/${encodeURIComponent(this.id)}/sessions`,
      body: {
        repos: opts.repos,
        envVars: opts.envVars,
      },
    });
    return new Session(this.http, info);
  }

  async getSession(sessionId: string): Promise<Session> {
    const info = await this.http.request<SessionInfo>({
      method: "GET",
      path: `/v1/sessions/${encodeURIComponent(sessionId)}`,
    });
    return new Session(this.http, info);
  }

  async listSessions(opts?: ListOptions): Promise<ListResult<SessionInfo>> {
    return this.http.request<ListResult<SessionInfo>>({
      method: "GET",
      path: `/v1/agents/${encodeURIComponent(this.id)}/sessions`,
      query: { limit: opts?.limit, cursor: opts?.cursor },
    });
  }

  async update(patch: Partial<Pick<AgentCreateOptions, "name" | "model" | "systemPrompt" | "tools">>): Promise<void> {
    const info = await this.http.request<AgentInfo>({
      method: "PATCH",
      path: `/v1/agents/${encodeURIComponent(this.id)}`,
      body: patch,
    });
    this._model = info.model;
    this._systemPrompt = info.systemPrompt;
    this._tools = info.tools;
  }

  async delete(): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/v1/agents/${encodeURIComponent(this.id)}`,
    });
  }
}
