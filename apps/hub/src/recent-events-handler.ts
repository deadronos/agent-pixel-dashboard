import type { RequestHandler } from "express";

import type { HubStore } from "./hub-store.js";

export function createRecentEventsHandler(options: { authToken: string; store: HubStore }): RequestHandler {
  return (req, res) => {
    const header = req.header("authorization");
    const token = header ? header.replace(/^Bearer /i, "") : "";
    if (token !== options.authToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const limit = Number(req.query.limit ?? 100);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    res.json({ events: options.store.getRecentEventsSnapshot().slice(-safeLimit) });
  };
}
