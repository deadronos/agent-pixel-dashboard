# Dashboard Configurability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared dashboard defaults plus per-viewer runtime overrides for layout, filtering, themes, and agent visual profiles.

**Architecture:** Introduce a typed settings pipeline that resolves built-in defaults, repo-owned shared config, and browser-stored viewer overrides into one normalized runtime object. Route dashboard filtering, sorting, layout, theming, and card rendering through that resolved settings layer so the UI stays configurable without adding a backend service.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, CSS custom properties, `localStorage`

---

## File Structure

### New files

- `apps/dashboard/src/dashboard-config.ts`
  Owns the repo-checked-in shared config object, theme presets, and visual rules.
- `apps/dashboard/src/dashboard-settings.ts`
  Owns settings types, built-in defaults, config merge logic, and viewer override normalization.
- `apps/dashboard/src/dashboard-settings.test.ts`
  Verifies precedence and validation behavior for resolved settings.
- `apps/dashboard/src/dashboard-view.ts`
  Owns pure helpers for filtering, sorting, slicing, and grid layout.
- `apps/dashboard/src/dashboard-view.test.ts`
  Verifies `maxAgentsShown`, filtering, sorting, and column calculation behavior.
- `apps/dashboard/src/viewer-preferences.ts`
  Owns `localStorage` read/write/reset helpers for personal overrides.
- `apps/dashboard/src/viewer-preferences.test.ts`
  Verifies personal overrides persist, reload, and reset correctly.
- `apps/dashboard/src/visual-profile.ts`
  Resolves theme tokens and per-entity visual profiles from `source`, `entityKind`, and status.
- `apps/dashboard/src/visual-profile.test.ts`
  Verifies visual rule specificity and fallback behavior.
- `apps/dashboard/src/SettingsPanel.tsx`
  Renders the compact settings UI for local overrides.

### Modified files

- `apps/dashboard/src/App.tsx`
  Uses resolved settings, applies filtering/layout helpers, and wires the settings panel.
- `apps/dashboard/src/AgentFaceCard.tsx`
  Consumes a resolved visual profile instead of deriving palette directly from `source`.
- `apps/dashboard/src/face.ts`
  Keeps status/mood helpers and exports reusable palette helpers for the visual-profile layer.
- `apps/dashboard/src/face.test.ts`
  Updates palette tests to match the new helper surface.
- `apps/dashboard/src/styles.css`
  Replaces hard-coded page/card tokens with theme CSS variables and adds settings panel styles.

## Task 1: Create The Shared Config And Settings Resolver

**Files:**

- Create: `apps/dashboard/src/dashboard-config.ts`
- Create: `apps/dashboard/src/dashboard-settings.ts`
- Create: `apps/dashboard/src/dashboard-settings.test.ts`

- [ ] **Step 1: Write the failing settings-resolution tests**

```ts
import { describe, expect, it } from 'vitest';
import { dashboardConfig } from './dashboard-config.js';
import { createResolvedSettings } from './dashboard-settings.js';

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
  });

  it('drops invalid viewer theme ids', () => {
    const resolved = createResolvedSettings(dashboardConfig, {
      themeId: 'missing-theme',
    });

    expect(resolved.theme.id).toBe(dashboardConfig.themes.defaultThemeId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-settings.test.ts`

Expected: FAIL with module resolution errors for `dashboard-config.ts` and `dashboard-settings.ts`.

- [ ] **Step 3: Write the minimal shared config and resolver implementation**

```ts
// apps/dashboard/src/dashboard-config.ts
import type { DashboardConfig } from './dashboard-settings.js';

export const dashboardConfig: DashboardConfig = {
  layout: {
    maxAgentsShown: 12,
    density: 'comfortable',
    sortMode: 'activity',
  },
  filters: {
    hideDormant: false,
    hideDone: false,
    visibleSources: [],
    visibleEntityKinds: [],
  },
  themes: {
    defaultThemeId: 'sunrise-arcade',
    presets: [
      {
        id: 'sunrise-arcade',
        label: 'Sunrise Arcade',
        pageBackground:
          'radial-gradient(circle at 20% 15%, rgba(255, 247, 186, 0.88), transparent 28%), radial-gradient(circle at 80% 10%, rgba(126, 180, 255, 0.5), transparent 24%), linear-gradient(180deg, #fbf7ef 0%, #e9f0ff 48%, #dde8ff 100%)',
        panelBackground: 'rgba(255, 255, 255, 0.72)',
        textColor: '#132032',
        mutedTextColor: 'rgba(19, 32, 50, 0.68)',
      },
      {
        id: 'night-shift',
        label: 'Night Shift',
        pageBackground:
          'radial-gradient(circle at 20% 20%, rgba(72, 145, 255, 0.24), transparent 30%), linear-gradient(180deg, #07111f 0%, #0d1b31 46%, #142847 100%)',
        panelBackground: 'rgba(11, 19, 34, 0.68)',
        textColor: '#eef4ff',
        mutedTextColor: 'rgba(238, 244, 255, 0.7)',
      },
    ],
  },
  visualRules: [],
  ui: {
    showSettingsPanel: true,
    allowViewerThemeOverride: true,
  },
};
```

