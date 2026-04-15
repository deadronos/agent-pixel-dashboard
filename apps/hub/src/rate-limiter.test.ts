import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "./rate-limiter.js";

function createMockReq(overrides: { ip?: string; headers?: Record<string, string> } = {}) {
  return {
    ip: overrides.ip,
    headers: overrides.headers ?? {},
  } as any;
}

function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => void;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  return res;
}

describe("createRateLimiter", () => {
  describe("cleanup", () => {
    it("removes entries whose window has expired", () => {
      const { middleware: limiter, cleanup, store } = createRateLimiter({ windowMs: 10_000, max: 3 });
      const req = createMockReq({ ip: "192.168.1.1" });
      const res = createMockRes();
      const next = vi.fn();

      // Exhaust the window for IP
      for (let i = 0; i < 3; i++) {
        limiter(req, res as any, next as any);
      }

      // Entry is in store and exhausted
      expect(store.get("192.168.1.1")!.count).toBe(3);

      // Simulate time advancing by directly mutating windowEnd to the past
      store.get("192.168.1.1")!.windowEnd = Date.now() - 1;

      // Run cleanup
      cleanup();

      // Entry should be removed
      expect(store.has("192.168.1.1")).toBe(false);
    });

    it("does not remove entries still within their window", () => {
      const { middleware: limiter, cleanup, store } = createRateLimiter({ windowMs: 10_000, max: 3 });
      const req = createMockReq({ ip: "192.168.1.1" });
      const res = createMockRes();
      const next = vi.fn();

      limiter(req, res as any, next as any);

      expect(store.has("192.168.1.1")).toBe(true);
      cleanup();
      expect(store.has("192.168.1.1")).toBe(true);
    });
  });

  describe("first request in new window", () => {
    it("allows first request and sets counter", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = createMockReq({ ip: "192.168.1.1" });
      const res = createMockRes();
      const next = vi.fn();

      limiter(req, res as any, next as any);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
  });

  describe("burst at limit", () => {
    it("blocks 4th request when max=3", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = createMockReq({ ip: "192.168.1.1" });
      const res = createMockRes();
      const next = vi.fn();

      // 3 requests should pass
      for (let i = 0; i < 3; i++) {
        limiter(req, res as any, next as any);
      }

      expect(next).toHaveBeenCalledTimes(3);

      // 4th request should be rate limited
      next.mockClear();
      limiter(req, res as any, next as any);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: "rate_limited", message: "Too many requests" });
    });
  });

  describe("separate IPs get independent counters", () => {
    it("new IP gets fresh window and is not blocked by other IP's requests", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 3 });
      const reqA = createMockReq({ ip: "192.168.1.1" });
      const reqB = createMockReq({ ip: "192.168.1.2" });
      const resA = createMockRes();
      const resB = createMockRes();
      const nextA = vi.fn();
      const nextB = vi.fn();

      // Exhaust limit for IP A
      for (let i = 0; i < 3; i++) {
        limiter(reqA, resA as any, nextA as any);
      }

      expect(nextA).toHaveBeenCalledTimes(3);

      // IP B should still be allowed (independent counter)
      limiter(reqB, resB as any, nextB as any);
      expect(nextB).toHaveBeenCalled();
      expect(resB.statusCode).toBe(200);
    });
  });

  describe("x-forwarded-for fallback", () => {
    it("uses x-forwarded-for when req.ip is undefined", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = createMockReq({
        ip: undefined as any,
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      const res = createMockRes();
      const next = vi.fn();

      limiter(req, res as any, next as any);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it("uses first IP from comma-separated x-forwarded-for", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 1 });
      const req = createMockReq({
        ip: undefined as any,
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" },
      });
      const res = createMockRes();
      const next = vi.fn();

      // First request should pass
      limiter(req, res as any, next as any);
      expect(next).toHaveBeenCalledTimes(1);

      // Second request from same IP (first in x-forwarded-for chain) should be blocked
      next.mockClear();
      limiter(req, res as any, next as any);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
    });
  });

  describe("unknown key fallback", () => {
    it("uses 'unknown' when both ip and x-forwarded-for are missing", () => {
      const { middleware: limiter } = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = createMockReq({ ip: undefined, headers: {} });
      const res = createMockRes();
      const next = vi.fn();

      limiter(req, res as any, next as any);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
  });
});
