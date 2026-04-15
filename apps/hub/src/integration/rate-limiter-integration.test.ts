import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startTestHub } from "../test-helpers.js";

describe("rate limiter integration", () => {
  const authToken = "test-token";

  let close: () => Promise<void>;
  let baseUrl: string;

  beforeEach(async () => {
    // Use a small max so we can exercise throttling without sending 65 requests
    const hub = await startTestHub({ authToken, rateLimiterMax: 5, rateLimiterWindowMs: 60_000 });
    close = hub.close;
    baseUrl = hub.baseUrl;
  });

  afterEach(async () => {
    await close();
  });

  it("burst at limit: first 5 requests succeed, 6th gets 429", async () => {
    // Send 7 requests (1 over the limit of 5)
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${baseUrl}/api/events/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ events: [] }),
      });
      results.push(res.status);
    }

    // First 5 should succeed
    expect(results.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    // 6th and 7th should be rate limited
    expect(results.slice(5)).toEqual([429, 429]);
  });
});