```ts
// apps/dashboard/src/dashboard-settings.ts
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
  faceVariant?: 'rounded-bot' | 'square-bot' | 'soft-ghost' | 'terminal-sprite';
}

export interface DashboardConfig {
  layout: {
    maxAgentsShown: number;
    density: 'compact' | 'comfortable';
    sortMode: 'activity' | 'recent';
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
  density?: 'compact' | 'comfortable';
  sortMode?: 'activity' | 'recent';
  hideDormant?: boolean;
  hideDone?: boolean;
  visibleSources?: string[];
  visibleEntityKinds?: string[];
  themeId?: string;
  artStyleMode?: 'config' | 'playful' | 'minimal';
}

export function createResolvedSettings(config: DashboardConfig, viewer: ViewerPreferences) {
  const theme =
    config.themes.presets.find(preset => preset.id === viewer.themeId) ??
    config.themes.presets.find(preset => preset.id === config.themes.defaultThemeId) ??
    config.themes.presets[0];

  return {
    layout: {
      maxAgentsShown: viewer.maxAgentsShown ?? config.layout.maxAgentsShown,
      density: viewer.density ?? config.layout.density,
      sortMode: viewer.sortMode ?? config.layout.sortMode,
    },
    filters: {
      hideDormant: viewer.hideDormant ?? config.filters.hideDormant,
      hideDone: viewer.hideDone ?? config.filters.hideDone,
      visibleSources: viewer.visibleSources ?? config.filters.visibleSources,
      visibleEntityKinds: viewer.visibleEntityKinds ?? config.filters.visibleEntityKinds,
    },
    theme,
    visualRules: config.visualRules,
    ui: config.ui,
    artStyleMode: viewer.artStyleMode ?? 'config',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-settings.test.ts`

Expected: PASS with 3 passing tests in `dashboard-settings.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/dashboard-config.ts apps/dashboard/src/dashboard-settings.ts apps/dashboard/src/dashboard-settings.test.ts
git commit -m "feat: add dashboard settings resolver"
```

## Task 2: Extract Filtering, Sorting, Slicing, And Grid Helpers

**Files:**

- Create: `apps/dashboard/src/dashboard-view.ts`
- Create: `apps/dashboard/src/dashboard-view.test.ts`
- Modify: `apps/dashboard/src/App.tsx`

- [ ] **Step 1: Write the failing view-model tests**

```ts
import { describe, expect, it } from 'vitest';
import { getGridColumns, getVisibleEntities } from './dashboard-view.js';

const entities = [
  {
    entityId: '1',
    source: 'codex',
    entityKind: 'worker',
    currentStatus: 'active',
    lastEventAt: '2026-04-10T10:00:00.000Z',
    activityScore: 0.9,
  },
  {
    entityId: '2',
    source: 'claude',
    entityKind: 'session',
    currentStatus: 'dormant',
    lastEventAt: '2026-04-10T09:00:00.000Z',
    activityScore: 0.2,
  },
  {
    entityId: '3',
    source: 'gemini',
    entityKind: 'worker',
    currentStatus: 'idle',
    lastEventAt: '2026-04-10T10:05:00.000Z',
    activityScore: 0.7,
  },
] as const;

describe('getVisibleEntities', () => {
  it('filters dormant entities and respects maxAgentsShown', () => {
    const result = getVisibleEntities(entities, {
      layout: { maxAgentsShown: 1, density: 'comfortable', sortMode: 'activity' },
      filters: { hideDormant: true, hideDone: false, visibleSources: [], visibleEntityKinds: [] },
    });

    expect(result.map(entity => entity.entityId)).toEqual(['1']);
  });

  it('supports recent sorting', () => {
    const result = getVisibleEntities(entities, {
      layout: { maxAgentsShown: 3, density: 'comfortable', sortMode: 'recent' },
      filters: { hideDormant: false, hideDone: false, visibleSources: [], visibleEntityKinds: [] },
    });

    expect(result.map(entity => entity.entityId)).toEqual(['3', '1', '2']);
  });
});

describe('getGridColumns', () => {
  it('caps compact layouts at more columns than comfortable layouts', () => {
    expect(getGridColumns(6, 'comfortable')).toBe(3);
    expect(getGridColumns(6, 'compact')).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-view.test.ts`

