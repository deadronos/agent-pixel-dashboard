import { describe, expect, it } from "vitest";
import {
  getFaceMood,
  getFaceShell,
  getNamedPalette,
  getProviderPalette,
  getStatusFromTimestamp,
  getStatusLabel,
  isNamedPaletteId,
  resolveLiveStatus,
  namedPaletteIds
} from "./face.js";

describe("getProviderPalette", () => {
  it("returns a stable palette for a provider", () => {
    expect(getProviderPalette("codex")).toEqual(getProviderPalette("codex"));
  });

  it("returns different palettes for different providers", () => {
    expect(getProviderPalette("codex").accent).not.toBe(getProviderPalette("claude").accent);
  });
});

describe("getNamedPalette", () => {
  it("returns a named palette when one is defined", () => {
    expect(getNamedPalette("mint")).toEqual({
      base: "hsl(162 70% 58%)",
      accent: "hsl(181 84% 52%)",
      glow: "hsl(166 94% 78%)",
      shade: "hsl(164 42% 18%)",
      line: "hsl(168 30% 12%)",
      background: "linear-gradient(160deg, hsl(154 68% 94%), hsl(182 72% 84%))"
    });
  });
});

describe("named palette ids", () => {
  it("exposes the source of truth for named palettes", () => {
    expect(namedPaletteIds).toEqual(["mint", "rose", "sky"]);
    expect(isNamedPaletteId("mint")).toBe(true);
    expect(isNamedPaletteId("missing")).toBe(false);
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

describe("getFaceShell", () => {
  it("returns distinct shell layouts for renderer variants", () => {
    expect(getFaceShell("rounded-bot")).not.toEqual(getFaceShell("terminal-sprite"));
    expect(getFaceShell("soft-ghost")).toEqual(
      expect.objectContaining({
        outline: expect.any(Array),
        fill: expect.any(Array)
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

describe("resolveLiveStatus", () => {
  it("preserves terminal statuses during refresh", () => {
    expect(resolveLiveStatus("done", new Date(Date.now() - 10 * 60_000).toISOString())).toBe("done");
    expect(resolveLiveStatus("error", new Date(Date.now() - 10 * 60_000).toISOString())).toBe("error");
  });

  it("recomputes nonterminal statuses from the latest timestamp", () => {
    expect(resolveLiveStatus("idle", new Date().toISOString())).toBe("active");
  });
});
