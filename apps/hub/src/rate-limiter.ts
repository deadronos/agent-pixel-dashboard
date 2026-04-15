import type { Request, Response, NextFunction } from "express";

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, { count: number; windowEnd: number }>();

  const middleware = function eventsRateLimiter(req: Request, res: Response, next: NextFunction): void {
    const rawIp = req.ip ?? (req.headers["x-forwarded-for"] as string | undefined) ?? "";
    const key = rawIp.toString().split(",")[0].trim() || "unknown";
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.windowEnd) {
      store.set(key, { count: 1, windowEnd: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests" });
      return;
    }

    entry.count += 1;
    store.set(key, entry);
    next();
  };

  function cleanup(): void {
    const now = Date.now();
    // Snapshot keys first to avoid concurrent-modification during deletion
    for (const key of [...store.keys()]) {
      const entry = store.get(key);
      if (entry && entry.windowEnd < now) {
        store.delete(key);
      }
    }
  }

  return { middleware, store, cleanup };
}
