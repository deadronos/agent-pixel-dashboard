import { describe, expect, it } from "vitest";

import { getHubCorsOptions } from "./cors.js";

describe("getHubCorsOptions", () => {
  it("reflects the request origin when no allowlist is configured", () => {
    expect(getHubCorsOptions([]).origin).toBe(true);
  });

  it("uses the explicit allowlist when provided", () => {
    expect(getHubCorsOptions(["http://localhost:5173", "https://dashboard.example"])).toEqual({
      origin: ["http://localhost:5173", "https://dashboard.example"]
    });
  });
});
