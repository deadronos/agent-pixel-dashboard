import { describe, expect, it } from "vitest";
import { getProviderPalette, getFaceMood, getStatusFromTimestamp, getStatusLabel } from "./face.js";

describe("getProviderPalette", () => {
  it("returns a stable palette for a provider", () => {
    expect(getProviderPalette("codex")).toEqual(getProviderPalette("codex"));
  });

  it("returns different palettes for different providers", () => {
    expect(getProviderPalette("codex").accent).not.toBe(getProviderPalette("claude").accent);
  });
});

describe("getFaceMood", () => {
  it("maps active to an energetic mood", () => {
    expect(getFaceMood("active")).toEqual(
      expect.objectContaining({
        eyes: "wide",
        mouth: "smile",
        animation: "bounce"
      })
    );
  });

  it("maps sleepy to a sleepy mood", () => {
    expect(getFaceMood("sleepy")).toEqual(
      expect.objectContaining({
        eyes: "sleepy",
        mouth: "flat",
        animation: "drift"
      })
    );
  });
});

describe("getStatusLabel", () => {
  it("returns readable status labels", () => {
    expect(getStatusLabel("idle")).toBe("Idle");
    expect(getStatusLabel("sleepy")).toBe("Sleepy");
  });
});

describe("getStatusFromTimestamp", () => {
  it("marks recent timestamps as active", () => {
    expect(getStatusFromTimestamp(new Date().toISOString())).toBe("active");
  });

  it("marks older timestamps as dormant", () => {
    expect(getStatusFromTimestamp(new Date(Date.now() - 10 * 60_000).toISOString())).toBe("dormant");
  });
});
