import { describe, expect, it } from "vitest";
import { dashboardConfig } from "./dashboard-config.js";
import { resolveVisualProfile } from "./visual-profile.js";

describe("resolveVisualProfile", () => {
  it("prefers rules matching both source and entityKind", () => {
    const profile = resolveVisualProfile(
      {
        source: "codex",
        entityKind: "worker",
        entityId: "agent-1",
        currentStatus: "active"
      },
      dashboardConfig.themes.presets[0],
      [
        { source: "codex", faceVariant: "rounded-bot" },
        { entityKind: "worker", faceVariant: "soft-ghost" },
        { source: "codex", entityKind: "worker", faceVariant: "terminal-sprite" }
      ]
    );

    expect(profile.faceVariant).toBe("terminal-sprite");
  });

  it("prefers the later matching rule when specificity is tied", () => {
    const profile = resolveVisualProfile(
      {
        source: "codex",
        entityKind: "worker",
        entityId: "agent-1",
        currentStatus: "active"
      },
      dashboardConfig.themes.presets[0],
      [
        { source: "codex", faceVariant: "rounded-bot" },
        { source: "codex", faceVariant: "terminal-sprite" }
      ]
    );

    expect(profile.faceVariant).toBe("terminal-sprite");
  });

  it("uses named theme palettes when a matching rule provides one", () => {
    const profile = resolveVisualProfile(
      {
        source: "codex",
        entityKind: "worker",
        entityId: "agent-2",
        currentStatus: "idle"
      },
      dashboardConfig.themes.presets[0],
      [{ source: "codex", entityKind: "worker", themePalette: "mint" }]
    );

    expect(profile.palette.base).toBe("hsl(162 70% 58%)");
    expect(profile.palette.background).toContain("hsl(154 68% 94%)");
  });

  it("falls back to provider palette for invalid named palette ids", () => {
    const profile = resolveVisualProfile(
      {
        source: "codex",
        entityKind: "worker",
        entityId: "agent-2",
        currentStatus: "idle"
      },
      dashboardConfig.themes.presets[0],
      [{ source: "codex", themePalette: "nope" as never }]
    );

    // Should not throw, should return fallback provider palette
    expect(profile.palette.base).toBeDefined();
  });

  it("uses the current status and theme to derive animation and accent style", () => {
    const profile = resolveVisualProfile(
      {
        source: "unknown",
        entityKind: "worker",
        entityId: "agent-3",
        currentStatus: "dormant"
      },
      dashboardConfig.themes.presets[1],
      []
    );

    expect(profile.palette.accent).toBeDefined();
    expect(profile.faceVariant).toBe("rounded-bot");
    expect(profile.animationMode).toBe("reduced");
    expect(profile.accentStyle).toBe("none");
  });

  it("uses sparkle accent styling for energetic statuses", () => {
    const profile = resolveVisualProfile(
      {
        source: "unknown",
        entityKind: "worker",
        entityId: "agent-4",
        currentStatus: "active"
      },
      dashboardConfig.themes.presets[0],
      []
    );

    expect(profile.animationMode).toBe("full");
    expect(profile.accentStyle).toBe("sparkles");
  });

  it("switches to minimal presentation when the viewer requests it", () => {
    const resolver = resolveVisualProfile as unknown as (
      entity: Parameters<typeof resolveVisualProfile>[0],
      theme: Parameters<typeof resolveVisualProfile>[1],
      rules: Parameters<typeof resolveVisualProfile>[2],
      artStyleMode: "config" | "playful" | "minimal"
    ) => ReturnType<typeof resolveVisualProfile>;

    const profile = resolver(
      {
        source: "codex",
        entityKind: "session",
        entityId: "agent-5",
        currentStatus: "active"
      },
      dashboardConfig.themes.presets[0],
      [],
      "minimal"
    );

    expect(profile.accentStyle).toBe("none");
    expect(profile.animationMode).toBe("reduced");
  });

  it("uses playful accents for worker entities", () => {
    const resolver = resolveVisualProfile as unknown as (
      entity: Parameters<typeof resolveVisualProfile>[0],
      theme: Parameters<typeof resolveVisualProfile>[1],
      rules: Parameters<typeof resolveVisualProfile>[2],
      artStyleMode: "config" | "playful" | "minimal"
    ) => ReturnType<typeof resolveVisualProfile>;

    const profile = resolver(
      {
        source: "codex",
        entityKind: "worker",
        entityId: "agent-6",
        currentStatus: "active"
      },
      dashboardConfig.themes.presets[0],
      [],
      "playful"
    );

    expect(profile.accentStyle).toBe("antenna");
    expect(profile.animationMode).toBe("full");
  });
});
