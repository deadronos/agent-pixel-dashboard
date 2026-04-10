import type { EntityStatus } from "./face.js";

export interface ConversationDetailLookup {
  source: string;
  sessionId?: string;
  entityId: string;
}

export interface ConversationDetailEntity {
  entityId: string;
  source: string;
  sourceHost: string;
  displayName: string;
  entityKind: string;
  sessionId?: string;
  parentEntityId?: string | null;
  currentStatus: EntityStatus;
  lastEventAt: string;
  lastSummary?: string;
  activityScore: number;
  recentEvents?: string[];
}

export interface ConversationDetailEvent {
  eventId: string;
  timestamp: string;
  source: string;
  sourceHost: string;
  entityId: string;
  sessionId?: string;
  parentEntityId?: string | null;
  entityKind: string;
  displayName: string;
  eventType: string;
  status: string;
  summary?: string;
  detail?: string;
  activityScore?: number;
  sequence: number;
  meta?: Record<string, unknown>;
}

export interface ConversationDetailPayload {
  groupId: string;
  group: {
    source: string;
    sessionId?: string;
    entityId?: string;
  };
  matchedBy: "session" | "entity";
  current: ConversationDetailEntity;
  representative: ConversationDetailEntity;
  members: ConversationDetailEntity[];
  recentEvents: ConversationDetailEvent[];
}

export function buildConversationDetailUrl(hubHttp: string, group: ConversationDetailLookup): string {
  const normalizedHubHttp = hubHttp.replace(/\/+$/, "");
  const params = new URLSearchParams({ source: group.source });

  if (group.sessionId?.trim()) {
    params.set("sessionId", group.sessionId.trim());
  } else {
    params.set("entityId", group.entityId);
  }

  return `${normalizedHubHttp}/api/entity-detail?${params.toString()}`;
}