Expected: FAIL because `dashboard-view.ts` does not exist yet.

- [ ] **Step 3: Implement the pure dashboard-view helpers and wire App.tsx**

```ts
// apps/dashboard/src/dashboard-view.ts
import type { EntityStatus } from './face.js';

interface DashboardEntity {
  entityId: string;
  source: string;
  entityKind: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  activityScore: number;
}

interface ViewSettings {
  layout: {
    maxAgentsShown: number;
    density: 'compact' | 'comfortable';
    sortMode: 'activity' | 'recent';
  };
  filters: {
    hideDormant: boolean;
    hideDone: boolean;
    visibleSources: string[];
    visibleEntityKinds: string[];
  };
}

export function getVisibleEntities(
  entities: readonly DashboardEntity[],
  settings: ViewSettings
): DashboardEntity[] {
  const filtered = entities.filter(entity => {
    if (settings.filters.hideDormant && entity.currentStatus === 'dormant') return false;
    if (settings.filters.hideDone && entity.currentStatus === 'done') return false;
    if (
      settings.filters.visibleSources.length > 0 &&
      !settings.filters.visibleSources.includes(entity.source)
    )
      return false;
    if (
      settings.filters.visibleEntityKinds.length > 0 &&
      !settings.filters.visibleEntityKinds.includes(entity.entityKind)
    )
      return false;
    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (settings.layout.sortMode === 'recent') {
      return new Date(right.lastEventAt).getTime() - new Date(left.lastEventAt).getTime();
    }
    return right.activityScore - left.activityScore;
  });

  return sorted.slice(0, settings.layout.maxAgentsShown);
}

export function getGridColumns(count: number, density: 'compact' | 'comfortable'): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return density === 'compact' ? 4 : 3;
  return density === 'compact' ? 5 : 4;
}
```

```tsx
// apps/dashboard/src/App.tsx
import { dashboardConfig } from './dashboard-config.js';
import { createResolvedSettings } from './dashboard-settings.js';
import { getGridColumns, getVisibleEntities } from './dashboard-view.js';

// inside App()
const settings = useMemo(() => createResolvedSettings(dashboardConfig, {}), []);
const visibleEntities = useMemo(() => getVisibleEntities(entities, settings), [entities, settings]);
const columns = getGridColumns(visibleEntities.length, settings.layout.density);
```

- [ ] **Step 4: Run the focused tests and lint**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-settings.test.ts src/dashboard-view.test.ts`

Expected: PASS with all tests green.

Run: `npm --workspace @agent-watch/dashboard run lint`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/dashboard-view.ts apps/dashboard/src/dashboard-view.test.ts apps/dashboard/src/App.tsx
git commit -m "feat: apply configurable dashboard view settings"
```

## Task 3: Add Theme Presets And Visual Rule Resolution

**Files:**

- Create: `apps/dashboard/src/visual-profile.ts`
- Create: `apps/dashboard/src/visual-profile.test.ts`
- Modify: `apps/dashboard/src/dashboard-config.ts`
- Modify: `apps/dashboard/src/face.ts`
- Modify: `apps/dashboard/src/face.test.ts`

- [ ] **Step 1: Write the failing visual-profile tests**

