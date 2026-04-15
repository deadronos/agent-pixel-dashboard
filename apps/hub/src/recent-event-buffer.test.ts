import type { NormalizedEvent } from '@agent-watch/event-schema';
import { describe, expect, it } from 'vitest';

import { RecentEventBuffer } from './recent-event-buffer.js';

function sampleEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
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
    activityScore: 0.8,
    sequence: 5,
    meta: {},
    ...overrides,
  };
}

describe('RecentEventBuffer', () => {
  describe('add', () => {
    it('returns false when same eventId is added twice (deduplication)', () => {
      const buffer = new RecentEventBuffer(3);
      const event = sampleEvent({ eventId: 'evt_dedup' });

      const first = buffer.add(event);
      const second = buffer.add(event);

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(buffer.size).toBe(1);
    });
  });

  describe('circular wrap', () => {
    it('evicts oldest event when filling beyond maxSize', () => {
      const buffer = new RecentEventBuffer(3);

      const evt1 = sampleEvent({ eventId: 'evt_1', sequence: 1 });
      const evt2 = sampleEvent({ eventId: 'evt_2', sequence: 2 });
      const evt3 = sampleEvent({ eventId: 'evt_3', sequence: 3 });
      const evt4 = sampleEvent({ eventId: 'evt_4', sequence: 4 });

      buffer.add(evt1);
      buffer.add(evt2);
      buffer.add(evt3);
      const added = buffer.add(evt4);

      expect(added).toBe(true);
      expect(buffer.size).toBe(3);

      const snapshot = buffer.snapshot();
      const ids = snapshot.map((e) => e.eventId);

      expect(ids).not.toContain('evt_1');
      expect(ids).toContain('evt_2');
      expect(ids).toContain('evt_3');
      expect(ids).toContain('evt_4');
    });
  });

  describe('size tracking', () => {
    it('returns N after N adds when N < maxSize', () => {
      const buffer = new RecentEventBuffer(5);

      buffer.add(sampleEvent({ eventId: 'evt_1' }));
      expect(buffer.size).toBe(1);

      buffer.add(sampleEvent({ eventId: 'evt_2' }));
      expect(buffer.size).toBe(2);

      buffer.add(sampleEvent({ eventId: 'evt_3' }));
      expect(buffer.size).toBe(3);
    });
  });

  describe('snapshot', () => {
    it('returns events in insertion order (oldest first)', () => {
      const buffer = new RecentEventBuffer(5);

      const evt1 = sampleEvent({ eventId: 'evt_1', sequence: 1 });
      const evt2 = sampleEvent({ eventId: 'evt_2', sequence: 2 });
      const evt3 = sampleEvent({ eventId: 'evt_3', sequence: 3 });

      buffer.add(evt1);
      buffer.add(evt2);
      buffer.add(evt3);

      const snapshot = buffer.snapshot();
      expect(snapshot.map((e) => e.eventId)).toEqual(['evt_1', 'evt_2', 'evt_3']);
    });

    it('returns empty array when no events added', () => {
      const buffer = new RecentEventBuffer(3);
      expect(buffer.snapshot()).toEqual([]);
    });
  });
});