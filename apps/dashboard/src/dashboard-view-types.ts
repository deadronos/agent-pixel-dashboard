import type { DashboardEntity as SharedDashboardEntity } from "@agent-watch/event-schema";

import type { ResolvedSettings, ViewerPreferences } from "./dashboard-settings.js";

export type DashboardEntity = Pick<
  SharedDashboardEntity,
  | "entityId"
  | "source"
  | "entityKind"
  | "sessionId"
  | "parentEntityId"
  | "groupKey"
  | "currentStatus"
  | "lastEventAt"
  | "activityScore"
>;

export type ViewSettings = Pick<ResolvedSettings, "layout" | "filters">;

export interface FilterOptions {
  sources: string[];
  entityKinds: string[];
}

export interface EntityStatusSummary {
  total: number;
  active: number;
  idle: number;
  sleepy: number;
  dormant: number;
  done: number;
  error: number;
  latestEventAt?: string;
}

export interface DashboardEntityGroup<T extends DashboardEntity = DashboardEntity> {
  groupId: string;
  sessionId: string | undefined;
  source: string;
  currentStatus: T["currentStatus"];
  lastEventAt: string;
  activityScore: number;
  memberCount: number;
  representative: T;
  members: T[];
}

export interface ViewerPreferenceOptions {
  preferences: ViewerPreferences;
  options: FilterOptions;
}
