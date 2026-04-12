import {
  parseHubMessage,
  parseHubStateResponse,
  resolveEntityStatus,
  type DashboardEntity,
  type NormalizedEvent
} from "@agent-watch/event-schema";
import { useEffect, useState } from "react";

export type ConnectionState = "connecting" | "live" | "offline";

const MAX_RECENT_EVENTS = 25;

function normalizeEntity(entity: DashboardEntity): DashboardEntity {
  return {
    ...entity,
    currentStatus: resolveEntityStatus(entity.currentStatus, entity.lastEventAt)
  };
}

function applyIncomingEvents(previous: DashboardEntity[], events: readonly NormalizedEvent[]): DashboardEntity[] {
  const next = new Map(previous.map((entity) => [entity.entityId, entity]));

  for (const event of events) {
    const previousEntity = next.get(event.entityId);
    const groupKey =
      typeof event.meta?.groupKey === "string" ? event.meta.groupKey : previousEntity?.groupKey;
    const recentEvents = [...(previousEntity?.recentEvents ?? []), event.eventId].slice(-MAX_RECENT_EVENTS);

    next.set(event.entityId, {
      entityId: event.entityId,
      source: event.source,
      sourceHost: event.sourceHost,
      displayName: event.displayName,
      entityKind: event.entityKind,
      sessionId: event.sessionId,
      parentEntityId: event.parentEntityId,
      groupKey,
      currentStatus: resolveEntityStatus(previousEntity?.currentStatus, event.timestamp),
      lastEventAt: event.timestamp,
      lastSummary: event.summary ?? previousEntity?.lastSummary,
      activityScore: event.activityScore ?? previousEntity?.activityScore ?? 0.5,
      recentEvents
    });
  }

  return [...next.values()];
}

export function useLiveEntities(hubHttp: string, hubWs: string): {
  entities: DashboardEntity[];
  connectionState: ConnectionState;
} {
  const [entities, setEntities] = useState<DashboardEntity[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    fetch(`${hubHttp}/api/state`)
      .then((res) => res.json())
      .then((data) => {
        const payload = parseHubStateResponse(data);
        setEntities(payload.entities.map(normalizeEntity));
      })
      .catch(() => {
        // Ignore initial fetch failures and let the live stream recover.
      });
  }, [hubHttp]);

  useEffect(() => {
    const socket = new WebSocket(hubWs);
    socket.addEventListener("open", () => setConnectionState("live"));
    socket.addEventListener("close", () => setConnectionState("offline"));
    socket.addEventListener("error", () => setConnectionState("offline"));
    socket.addEventListener("message", (event) => {
      try {
        const payload = parseHubMessage(JSON.parse(event.data as string));
        if (payload.type !== "events") {
          return;
        }

        setEntities((previous) => applyIncomingEvents(previous, payload.events));
      } catch {
        // Ignore malformed websocket messages to keep the dashboard live.
      }
    });

    return () => {
      socket.close();
    };
  }, [hubWs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEntities((previous) => previous.map(normalizeEntity));
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return {
    entities,
    connectionState
  };
}
