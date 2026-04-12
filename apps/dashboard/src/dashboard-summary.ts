import type { EntityStatusSummary, GroupedDashboardEntity } from "./dashboard-view-types.js";

function getSortableTimestamp(timestamp: string): number {
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function getEntityStatusSummary(entities: readonly GroupedDashboardEntity[]): EntityStatusSummary {
  const summary: EntityStatusSummary = {
    total: entities.length,
    active: 0,
    idle: 0,
    sleepy: 0,
    dormant: 0,
    done: 0,
    error: 0
  };

  for (const entity of entities) {
    summary[entity.currentStatus]++;

    if (!summary.latestEventAt || getSortableTimestamp(entity.lastEventAt) > getSortableTimestamp(summary.latestEventAt)) {
      summary.latestEventAt = entity.lastEventAt;
    }
  }

  return summary;
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
