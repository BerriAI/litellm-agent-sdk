import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

interface MockAgent {
  id: string;
  name: string;
  model: { id: string };
  system_prompt: string;
  tools?: unknown[];
  created_at: string;
}

interface MockSession {
  id: string;
  agent_id: string;
  status: string;
  sandbox_url?: string;
  repos?: unknown[];
  created_at: string;
  terminated: boolean;
}

interface MockRun {
  id: string;
  session_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result: string | null;
  created_at: string;
  events: { seq: number; type: string; data: unknown; ts: string }[];
  followups: string[];
}

export interface MockProxyOptions {
  apiKey?: string;
  // Drop the SSE socket after this many events on the next stream() call (then auto-reset to 0).
  dropAfterEvents?: number;
  // Whether send() should yield events automatically (default true).
  autoEmit?: boolean;
}

export class MockProxy {
  private server: Server;
  private port = 0;
  agents = new Map<string, MockAgent>();
  sessions = new Map<string, MockSession>();
  runs = new Map<string, MockRun>();
  options: MockProxyOptions;

  constructor(opts: MockProxyOptions = {}) {
    this.options = { autoEmit: true, ...opts };
    this.server = createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
        }
        resolve(this.baseUrl);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.closeAllConnections?.();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!text) return resolve({});
        try {
          resolve(JSON.parse(text));
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }

  private auth(req: IncomingMessage): boolean {
    if (!this.options.apiKey) return true;
    const h = req.headers["authorization"];
    return h === `Bearer ${this.options.apiKey}`;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.auth(req)) {
      this.send(res, 401, { error: "unauthorized" });
      return;
    }

    const url = new URL(req.url ?? "/", this.baseUrl);
    const method = req.method ?? "GET";
    const path = url.pathname;

    try {
      // POST /v1/agents
      if (method === "POST" && path === "/v1/agents") {
        const body = await this.readJson(req);
        const id = `agent_${randomUUID()}`;
        const agent: MockAgent = {
          id,
          name: String(body.name ?? "agent"),
          model: (body.model as { id: string }) ?? { id: "noop" },
          system_prompt: String(body.system_prompt ?? ""),
          tools: body.tools as unknown[] | undefined,
          created_at: new Date().toISOString(),
        };
        this.agents.set(id, agent);
        return this.send(res, 200, agent);
      }

      // GET /v1/agents/:id
      let m = path.match(/^\/v1\/agents\/([^/]+)$/);
      if (m && method === "GET") {
        const a = this.agents.get(m[1]!);
        if (!a) return this.send(res, 404, { error: "not_found" });
        return this.send(res, 200, a);
      }

      // POST /v1/agents/:id/sessions
      m = path.match(/^\/v1\/agents\/([^/]+)\/sessions$/);
      if (m && method === "POST") {
        const agentId = m[1]!;
        if (!this.agents.has(agentId)) return this.send(res, 404, { error: "not_found" });
        const body = await this.readJson(req);
        const id = `session_${randomUUID()}`;
        const session: MockSession = {
          id,
          agent_id: agentId,
          status: "ready",
          sandbox_url: `https://sandbox.example.com/${id}`,
          repos: body.repos as unknown[] | undefined,
          created_at: new Date().toISOString(),
          terminated: false,
        };
        this.sessions.set(id, session);
        return this.send(res, 200, session);
      }

      // GET /v1/sessions/:id
      m = path.match(/^\/v1\/sessions\/([^/]+)$/);
      if (m && method === "GET") {
        const s = this.sessions.get(m[1]!);
        if (!s) return this.send(res, 404, { error: "not_found" });
        return this.send(res, 200, s);
      }

      // DELETE /v1/sessions/:id
      if (m && method === "DELETE") {
        const s = this.sessions.get(m[1]!);
        if (!s) return this.send(res, 404, { error: "not_found" });
        s.status = "terminated";
        s.terminated = true;
        res.statusCode = 204;
        res.end();
        return;
      }

      // POST /v1/sessions/:id/prompt_async
      m = path.match(/^\/v1\/sessions\/([^/]+)\/prompt_async$/);
      if (m && method === "POST") {
        const sessionId = m[1]!;
        const session = this.sessions.get(sessionId);
        if (!session) return this.send(res, 404, { error: "not_found" });
        const body = await this.readJson(req);

        if (body.followup) {
          const active = [...this.runs.values()]
            .reverse()
            .find((r) => r.session_id === sessionId && r.status === "running");
          if (!active) return this.send(res, 409, { error: "no_active_run" });
          active.followups.push(String(body.text ?? ""));
          active.events.push({
            seq: active.events.length,
            type: "message.followup",
            data: { text: body.text },
            ts: new Date().toISOString(),
          });
          res.statusCode = 204;
          res.end();
          return;
        }

        const busy = [...this.runs.values()].some(
          (r) => r.session_id === sessionId && r.status === "running"
        );
        if (busy) return this.send(res, 409, { error: "session_busy" });

        const id = `run_${randomUUID()}`;
        const run: MockRun = {
          id,
          session_id: sessionId,
          status: "running",
          result: null,
          created_at: new Date().toISOString(),
          events: [],
          followups: [],
        };
        if (this.options.autoEmit !== false) {
          run.events.push(
            { seq: 0, type: "run.started", data: { run_id: id }, ts: new Date().toISOString() },
            { seq: 1, type: "message.delta", data: { text: "hello " }, ts: new Date().toISOString() },
            { seq: 2, type: "message.delta", data: { text: "world" }, ts: new Date().toISOString() },
            { seq: 3, type: "run.completed", data: { result: "hello world" }, ts: new Date().toISOString() },
          );
          run.status = "completed";
          run.result = "hello world";
        }
        this.runs.set(id, run);
        return this.send(res, 200, run);
      }

      // GET /v1/runs/:id
      m = path.match(/^\/v1\/runs\/([^/]+)$/);
      if (m && method === "GET") {
        const r = this.runs.get(m[1]!);
        if (!r) return this.send(res, 404, { error: "not_found" });
        return this.send(res, 200, r);
      }

      // GET /v1/runs/:id/events  (SSE)
      m = path.match(/^\/v1\/runs\/([^/]+)\/events$/);
      if (m && method === "GET") {
        const run = this.runs.get(m[1]!);
        if (!run) return this.send(res, 404, { error: "not_found" });
        const startingSeq = Number(url.searchParams.get("starting_seq") ?? 0);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const dropAfter = this.options.dropAfterEvents ?? 0;
        // Snapshot now, then optionally drop after N.
        const events = run.events.filter((e) => e.seq >= startingSeq);
        let emitted = 0;
        for (const ev of events) {
          res.write(`event: event\ndata: ${JSON.stringify(ev)}\n\n`);
          emitted++;
          if (dropAfter > 0 && emitted >= dropAfter) {
            // Force-close the socket without finishing.
            this.options.dropAfterEvents = 0; // only drop once
            res.socket?.destroy();
            return;
          }
        }
        // If terminal, close cleanly. Otherwise keep open briefly then close.
        res.end();
        return;
      }

      // POST /v1/runs/:id/cancel
      m = path.match(/^\/v1\/runs\/([^/]+)\/cancel$/);
      if (m && method === "POST") {
        const r = this.runs.get(m[1]!);
        if (!r) return this.send(res, 404, { error: "not_found" });
        r.status = "cancelled";
        res.statusCode = 204;
        res.end();
        return;
      }

      this.send(res, 404, { error: "no_route", path, method });
    } catch (err) {
      this.send(res, 500, { error: String(err) });
    }
  }
}
