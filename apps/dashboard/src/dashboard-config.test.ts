import { describe, expect, it } from "vitest";

import { dashboardConfig } from "./dashboard-config.js";

describe("dashboardConfig", () => {
  it("has the expected default layout configuration", () => {
    expect(dashboardConfig.layout).toEqual({
      maxAgentsShown: 12,
      density: "comfortable",
      sortMode: "activity"
    });
  });

  it("has the expected default filter configuration", () => {
    expect(dashboardConfig.filters).toEqual({
      hideDormant: false,
      hideDone: false,
      visibleSources: [],
      visibleEntityKinds: []
    });
  });

  it("has valid default themes", () => {
    expect(dashboardConfig.themes.defaultThemeId).toBe("sunrise-arcade");
    expect(dashboardConfig.themes.presets.length).toBeGreaterThan(0);

    // Check that the default theme id is actually in the presets
    const defaultPreset = dashboardConfig.themes.presets.find(
      (preset) => preset.id === dashboardConfig.themes.defaultThemeId
    );
    expect(defaultPreset).toBeDefined();

    // Check properties of a preset
    expect(dashboardConfig.themes.presets[0]).toHaveProperty("id");
    expect(dashboardConfig.themes.presets[0]).toHaveProperty("label");
    expect(dashboardConfig.themes.presets[0]).toHaveProperty("pageBackground");
  });

  it("has a default set of visual rules", () => {
    expect(Array.isArray(dashboardConfig.visualRules)).toBe(true);
    expect(dashboardConfig.visualRules.length).toBeGreaterThan(0);
  });

  it("has the expected ui configuration", () => {
    expect(dashboardConfig.ui).toEqual({
      showSettingsPanel: true,
      allowViewerThemeOverride: true
    });
  });
});
