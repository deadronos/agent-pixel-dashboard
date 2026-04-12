import type { ViewerPreferences } from "./dashboard-settings.js";
import type { FilterOptions, GroupedDashboardEntity, ViewSettings } from "./dashboard-view-types.js";

export function getFilterOptions(entities: readonly GroupedDashboardEntity[]): FilterOptions {
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
    pruned.visibleEntityKinds = preferences.visibleEntityKinds.filter((kind) => options.entityKinds.includes(kind));
  }

  return pruned;
}

export function matchesFilters(entity: GroupedDashboardEntity, settings: ViewSettings): boolean {
  if (settings.filters.hideDormant && entity.currentStatus === "dormant") {
    return false;
  }
  if (settings.filters.hideDone && entity.currentStatus === "done") {
    return false;
  }
  if (settings.filters.sourceFilterActive && !settings.filters.visibleSources.includes(entity.source)) {
    return false;
  }
  if (settings.filters.entityKindFilterActive && !settings.filters.visibleEntityKinds.includes(entity.entityKind)) {
    return false;
  }
  return true;
}
