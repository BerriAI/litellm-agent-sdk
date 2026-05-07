import type { ClientOptions } from "../types.js";
import { camelify, snakeify } from "../wire.js";

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 200;

export class LiteLLMAgentSDKError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "LiteLLMAgentSDKError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export class HttpClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) throw new Error("apiKey is required");
    if (!opts.baseUrl) throw new Error("baseUrl is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const u = new URL(this.baseUrl + (path.startsWith("/") ? path : "/" + path));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const method = opts.method ?? "GET";
    const init: RequestInit = {
      method,
      headers: this.authHeaders(),
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(snakeify(opts.body));
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.fetchImpl(url, init);
        if (res.ok) {
          if (res.status === 204) return undefined as T;
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            return camelify(data) as T;
          }
          return (await res.text()) as unknown as T;
        }
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // not json
        }
        if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new LiteLLMAgentSDKError(
          `HTTP ${res.status} ${method} ${opts.path}`,
          res.status,
          body
        );
      } catch (e) {
        if (e instanceof LiteLLMAgentSDKError) throw e;
        if (attempt === MAX_RETRIES) throw e;
        lastErr = e;
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
    throw lastErr ?? new Error("request failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
