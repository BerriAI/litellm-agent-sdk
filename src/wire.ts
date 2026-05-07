function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function snakeify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeify);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[toSnake(k)] = snakeify(v);
    }
    return out;
  }
  return value;
}

export function camelify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelify);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[toCamel(k)] = camelify(v);
    }
    return out;
  }
  return value;
}
