import type { DashboardConfig, ResolvedSettings, ViewerPreferences } from './dashboard-settings.js';

interface SettingsPanelProps {
  config: DashboardConfig;
  settings: ResolvedSettings;
  sourceOptions?: string[];
  entityKindOptions?: string[];
  viewerPreferences?: ViewerPreferences;
  // eslint-disable-next-line no-unused-vars
  onChange: (_patch: ViewerPreferences) => void;
  onReset: () => void;
}

export function SettingsPanel({
  config,
  settings,
  sourceOptions = [],
  entityKindOptions = [],
  viewerPreferences = {},
  onChange,
  onReset,
}: SettingsPanelProps) {
  const maxAgentsShown = settings.layout.maxAgentsShown;
  const density = settings.layout.density;
  const sortMode = settings.layout.sortMode;
  const hideDormant = settings.filters.hideDormant;
  const hideDone = settings.filters.hideDone;
  const themeId = settings.theme.id;
  const selectedSources = viewerPreferences.visibleSources ?? sourceOptions;
  const selectedEntityKinds = viewerPreferences.visibleEntityKinds ?? entityKindOptions;

  function toggleSelection(
    currentSelection: string[],
    value: string,
    key: 'visibleSources' | 'visibleEntityKinds'
  ) {
    const next = currentSelection.includes(value)
      ? currentSelection.filter(entry => entry !== value)
      : [...currentSelection, value];

    onChange({ [key]: next } as ViewerPreferences);
  }

  return (
    <aside id="dashboard-settings-panel" className="settings-panel" aria-label="Dashboard settings">
      <div className="settings-panel__header">
        <div>
          <p className="eyebrow">Local overrides</p>
          <h2>Settings</h2>
          <p className="settings-panel__lede">
            Tune the mural without touching the shared hub config.
          </p>
        </div>
        <button type="button" className="settings-panel__reset" onClick={onReset}>
          Reset view
        </button>
      </div>

      <div className="settings-panel__sections">
        <section className="settings-panel__section">
          <div className="settings-panel__section-heading">
            <h3>Layout</h3>
            <p>Control how dense the wall feels and which conversations stay in frame.</p>
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
                  onChange={event => onChange({ maxAgentsShown: Number(event.target.value) })}
                />
                <output>{maxAgentsShown}</output>
              </div>
            </label>

            <label className="settings-panel__field">
              <span>Density</span>
              <select
                value={density}
                onChange={event =>
                  onChange({ density: event.target.value as 'compact' | 'comfortable' })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>

            <label className="settings-panel__field">
              <span>Sort by</span>
              <select
                value={sortMode}
                onChange={event =>
                  onChange({ sortMode: event.target.value as 'activity' | 'recent' })
                }
              >
                <option value="activity">Activity</option>
                <option value="recent">Recent</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-panel__section">
          <div className="settings-panel__section-heading">
            <h3>Display</h3>
            <p>Adjust the theme and visual style without changing the underlying data.</p>
          </div>

          <div className="settings-panel__grid">
            <label className="settings-panel__field">
              <span>Theme</span>
              <select
                value={themeId}
                disabled={!config.ui.allowViewerThemeOverride}
                onChange={event => onChange({ themeId: event.target.value })}
              >
                {config.themes.presets.map(theme => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-panel__field">
              <span>Art style</span>
              <select
                value={settings.artStyleMode}
                onChange={event =>
                  onChange({
                    artStyleMode: event.target.value as 'config' | 'playful' | 'minimal',
                  })
                }
              >
                <option value="config">Config</option>
                <option value="playful">Playful</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-panel__section">
          <div className="settings-panel__section-heading">
            <h3>Filters</h3>
            <p>Trim the live wall to the conversations that matter most right now.</p>
          </div>

          <div className="settings-panel__grid">
            <label className="settings-panel__check">
              <input
                type="checkbox"
                checked={hideDormant}
                onChange={event => onChange({ hideDormant: event.target.checked })}
              />
              <span>Hide dormant</span>
            </label>

            <label className="settings-panel__check">
              <input
                type="checkbox"
                checked={hideDone}
                onChange={event => onChange({ hideDone: event.target.checked })}
              />
              <span>Hide done</span>
            </label>

            <div className="settings-panel__filters">
              <div className="settings-panel__filters-header">
                <span>Sources</span>
              </div>
              <div className="settings-panel__filter-list">
                {sourceOptions.length > 0 ? (
                  sourceOptions.map(source => (
                    <label key={source} className="settings-panel__check">
                      <input
                        type="checkbox"
                        checked={selectedSources.includes(source)}
                        onChange={() => toggleSelection(selectedSources, source, 'visibleSources')}
                      />
                      <span>{source}</span>
                    </label>
                  ))
                ) : (
                  <p className="settings-panel__note settings-panel__note--compact">
                    Waiting for live entities to populate source filters.
                  </p>
                )}
              </div>
            </div>

            <div className="settings-panel__filters">
              <div className="settings-panel__filters-header">
                <span>Entity kinds</span>
              </div>
              <div className="settings-panel__filter-list">
                {entityKindOptions.length > 0 ? (
                  entityKindOptions.map(entityKind => (
                    <label key={entityKind} className="settings-panel__check">
                      <input
                        type="checkbox"
                        checked={selectedEntityKinds.includes(entityKind)}
                        onChange={() =>
                          toggleSelection(selectedEntityKinds, entityKind, 'visibleEntityKinds')
                        }
                      />
                      <span>{entityKind}</span>
                    </label>
                  ))
                ) : (
                  <p className="settings-panel__note settings-panel__note--compact">
                    Waiting for live entities to populate entity kind filters.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {!settings.ui.allowViewerThemeOverride ? (
        <p className="settings-panel__note">Theme overrides are locked by shared config.</p>
      ) : null}
    </aside>
  );
}
