import type { RequestHandler } from "express";

import type { HubStore } from "./hub-store.js";

export function createStateHandler(store: HubStore): RequestHandler {
  return (req, res) => {
    const includeDormant = String(req.query.includeDormant ?? "0") === "1";
    res.json(store.getState(includeDormant, new Date()));
  };
}
