export function snake(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(snake);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())] = snake(val);
    }
    return out;
  }
  return v;
}

export function camel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camel);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = camel(val);
    }
    return out;
  }
  return v;
}
