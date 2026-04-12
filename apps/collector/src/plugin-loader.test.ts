import { describe, expect, it } from "vitest";

import { extractSourceFromDirName, resolvePluginDir, resolveRequestedSources } from "./plugin-loader.js";

describe("extractSourceFromDirName", () => {
  it("extracts source from plugin directory name", () => {
    expect(extractSourceFromDirName("plugin-codex-watch")).toBe("codex");
    expect(extractSourceFromDirName("plugin-openclaw-watch")).toBe("openclaw");
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
