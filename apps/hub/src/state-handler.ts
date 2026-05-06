import type { RequestHandler } from "express";

import type { HubStore } from "./hub-store.js";

export function createStateHandler(store: HubStore): RequestHandler {
  return (req, res) => {
    const includeDormant = String(req.query.includeDormant ?? "0") === "1";
    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const limit = rawLimit !== undefined && rawLimit !== "" ? Number(rawLimit) : undefined;
    const offset = rawOffset !== undefined && rawOffset !== "" ? Number(rawOffset) : 0;
    res.json(store.getState(includeDormant, new Date(), limit, offset));
  };
}
