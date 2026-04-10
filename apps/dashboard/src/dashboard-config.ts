import type { DashboardConfig } from "./dashboard-settings.js";
import type { NamedPaletteId } from "./face.js";

type DashboardVisualRule = Omit<DashboardConfig["visualRules"][number], "themePalette"> & {
  themePalette?: NamedPaletteId;
};

type StrictDashboardConfig = Omit<DashboardConfig, "visualRules"> & {
  visualRules: DashboardVisualRule[];
};

export const dashboardConfig = {
  layout: {
    maxAgentsShown: 12,
    density: "comfortable",
    sortMode: "activity"
  },
  filters: {
    hideDormant: false,
    hideDone: false,
    visibleSources: [],
    visibleEntityKinds: []
  },
  themes: {
    defaultThemeId: "sunrise-arcade",
    presets: [
      {
        id: "sunrise-arcade",
        label: "Sunrise Arcade",
        pageBackground:
          "radial-gradient(circle at 20% 15%, rgba(255, 247, 186, 0.88), transparent 28%), radial-gradient(circle at 80% 10%, rgba(126, 180, 255, 0.5), transparent 24%), linear-gradient(180deg, #fbf7ef 0%, #e9f0ff 48%, #dde8ff 100%)",
        panelBackground: "rgba(255, 255, 255, 0.72)",
        textColor: "#132032",
        mutedTextColor: "rgba(19, 32, 50, 0.68)"
      },
      {
        id: "night-shift",
        label: "Night Shift",
        pageBackground:
          "radial-gradient(circle at 20% 20%, rgba(72, 145, 255, 0.24), transparent 30%), linear-gradient(180deg, #07111f 0%, #0d1b31 46%, #142847 100%)",
        panelBackground: "rgba(11, 19, 34, 0.68)",
        textColor: "#eef4ff",
        mutedTextColor: "rgba(238, 244, 255, 0.7)"
      }
    ]
  },
  visualRules: [
    { source: "codex", entityKind: "worker", faceVariant: "terminal-sprite", themePalette: "mint" },
    { source: "claude", faceVariant: "rounded-bot", themePalette: "rose" },
    { entityKind: "session", faceVariant: "soft-ghost", themePalette: "sky" }
  ],
  ui: {
    showSettingsPanel: true,
    allowViewerThemeOverride: true
  }
} satisfies StrictDashboardConfig;
