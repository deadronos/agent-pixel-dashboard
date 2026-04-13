import { describe, expect, it } from 'vitest';

import { dashboardConfig } from './dashboard-config.js';
import { createResolvedSettings, type DashboardConfig } from './dashboard-settings.js';

describe('createResolvedSettings', () => {
  it('prefers viewer overrides over shared config', () => {
    const resolved = createResolvedSettings(dashboardConfig, {
      maxAgentsShown: 6,
      themeId: 'night-shift',
      hideDormant: true,
    });

    expect(resolved.layout.maxAgentsShown).toBe(6);
    expect(resolved.theme.id).toBe('night-shift');
    expect(resolved.filters.hideDormant).toBe(true);
  });

  it('falls back to shared defaults when viewer overrides are absent', () => {
    const resolved = createResolvedSettings(dashboardConfig, {});

    expect(resolved.layout.maxAgentsShown).toBe(dashboardConfig.layout.maxAgentsShown);
    expect(resolved.theme.id).toBe(dashboardConfig.themes.defaultThemeId);
    expect(resolved.artStyleMode).toBe('playful');
  });

  it('drops invalid viewer theme ids', () => {
    const resolved = createResolvedSettings(dashboardConfig, {
      themeId: 'missing-theme',
    });

    expect(resolved.theme.id).toBe(dashboardConfig.themes.defaultThemeId);
  });

  it('ignores persisted theme overrides when shared config locks theme changes', () => {
    const resolved = createResolvedSettings(
      {
        ...dashboardConfig,
        ui: {
          ...dashboardConfig.ui,
          allowViewerThemeOverride: false,
        },
      },
      {
        themeId: 'night-shift',
      }
    );

    expect(resolved.theme.id).toBe(dashboardConfig.themes.defaultThemeId);
  });

  it('throws when no theme preset can be resolved', () => {
    const config: DashboardConfig = {
      ...dashboardConfig,
      themes: {
        defaultThemeId: 'missing-theme',
        presets: [],
      },
    };

    expect(() => createResolvedSettings(config, {})).toThrow('No theme preset could be resolved');
  });
});
