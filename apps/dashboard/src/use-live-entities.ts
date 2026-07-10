import {
  normalizeDashboardEntity,
  parseHubMessage,
  parseHubStateResponse,
  projectEntityEvent,
  type DashboardEntity,
  type NormalizedEvent
} from "@agent-watch/event-schema";
import { useCallback, useEffect, useState } from "react";

import { createLiveEntitySocket, type LiveEntitySocket } from "./live-entity-socket.js";

export type ConnectionState = "connecting" | "live" | "offline";

const MAX_RECENT_EVENTS = 25;
const FALLBACK_POLL_INTERVAL_MS = 5_000;

function normalizeEntity(entity: DashboardEntity): DashboardEntity {
  return normalizeDashboardEntity(entity);
}

function applyIncomingEvents(previous: DashboardEntity[], events: readonly NormalizedEvent[]): DashboardEntity[] {
  const next = new Map(previous.map((entity) => [entity.entityId, entity]));

  for (const event of events) {
    next.set(event.entityId, projectEntityEvent(next.get(event.entityId), event, { maxRecentEvents: MAX_RECENT_EVENTS }));
  }

  return [...next.values()];
}

export function useLiveEntities(hubHttp: string, hubWs: string): {
  entities: DashboardEntity[];
  connectionState: ConnectionState;
} {
  const [entities, setEntities] = useState<DashboardEntity[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const fetchState = useCallback(() =>
    fetch(`${hubHttp}/api/state`)
      .then((res) => res.json())
      .then((data) => {
        const payload = parseHubStateResponse(data);
        setEntities(payload.entities.map(normalizeEntity));
      })
      .catch(() => {
        // Ignore initial fetch failures and let the live stream recover.
      }), [hubHttp]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (connectionState === "live") {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchState();
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [connectionState, fetchState]);

  useEffect(() => {
    const socket: LiveEntitySocket = createLiveEntitySocket({
      url: hubWs,
      onStateChange: setConnectionState,
      onMessage: (data) => {
        try {
          const payload = parseHubMessage(JSON.parse(data));
          if (payload.type !== "events") {
            return;
          }

          setEntities((previous) => applyIncomingEvents(previous, payload.events));
        } catch {
          // Ignore malformed websocket messages to keep the dashboard live.
        }
      }
    });
    socket.start();

    return () => {
      socket.stop();
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