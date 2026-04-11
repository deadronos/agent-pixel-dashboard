export interface ThemePreset {
  id: string;
  label: string;
  pageBackground: string;
  panelBackground: string;
  textColor: string;
  mutedTextColor: string;
}

export interface VisualRule {
  source?: string;
  entityKind?: string;
  themePalette?: string;
  faceVariant?: "rounded-bot" | "square-bot" | "soft-ghost" | "terminal-sprite";
}

export interface DashboardConfig {
  layout: {
    maxAgentsShown: number;
    density: "compact" | "comfortable";
    sortMode: "activity" | "recent";
  };
  filters: {
    hideDormant: boolean;
    hideDone: boolean;
    visibleSources: string[];
    visibleEntityKinds: string[];
  };
  themes: {
    defaultThemeId: string;
    presets: ThemePreset[];
  };
  visualRules: VisualRule[];
  ui: {
    showSettingsPanel: boolean;
    allowViewerThemeOverride: boolean;
  };
}

export interface ViewerPreferences {
  maxAgentsShown?: number;
  density?: "compact" | "comfortable";
  sortMode?: "activity" | "recent";
  hideDormant?: boolean;
  hideDone?: boolean;
  visibleSources?: string[];
  visibleEntityKinds?: string[];
  themeId?: string;
  artStyleMode?: "config" | "playful" | "minimal";
}

export interface ResolvedSettings {
  layout: {
    maxAgentsShown: number;
    density: "compact" | "comfortable";
    sortMode: "activity" | "recent";
  };
  filters: {
    hideDormant: boolean;
    hideDone: boolean;
    visibleSources: string[];
    visibleEntityKinds: string[];
    sourceFilterActive: boolean;
    entityKindFilterActive: boolean;
  };
  theme: ThemePreset;
  visualRules: VisualRule[];
  ui: DashboardConfig["ui"];
  artStyleMode: "config" | "playful" | "minimal";
}

export function createResolvedSettings(config: DashboardConfig, viewer: ViewerPreferences): ResolvedSettings {
  const theme =
    config.themes.presets.find(
      (preset) => preset.id === (config.ui.allowViewerThemeOverride ? viewer.themeId : undefined)
    ) ??
    config.themes.presets.find((preset) => preset.id === config.themes.defaultThemeId) ??
    config.themes.presets[0];

  if (!theme) {
    throw new Error("No theme preset could be resolved");
  }

  return {
    layout: {
      maxAgentsShown: viewer.maxAgentsShown ?? config.layout.maxAgentsShown,
      density: viewer.density ?? config.layout.density,
      sortMode: viewer.sortMode ?? config.layout.sortMode
    },
    filters: {
      hideDormant: viewer.hideDormant ?? config.filters.hideDormant,
      hideDone: viewer.hideDone ?? config.filters.hideDone,
      visibleSources: viewer.visibleSources ?? config.filters.visibleSources,
      visibleEntityKinds: viewer.visibleEntityKinds ?? config.filters.visibleEntityKinds,
      sourceFilterActive: viewer.visibleSources !== undefined || config.filters.visibleSources.length > 0,
      entityKindFilterActive:
        viewer.visibleEntityKinds !== undefined || config.filters.visibleEntityKinds.length > 0
    },
    theme,
    visualRules: config.visualRules,
    ui: config.ui,
    artStyleMode: viewer.artStyleMode ?? "playful"
  };
}
