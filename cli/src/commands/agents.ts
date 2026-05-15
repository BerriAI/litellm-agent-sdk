import { loadConfig } from "../config.js";
import { lapRequest } from "../http.js";

interface AgentRow {
  id: string;
  name?: string | null;
  model: string;
  template_id?: string;
  templateId?: string;
  harness_id?: string;
}

interface AgentsListResponse {
  agents?: AgentRow[];
  data?: AgentRow[];
}

export async function agentsList(opts: { baseUrl?: string; apiKey?: string }): Promise<void> {
  const cfg = loadConfig(opts);
  const res = await lapRequest<AgentsListResponse>(cfg, "GET", "/v1/managed_agents/agents");
  const agents: AgentRow[] = res.agents ?? res.data ?? (res as unknown as AgentRow[]);

  if (!Array.isArray(agents) || agents.length === 0) {
    console.log("No agents found.");
    return;
  }

  const tpl = (a: AgentRow) => a.template_id ?? a.templateId ?? "—";

  const idW = Math.max(4, ...agents.map((a) => a.id.length));
  const nameW = Math.max(4, ...agents.map((a) => (a.name ?? "—").length));
  const modelW = Math.max(5, ...agents.map((a) => a.model.length));
  const tplW = Math.max(8, ...agents.map((a) => tpl(a).length));

  const row = (id: string, name: string, model: string, t: string) =>
    `${id.padEnd(idW)}  ${name.padEnd(nameW)}  ${model.padEnd(modelW)}  ${t}`;

  console.log(row("ID", "NAME", "MODEL", "TEMPLATE"));
  console.log(row("-".repeat(idW), "-".repeat(nameW), "-".repeat(modelW), "-".repeat(tplW)));
  for (const a of agents) {
    console.log(row(a.id, a.name ?? "—", a.model, tpl(a)));
  }
}

export async function agentsCreate(opts: {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
  model: string;
  template: string;
  prompt?: string;
  repoUrl?: string;
  branch?: string;
  harness?: string;
}): Promise<void> {
  const cfg = loadConfig(opts);
  const body: Record<string, unknown> = {
    model: opts.model,
    templateId: opts.template,
  };
  if (opts.name) body.name = opts.name;
  if (opts.prompt) body.prompt = opts.prompt;
  if (opts.repoUrl) body.repoUrl = opts.repoUrl;
  if (opts.branch) body.branch = opts.branch;
  if (opts.harness) body.harnessId = opts.harness;

  const agent = await lapRequest<AgentRow>(cfg, "POST", "/v1/managed_agents/agents", body);
  console.log(`Created agent: ${agent.id}`);
}

export async function agentsRm(agentId: string, opts: { baseUrl?: string; apiKey?: string }): Promise<void> {
  const cfg = loadConfig(opts);
  await lapRequest(cfg, "DELETE", `/v1/managed_agents/agents/${agentId}`);
  console.log(`Deleted agent: ${agentId}`);
}
