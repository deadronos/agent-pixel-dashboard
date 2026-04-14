import { useEffect, useMemo, useState } from "react";

import { AgentFaceCard } from "./AgentFaceCard.js";
import { ConversationDrawer } from "./ConversationDrawer.js";
import { DashboardTopbar } from "./DashboardTopbar.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { toggleSelectedGroupId } from "./conversation-selection.js";
import { dashboardConfig } from "./dashboard-config.js";
import { createResolvedSettings, type ViewerPreferences } from "./dashboard-settings.js";
import {
  getEmptyStateMessage,
  getEntityStatusSummary,
  getFilterOptions,
  getGridColumns,
  getVisibleEntityGroups,
  findVisibleEntityGroupById,
  pruneViewerPreferencesToLiveOptions
} from "./dashboard-view.js";
import { resolveHubWebSocketUrl } from "./hub-url.js";
import { useConversationDetail } from "./use-conversation-detail.js";
import { useLiveEntities } from "./use-live-entities.js";
import { loadViewerPreferences, saveViewerPreferences } from "./viewer-preferences.js";

const HUB_HTTP = import.meta.env.VITE_HUB_HTTP ?? "http://localhost:3030";
const HUB_WS = resolveHubWebSocketUrl(import.meta.env.VITE_HUB_WS, HUB_HTTP);

export function App() {
  const { entities, connectionState } = useLiveEntities(HUB_HTTP, HUB_WS);
  const [viewerPreferences, setViewerPreferences] = useState<ViewerPreferences>(() =>
    loadViewerPreferences()
  );
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const filterOptions = useMemo(() => getFilterOptions(entities), [entities]);
  const activeViewerPreferences = useMemo(
    () => pruneViewerPreferencesToLiveOptions(viewerPreferences, filterOptions),
    [viewerPreferences, filterOptions]
  );
  const statusSummary = useMemo(() => getEntityStatusSummary(entities), [entities]);
  const settings = useMemo(
    () => createResolvedSettings(dashboardConfig, activeViewerPreferences),
    [activeViewerPreferences]
  );
  const visibleGroups = useMemo(() => getVisibleEntityGroups(entities, settings), [entities, settings]);
  const selectedVisibleGroup = useMemo(
    () => findVisibleEntityGroupById(visibleGroups, selectedGroupId),
    [selectedGroupId, visibleGroups]
  );
  const selectedVisibleGroupId = selectedVisibleGroup?.groupId ?? null;
  const columns = getGridColumns(visibleGroups.length, settings.layout.density);
  const emptyMessage = getEmptyStateMessage(entities.length, visibleGroups.length);
  const showSettingsPanel = settings.ui.showSettingsPanel && settingsPanelOpen;
  const themeStyles = `
    .dashboard {
      --page-bg: ${settings.theme.pageBackground};
      --panel-bg: ${settings.theme.panelBackground};
      --text-color: ${settings.theme.textColor};
      --muted-text-color: ${settings.theme.mutedTextColor};
    }
  `;
  const { detail: selectedDetail, loading: detailLoading, error: detailError } = useConversationDetail(
    HUB_HTTP,
    selectedVisibleGroup,
    selectedGroupId
  );

  const clearViewerFilterPreferences = () => {
    setViewerPreferences((previous) => {
      const next = { ...previous };
      delete next.hideDormant;
      delete next.hideDone;
      delete next.visibleSources;
      delete next.visibleEntityKinds;
      return next;
    });
  };

  const emptyStateTips =
    entities.length === 0
      ? [
          "Keep the collector and hub running together so the mural can populate.",
          "Use the settings sidebar to tune density, sort order, and theme.",
          "Watch the top summary as soon as live events start flowing.",
        ]
      : [
          "Clear the current filters to bring dormant conversations back.",
          "Widen the source and entity-kind filters if they are too narrow.",
          "Try recent sorting to surface the freshest activity first.",
        ];

  useEffect(() => {
    saveViewerPreferences(activeViewerPreferences);
  }, [activeViewerPreferences]);

  useEffect(() => {
    if (!selectedGroupId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedGroupId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedGroupId]);

  useEffect(() => {
    if (selectedGroupId && !selectedVisibleGroup) {
      setSelectedGroupId(null);
    }
  }, [selectedGroupId, selectedVisibleGroup]);

  return (
    <>
      <style>{themeStyles}</style>
      <main className="dashboard">
        <div
          className={`dashboard__shell ${showSettingsPanel ? "dashboard__shell--with-settings" : "dashboard__shell--solo"}`}
        >
          <DashboardTopbar
            connectionState={connectionState}
            statusSummary={statusSummary}
            settingsPanelAvailable={settings.ui.showSettingsPanel}
            settingsPanelOpen={showSettingsPanel}
            onToggleSettings={() => setSettingsPanelOpen((current) => !current)}
          />

          {showSettingsPanel ? (
            <SettingsPanel
              config={dashboardConfig}
              settings={settings}
              sourceOptions={filterOptions.sources}
              entityKindOptions={filterOptions.entityKinds}
              viewerPreferences={activeViewerPreferences}
              onChange={(patch) => setViewerPreferences((previous) => ({ ...previous, ...patch }))}
              onReset={() => setViewerPreferences({})}
            />
          ) : null}

          <section className={`grid grid--cols-${columns}`}>
            {visibleGroups.map((group) => (
              <AgentFaceCard
                key={group.groupId}
                entity={group.representative}
                groupCount={group.memberCount}
                theme={settings.theme}
                visualRules={settings.visualRules}
                artStyleMode={settings.artStyleMode}
                selected={selectedVisibleGroupId === group.groupId}
                onClick={() => {
                  setSelectedGroupId((current) => toggleSelectedGroupId(current, group.groupId));
                }}
              />
            ))}
            {visibleGroups.length === 0 ? (
              <section
                className={`empty-state ${entities.length > 0 ? "empty-state--filtered" : "empty-state--fresh"}`}
                aria-label={entities.length > 0 ? "Filtered empty state" : "Getting started"}
              >
                <div className="empty-state__copy">
                  <p className="eyebrow">
                    {entities.length > 0 ? "Filtered view" : "Getting started"}
                  </p>
                  <h2>
                    {entities.length > 0
                      ? "Nothing matches the current filters"
                      : "Waiting for the first collector event"}
                  </h2>
                  <p>{emptyMessage}</p>
                </div>

                <div className="empty-state__actions">
                  {!showSettingsPanel && settings.ui.showSettingsPanel ? (
                    <button
                      type="button"
                      className="empty-state__action"
                      onClick={() => setSettingsPanelOpen(true)}
                    >
                      Show settings
                    </button>
                  ) : null}
                  {entities.length > 0 ? (
                    <button
                      type="button"
                      className="empty-state__action empty-state__action--ghost"
                      onClick={clearViewerFilterPreferences}
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>

                <ul className="empty-state__tips">
                  {emptyStateTips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </div>

        <ConversationDrawer
          open={Boolean(selectedVisibleGroup)}
          group={selectedVisibleGroup ?? null}
          detail={selectedDetail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedGroupId(null)}
        />
      </main>
    </>
  );
}
