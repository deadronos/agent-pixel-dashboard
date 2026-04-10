import type { ResolvedSettings } from "./dashboard-settings.js";
import type { ViewerPreferences } from "./dashboard-settings.js";
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

export interface FilterOptions {
  sources: string[];
  entityKinds: string[];
}

export function getVisibleEntities<T extends DashboardEntity>(entities: readonly T[], settings: ViewSettings): T[] {
  const filtered = entities.filter((entity) => {
    if (settings.filters.hideDormant && entity.currentStatus === "dormant") {
      return false;
    }
    if (settings.filters.hideDone && entity.currentStatus === "done") {
      return false;
    }
    if (
      settings.filters.sourceFilterActive &&
      !settings.filters.visibleSources.includes(entity.source)
    ) {
      return false;
    }
    if (
      settings.filters.entityKindFilterActive &&
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

export function getFilterOptions(entities: readonly DashboardEntity[]): FilterOptions {
  return {
    sources: [...new Set(entities.map((entity) => entity.source))].sort(),
    entityKinds: [...new Set(entities.map((entity) => entity.entityKind))].sort()
  };
}

export function pruneViewerPreferencesToLiveOptions(
  preferences: ViewerPreferences,
  options: FilterOptions
): ViewerPreferences {
  const pruned: ViewerPreferences = { ...preferences };

  if (preferences.visibleSources && options.sources.length > 0) {
    pruned.visibleSources = preferences.visibleSources.filter((source) => options.sources.includes(source));
  }

  if (preferences.visibleEntityKinds && options.entityKinds.length > 0) {
    pruned.visibleEntityKinds = preferences.visibleEntityKinds.filter((kind) =>
      options.entityKinds.includes(kind)
    );
  }

  return pruned;
}

export function getEmptyStateMessage(totalEntities: number, visibleEntities: number): string {
  if (totalEntities === 0) {
    return "No active entities yet. Start the collector to stream events.";
  }
  if (visibleEntities === 0) {
    return "No entities match the current filters. Reset your overrides or widen the filters.";
  }
  return "";
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
