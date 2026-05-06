import { describe, expect, it, vi } from "vitest";

import type { HubStore } from "./hub-store.js";
import { createStateHandler } from "./state-handler.js";

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

describe("createStateHandler", () => {
  it("returns only active/idle/sleepy entities when includeDormant=0", () => {
    const getState = vi.fn().mockReturnValue({ entities: [{ id: "1", status: "idle" }] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: {} } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(res.body).toEqual({ entities: [{ id: "1", status: "idle" }] });
    expect(getState).toHaveBeenCalledWith(false, expect.any(Date), undefined, 0);
  });

  it("returns all entities including dormant when includeDormant=1", () => {
    const getState = vi.fn().mockReturnValue({ entities: [{ id: "1", status: "idle" }, { id: "2", status: "dormant" }] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { includeDormant: "1" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(res.body).toEqual({ entities: [{ id: "1", status: "idle" }, { id: "2", status: "dormant" }] });
    expect(getState).toHaveBeenCalledWith(true, expect.any(Date), undefined, 0);
  });

  it("returns empty entities array from empty store", () => {
    const getState = vi.fn().mockReturnValue({ entities: [] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: {} } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(res.body).toEqual({ entities: [] });
    expect(getState).toHaveBeenCalledWith(false, expect.any(Date), undefined, 0);
  });

  it("calls store.getState with correct includeDormant and now args", () => {
    const getState = vi.fn().mockReturnValue({ entities: [] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { includeDormant: "1" } } as any;
    const res = createMockRes();
    const before = new Date();

    handler(req, res as any, () => undefined);

    const after = new Date();
    const call = getState.mock.calls[0];
    expect(call[0]).toBe(true); // includeDormant
    expect(call[1].getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call[1].getTime()).toBeLessThanOrEqual(after.getTime()); // now is approximately "now"
    expect(call[2]).toBeUndefined(); // limit
    expect(call[3]).toBe(0); // offset
  });

  it("passes limit and offset to getState", () => {
    const getState = vi.fn().mockReturnValue({ entities: [] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { limit: "10", offset: "20" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(getState).toHaveBeenCalledWith(false, expect.any(Date), 10, 20);
  });

  it("treats empty-string params as no pagination", () => {
    const getState = vi.fn().mockReturnValue({ entities: [] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { limit: "", offset: "" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(getState).toHaveBeenCalledWith(false, expect.any(Date), undefined, 0);
  });

  it("treats missing limit as no pagination limit", () => {
    const getState = vi.fn().mockReturnValue({ entities: [] });
    const store = { getState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { offset: "5" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);

    expect(getState).toHaveBeenCalledWith(false, expect.any(Date), undefined, 5);
  });
});
