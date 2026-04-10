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

  it("rejects invalid named palette ids instead of falling back", () => {
    expect(() =>
      resolveVisualProfile(
        {
          source: "codex",
          entityKind: "worker",
          entityId: "agent-2",
          currentStatus: "idle"
        },
        dashboardConfig.themes.presets[0],
        [{ source: "codex", themePalette: "nope" as never }]
      )
    ).toThrow("Unknown palette id: nope");
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
});
