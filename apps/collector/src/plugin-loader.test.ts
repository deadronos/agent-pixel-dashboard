import { describe, expect, it } from "vitest";

import {
  discoverCollectorPlugins,
  extractSourceFromDirName,
  resolvePluginDir,
  resolveRequestedSources
} from "./plugin-loader.js";

describe("discoverCollectorPlugins", () => {
  it("reads plugin metadata from the filesystem", async () => {
    const registrations = await discoverCollectorPlugins(resolvePluginDir("plugins"));
    expect(registrations).toContainEqual(
      expect.objectContaining({
        source: "codex",
        directoryName: "plugin-codex-watch",
        packageName: "@agent-watch/plugin-codex-watch"
      })
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({
        source: "opencode",
        directoryName: "plugin-opencode-watch",
        packageName: "@agent-watch/plugin-opencode-watch"
      })
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({
        source: "hermes",
        directoryName: "plugin-hermes-watch",
        packageName: "@agent-watch/plugin-hermes-watch"
      })
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({
        source: "pi",
        directoryName: "plugin-pi-watch",
        packageName: "@agent-watch/plugin-pi-watch"
      })
    );
  });
});

describe("extractSourceFromDirName", () => {
  it("extracts source from plugin directory name", () => {
    expect(extractSourceFromDirName("plugin-codex-watch")).toBe("codex");
    expect(extractSourceFromDirName("plugin-openclaw-watch")).toBe("openclaw");
    expect(extractSourceFromDirName("plugin-opencode-watch")).toBe("opencode");
    expect(extractSourceFromDirName("plugin-hermes-watch")).toBe("hermes");
    expect(extractSourceFromDirName("plugin-pi-watch")).toBe("pi");
  });

  it("rejects non-matching directory names", () => {
    expect(extractSourceFromDirName("plugin-codex")).toBeNull();
    expect(extractSourceFromDirName("random-folder")).toBeNull();
  });
});

describe("resolveRequestedSources", () => {
  it("returns discovered sources for auto", () => {
    const discovered = ["codex", "claude", "gemini"];
    expect(resolveRequestedSources(["auto"], discovered)).toEqual(discovered);
    expect(resolveRequestedSources(["all"], discovered)).toEqual(discovered);
  });

  it("returns filtered explicit sources in stable order", () => {
    const discovered = ["codex", "claude", "gemini"];
    expect(resolveRequestedSources(["gemini", "codex"], discovered)).toEqual(["gemini", "codex"]);
    expect(resolveRequestedSources(["gemini", "unknown", "codex"], discovered)).toEqual(["gemini", "codex"]);
  });
});

describe("resolvePluginDir", () => {
  it("resolves relative paths against the repo root", () => {
    expect(resolvePluginDir("plugins")).toMatch(/\/plugins$/);
  });

  it("preserves absolute paths", () => {
    expect(resolvePluginDir("/tmp/custom-plugins")).toBe("/tmp/custom-plugins");
  });
});
