import { camel, snake } from "./wire.js";

export interface Client {
  apiKey: string;
  baseUrl: string;
  fetch: typeof fetch;
}

export function client(opts: { apiKey: string; baseUrl: string; fetch?: typeof fetch }): Client {
  if (!opts.apiKey) throw new Error("apiKey required");
  if (!opts.baseUrl) throw new Error("baseUrl required");
  return {
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl.replace(/\/+$/, ""),
    fetch: opts.fetch ?? globalThis.fetch.bind(globalThis),
  };
}

export async function request<T>(
  c: Client,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(snake(body));

  for (let attempt = 0; ; attempt++) {
    const res = await c.fetch(c.baseUrl + path, init);
    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return camel(await res.json()) as T;
    }
    const text = await res.text().catch(() => "");
    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
      await sleep(200 * 2 ** attempt);
      continue;
    }
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
