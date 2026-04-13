import { useEffect, useMemo, useState, type CSSProperties } from "react";

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
  const { detail: selectedDetail, loading: detailLoading, error: detailError } = useConversationDetail(
    HUB_HTTP,
    selectedVisibleGroup,
    selectedGroupId
  );

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
      <div className="dashboard__shell">
        <DashboardTopbar connectionState={connectionState} statusSummary={statusSummary} />

        {settings.ui.showSettingsPanel ? (
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

        <section className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(16rem, 1fr))` }}>
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
            <p className={`empty ${entities.length > 0 ? "empty--filtered" : ""}`}>{emptyMessage}</p>
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
  );
}
