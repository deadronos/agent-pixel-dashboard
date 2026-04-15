import http from "node:http";

import { type HubHelloMessage } from "@agent-watch/event-schema";
import cors from "cors";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

import { createBatchHandler } from "./batch-handler.js";
import { getHubCorsOptions } from "./cors.js";
import { HubStore } from "./hub-store.js";
import { createRecentEventsHandler } from "./recent-events-handler.js";
import { createRateLimiter } from "./rate-limiter.js";
import { createStateHandler } from "./state-handler.js";

export async function startTestHub(authToken = "test-token"): Promise<{
  baseUrl: string;
  port: number;
  store: HubStore;
  close: () => Promise<void>;
}> {
  // Set auth token before any hub module reads process.env.HUB_AUTH_TOKEN
  const originalAuthToken = process.env.HUB_AUTH_TOKEN;
  process.env.HUB_AUTH_TOKEN = authToken ?? "test-secret";

  const app = express();
  app.use(cors(getHubCorsOptions([])));
  app.use(express.json({ limit: "2mb" }));

  // Generous rate limit so tests are not throttled
  const { middleware: eventsRateLimiter } = createRateLimiter({
    windowMs: 60_000,
    max: 10_000,
  });

  const store = new HubStore();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  function broadcast(payload: unknown): void {
    const encoded = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(encoded);
        } catch (error) {
          console.error(
            "WebSocket send failed:",
            error instanceof Error ? error.message : String(error),
          );
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

  wss.on("connection", (socket) => {
    const payload: HubHelloMessage = { type: "hello", entities: store.entityCount };
    socket.send(JSON.stringify(payload));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unexpected server address format after listen");
  }
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  function close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      wss.close(() => {
        server.close((err) => {
          if (err) reject(err);
          else {
            // Restore the original HUB_AUTH_TOKEN
            if (originalAuthToken === undefined) {
              Reflect.deleteProperty(process.env, "HUB_AUTH_TOKEN");
            } else {
              process.env.HUB_AUTH_TOKEN = originalAuthToken;
            }
            resolve();
          }
        });
      });
    });
  }

  return { baseUrl, port, store, close };
}
