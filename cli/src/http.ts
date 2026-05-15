import type { Config } from "./config.js";

export type Method = "GET" | "POST" | "DELETE" | "PATCH";

export async function lapRequest<T>(
  cfg: Config,
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    // Strip HTML bodies — only keep the status code for error matching
    const body = raw.startsWith("<") ? "" : raw.slice(0, 200);
    throw new Error(`${method} ${path} → ${res.status}${body ? " " + body : ""}`.trim());
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return {} as T;
}
