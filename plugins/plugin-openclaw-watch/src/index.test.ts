import { describe, expect, it } from 'vitest';

import { buildOpenClawSessionId, getOpenClawAgentId } from './identity.js';

import { parseOpenClawRecord, parseOpenClawRecordEvents } from './index.js';

describe('openclaw identity helpers', () => {
  it('extracts agent id from standard agent session path', () => {
    const filePath = '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl';
    expect(getOpenClawAgentId(filePath)).toBe('researcher');
  });

  it('builds agent-aware session ids', () => {
    const filePath = '/Users/test/.openclaw/agents/clawson/sessions/abc123.jsonl';
    expect(buildOpenClawSessionId('clawson', filePath)).toBe('openclaw:clawson:abc123');
  });

  it('falls back to legacy style when agent id is unavailable', () => {
    const filePath = '/Users/test/.openclaw/sessions/abc123.jsonl';
    expect(buildOpenClawSessionId(null, filePath)).toBe('openclaw-abc123');
  });

  it('normalizes openclaw records into shared events', () => {
    const event = parseOpenClawRecord(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'tool_call',
        message: {
          role: 'assistant',
          model: 'opus',
          name: 'shell',
        },
      },
      1,
      '2026-04-09T20:15:31.000Z'
    );

    expect(event).toMatchObject({
      source: 'openclaw',
      entityId: 'openclaw:session:openclaw:researcher:abc123',
      sessionId: 'openclaw:researcher:abc123',
      displayName: 'researcher',
      eventType: 'tool_call',
      summary: 'shell',
      detail: 'opus',
    });
    expect(event.meta).toMatchObject({
      agentId: 'researcher',
      groupKey: 'researcher',
      toolName: 'shell',
    });
  });

  it('extracts OpenClaw assistant text and tool_use content', () => {
    const event = parseOpenClawRecord(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'message',
        message: {
          role: 'assistant',
          model: 'gpt-5.4',
          content: [
            { type: 'tool_use', name: 'Shell', input: { command: 'git status --short' } },
            { type: 'text', text: 'Status is clean.' },
          ],
        },
      },
      2,
      '2026-04-09T20:15:31.000Z'
    );

    expect(event).toMatchObject({
      eventType: 'tool_use',
      summary: 'Shell',
      detail: 'git status --short',
    });
    expect(event.meta).toMatchObject({
      model: 'gpt-5.4',
      role: 'assistant',
      toolName: 'Shell',
    });
  });

  it('emits a nested tool_start entity for OpenClaw tool invocations', () => {
    const events = parseOpenClawRecordEvents(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'message',
        message: {
          role: 'assistant',
          model: 'gpt-5.4',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_shell_1',
              name: 'Shell',
              input: { command: 'git status --short' },
            },
          ],
        },
      },
      3,
      '2026-04-09T20:15:31.000Z'
    );

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      source: 'openclaw',
      entityId: 'openclaw:tool-run:openclaw:researcher:abc123:toolu_shell_1',
      parentEntityId: 'openclaw:session:openclaw:researcher:abc123',
      entityKind: 'tool-run',
      eventType: 'tool_start',
      status: 'active',
      displayName: 'Shell',
      summary: 'Running Shell...',
    });
    expect(events[1].meta).toMatchObject({
      toolName: 'Shell',
      inputs: { command: 'git status --short' },
    });
  });

  it('emits a nested tool_end entity for OpenClaw tool results', () => {
    const events = parseOpenClawRecordEvents(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'tool_result',
        tool_use_id: 'toolu_shell_1',
        toolName: 'Shell',
        status: 'done',
        durationMs: 42,
        message: {
          role: 'tool',
          content: 'working tree clean',
        },
      },
      4,
      '2026-04-09T20:15:33.000Z'
    );

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      entityId: 'openclaw:tool-run:openclaw:researcher:abc123:toolu_shell_1',
      parentEntityId: 'openclaw:session:openclaw:researcher:abc123',
      entityKind: 'tool-run',
      eventType: 'tool_end',
      status: 'done',
      displayName: 'Shell',
      summary: 'Finished Shell',
      detail: 'working tree clean',
    });
    expect(events[1].meta).toMatchObject({
      toolName: 'Shell',
      output: 'working tree clean',
      durationMs: 42,
    });
  });

  it('recognizes camelCase OpenClaw toolCall and toolResult records', () => {
    const startEvents = parseOpenClawRecordEvents(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              toolCallId: 'toolu_web_1',
              name: 'web_fetch',
              arguments: { url: 'https://example.com' },
            },
          ],
        },
      },
      5,
      '2026-04-09T20:15:34.000Z'
    );
    const endEvents = parseOpenClawRecordEvents(
      'workstation',
      '/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl',
      {
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'toolu_web_1',
          toolName: 'web_fetch',
          content: 'Fetched example page',
        },
      },
      6,
      '2026-04-09T20:15:35.000Z'
    );

    expect(startEvents[1]).toMatchObject({
      entityId: 'openclaw:tool-run:openclaw:researcher:abc123:toolu_web_1',
      eventType: 'tool_start',
      displayName: 'web_fetch',
    });
    expect(startEvents[1].meta).toMatchObject({
      toolName: 'web_fetch',
      inputs: { url: 'https://example.com' },
    });
    expect(endEvents[1]).toMatchObject({
      entityId: 'openclaw:tool-run:openclaw:researcher:abc123:toolu_web_1',
      eventType: 'tool_end',
      displayName: 'web_fetch',
      detail: 'Fetched example page',
    });
    expect(endEvents[1].meta).toMatchObject({
      toolName: 'web_fetch',
      output: 'Fetched example page',
    });
  });
});
