import { describe, expect, it } from 'vitest';

import { NormalizedEventSchema, makeDeterministicEventId, parseNormalizedEvent } from './index.js';

describe('NormalizedEventSchema', () => {
  it('accepts a valid event', () => {
    const event = {
      eventId: 'evt_1',
      timestamp: '2026-04-09T20:15:31.000Z',
      source: 'codex',
      sourceHost: 'workstation',
      entityId: 'codex:session:abc123',
      sessionId: 'abc123',
      parentEntityId: null,
      entityKind: 'session',
      displayName: 'Codex',
      eventType: 'message',
      status: 'active',
      summary: 'Reading files',
      detail: 'Scanning src',
      activityScore: 0.5,
      sequence: 2,
      meta: { cwd: '/tmp' },
    };

    expect(() => parseNormalizedEvent(event)).not.toThrow();
  });

  it('rejects activityScore outside range', () => {
    const result = NormalizedEventSchema.safeParse({
      eventId: 'evt_2',
      timestamp: '2026-04-09T20:15:31.000Z',
      source: 'codex',
      sourceHost: 'workstation',
      entityId: 'codex:session:abc123',
      entityKind: 'session',
      displayName: 'Codex',
      eventType: 'message',
      activityScore: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it('generates deterministic event ids', () => {
    const left = makeDeterministicEventId({
      source: 'codex',
      entityId: 'codex:session:abc123',
      timestamp: '2026-04-09T20:15:31.000Z',
      eventType: 'message',
      sequence: 7,
      detail: 'hello',
    });

    const right = makeDeterministicEventId({
      source: 'codex',
      entityId: 'codex:session:abc123',
      timestamp: '2026-04-09T20:15:31.000Z',
      eventType: 'message',
      sequence: 7,
      detail: 'hello',
    });

    expect(left).toBe(right);
  });
});
