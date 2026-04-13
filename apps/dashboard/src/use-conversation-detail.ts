import { useEffect, useState } from "react";

import {
  buildConversationDetailUrl,
  parseConversationDetailPayload,
  type ConversationDetailPayload
} from "./conversation-detail.js";
import type { DashboardEntityGroup } from "./dashboard-view.js";

export function useConversationDetail(
  hubHttp: string,
  selectedGroup: DashboardEntityGroup | undefined,
  selectedGroupId: string | null
): {
  detail: ConversationDetailPayload | null;
  loading: boolean;
  error: string | null;
} {
  const [detail, setDetail] = useState<ConversationDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGroupId || !selectedGroup) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(
      buildConversationDetailUrl(hubHttp, {
        source: selectedGroup.source,
        sessionId: selectedGroup.sessionId,
        entityId: selectedGroup.representative.entityId
      }),
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`detail request failed (${response.status})`);
        }

        return parseConversationDetailPayload(await response.json());
      })
      .then((nextDetail) => {
        if (!controller.signal.aborted) {
          setDetail(nextDetail);
        }
      })
      .catch((nextError) => {
        if (controller.signal.aborted) {
          return;
        }

        setDetail(null);
        setError(nextError instanceof Error ? nextError.message : "Failed to load conversation detail");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [hubHttp, selectedGroup, selectedGroupId]);

  return { detail, loading, error };
}
