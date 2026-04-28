import { describe, expect, it } from 'vitest';

import {
  ConversationDetailPayloadSchema,
  HubMessageSchema,
  IngestBatchBodySchema,
  LIVE_STATUS_WINDOWS_MS,
  NormalizedEventSchema,
  ToolRunMetaSchema,
  getStatusFromTimestamp,
  makeDeterministicEventId,
  normalizeDashboardEntity,
  parseConversationDetailPayload,
  parseHubStateResponse,
  parseIngestBatchBody,
  parseNormalizedEvent,
  projectEntityEvent,
  resolveEntityStatus,
} from './index.js';

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

  it('rejects invalid status values', () => {
    const result = NormalizedEventSchema.safeParse({
      eventId: 'evt_2',
      timestamp: '2026-04-09T20:15:31.000Z',
      source: 'codex',
      sourceHost: 'workstation',
      entityId: 'codex:session:abc123',
      entityKind: 'session',
      displayName: 'Codex',
      eventType: 'message',
      status: 'broken',
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

describe('ToolRunMetaSchema', () => {
  it('accepts structured tool-run metadata', () => {
    expect(
      ToolRunMetaSchema.parse({
        toolName: 'Shell',
        inputs: { command: 'git status --short' },
        output: 'clean',
        exitCode: 0,
        durationMs: 124,
      })
    ).toEqual({
      toolName: 'Shell',
      inputs: { command: 'git status --short' },
      output: 'clean',
      exitCode: 0,
      durationMs: 124,
    });
  });

  it('rejects tool metadata without a tool name', () => {
    expect(() => ToolRunMetaSchema.parse({ output: 'missing name' })).toThrow();
  });
});

describe('shared entity helpers', () => {
  it('computes live statuses from timestamps', () => {
    const now = new Date('2026-04-10T10:00:00.000Z');

    expect(getStatusFromTimestamp('2026-04-10T09:59:55.000Z', now)).toBe('active');
    expect(getStatusFromTimestamp('2026-04-10T09:59:40.000Z', now)).toBe('idle');
    expect(getStatusFromTimestamp('2026-04-10T09:58:45.000Z', now)).toBe('sleepy');
    expect(getStatusFromTimestamp('2026-04-10T09:50:00.000Z', now)).toBe('dormant');
  });

  it('preserves terminal statuses when resolving entity status', () => {
    const staleTimestamp = '2026-04-10T09:40:00.000Z';

    expect(resolveEntityStatus('done', staleTimestamp)).toBe('done');
    expect(resolveEntityStatus('error', staleTimestamp)).toBe('error');
    expect(resolveEntityStatus('idle', staleTimestamp)).toBe('dormant');
  });

  it('parses hub state payloads with default entity arrays', () => {
    expect(parseHubStateResponse({})).toEqual({ entities: [] });
  });

  it('parses ingest batch payloads', () => {
    expect(
      parseIngestBatchBody({
        collectorId: 'collector-a',
        events: [
          {
            eventId: 'evt_1',
            timestamp: '2026-04-09T20:15:31.000Z',
            source: 'codex',
            sourceHost: 'workstation',
            entityId: 'codex:session:abc123',
            entityKind: 'session',
            displayName: 'Codex',
            eventType: 'message',
          },
        ],
      })
    ).toEqual({
      collectorId: 'collector-a',
      events: [
        {
          eventId: 'evt_1',
          timestamp: '2026-04-09T20:15:31.000Z',
          source: 'codex',
          sourceHost: 'workstation',
          entityId: 'codex:session:abc123',
          entityKind: 'session',
          displayName: 'Codex',
          eventType: 'message',
        },
      ],
    });
    expect(() => IngestBatchBodySchema.parse({})).toThrow();
  });

  it('projects entity updates consistently', () => {
    const first = projectEntityEvent(undefined, {
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
      activityScore: 0.8,
      sequence: 1,
      meta: { groupKey: 'workspace-a' },
    });

    const second = projectEntityEvent(first, {
      eventId: 'evt_2',
      timestamp: '2026-04-09T20:15:40.000Z',
      source: 'codex',
      sourceHost: 'workstation',
      entityId: 'codex:session:abc123',
      sessionId: 'abc123',
      parentEntityId: null,
      entityKind: 'session',
      displayName: 'Codex',
      eventType: 'session_finished',
      summary: 'Finished',
      sequence: 2,
    });

    expect(first.groupKey).toBe('workspace-a');
    expect(second.currentStatus).toBe('done');
    expect(second.recentEvents).toEqual(['evt_1', 'evt_2']);
  });

  it('normalizes non-terminal dashboard entity status from timestamps', () => {
    const normalized = normalizeDashboardEntity(
      {
        entityId: 'codex:session:abc123',
        source: 'codex',
        sourceHost: 'workstation',
        displayName: 'Codex',
        entityKind: 'session',
        currentStatus: 'active',
        lastEventAt: '2026-04-10T09:58:45.000Z',
        activityScore: 0.5,
        recentEvents: [],
      },
      new Date('2026-04-10T10:00:00.000Z')
    );

    expect(normalized.currentStatus).toBe('sleepy');
  });

  it('parses conversation detail payloads', () => {
    const payload = {
      groupId: 'codex|abc123',
      group: { source: 'codex', sessionId: 'abc123' },
      matchedBy: 'session',
      current: {
        entityId: 'codex:session:abc123',
        source: 'codex',
        sourceHost: 'workstation',
        displayName: 'Codex',
        entityKind: 'session',
        currentStatus: 'active',
        lastEventAt: '2026-04-09T20:15:31.000Z',
        activityScore: 0.8,
      },
      representative: {
        entityId: 'codex:session:abc123',
        source: 'codex',
        sourceHost: 'workstation',
        displayName: 'Codex',
        entityKind: 'session',
        currentStatus: 'active',
        lastEventAt: '2026-04-09T20:15:31.000Z',
        activityScore: 0.8,
      },
      members: [
        {
          entityId: 'codex:session:abc123',
          source: 'codex',
          sourceHost: 'workstation',
          displayName: 'Codex',
          entityKind: 'session',
          currentStatus: 'active',
          lastEventAt: '2026-04-09T20:15:31.000Z',
          activityScore: 0.8,
        },
      ],
      recentEvents: [
        {
          eventId: 'evt_1',
          timestamp: '2026-04-09T20:15:31.000Z',
          source: 'codex',
          sourceHost: 'workstation',
          entityId: 'codex:session:abc123',
          entityKind: 'session',
          displayName: 'Codex',
          eventType: 'message',
        },
      ],
    };

    expect(parseConversationDetailPayload(payload)).toEqual(payload);
    expect(ConversationDetailPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('accepts hello and events websocket messages', () => {
    expect(HubMessageSchema.parse({ type: 'hello', entities: 2 })).toEqual({
      type: 'hello',
      entities: 2,
    });

    const event = {
      eventId: 'evt_1',
      timestamp: '2026-04-09T20:15:31.000Z',
      source: 'codex',
      sourceHost: 'workstation',
      entityId: 'codex:session:abc123',
      entityKind: 'session',
      displayName: 'Codex',
      eventType: 'message',
    };

    expect(HubMessageSchema.parse({ type: 'events', events: [event] })).toEqual({
      type: 'events',
      events: [event],
    });
  });

  it('exposes stable live-status windows', () => {
    expect(LIVE_STATUS_WINDOWS_MS).toEqual({
      active: 10_000,
      idle: 30_000,
      sleepy: 90_000,
      dormant: 300_000,
    });
  });
});
