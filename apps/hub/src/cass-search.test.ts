import { describe, expect, it } from "vitest";

import { sanitizeCassQuery } from "./cass-search.js";

describe("sanitizeCassQuery", () => {
  it("trims and preserves ordinary search syntax", () => {
    expect(sanitizeCassQuery("  model:codex tool call  ")).toBe("model:codex tool call");
  });

  it("rejects control characters and oversized queries before invoking cass", () => {
    expect(() => sanitizeCassQuery("hello\u0000world")).toThrow(/control characters/);
    expect(() => sanitizeCassQuery("x".repeat(257))).toThrow(/too long/);
  });
});
