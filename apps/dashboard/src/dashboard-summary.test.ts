import { describe, expect, it } from "vitest";
import { getEmptyStateMessage, getEntityStatusSummary } from "./dashboard-summary.js";
import type { GroupedDashboardEntity } from "./dashboard-view-types.js";

describe("dashboard-summary", () => {
  describe("getEmptyStateMessage", () => {
    it("returns specific message when totalEntities is 0", () => {
      const result = getEmptyStateMessage(0, 0);
      expect(result).toBe("No active entities yet. Start the collector to stream events.");
    });

    it("returns specific message when totalEntities > 0 but visibleEntities is 0", () => {
      const result = getEmptyStateMessage(10, 0);
      expect(result).toBe("No conversations match the current filters. Reset your overrides or widen the filters.");
    });

    it("returns empty string when there are visible entities", () => {
      const result = getEmptyStateMessage(10, 5);
      expect(result).toBe("");
    });
  });

  describe("getEntityStatusSummary", () => {
    it("returns zeroed summary for empty entities list", () => {
      const summary = getEntityStatusSummary([]);
      expect(summary).toEqual({
        total: 0,
        active: 0,
        idle: 0,
        sleepy: 0,
        dormant: 0,
        done: 0,
        error: 0,
        latestEventAt: undefined
      });
    });

    it("correctly counts statuses and identifies latest event", () => {
      const entities: GroupedDashboardEntity[] = [
        {
          entityId: "1",
          source: "test",
          entityKind: "agent",
          currentStatus: "active",
          lastEventAt: "2023-01-01T10:00:00Z",
          activityScore: 1
        },
        {
          entityId: "2",
          source: "test",
          entityKind: "agent",
          currentStatus: "idle",
          lastEventAt: "2023-01-01T11:00:00Z",
          activityScore: 0.5
        },
        {
          entityId: "3",
          source: "test",
          entityKind: "agent",
          currentStatus: "active",
          lastEventAt: "2023-01-01T10:30:00Z",
          activityScore: 0.8
        }
      ] as any;

      const summary = getEntityStatusSummary(entities);
      expect(summary).toEqual({
        total: 3,
        active: 2,
        idle: 1,
        sleepy: 0,
        dormant: 0,
        done: 0,
        error: 0,
        latestEventAt: "2023-01-01T11:00:00Z"
      });
    });

    it("handles invalid timestamps gracefully when determining latest event", () => {
      const entities: GroupedDashboardEntity[] = [
        {
          entityId: "1",
          currentStatus: "active",
          lastEventAt: "invalid",
        },
        {
          entityId: "2",
          currentStatus: "active",
          lastEventAt: "2023-01-01T10:00:00Z",
        }
      ] as any;

      const summary = getEntityStatusSummary(entities);
      expect(summary.latestEventAt).toBe("2023-01-01T10:00:00Z");
    });
  });
});
