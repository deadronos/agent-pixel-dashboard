# Dashboard Configurability Design

## Goal

Make the dashboard meaningfully configurable without losing its current lightweight architecture. The first release should support shared repo-owned defaults, per-viewer runtime overrides, and richer visual customization across layout, filtering, and agent presentation.

## Current State

The dashboard is a small Vite + React app. Most behavior is currently hard-coded:

- [`apps/dashboard/src/App.tsx`](/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/App.tsx) computes grid columns from entity count, sorts only by `activityScore`, and renders every entity it receives.
- [`apps/dashboard/src/face.ts`](/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/face.ts) derives palettes from `source` and moods from `status`.
- [`apps/dashboard/src/AgentFaceCard.tsx`](/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/AgentFaceCard.tsx) renders one fixed card layout and one canvas-driven face style.

This makes the dashboard easy to understand, but it also means product choices like "show only 8 agents," "hide dormant Claude sessions," or "use a different art treatment for Codex workers" require code edits.

## Product Intent

The first configurability pass should enable:

- shared dashboard defaults that live in the repo
- runtime viewer controls inside the dashboard
- per-viewer overrides that do not modify shared defaults
- visual rules targeting both `source` and `entityKind`
- a clean path to future explicit per-entity overrides

The design should keep the current local-first architecture. No backend config service is required for the first version.

## Non-Goals

The first release should not include:

- multi-user shared editing of settings from the UI
- arbitrary uploaded image assets for agent art
- backend persistence for personal preferences
- deeply nested rule systems or full theme authoring tools

## Proposed Architecture

### 1. Shared Config Layer

Add one typed dashboard config module as the canonical shared settings source. A TypeScript module is the best fit for the current codebase because it keeps validation simple and avoids adding runtime parsing complexity.

Suggested file:

- `apps/dashboard/src/dashboard-config.ts`

Suggested top-level shape:

- `layout`
- `filters`
- `themes`
- `visualRules`
- `ui`

Conceptually:

```ts
interface DashboardConfig {
  layout: {
    maxAgentsShown: number;
    density: "compact" | "comfortable";
    sortMode: "activity" | "recent";
  };
  filters: {
    hideDormant: boolean;
    hideDone: boolean;
    visibleSources?: string[];
    visibleEntityKinds?: string[];
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
```

This file should be repo-owned and safe to review like any other code change.

### 2. Viewer Override Layer

Add a small browser-only preference store backed by `localStorage`.

Suggested file:

- `apps/dashboard/src/viewer-preferences.ts`

This layer stores only local overrides, not a full copy of the shared config. It should be partial by design so the app can always fall back to shared defaults.

Example override categories:

- `maxAgentsShown`
- `density`
- `hideDormant`
- `hideDone`
- `visibleSources`
- `visibleEntityKinds`
- `themeId`
- `artStyleMode`

Resolution order:

1. internal defaults
2. shared config module
3. viewer overrides from `localStorage`

This preserves a canonical team view while letting each viewer tune their own dashboard.

### 3. Resolved Settings Layer

Add a single resolver that merges shared config with viewer overrides into a normalized runtime object used by the UI.

Suggested file:

- `apps/dashboard/src/dashboard-settings.ts`

Responsibilities:

- merge defaults, shared config, and viewer overrides
- normalize missing or invalid viewer values
- expose resolved layout, filter, theme, and visual settings
- keep the rest of the UI from knowing where any value came from

This should become the only input for filtering entities, computing layout, and choosing visual presentation.

## Visual System

### Theme Presets

Dashboard-wide themes should control the environment around the cards, not just the card palette. A theme preset should define:

- page background and atmosphere
- topbar colors
- badge styling
- card glass/chrome tokens
- default text contrast
- optional default palette behavior

This moves visual direction out of `styles.css` constants and into a small token system.

### Agent Visual Profiles

Replace the current direct `source -> palette` coupling with a resolver that produces a visual profile for each entity.

Suggested file:

- `apps/dashboard/src/visual-profile.ts`

