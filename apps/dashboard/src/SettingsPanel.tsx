import type { DashboardConfig, ResolvedSettings, ViewerPreferences } from "./dashboard-settings.js";

interface SettingsPanelProps {
  config: DashboardConfig;
  settings: ResolvedSettings;
  onChange: (patch: ViewerPreferences) => void;
  onReset: () => void;
}

export function SettingsPanel({ config, settings, onChange, onReset }: SettingsPanelProps) {
  const maxAgentsShown = settings.layout.maxAgentsShown;
  const density = settings.layout.density;
  const sortMode = settings.layout.sortMode;
  const hideDormant = settings.filters.hideDormant;
  const hideDone = settings.filters.hideDone;
  const themeId = settings.theme.id;

  return (
    <aside className="settings-panel" aria-label="Dashboard settings">
      <div className="settings-panel__header">
        <div>
          <p className="eyebrow">Local overrides</p>
          <h2>Settings</h2>
        </div>
        <button type="button" className="settings-panel__reset" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="settings-panel__grid">
        <label className="settings-panel__field settings-panel__field--range">
          <span>Max agents shown</span>
          <div className="settings-panel__range-row">
            <input
              type="range"
              min="1"
              max="24"
              step="1"
              value={maxAgentsShown}
              onChange={(event) => onChange({ maxAgentsShown: Number(event.target.value) })}
            />
            <output>{maxAgentsShown}</output>
          </div>
        </label>

        <label className="settings-panel__field">
          <span>Theme</span>
          <select
            value={themeId}
            disabled={!config.ui.allowViewerThemeOverride}
            onChange={(event) => onChange({ themeId: event.target.value })}
          >
            {config.themes.presets.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-panel__field">
          <span>Density</span>
          <select
            value={density}
            onChange={(event) => onChange({ density: event.target.value as "compact" | "comfortable" })}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <label className="settings-panel__field">
          <span>Sort by</span>
          <select
            value={sortMode}
            onChange={(event) => onChange({ sortMode: event.target.value as "activity" | "recent" })}
          >
            <option value="activity">Activity</option>
            <option value="recent">Recent</option>
          </select>
        </label>

        <label className="settings-panel__check">
          <input
            type="checkbox"
            checked={hideDormant}
            onChange={(event) => onChange({ hideDormant: event.target.checked })}
          />
          <span>Hide dormant</span>
        </label>

        <label className="settings-panel__check">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(event) => onChange({ hideDone: event.target.checked })}
          />
          <span>Hide done</span>
        </label>
      </div>

      {!settings.ui.allowViewerThemeOverride ? (
        <p className="settings-panel__note">Theme overrides are locked by shared config.</p>
      ) : null}
    </aside>
  );
}
