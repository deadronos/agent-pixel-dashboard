import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("throws an error when HUB_AUTH_TOKEN is missing", () => {
    const env: Record<string, string | undefined> = {
      // Intentionally missing HUB_AUTH_TOKEN
      COLLECTOR_ID: "test-collector",
    };

    expect(() => loadConfig(env)).toThrow("HUB_AUTH_TOKEN environment variable is required");
  });

  it("successfully parses configuration when HUB_AUTH_TOKEN is provided", () => {
    const env: Record<string, string | undefined> = {
      HUB_AUTH_TOKEN: "my-secret-token",
      COLLECTOR_ID: "test-collector",
      HUB_URL: "http://my-hub:3030",
    };

    const config = loadConfig(env);

    expect(config.hubToken).toBe("my-secret-token");
    expect(config.collectorId).toBe("test-collector");
    expect(config.hubUrl).toBe("http://my-hub:3030");
  });
});
