export interface ConversationDetailLookup {
  source: string;
  sessionId?: string;
  entityId: string;
}
export {
  parseConversationDetailPayload,
  type ConversationDetailPayload
} from "@agent-watch/event-schema";

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
