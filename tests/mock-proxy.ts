import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

interface Run {
  id: string;
  session_id: string;
  status: "running" | "completed";
  events: { seq: number; type: string; data: unknown }[];
  followups: string[];
}

export interface MockOptions {
  apiKey?: string;
  // Drop the SSE socket after this many events on the next /events call (single-shot).
  dropAfter?: number;
  // If true, send() leaves the run "running" with no events (so followups can land).
  noAutoEmit?: boolean;
}

export class MockProxy {
  private server: Server;
  private port = 0;
  agents = new Map<string, { id: string; name: string }>();
  sessions = new Map<string, { id: string; agent_id: string }>();
  runs = new Map<string, Run>();
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

    if (m === "POST" && p === "/v1/agents") {
      const b = await this.body(req);
      const id = `agent_${randomUUID()}`;
      this.agents.set(id, { id, name: String(b.name ?? "") });
      return this.json(res, 200, { id, name: b.name });
    }

    let mt = p.match(/^\/v1\/agents\/([^/]+)\/sessions$/);
    if (mt && m === "POST") {
      const agentId = mt[1]!;
      if (!this.agents.has(agentId)) return this.json(res, 404, {});
      const id = `session_${randomUUID()}`;
      this.sessions.set(id, { id, agent_id: agentId });
      return this.json(res, 200, { id, agent_id: agentId });
    }

    mt = p.match(/^\/v1\/sessions\/([^/]+)$/);
    if (mt && m === "GET") {
      const s = this.sessions.get(mt[1]!);
      return s ? this.json(res, 200, s) : this.json(res, 404, {});
    }

    mt = p.match(/^\/v1\/sessions\/([^/]+)\/prompt_async$/);
    if (mt && m === "POST") {
      const sid = mt[1]!;
      if (!this.sessions.has(sid)) return this.json(res, 404, {});
      const b = await this.body(req);

      if (b.followup) {
        const active = [...this.runs.values()].reverse().find((r) => r.session_id === sid && r.status === "running");
        if (!active) return this.json(res, 409, { error: "no_active_run" });
        active.followups.push(String(b.text ?? ""));
        res.statusCode = 204;
        return res.end();
      }

      if ([...this.runs.values()].some((r) => r.session_id === sid && r.status === "running")) {
        return this.json(res, 409, { error: "busy" });
      }

      const id = `run_${randomUUID()}`;
      const run: Run = { id, session_id: sid, status: "running", events: [], followups: [] };
      if (!this.opts.noAutoEmit) {
        run.events = [
          { seq: 0, type: "run.started", data: {} },
          { seq: 1, type: "message.delta", data: { text: "hello " } },
          { seq: 2, type: "message.delta", data: { text: "world" } },
          { seq: 3, type: "run.completed", data: { result: "hello world" } },
        ];
        run.status = "completed";
      }
      this.runs.set(id, run);
      return this.json(res, 200, { id, session_id: sid });
    }

    mt = p.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (mt && m === "GET") {
      const run = this.runs.get(mt[1]!);
      if (!run) return this.json(res, 404, {});
      const start = Number(url.searchParams.get("starting_seq") ?? 0);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders?.();

      const drop = this.opts.dropAfter ?? 0;
      let n = 0;
      for (const ev of run.events.filter((e) => e.seq >= start)) {
        res.write(`event: event\ndata: ${JSON.stringify(ev)}\n\n`);
        n++;
        if (drop > 0 && n >= drop) {
          this.opts.dropAfter = 0; // single-shot
          res.socket?.destroy();
          return;
        }
      }
      return res.end();
    }

    this.json(res, 404, { error: "no_route", path: p, method: m });
  }
}
