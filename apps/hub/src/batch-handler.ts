import type { HubEventsMessage } from "@agent-watch/event-schema";
import type { RequestHandler } from "express";

import type { HubStore } from "./hub-store.js";

export function createBatchHandler(options: {
  authToken: string;
  store: HubStore;
  // eslint-disable-next-line no-unused-vars
  broadcast: (payload: HubEventsMessage) => void;
}): RequestHandler {
  return (req, res) => {
    const header = req.header("authorization");
    const token = header ? header.replace(/^Bearer /i, "") : "";
    if (token !== options.authToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const result = options.store.ingestBatch(req.body);
      if (result.accepted.length > 0) {
        options.broadcast({ type: "events", events: result.accepted });
      }
      res.json({ accepted: result.accepted.length, rejected: result.rejected });
    } catch {
      res.status(400).json({ error: "invalid_events" });
    }
  };
}
