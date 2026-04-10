import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AgentFaceCard } from "./AgentFaceCard.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { dashboardConfig } from "./dashboard-config.js";
import { createResolvedSettings, type ViewerPreferences } from "./dashboard-settings.js";
import {
  getEmptyStateMessage,
  getFilterOptions,
  getGridColumns,
  getVisibleEntities,
  pruneViewerPreferencesToLiveOptions
} from "./dashboard-view.js";
import { resolveLiveStatus, type DashboardEntity } from "./face.js";
import { loadViewerPreferences, saveViewerPreferences } from "./viewer-preferences.js";

const HUB_HTTP = import.meta.env.VITE_HUB_HTTP ?? "http://localhost:3030";
const HUB_WS = import.meta.env.VITE_HUB_WS ?? "ws://localhost:3030/ws";

function normalizeEntity(entity: DashboardEntity): DashboardEntity {
  return {
    ...entity,
    currentStatus: resolveLiveStatus(entity.currentStatus, entity.lastEventAt)
  };
}

export function App() {
  const [entities, setEntities] = useState<DashboardEntity[]>([]);
  const [connected, setConnected] = useState(false);
  const [viewerPreferences, setViewerPreferences] = useState<ViewerPreferences>(() =>
    loadViewerPreferences()
  );
  const filterOptions = useMemo(() => getFilterOptions(entities), [entities]);
  const activeViewerPreferences = useMemo(
    () => pruneViewerPreferencesToLiveOptions(viewerPreferences, filterOptions),
    [viewerPreferences, filterOptions]
  );
  const settings = useMemo(
    () => createResolvedSettings(dashboardConfig, activeViewerPreferences),
    [activeViewerPreferences]
  );

  useEffect(() => {
    saveViewerPreferences(activeViewerPreferences);
  }, [activeViewerPreferences]);

  useEffect(() => {
    fetch(`${HUB_HTTP}/api/state`)
      .then((res) => res.json())
      .then((data) => {
        setEntities(((data.entities ?? []) as DashboardEntity[]).map(normalizeEntity));
      })
      .catch(() => {
        // no-op for initial load
      });
  }, []);

  useEffect(() => {
    const socket = new WebSocket(HUB_WS);
    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("error", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type: string;
          events?: Array<{
            entityId: string;
            source: string;
            sourceHost: string;
            displayName: string;
            entityKind: string;
            sessionId?: string;
            parentEntityId?: string | null;
            timestamp: string;
            summary?: string;
            activityScore?: number;
          }>;
        };
        if (payload.type !== "events" || !payload.events) {
          return;
        }
        const events = payload.events;
        setEntities((previous) => {
          const next = new Map(previous.map((entity) => [entity.entityId, entity]));
          for (const eventItem of events) {
            const prev = next.get(eventItem.entityId);
            next.set(eventItem.entityId, {
              entityId: eventItem.entityId,
              source: eventItem.source,
              sourceHost: eventItem.sourceHost,
              displayName: eventItem.displayName,
              entityKind: eventItem.entityKind,
              sessionId: eventItem.sessionId,
              parentEntityId: eventItem.parentEntityId,
              currentStatus: resolveLiveStatus(prev?.currentStatus, eventItem.timestamp),
              lastEventAt: eventItem.timestamp,
              lastSummary: eventItem.summary ?? prev?.lastSummary,
              activityScore: eventItem.activityScore ?? prev?.activityScore ?? 0.5,
              recentEvents: prev?.recentEvents ?? []
            });
          }
          return [...next.values()];
        });
      } catch {
        // Ignore bad messages.
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEntities((previous) => previous.map(normalizeEntity));
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const visibleEntities = useMemo(() => getVisibleEntities(entities, settings), [entities, settings]);
  const columns = getGridColumns(visibleEntities.length, settings.layout.density);
  const emptyMessage = getEmptyStateMessage(entities.length, visibleEntities.length);

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
        <header className="topbar">
          <div>
            <p className="eyebrow">Live session mural</p>
            <h1>Agent Watch</h1>
          </div>
          <div className={`badge ${connected ? "ok" : "warn"}`}>{connected ? "Live" : "Disconnected"}</div>
        </header>

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
          {visibleEntities.map((entity) => (
            <AgentFaceCard
              key={entity.entityId}
              entity={entity}
              theme={settings.theme}
              visualRules={settings.visualRules}
            />
          ))}
          {visibleEntities.length === 0 ? (
            <p className={`empty ${entities.length > 0 ? "empty--filtered" : ""}`}>{emptyMessage}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
