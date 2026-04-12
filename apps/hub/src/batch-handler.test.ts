import { describe, expect, it } from "vitest";

import { createBatchHandler } from "./batch-handler.js";
import { HubStore } from "./hub-store.js";

function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => void;
  } = {
    statusCode: 200,
    body: undefined,
    status(_code: number) {
      this.statusCode = _code;
      return this;
    },
    json(_body: unknown) {
      this.body = _body;
    }
  };
  return res;
}

describe("createBatchHandler", () => {
  it("rejects unauthorized requests", () => {
    const handler = createBatchHandler({
      authToken: "secret",
      store: new HubStore(),
      broadcast: () => undefined
    });
    const req = {
      body: { events: [] },
      header: () => ""
    } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for invalid envelopes", () => {
    const handler = createBatchHandler({
      authToken: "secret",
      store: new HubStore(),
      broadcast: () => undefined
    });
    const req = {
      body: { events: "bad" },
      header: () => "Bearer secret"
    } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(400);
  });
});
