import type { ResolvedSettings } from "./dashboard-settings.js";
import type { EntityStatus } from "./face.js";

export interface DashboardEntity {
  entityId: string;
  source: string;
  entityKind: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  activityScore: number;
}

export type ViewSettings = Pick<ResolvedSettings, "layout" | "filters">;

export function getVisibleEntities<T extends DashboardEntity>(entities: readonly T[], settings: ViewSettings): T[] {
  const filtered = entities.filter((entity) => {
    if (settings.filters.hideDormant && entity.currentStatus === "dormant") {
      return false;
    }
    if (settings.filters.hideDone && entity.currentStatus === "done") {
      return false;
    }
    if (
      settings.filters.visibleSources.length > 0 &&
      !settings.filters.visibleSources.includes(entity.source)
    ) {
      return false;
    }
    if (
      settings.filters.visibleEntityKinds.length > 0 &&
      !settings.filters.visibleEntityKinds.includes(entity.entityKind)
    ) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (settings.layout.sortMode === "recent") {
      const rightTimestamp = getSortableTimestamp(right.lastEventAt);
      const leftTimestamp = getSortableTimestamp(left.lastEventAt);

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.entityId.localeCompare(right.entityId);
    }

    return right.activityScore - left.activityScore;
  });

  return sorted.slice(0, settings.layout.maxAgentsShown);
}

export function getGridColumns(count: number, density: "compact" | "comfortable"): number {
  if (count <= 1) {
    return 1;
  }
  if (count <= 2) {
    return 2;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 6) {
    return density === "compact" ? 4 : 3;
  }
  return density === "compact" ? 5 : 4;
}

function getSortableTimestamp(timestamp: string): number {
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
