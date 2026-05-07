import { type Client, client, request } from "./http.js";
import { Session } from "./session.js";
import type { AgentCreateOptions, CreateSessionOptions } from "./types.js";

export class Agent {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly c: Client,
  ) {}

  static async create(opts: AgentCreateOptions): Promise<Agent> {
    const c = client(opts);
    const a = await request<{ id: string; name: string }>(c, "POST", "/v1/agents", {
      name: opts.name,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      tools: opts.tools,
    });
    return new Agent(a.id, a.name, c);
  }

  async createSession(opts: CreateSessionOptions = {}): Promise<Session> {
    const s = await request<{ id: string; agentId: string }>(
      this.c,
      "POST",
      `/v1/agents/${this.id}/sessions`,
      opts,
    );
    return new Session(s.id, s.agentId, this.c);
  }

  async getSession(id: string): Promise<Session> {
    const s = await request<{ id: string; agentId: string }>(
      this.c,
      "GET",
      `/v1/sessions/${id}`,
    );
    return new Session(s.id, s.agentId, this.c);
  }
}
