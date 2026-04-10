import "./env.js";
import http from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import { CassSearchClient } from "./cass-search.js";
import { createConversationDetailHandler } from "./conversation-detail.js";
import { applyEvent, computeStatus, type EntityState } from "./state.js";

interface IngestBatchBody {
  collectorId?: string;
  events?: unknown[];
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const authToken = process.env.HUB_AUTH_TOKEN ?? "dev-secret";
const MAX_RECENT_EVENTS = 1000;
const recentEventIds = new Set<string>();
const recentEvents: (NormalizedEvent | undefined)[] = new Array(MAX_RECENT_EVENTS);
let recentEventsIndex = 0;
let recentEventsCount = 0;
const entities = new Map<string, EntityState>();
const cass = new CassSearchClient();

function getRecentEventsSnapshot(): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const start = recentEventsCount === MAX_RECENT_EVENTS ? recentEventsIndex : 0;

  for (let i = 0; i < recentEventsCount; i++) {
    const event = recentEvents[(start + i) % MAX_RECENT_EVENTS];
    if (event) {
      events.push(event);
    }
  }

  return events;
}

function rememberEvent(event: NormalizedEvent): boolean {
  if (recentEventIds.has(event.eventId)) {
    return false;
  }

  if (recentEventsCount === MAX_RECENT_EVENTS) {
    const removed = recentEvents[recentEventsIndex];
    if (removed) {
      recentEventIds.delete(removed.eventId);
    }
  } else {
    recentEventsCount++;
  }

  recentEvents[recentEventsIndex] = event;
  recentEventIds.add(event.eventId);
  recentEventsIndex = (recentEventsIndex + 1) % MAX_RECENT_EVENTS;

  return true;
}

function getAuthHeader(req: express.Request): string {
  const header = req.header("authorization");
  if (!header) {
    return "";
  }
  return header.replace(/^Bearer /i, "");
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(encoded);
      } catch {
        // Ignore individual socket failures and keep broadcasting.
      }
    }
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, entities: entities.size, recentEvents: recentEventsCount });
});

app.post("/api/events/batch", (req, res) => {
  if (getAuthHeader(req) !== authToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body as IngestBatchBody;
  const incoming = Array.isArray(body.events) ? body.events : null;
  if (incoming === null) {
    res.status(400).json({ error: "invalid_events" });
    return;
  }
  const accepted: NormalizedEvent[] = [];
  let rejected = 0;

  for (const entry of incoming) {
    try {
      const event = parseNormalizedEvent(entry);
      if (!rememberEvent(event)) {
        continue;
      }
      accepted.push(event);
      const previous = entities.get(event.entityId);
      entities.set(event.entityId, applyEvent(previous, event));
    } catch {
      rejected++;
      // Keep ingest resilient and skip invalid rows.
    }
  }

  if (accepted.length > 0) {
    broadcast({ type: "events", events: accepted });
  }

  res.json({ accepted: accepted.length, rejected });
});

app.get("/api/state", (req, res) => {
  const now = new Date();
  const includeDormant = String(req.query.includeDormant ?? "0") === "1";
  const state = [...entities.values()].map((entity) => ({
    ...entity,
    currentStatus: computeStatus(entity, now)
  }));
  const filtered = includeDormant
    ? state
    : state.filter((entity) => entity.currentStatus === "active" || entity.currentStatus === "idle" || entity.currentStatus === "sleepy");
  res.json({ entities: filtered });
});

app.get("/api/events/recent", (req, res) => {
  if (getAuthHeader(req) !== authToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const limit = Number(req.query.limit ?? 100);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  res.json({ events: getRecentEventsSnapshot().slice(-safeLimit) });
});

app.get(
  "/api/entity-detail",
  createConversationDetailHandler({
    entities,
    recentEvents: getRecentEventsSnapshot
  })
);

app.get("/api/search/sessions", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  const limit = Number(req.query.limit ?? 10);
  if (!query) {
    res.status(400).json({ error: "missing q" });
    return;
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10;

  try {
    const available = await cass.isAvailable();
    if (!available) {
      res.status(503).json({
        error: "cass_unavailable",
        message: "CASS is not installed or not healthy on this host"
      });
      return;
    }

    const result = await cass.search(query, safeLimit);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "unknown error"
    });
  }
});

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", entities: entities.size }));
});

const port = Number(process.env.HUB_PORT ?? 3030);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`hub listening on http://localhost:${port}`);
});
