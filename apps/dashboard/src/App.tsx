import { useEffect, useMemo, useState } from "react";

type EntityStatus = "active" | "idle" | "sleepy" | "dormant" | "done" | "error";

interface EntityState {
  entityId: string;
  source: string;
  sourceHost: string;
  displayName: string;
  entityKind: string;
  sessionId?: string;
  parentEntityId?: string | null;
  currentStatus: EntityStatus;
  lastEventAt: string;
  lastSummary?: string;
  activityScore: number;
  recentEvents: string[];
}

function getGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

const HUB_HTTP = import.meta.env.VITE_HUB_HTTP ?? "http://localhost:3030";
const HUB_WS = import.meta.env.VITE_HUB_WS ?? "ws://localhost:3030/ws";

export function App() {
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch(`${HUB_HTTP}/api/state`)
      .then((res) => res.json())
      .then((data) => {
        setEntities((data.entities ?? []) as EntityState[]);
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
              currentStatus: "active",
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

  const sorted = useMemo(() => {
    return [...entities].sort((left, right) => right.activityScore - left.activityScore);
  }, [entities]);
  const columns = getGridColumns(sorted.length);

  return (
    <main className="dashboard">
      <header className="topbar">
        <h1>Agent Watch</h1>
        <div className={`badge ${connected ? "ok" : "warn"}`}>{connected ? "Live" : "Disconnected"}</div>
      </header>
      <section className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {sorted.map((entity) => (
          <article key={entity.entityId} className={`tile ${entity.currentStatus}`}>
            <div className="tile-header">
              <h2>{entity.displayName}</h2>
              <span>{entity.currentStatus}</span>
            </div>
            <p>{entity.lastSummary ?? "No summary yet"}</p>
            <div className="meta">
              <span>{entity.source}</span>
              <span>{entity.sourceHost}</span>
            </div>
          </article>
        ))}
        {sorted.length === 0 ? <p className="empty">No active entities yet. Start the collector to stream events.</p> : null}
      </section>
    </main>
  );
}
