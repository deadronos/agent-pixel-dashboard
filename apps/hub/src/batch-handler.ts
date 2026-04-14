import { parseIngestBatchBody } from "@agent-watch/event-schema";
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
      res.status(401).json({ error: "unauthorized", message: "invalid bearer token" });
      return;
    }

    const maxBatchBytes = Number(process.env.MAX_BATCH_BYTES ?? 1500000);

    const rawContentLength = (typeof req.get === 'function' ? req.get("content-length") : (typeof req.header === 'function' ? req.header("content-length") : undefined));
    const contentLength = Number(rawContentLength ?? 0);
    if (contentLength > 0 && Number.isFinite(contentLength) && contentLength > maxBatchBytes) {
      res.status(413).json({ error: "payload_too_large", message: `Batch exceeds MAX_BATCH_BYTES (${maxBatchBytes})` });
      return;
    }

    try {
      const bodySize = Buffer.byteLength(JSON.stringify(req.body ?? ''), "utf8");
      if (bodySize > maxBatchBytes) {
        res.status(413).json({ error: "payload_too_large", message: `Batch exceeds MAX_BATCH_BYTES (${maxBatchBytes})` });
        return;
      }

      // validate batch shape
      try {
        parseIngestBatchBody(req.body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "invalid batch body";
        res.status(400).json({ error: "invalid_batch", message: msg });
        return;
      }

      const result = options.store.ingestBatch(req.body);
      if (result.accepted.length > 0) {
        options.broadcast({ type: "events", events: result.accepted });
      }
      res.json({ accepted: result.accepted.length, rejected: result.rejected });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      res.status(500).json({ error: "server_error", message: msg });
    }
  };
}
