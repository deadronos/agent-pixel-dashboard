import type { RequestHandler } from "express";

import type { HubStore } from "./hub-store.js";

export function createStateHandler(store: HubStore): RequestHandler {
  return (req, res) => {
    const includeDormant = String(req.query.includeDormant ?? "0") === "1";
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    res.json(store.getState(includeDormant, new Date(), limit, offset));
  };
}
