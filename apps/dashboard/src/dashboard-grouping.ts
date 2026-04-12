import { matchesFilters } from "./dashboard-filters.js";
import type { DashboardEntityGroup, GroupedDashboardEntity, ViewSettings } from "./dashboard-view-types.js";

function getSortableTimestamp(timestamp: string): number {
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function getGroupingKey(entity: GroupedDashboardEntity): string {
  const stableId = entity.groupKey?.trim() || entity.sessionId?.trim() || entity.parentEntityId?.trim() || entity.entityId;
  return `${entity.source}|${stableId}`;
}

function pickRepresentative<T extends GroupedDashboardEntity>(
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

export function getVisibleEntityGroups<T extends GroupedDashboardEntity>(
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

  return [...grouped.entries()]
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
      };
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
    })
    .slice(0, settings.layout.maxAgentsShown);
}

export function findVisibleEntityGroupById<T extends DashboardEntityGroup>(
  groups: readonly T[],
  groupId: string | null | undefined
): T | undefined {
  if (!groupId) {
    return undefined;
  }

  return groups.find((group) => group.groupId === groupId);
}

export function getVisibleEntities<T extends GroupedDashboardEntity>(entities: readonly T[], settings: ViewSettings): T[] {
  return getVisibleEntityGroups(entities, settings).map((group) => group.representative);
}
