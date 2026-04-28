import "./env.js";
import http from "node:http";

import {
  type HubHelloMessage
} from "@agent-watch/event-schema";
import cors from "cors";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

import { createBatchHandler } from "./batch-handler.js";
import { CassSearchClient } from "./cass-search.js";
import { createConversationDetailHandler } from "./conversation-detail.js";
import { getHubCorsOptions } from "./cors.js";
import { HubStore } from "./hub-store.js";
import { createRecentEventsHandler } from "./recent-events-handler.js";
import { createRateLimiter } from "./rate-limiter.js";
import { createStateHandler } from "./state-handler.js";

const app = express();
const corsOrigins = (process.env.HUB_CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(getHubCorsOptions(corsOrigins)));
app.use(express.json({ limit: "2mb" }));

// Simple in-memory rate limiter for the ingest endpoint
const hubRateLimitWindowMs = Number(process.env.HUB_RATE_LIMIT_WINDOW_MS ?? 60000);
const hubRateLimitMax = Number(process.env.HUB_RATE_LIMIT_MAX ?? 60);
const { middleware: eventsRateLimiter, cleanup: rateLimitCleanup } = createRateLimiter({
  windowMs: hubRateLimitWindowMs,
  max: hubRateLimitMax,
});

// Periodic cleanup of expired rate limit entries
setInterval(() => {
  rateLimitCleanup();
}, hubRateLimitWindowMs);

const authToken = process.env.HUB_AUTH_TOKEN;
if (!authToken) {
  throw new Error("HUB_AUTH_TOKEN environment variable is required");
}
const store = new HubStore();
const cass = new CassSearchClient();

// Expire done/error entities every minute
setInterval(() => {
  store.expire(new Date());
}, 60_000);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(encoded);
      } catch (error) {
         
        console.error("WebSocket send failed:", error instanceof Error ? error.message : String(error));
      }
    }
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, entities: store.entityCount, recentEvents: store.recentEventCount });
});

app.post("/api/events/batch", eventsRateLimiter, createBatchHandler({ authToken, store, broadcast }));
app.get("/api/state", createStateHandler(store));
app.get("/api/events/recent", createRecentEventsHandler({ authToken, store }));

app.get(
  "/api/entity-detail",
  createConversationDetailHandler({
    entities: store.getEntityMap(),
    recentEvents: () => store.getRecentEventsSnapshot()
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
    res.status(503).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "unknown error"
    });
  }
});

wss.on("connection", (socket) => {
  const payload: HubHelloMessage = { type: "hello", entities: store.entityCount };
  socket.send(JSON.stringify(payload));
});

const port = Number(process.env.HUB_PORT ?? 3030);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`hub listening on http://localhost:${port}`);
});