```ts
import { describe, expect, it } from 'vitest';
import { dashboardConfig } from './dashboard-config.js';
import { resolveVisualProfile } from './visual-profile.js';

describe('resolveVisualProfile', () => {
  it('prefers rules matching both source and entityKind', () => {
    const profile = resolveVisualProfile(
      {
        source: 'codex',
        entityKind: 'worker',
        entityId: 'agent-1',
        currentStatus: 'active',
      },
      dashboardConfig.themes.presets[0],
      [
        { source: 'codex', faceVariant: 'rounded-bot' },
        { entityKind: 'worker', faceVariant: 'soft-ghost' },
        { source: 'codex', entityKind: 'worker', faceVariant: 'terminal-sprite' },
      ]
    );

    expect(profile.faceVariant).toBe('terminal-sprite');
  });

  it('falls back to the hashed source palette when no rule applies', () => {
    const profile = resolveVisualProfile(
      {
        source: 'unknown',
        entityKind: 'session',
        entityId: 'agent-2',
        currentStatus: 'idle',
      },
      dashboardConfig.themes.presets[0],
      []
    );

    expect(profile.palette.accent).toBeDefined();
    expect(profile.faceVariant).toBe('rounded-bot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/visual-profile.test.ts`

Expected: FAIL because `visual-profile.ts` does not exist.

- [ ] **Step 3: Implement theme-aware visual profiles and extend the config**

```ts
// apps/dashboard/src/dashboard-config.ts
visualRules: [
  { source: "codex", entityKind: "worker", faceVariant: "terminal-sprite", themePalette: "mint" },
  { source: "claude", faceVariant: "rounded-bot", themePalette: "rose" },
  { entityKind: "session", faceVariant: "soft-ghost", themePalette: "sky" }
],
```

```ts
// apps/dashboard/src/face.ts
export function getNamedPalette(name: string, fallbackKey: string): ProviderPalette {
  if (name === 'mint') {
    return {
      base: 'hsl(162 70% 58%)',
      accent: 'hsl(181 84% 52%)',
      glow: 'hsl(166 94% 78%)',
      shade: 'hsl(164 42% 18%)',
      line: 'hsl(168 30% 12%)',
      background: 'linear-gradient(160deg, hsl(154 68% 94%), hsl(182 72% 84%))',
    };
  }
  return getProviderPalette(fallbackKey);
}
```

```ts
// apps/dashboard/src/visual-profile.ts
import {
  getFaceMood,
  getNamedPalette,
  getProviderPalette,
  type EntityStatus,
  type ProviderPalette,
} from './face.js';
import type { ThemePreset, VisualRule } from './dashboard-settings.js';

interface VisualEntity {
  source: string;
  entityKind: string;
  entityId: string;
  currentStatus: EntityStatus;
}

export interface AgentVisualProfile {
  palette: ProviderPalette;
  faceVariant: 'rounded-bot' | 'square-bot' | 'soft-ghost' | 'terminal-sprite';
  animationMode: 'full' | 'reduced';
  accentStyle: 'sparkles' | 'antenna' | 'frame' | 'none';
}

export function resolveVisualProfile(
  entity: VisualEntity,
  theme: ThemePreset,
  rules: VisualRule[]
): AgentVisualProfile {
  const match = [...rules]
    .sort((left, right) => scoreRule(right) - scoreRule(left))
    .find(rule => {
      if (rule.source && rule.source !== entity.source) return false;
      if (rule.entityKind && rule.entityKind !== entity.entityKind) return false;
      return true;
    });

  const mood = getFaceMood(entity.currentStatus);
  const palette = match?.themePalette
    ? getNamedPalette(match.themePalette, entity.source)
    : getProviderPalette(entity.source);

  return {
    palette,
    faceVariant: match?.faceVariant ?? 'rounded-bot',
    animationMode: theme.id === 'night-shift' && mood.animation === 'pulse' ? 'reduced' : 'full',
    accentStyle: mood.sparkle ? 'sparkles' : 'none',
  };
}

function scoreRule(rule: VisualRule): number {
  return Number(Boolean(rule.source)) + Number(Boolean(rule.entityKind));
}
```

- [ ] **Step 4: Run the visual-profile and face tests**

Run: `npm --workspace @agent-watch/dashboard run test -- src/visual-profile.test.ts src/face.test.ts`

Expected: PASS with the new specificity tests and existing mood/status tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/dashboard-config.ts apps/dashboard/src/visual-profile.ts apps/dashboard/src/visual-profile.test.ts apps/dashboard/src/face.ts apps/dashboard/src/face.test.ts
git commit -m "feat: add theme-aware visual profiles"
```

## Task 4: Render Face Variants And Theme Tokens In The Card UI

**Files:**

- Modify: `apps/dashboard/src/AgentFaceCard.tsx`
- Modify: `apps/dashboard/src/face.ts`
- Modify: `apps/dashboard/src/face.test.ts`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [ ] **Step 1: Write the failing face-variant tests**

```ts
import { describe, expect, it } from 'vitest';
import { getFaceShell } from './face.js';

