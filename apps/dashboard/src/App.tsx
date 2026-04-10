import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AgentFaceCard } from "./AgentFaceCard.js";
import {
  buildConversationDetailUrl,
  type ConversationDetailPayload
} from "./conversation-detail.js";
import { ConversationDrawer } from "./ConversationDrawer.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { dashboardConfig } from "./dashboard-config.js";
import { createResolvedSettings, type ViewerPreferences } from "./dashboard-settings.js";
import {
  getEmptyStateMessage,
  getFilterOptions,
  getGridColumns,
  findVisibleEntityGroupById,
  getVisibleEntityGroups,
  pruneViewerPreferencesToLiveOptions
} from "./dashboard-view.js";
import { toggleSelectedGroupId } from "./conversation-selection.js";
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ConversationDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
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

  const visibleGroups = useMemo(() => getVisibleEntityGroups(entities, settings), [entities, settings]);
  const selectedVisibleGroup = useMemo(
    () => findVisibleEntityGroupById(visibleGroups, selectedGroupId),
    [selectedGroupId, visibleGroups]
  );
  const selectedVisibleGroupId = selectedVisibleGroup?.groupId ?? null;
  const columns = getGridColumns(visibleGroups.length, settings.layout.density);
  const emptyMessage = getEmptyStateMessage(entities.length, visibleGroups.length);

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
    if (!selectedGroupId) {
      setSelectedDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    if (!selectedVisibleGroup) {
      setSelectedGroupId(null);
      setSelectedDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    setSelectedDetail(null);

    fetch(
      buildConversationDetailUrl(HUB_HTTP, {
        source: selectedVisibleGroup.source,
        sessionId: selectedVisibleGroup.sessionId,
        entityId: selectedVisibleGroup.representative.entityId
      }),
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`detail request failed (${response.status})`);
        }
        return (await response.json()) as ConversationDetailPayload;
      })
      .then((detail) => {
        if (controller.signal.aborted) {
          return;
        }
        setSelectedDetail(detail);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setSelectedDetail(null);
        setDetailError(error instanceof Error ? error.message : "Failed to load conversation detail");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedGroupId, selectedVisibleGroupId]);

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
          {visibleGroups.map((group) => (
            <AgentFaceCard
              key={group.groupId}
              entity={group.representative}
              groupCount={group.memberCount}
              theme={settings.theme}
              visualRules={settings.visualRules}
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
