import crypto from 'node:crypto';
import { z } from 'zod';
export const EntityKindSchema = z.enum(['session', 'subagent', 'tool-run']);
export const NormalizedEventSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  sourceHost: z.string().min(1),
  entityId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  parentEntityId: z.string().nullable().optional(),
  entityKind: EntityKindSchema,
  displayName: z.string().min(1),
  eventType: z.string().min(1),
  status: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
  activityScore: z.number().min(0).max(1).optional(),
  turnId: z.string().min(1).optional(),
  sequence: z.number().int().nonnegative().optional(),
  meta: z.record(z.unknown()).optional(),
});
export function parseNormalizedEvent(input) {
  return NormalizedEventSchema.parse(input);
}
export function makeDeterministicEventId(input) {
  const key = `${input.source}|${input.entityId}|${input.timestamp}|${input.eventType}|${input.sequence ?? ''}|${input.detail ?? ''}`;
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `evt_${digest}`;
}
//# sourceMappingURL=index.js.map
