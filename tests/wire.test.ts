import { describe, expect, it } from "vitest";
import { camelify, snakeify } from "../src/wire.js";

describe("wire camel/snake", () => {
  it("snakeifies nested objects and arrays", () => {
    const input = {
      apiKey: "k",
      systemPrompt: "p",
      repos: [{ startingRef: "main" }],
    };
    expect(snakeify(input)).toEqual({
      api_key: "k",
      system_prompt: "p",
      repos: [{ starting_ref: "main" }],
    });
  });

  it("camelifies nested objects and arrays", () => {
    const input = {
      session_id: "s",
      git: { branches: [{ pr_url: null, branch: "main" }] },
    };
    expect(camelify(input)).toEqual({
      sessionId: "s",
      git: { branches: [{ prUrl: null, branch: "main" }] },
    });
  });

  it("passes scalars through", () => {
    expect(camelify(42)).toBe(42);
    expect(snakeify("x")).toBe("x");
    expect(camelify(null)).toBe(null);
  });
});
