import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardTopbar } from "./DashboardTopbar.js";

describe("DashboardTopbar", () => {
  it("renders a visible settings toggle and connection status copy", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardTopbar, {
        connectionState: "offline",
        statusSummary: {
          total: 0,
          active: 0,
          idle: 0,
          sleepy: 0,
          dormant: 0,
          done: 0,
          error: 0,
        },
        settingsPanelAvailable: true,
        settingsPanelOpen: false,
        onToggleSettings: () => undefined,
      })
    );

    expect(markup).toContain("Show settings");
    expect(markup).toContain("Disconnected");
    expect(markup).toContain("Waiting for the first collector event.");
  });

  it("shows latest activity when live data is available", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardTopbar, {
        connectionState: "live",
        statusSummary: {
          total: 3,
          active: 1,
          idle: 1,
          sleepy: 0,
          dormant: 1,
          done: 0,
          error: 0,
          latestEventAt: "2026-04-10T10:05:00.000Z",
        },
        settingsPanelAvailable: true,
        settingsPanelOpen: true,
        onToggleSettings: () => undefined,
      })
    );

    expect(markup).toContain("Hide settings");
    expect(markup).toContain("Tracking 3 conversations.");
    expect(markup).toContain("Latest event");
    expect(markup).toContain("Live");
  });
});