import { describe, expect, it } from "vitest";
import { camel, snake } from "../src/wire.js";

describe("wire", () => {
  it("snake nested", () => {
    expect(snake({ apiKey: "k", repos: [{ startingRef: "main" }] })).toEqual({
      api_key: "k",
      repos: [{ starting_ref: "main" }],
    });
  });

  it("camel nested", () => {
    expect(camel({ session_id: "s", agent_id: "a" })).toEqual({ sessionId: "s", agentId: "a" });
  });

  it("passes scalars", () => {
    expect(camel(42)).toBe(42);
    expect(snake("x")).toBe("x");
    expect(camel(null)).toBeNull();
  });
});
