import { loadConfig } from "../config.js";
import { lapRequest } from "../http.js";
import { repl } from "./run.js";

interface SessionRow {
  id: string;
  agent_id?: string;
  agentId?: string;
  status: string;
  created_at?: string;
  createdAt?: string;
}

type SessionsListResponse = SessionRow[] | { sessions?: SessionRow[]; data?: SessionRow[] };

function ageStr(row: SessionRow): string {
  const ts = row.created_at ?? row.createdAt;
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function agentId(row: SessionRow): string {
  return row.agent_id ?? row.agentId ?? "—";
}

export async function sessionsList(opts: { baseUrl?: string; apiKey?: string }): Promise<void> {
  const cfg = loadConfig(opts);
  const res = await lapRequest<SessionsListResponse>(cfg, "GET", "/v1/managed_agents/sessions");
  const sessions: SessionRow[] = Array.isArray(res)
    ? res
    : (res as { sessions?: SessionRow[]; data?: SessionRow[] }).sessions
      ?? (res as { sessions?: SessionRow[]; data?: SessionRow[] }).data
      ?? [];

  if (!Array.isArray(sessions) || sessions.length === 0) {
    console.log("No sessions.");
    return;
  }

  const idW = Math.max(10, ...sessions.map((s) => s.id.length));
  const agentW = Math.max(5, ...sessions.map((s) => agentId(s).length));
  const statusW = Math.max(6, ...sessions.map((s) => s.status.length));

  const row = (id: string, agent: string, status: string, age: string) =>
    `${id.padEnd(idW)}  ${agent.padEnd(agentW)}  ${status.padEnd(statusW)}  ${age}`;

  console.log(row("SESSION ID", "AGENT", "STATUS", "AGE"));
  console.log(row("-".repeat(idW), "-".repeat(agentW), "-".repeat(statusW), "---"));
  for (const s of sessions) {
    console.log(row(s.id, agentId(s), s.status, ageStr(s)));
  }
}

export async function sessionsAttach(
  sessionId: string,
  opts: { baseUrl?: string; apiKey?: string },
): Promise<void> {
  const cfg = loadConfig(opts);
  const session = await lapRequest<SessionRow>(cfg, "GET", `/v1/managed_agents/sessions/${sessionId}`);
  console.log(`Attached to session ${session.id} (agent: ${agentId(session)}, status: ${session.status})`);
  await repl(cfg, session.id);
}

export async function sessionsRm(
  sessionId: string,
  opts: { baseUrl?: string; apiKey?: string },
): Promise<void> {
  const cfg = loadConfig(opts);
  await lapRequest(cfg, "DELETE", `/v1/managed_agents/sessions/${sessionId}`);
  console.log(`Deleted session: ${sessionId}`);
}