Inputs:

- entity metadata: `source`, `entityKind`, `entityId`, `currentStatus`
- resolved theme
- configured visual rules

Outputs:

```ts
interface AgentVisualProfile {
  palette: ProviderPalette;
  faceVariant: "rounded-bot" | "square-bot" | "soft-ghost" | "terminal-sprite";
  animationMode: "full" | "reduced";
  accentStyle?: "sparkles" | "antenna" | "frame" | "none";
}
```

### Rule Matching

Visual rules should be simple and deterministic. For the first version:

- allow matching by `source`
- allow matching by `entityKind`
- allow matching by both
- prefer more specific matches over less specific ones

Priority order:

1. rule matching both `source` and `entityKind`
2. rule matching `entityKind`
3. rule matching `source`
4. theme/default fallback

This gives strong customization without introducing a heavy cascade engine.

### Art Strategy

"Configurable art" should mean renderer variants, not arbitrary image uploads.

The current canvas face renderer is already a strong extension point. The first version should support:

- multiple face silhouettes
- alternate eye and mouth sets
- decorative accents and frames
- palette families beyond the current hash-based colors
- optional animation intensity changes

This keeps art expressive while staying compatible with the existing rendering model and tests.

## Runtime Controls

Add a compact settings surface inside the dashboard rather than a dedicated settings page.

Suggested file:

- `apps/dashboard/src/SettingsPanel.tsx`

The panel should expose the highest-value viewer controls:

- max agents shown
- density mode
- hide dormant
- hide done
- source visibility toggles
- entity-kind visibility toggles
- theme preset selection
- local art style mode override

The panel should also communicate state clearly:

- show which values are inherited from shared config
- show which values are locally overridden
- include a "reset my overrides" action

All changes should preview instantly and persist locally.

## Dashboard Behavior Changes

### Layout

Layout should no longer depend only on entity count. The resolved settings layer should control:

- maximum entities rendered
- density tokens affecting card height and spacing
- grid behavior derived from visible entity count and density

This allows compact operator views and more cinematic wallboard views without branching the app.

### Filtering

Entities should be filtered before rendering based on resolved settings:

- hide dormant and done states when configured
- include only selected sources when source filters are active
- include only selected entity kinds when type filters are active
- preserve sort order after filtering

Future pinned/favorite entities can slot into this pipeline later.

### Sorting

The first version should support at least:

- `activity` descending
- `recent` descending by `lastEventAt`

This is enough to make the dashboard feel configurable without overdesigning ranking.

## Testing Strategy

Extend the current dashboard unit-test approach rather than introducing browser-end-to-end tests for this first pass.

Add tests for:

- settings resolution precedence
- visual rule matching specificity
- filter and sort behavior
- layout calculations with `maxAgentsShown`
- viewer preference persistence and reset behavior

Suggested test files:

- `apps/dashboard/src/dashboard-settings.test.ts`
- `apps/dashboard/src/visual-profile.test.ts`
- expand `apps/dashboard/src/face.test.ts`

## Implementation Notes

A good implementation sequence is:

1. extract typed config and resolved settings helpers
2. route `App.tsx` filtering, sorting, and layout through resolved settings
3. extract visual profile resolution from current palette logic
4. add renderer variants in `AgentFaceCard`
5. add runtime settings UI and local persistence
6. tighten tests around the new behavior

## Risks And Trade-Offs

- A JSON config file would feel more data-driven, but TypeScript is the lower-friction option for this repo today.
- Too many first-pass controls would make the settings panel noisy, so the initial UI should stay focused on a small set of high-value toggles.
- Arbitrary uploaded art sounds flexible, but it would complicate asset loading, sizing, and runtime validation well before the product proves it needs that power.

## Outcome

After this change, the dashboard should support:

- a checked-in shared visual and behavioral baseline
- personal runtime tuning per viewer
- configurable max agents shown
- configurable themes
- configurable art/style by `source` and `entityKind`
- a clear path for later expansion without rewriting core rendering again
