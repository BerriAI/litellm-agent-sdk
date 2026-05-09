import { type Client, client, request } from "./http.js";
import { Session } from "./session.js";
import type {
  AgentCreateOptions,
  CreateSessionOptions,
  SessionSnapshot,
} from "./types.js";

interface AgentWire {
  id: string;
  name?: string | null;
  model: string;
  templateId: string;
  branch?: string;
}

export class Agent {
  constructor(
    readonly id: string,
    readonly model: string,
    readonly templateId: string,
    readonly name: string | null,
    private readonly c: Client,
  ) {}

  static async create(opts: AgentCreateOptions): Promise<Agent> {
    const c = client(opts);
    const a = await request<AgentWire>(c, "POST", "/v1/managed_agents/agents", {
      model: opts.model,
      templateId: opts.templateId,
      name: opts.name,
      prompt: opts.prompt,
      repoUrl: opts.repoUrl,
      branch: opts.branch,
      tools: opts.tools,
      mcpServers: opts.mcpServers,
      litellmApiKey: opts.litellmApiKey,
      litellmApiBase: opts.litellmApiBase,
      pfpUrl: opts.pfpUrl,
      harnessId: opts.harnessId,
    });
    return new Agent(a.id, a.model, a.templateId, a.name ?? null, c);
  }

  async createSession(opts: CreateSessionOptions = {}): Promise<Session> {
    const s = await request<SessionSnapshot>(
      this.c,
      "POST",
      `/v1/managed_agents/agents/${this.id}/session`,
      opts,
    );
    return new Session(s, this.c);
  }

  async getSession(id: string): Promise<Session> {
    const s = await request<SessionSnapshot>(
      this.c,
      "GET",
      `/v1/managed_agents/sessions/${id}`,
    );
    return new Session(s, this.c);
  }
}
