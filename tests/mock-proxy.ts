import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

interface SessionRow {
  id: string;
  agent_id: string;
  status: "ready" | "creating" | "failed";
  sandbox_url?: string;
  messages: { text: string; reply: Record<string, unknown> }[];
  events: Record<string, unknown>[];
}

export interface MockOptions {
  apiKey?: string;
  /** Drop the SSE socket after this many events on the next /events call (single-shot). */
  dropAfter?: number;
  /** If set, /sessions/:id/events will use these events instead of the session's queue. */
  sessionEvents?: Record<string, unknown>[];
}

export class MockProxy {
  private server: Server;
  private port = 0;
  agents = new Map<string, { id: string; name: string | null; model: string; template_id: string }>();
  sessions = new Map<string, SessionRow>();
  /** Raw body of the most recent POST /v1/managed_agents/agents. Tests assert wire shape against this. */
  lastCreateAgentBody: Record<string, unknown> | null = null;
  opts: MockOptions;

  constructor(opts: MockOptions = {}) {
    this.opts = opts;
    this.server = createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as { port: number }).port;
    return `http://127.0.0.1:${this.port}`;
  }

  stop(): Promise<void> {
    this.server.closeAllConnections?.();
    return new Promise((r) => this.server.close(() => r()));
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }

  private body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const t = Buffer.concat(chunks).toString();
        resolve(t ? JSON.parse(t) : {});
      });
      req.on("error", reject);
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    if (this.opts.apiKey && req.headers.authorization !== `Bearer ${this.opts.apiKey}`) {
      return this.json(res, 401, { error: "unauthorized" });
    }
    const url = new URL(req.url ?? "/", `http://x`);
    const p = url.pathname;
    const m = req.method;

    if (m === "POST" && p === "/v1/managed_agents/agents") {
      const b = await this.body(req);
      this.lastCreateAgentBody = b;
      const id = `agent_${randomUUID()}`;
      const row = {
        id,
        name: (b.name as string | undefined) ?? null,
        model: String(b.model ?? ""),
        template_id: String(b.template_id ?? ""),
      };
      this.agents.set(id, row);
      return this.json(res, 200, row);
    }

    let mt = p.match(/^\/v1\/managed_agents\/agents\/([^/]+)\/session$/);
    if (mt && m === "POST") {
      const agentId = mt[1]!;
      if (!this.agents.has(agentId)) return this.json(res, 404, {});
      const id = `session_${randomUUID()}`;
      const row: SessionRow = {
        id,
        agent_id: agentId,
        status: "ready",
        sandbox_url: `http://sandbox.test/${id}`,
        messages: [],
        events: [],
      };
      this.sessions.set(id, row);
      return this.json(res, 200, {
        id,
        agent_id: agentId,
        status: row.status,
        sandbox_url: row.sandbox_url,
      });
    }

    mt = p.match(/^\/v1\/managed_agents\/sessions\/([^/]+)$/);
    if (mt && m === "GET") {
      const s = this.sessions.get(mt[1]!);
      return s
        ? this.json(res, 200, {
            id: s.id,
            agent_id: s.agent_id,
            status: s.status,
            sandbox_url: s.sandbox_url,
          })
        : this.json(res, 404, {});
    }

    mt = p.match(/^\/v1\/managed_agents\/sessions\/([^/]+)\/message$/);
    if (mt && m === "POST") {
      const s = this.sessions.get(mt[1]!);
      if (!s) return this.json(res, 404, {});
      const b = await this.body(req);
      const reply = { text: `echo: ${String(b.text ?? "")}` };
      s.messages.push({ text: String(b.text ?? ""), reply });
      return this.json(res, 200, reply);
    }

    mt = p.match(/^\/v1\/managed_agents\/sessions\/([^/]+)\/events$/);
    if (mt && m === "GET") {
      const s = this.sessions.get(mt[1]!);
      if (!s) return this.json(res, 404, {});
      const events = this.opts.sessionEvents ?? [
        { type: "session.started", session_id: s.id },
        { type: "message.delta", text: "hello " },
        { type: "message.delta", text: "world" },
        { type: "message.completed", text: "hello world" },
      ];

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders?.();

      const drop = this.opts.dropAfter ?? 0;
      let n = 0;
      for (const ev of events) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
        n++;
        if (drop > 0 && n >= drop) {
          this.opts.dropAfter = 0;
          res.socket?.destroy();
          return;
        }
      }
      return res.end();
    }

    this.json(res, 404, { error: "no_route", path: p, method: m });
  }
}
