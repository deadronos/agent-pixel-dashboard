import os from "node:os";

import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("throws an error when HUB_AUTH_TOKEN is missing", () => {
    expect(() => loadConfig({})).toThrow("HUB_AUTH_TOKEN environment variable is required");
  });

  it("loads config successfully when HUB_AUTH_TOKEN is provided", () => {
    const env = { HUB_AUTH_TOKEN: "my-secret-token" };
    const config = loadConfig(env);
    expect(config.hubToken).toBe("my-secret-token");
    expect(config.collectorId).toBe(`collector-${os.hostname()}`);
  });
});