describe('getFaceShell', () => {
  it('returns distinct shell layouts for renderer variants', () => {
    expect(getFaceShell('rounded-bot')).not.toEqual(getFaceShell('terminal-sprite'));
    expect(getFaceShell('soft-ghost')).toEqual(
      expect.objectContaining({
        outline: expect.any(Array),
        fill: expect.any(Array),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/face.test.ts`

Expected: FAIL because `getFaceShell` is not exported from `face.ts` yet.

- [ ] **Step 3: Implement face-variant rendering and theme CSS variables**

```ts
// apps/dashboard/src/face.ts
interface FaceShell {
  outline: Array<[number, number, number, number]>;
  fill: Array<[number, number, number, number]>;
}

export function getFaceShell(
  variant: 'rounded-bot' | 'square-bot' | 'soft-ghost' | 'terminal-sprite'
): FaceShell {
  if (variant === 'terminal-sprite') {
    return {
      outline: [
        [0, 0, 12, 1],
        [0, 1, 1, 10],
        [11, 1, 1, 10],
        [1, 10, 10, 1],
      ],
      fill: [
        [1, 1, 10, 9],
        [2, 2, 8, 6],
      ],
    };
  }

  if (variant === 'soft-ghost') {
    return {
      outline: [[2, 1, 8, 9]],
      fill: [
        [3, 2, 6, 6],
        [2, 10, 1, 1],
        [5, 10, 1, 1],
        [8, 10, 1, 1],
      ],
    };
  }

  return {
    outline: [[1, 1, 10, 10]],
    fill: [[2, 2, 8, 8]],
  };
}
```

```tsx
// apps/dashboard/src/AgentFaceCard.tsx
import { useMemo } from 'react';
import { getFaceShell } from './face.js';
import { resolveVisualProfile } from './visual-profile.js';

export function AgentFaceCard({
  entity,
  theme,
  visualRules,
}: {
  entity: EntityState;
  theme: ThemePreset;
  visualRules: VisualRule[];
}) {
  const visualProfile = useMemo(
    () => resolveVisualProfile(entity, theme, visualRules),
    [entity, theme, visualRules]
  );
  const shell = getFaceShell(visualProfile.faceVariant);
  for (const [pxX, pxY, pxW, pxH] of shell.outline) {
    px(pxX, pxY, pxW, pxH, palette.base);
  }
  for (const [pxX, pxY, pxW, pxH] of shell.fill) {
    px(pxX, pxY, pxW, pxH, palette.glow);
  }
}
```

```tsx
// apps/dashboard/src/App.tsx
import type { CSSProperties } from "react";

<main
  className="dashboard"
  style={
    {
      "--page-bg": settings.theme.pageBackground,
      "--panel-bg": settings.theme.panelBackground,
      "--text-color": settings.theme.textColor,
      "--muted-text-color": settings.theme.mutedTextColor
    } as CSSProperties
  }
>
```

```css
/* apps/dashboard/src/styles.css */
body {
  color: var(--text-color);
  background: var(--page-bg);
}

.topbar,
.empty,
.settings-panel {
  background: var(--panel-bg);
}
```

- [ ] **Step 4: Run the dashboard test suite and build**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-settings.test.ts src/dashboard-view.test.ts src/visual-profile.test.ts src/face.test.ts`

Expected: PASS with all focused dashboard tests green.

Run: `npm --workspace @agent-watch/dashboard run build`

Expected: PASS with Vite build output in `apps/dashboard/dist`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/AgentFaceCard.tsx apps/dashboard/src/face.ts apps/dashboard/src/face.test.ts apps/dashboard/src/App.tsx apps/dashboard/src/styles.css
git commit -m "feat: add configurable dashboard theming and face variants"
```

## Task 5: Add Viewer Preference Persistence And The Settings Panel

**Files:**

- Create: `apps/dashboard/src/viewer-preferences.ts`
- Create: `apps/dashboard/src/viewer-preferences.test.ts`
- Create: `apps/dashboard/src/SettingsPanel.tsx`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [ ] **Step 1: Write the failing persistence tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadViewerPreferences,
  resetViewerPreferences,
  saveViewerPreferences,
} from './viewer-preferences.js';

describe('viewer preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips persisted viewer overrides', () => {
    saveViewerPreferences({ maxAgentsShown: 6, hideDormant: true, themeId: 'night-shift' });

    expect(loadViewerPreferences()).toEqual({
      maxAgentsShown: 6,
      hideDormant: true,
      themeId: 'night-shift',
    });
  });

  it('clears overrides on reset', () => {
    saveViewerPreferences({ density: 'compact' });
    resetViewerPreferences();
    expect(loadViewerPreferences()).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/viewer-preferences.test.ts`

Expected: FAIL because the persistence module and test file do not exist yet.

- [ ] **Step 3: Implement persistence and a compact settings panel**

```ts
// apps/dashboard/src/viewer-preferences.ts
import type { ViewerPreferences } from './dashboard-settings.js';

const STORAGE_KEY = 'agent-watch.viewer-preferences';

export function loadViewerPreferences(): ViewerPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ViewerPreferences) : {};
  } catch {
    return {};
  }
}

export function saveViewerPreferences(preferences: ViewerPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function resetViewerPreferences(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
```

```tsx
// apps/dashboard/src/SettingsPanel.tsx
import type { DashboardConfig, ViewerPreferences } from './dashboard-settings.js';

interface SettingsPanelProps {
  config: DashboardConfig;
  viewerPreferences: ViewerPreferences;
  onChange: (next: ViewerPreferences) => void;
  onReset: () => void;
}

export function SettingsPanel({
  config,
  viewerPreferences,
  onChange,
  onReset,
}: SettingsPanelProps) {
  return (
    <aside className="settings-panel">
      <div className="settings-panel__header">
        <h2>View Settings</h2>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <label>
        <span>Max agents shown</span>
        <input
          type="range"
          min="1"
          max="24"
          value={viewerPreferences.maxAgentsShown ?? config.layout.maxAgentsShown}
          onChange={event =>
            onChange({ ...viewerPreferences, maxAgentsShown: Number(event.target.value) })
          }
        />
      </label>

      <label>
        <span>Theme</span>
        <select
          value={viewerPreferences.themeId ?? config.themes.defaultThemeId}
          onChange={event => onChange({ ...viewerPreferences, themeId: event.target.value })}
        >
          {config.themes.presets.map(theme => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
```

```tsx
// apps/dashboard/src/App.tsx
const [viewerPreferences, setViewerPreferences] = useState<ViewerPreferences>(() =>
  loadViewerPreferences()
);

useEffect(() => {
  saveViewerPreferences(viewerPreferences);
}, [viewerPreferences]);

const settings = useMemo(
  () => createResolvedSettings(dashboardConfig, viewerPreferences),
  [viewerPreferences]
);
```

- [ ] **Step 4: Run tests, lint, and a manual smoke check**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-settings.test.ts src/dashboard-view.test.ts src/visual-profile.test.ts src/face.test.ts src/viewer-preferences.test.ts`

Expected: PASS with all dashboard tests green.

Run: `npm --workspace @agent-watch/dashboard run lint`

Expected: PASS with no TypeScript errors.

Run: `npm --workspace @agent-watch/dashboard run dev`

Expected: Dashboard opens with a visible settings panel; changing the slider or theme immediately updates the page and persists after refresh.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/viewer-preferences.ts apps/dashboard/src/viewer-preferences.test.ts apps/dashboard/src/SettingsPanel.tsx apps/dashboard/src/App.tsx apps/dashboard/src/styles.css
git commit -m "feat: add viewer settings overrides"
```

## Task 6: Polish Empty States, Derived Filter Options, And Final Verification

**Files:**

- Modify: `apps/dashboard/src/dashboard-view.ts`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/SettingsPanel.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Modify: `apps/dashboard/src/dashboard-view.test.ts`

- [ ] **Step 1: Write the failing UX-level tests for derived filter options and empty-state messaging**

```ts
import { describe, expect, it } from 'vitest';
import { getEmptyStateMessage, getFilterOptions } from './dashboard-view.js';

describe('dashboard view helpers', () => {
  it('builds sorted unique filter options from live entities', () => {
    const options = getFilterOptions([
      {
        entityId: '1',
        source: 'codex',
        entityKind: 'worker',
        currentStatus: 'active',
        lastEventAt: '2026-04-10T10:00:00.000Z',
        activityScore: 0.9,
      },
      {
        entityId: '2',
        source: 'claude',
        entityKind: 'session',
        currentStatus: 'idle',
        lastEventAt: '2026-04-10T10:01:00.000Z',
        activityScore: 0.7,
      },
      {
        entityId: '3',
        source: 'codex',
        entityKind: 'session',
        currentStatus: 'sleepy',
        lastEventAt: '2026-04-10T10:02:00.000Z',
        activityScore: 0.6,
      },
    ]);

    expect(options.sources).toEqual(['claude', 'codex']);
    expect(options.entityKinds).toEqual(['session', 'worker']);
  });

  it('returns a filter-specific empty-state message when live data exists', () => {
    expect(getEmptyStateMessage(3, 0)).toBe(
      'No entities match the current filters. Reset your overrides or widen the filters.'
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/dashboard-view.test.ts`

Expected: FAIL because `getFilterOptions` and `getEmptyStateMessage` are not exported yet.

- [ ] **Step 3: Implement the final UX polish**

```ts
// apps/dashboard/src/dashboard-view.ts
export function getFilterOptions(entities: readonly DashboardEntity[]) {
  return {
    sources: [...new Set(entities.map(entity => entity.source))].sort(),
    entityKinds: [...new Set(entities.map(entity => entity.entityKind))].sort(),
  };
}

export function getEmptyStateMessage(totalEntities: number, visibleEntities: number): string {
  if (totalEntities === 0) {
    return 'No active entities yet. Start the collector to stream events.';
  }
  if (visibleEntities === 0) {
    return 'No entities match the current filters. Reset your overrides or widen the filters.';
  }
  return '';
}
```

```tsx
// apps/dashboard/src/App.tsx
const { sources: sourceOptions, entityKinds: entityKindOptions } = useMemo(
  () => getFilterOptions(entities),
  [entities]
);

const emptyMessage = getEmptyStateMessage(entities.length, visibleEntities.length);
```

```tsx
// apps/dashboard/src/SettingsPanel.tsx
interface SettingsPanelProps {
  sourceOptions: string[];
  entityKindOptions: string[];
  viewerPreferences: ViewerPreferences;
  onChange: (next: ViewerPreferences) => void;
}

export function SettingsPanel({
  sourceOptions,
  entityKindOptions,
  viewerPreferences,
  onChange,
}: SettingsPanelProps) {
  function toggleSource(source: string) {
    const current = viewerPreferences.visibleSources ?? sourceOptions;
    const next = current.includes(source)
      ? current.filter(value => value !== source)
      : [...current, source];

    onChange({ ...viewerPreferences, visibleSources: next });
  }

  function toggleEntityKind(entityKind: string) {
    const current = viewerPreferences.visibleEntityKinds ?? entityKindOptions;
    const next = current.includes(entityKind)
      ? current.filter(value => value !== entityKind)
      : [...current, entityKind];

    onChange({ ...viewerPreferences, visibleEntityKinds: next });
  }

  {
    sourceOptions.map(source => (
      <label key={source} className="settings-panel__checkbox">
        <input
          type="checkbox"
          checked={(viewerPreferences.visibleSources ?? sourceOptions).includes(source)}
          onChange={() => toggleSource(source)}
        />
        <span>{source}</span>
      </label>
    ));
  }

  {
    entityKindOptions.map(entityKind => (
      <label key={entityKind} className="settings-panel__checkbox">
        <input
          type="checkbox"
          checked={(viewerPreferences.visibleEntityKinds ?? entityKindOptions).includes(entityKind)}
          onChange={() => toggleEntityKind(entityKind)}
        />
        <span>{entityKind}</span>
      </label>
    ));
  }
}
```

```css
/* apps/dashboard/src/styles.css */
.settings-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(19, 32, 50, 0.12);
}

.settings-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-panel__checkbox {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
```

- [ ] **Step 4: Run full verification**

Run: `npm run test`

Expected: PASS across all workspaces.

Run: `npm run build`

Expected: PASS across all workspaces, including the dashboard bundle.

Run: `npm --workspace @agent-watch/dashboard run dev`

Expected: Manual smoke test succeeds for all of the following:

- changing max agents shown
- toggling a theme
- hiding dormant entities
- filtering by source or entity kind
- resetting viewer overrides

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/dashboard-view.ts apps/dashboard/src/App.tsx apps/dashboard/src/SettingsPanel.tsx apps/dashboard/src/styles.css apps/dashboard/src/dashboard-view.test.ts
git commit -m "feat: polish dashboard configurability controls"
```
