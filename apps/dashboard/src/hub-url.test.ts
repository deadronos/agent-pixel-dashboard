import { describe, expect, it } from "vitest";
import { buildHubWebSocketUrl, resolveHubWebSocketUrl } from "./hub-url.js";

describe("buildHubWebSocketUrl", () => {
  it("derives a websocket URL from an http hub base", () => {
    expect(buildHubWebSocketUrl("http://m4:3032")).toBe("ws://m4:3032/ws");
    expect(buildHubWebSocketUrl("http://m4:3032/")).toBe("ws://m4:3032/ws");
  });

  it("derives a secure websocket URL from an https hub base", () => {
    expect(buildHubWebSocketUrl("https://example.test:8443")).toBe("wss://example.test:8443/ws");
  });

  it("falls back to the derived websocket url when the explicit env var is blank", () => {
    expect(resolveHubWebSocketUrl("   ", "http://m4:3032")).toBe("ws://m4:3032/ws");
  });
});
