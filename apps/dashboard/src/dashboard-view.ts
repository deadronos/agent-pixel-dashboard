import type { ResolvedSettings } from "./dashboard-settings.js";
import type { ViewerPreferences } from "./dashboard-settings.js";
import type { EntityStatus } from "./face.js";

export interface DashboardEntity {
  entityId: string;
  source: string;
  entityKind: string;
  sessionId?: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  activityScore: number;
}

export type ViewSettings = Pick<ResolvedSettings, "layout" | "filters">;

export interface FilterOptions {
  sources: string[];
  entityKinds: string[];
}

export interface DashboardEntityGroup<T extends DashboardEntity = DashboardEntity> {
  groupId: string;
  sessionId: string | undefined;
  source: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  activityScore: number;
  memberCount: number;
  representative: T;
  members: T[];
}

export function getVisibleEntityGroups<T extends DashboardEntity>(
  entities: readonly T[],
  settings: ViewSettings
): DashboardEntityGroup<T>[] {
  const grouped = new Map<string, T[]>();

  for (const entity of entities) {
    const key = getGroupingKey(entity);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(entity);
    } else {
      grouped.set(key, [entity]);
    }
  }

  const visibleGroups = [...grouped.entries()]
    .map(([groupId, members]): DashboardEntityGroup<T> | null => {
      const visibleMembers = members.filter((member) => matchesFilters(member, settings));
      if (visibleMembers.length === 0) {
        return null;
      }

      const representative = pickRepresentative(visibleMembers, settings.layout.sortMode);
      const activityScore =
        settings.layout.sortMode === "recent"
          ? representative.activityScore
          : Math.max(...visibleMembers.map((member) => member.activityScore));

      return {
        groupId,
        sessionId: representative.sessionId,
        source: representative.source,
        currentStatus: representative.currentStatus,
        lastEventAt: representative.lastEventAt,
        activityScore,
        memberCount: members.length,
        representative,
        members
      } satisfies DashboardEntityGroup<T>;
    })
    .filter((group): group is DashboardEntityGroup<T> => group !== null)
    .sort((left, right) => {
      if (settings.layout.sortMode === "recent") {
        const rightTimestamp = getSortableTimestamp(right.lastEventAt);
        const leftTimestamp = getSortableTimestamp(left.lastEventAt);

        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp;
        }

        return left.groupId.localeCompare(right.groupId);
      }

      if (right.activityScore !== left.activityScore) {
        return right.activityScore - left.activityScore;
      }

      return left.groupId.localeCompare(right.groupId);
    });

  return visibleGroups.slice(0, settings.layout.maxAgentsShown);
}

export function getVisibleEntities<T extends DashboardEntity>(entities: readonly T[], settings: ViewSettings): T[] {
  return getVisibleEntityGroups(entities, settings).map((group) => group.representative);
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
    return "No conversations match the current filters. Reset your overrides or widen the filters.";
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

function getGroupingKey(entity: DashboardEntity): string {
  const stableId = entity.sessionId?.trim() || entity.entityId;
  return `${entity.source}|${stableId}`;
}

function matchesFilters(entity: DashboardEntity, settings: ViewSettings): boolean {
  if (settings.filters.hideDormant && entity.currentStatus === "dormant") {
    return false;
  }
  if (settings.filters.hideDone && entity.currentStatus === "done") {
    return false;
  }
  if (settings.filters.sourceFilterActive && !settings.filters.visibleSources.includes(entity.source)) {
    return false;
  }
  if (
    settings.filters.entityKindFilterActive &&
    !settings.filters.visibleEntityKinds.includes(entity.entityKind)
  ) {
    return false;
  }
  return true;
}

function pickRepresentative<T extends DashboardEntity>(
  members: readonly T[],
  sortMode: ViewSettings["layout"]["sortMode"]
): T {
  return [...members].sort((left, right) => {
    if (sortMode === "recent") {
      const rightTimestamp = getSortableTimestamp(right.lastEventAt);
      const leftTimestamp = getSortableTimestamp(left.lastEventAt);

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
    }

    if (right.activityScore !== left.activityScore) {
      return right.activityScore - left.activityScore;
    }

    return left.entityId.localeCompare(right.entityId);
  })[0];
}
