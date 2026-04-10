import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsPanel } from "./SettingsPanel.js";
import { dashboardConfig } from "./dashboard-config.js";
import { createResolvedSettings } from "./dashboard-settings.js";
import {
  loadViewerPreferences,
  resetViewerPreferences,
  saveViewerPreferences
} from "./viewer-preferences.js";

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true
  });
}

describe("viewer preferences", () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it("round-trips persisted viewer overrides", () => {
    saveViewerPreferences({ maxAgentsShown: 6, hideDormant: true, themeId: "night-shift" });

    expect(loadViewerPreferences()).toEqual({
      maxAgentsShown: 6,
      hideDormant: true,
      themeId: "night-shift"
    });
  });

  it("clears overrides on reset", () => {
    saveViewerPreferences({ density: "compact" });

    resetViewerPreferences();

    expect(loadViewerPreferences()).toEqual({});
  });

  it("ignores malformed stored preferences", () => {
    localStorage.setItem("agent-watch.viewer-preferences", "{not-json");

    expect(loadViewerPreferences()).toEqual({});
  });

  it("sanitizes stored preferences field by field", () => {
    localStorage.setItem(
      "agent-watch.viewer-preferences",
      JSON.stringify({
        maxAgentsShown: 0,
        density: "compact",
        sortMode: "recent",
        hideDormant: "true",
        hideDone: false,
        visibleSources: ["codex", 7, "claude"],
        visibleEntityKinds: ["worker", null, "session"],
        themeId: 42,
        artStyleMode: "playful"
      })
    );

    expect(loadViewerPreferences()).toEqual({
      density: "compact",
      sortMode: "recent",
      hideDone: false,
      visibleSources: ["codex", "claude"],
      visibleEntityKinds: ["worker", "session"],
      artStyleMode: "playful"
    });
  });
});

describe("SettingsPanel", () => {
  it("uses canonical resolved values instead of recomputing from config", () => {
    const settings = createResolvedSettings(dashboardConfig, {
      maxAgentsShown: 6,
      themeId: "night-shift",
      hideDormant: true
    });

    const markup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        config: dashboardConfig,
        settings,
        onChange: () => undefined,
        onReset: () => undefined
      })
    );

    expect(markup).toContain("<output>6</output>");
    expect(markup).toContain('value="night-shift" selected');
  });
});
