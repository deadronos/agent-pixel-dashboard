import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { NormalizedEvent } from '@agent-watch/event-schema';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectJsonlFiles,
  createJsonlIngestState,
  discoverSessionRoots,
  ingestJsonlFile,
} from './watch-helpers.js';

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0, createdDirs.length).map(async dir => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-sdk-watch-'));
  createdDirs.push(dir);
  return dir;
}

function eventWithId(eventId: string): NormalizedEvent {
  return {
    eventId,
    timestamp: '2026-04-09T20:15:31.000Z',
    source: 'test',
    sourceHost: 'workstation',
    entityId: `test:session:${eventId}`,
    entityKind: 'session',
    displayName: 'Test',
    eventType: 'message',
  };
}

describe('collectJsonlFiles', () => {
  it('collects .jsonl files recursively up to max depth', async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, 'a', 'b'), { recursive: true });
    await fs.writeFile(path.join(root, 'top.jsonl'), '');
    await fs.writeFile(path.join(root, 'a', 'nested.jsonl'), '');
    await fs.writeFile(path.join(root, 'a', 'b', 'too-deep.jsonl'), '');
    await fs.writeFile(path.join(root, 'a', 'not-json.txt'), '');

    const files = await collectJsonlFiles(root, { maxDepth: 1, maxFiles: 50 });
    const rel = files.map(file => path.relative(root, file)).sort();

    expect(rel).toEqual(['a/nested.jsonl', 'top.jsonl']);
  });

  it('stops once max files are collected', async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, 'x'), { recursive: true });
    await fs.writeFile(path.join(root, 'x', '1.jsonl'), '');
    await fs.writeFile(path.join(root, 'x', '2.jsonl'), '');
    await fs.writeFile(path.join(root, 'x', '3.jsonl'), '');

    const files = await collectJsonlFiles(root, { maxDepth: 5, maxFiles: 2 });
    expect(files).toHaveLength(2);
  });
});

describe('ingestJsonlFile', () => {
  it('emits every event returned by a parser that fans out one record', async () => {
    const root = await makeTempDir();
    const filePath = path.join(root, 'session.jsonl');
    await fs.writeFile(filePath, `${JSON.stringify({ type: 'tool_use' })}\n`);
    const stat = await fs.stat(filePath);
    const events: NormalizedEvent[] = [];

    await ingestJsonlFile(filePath, createJsonlIngestState(), {
      reason: 'change',
      stat,
      parseRecord: () => [eventWithId('evt_parent'), eventWithId('evt_child')],
      onRecord: event => events.push(event),
      onError: error => {
        throw error;
      },
    });

    expect(events.map(event => event.eventId)).toEqual(['evt_parent', 'evt_child']);
  });
});

describe('discoverSessionRoots', () => {
  it('merges globally configured roots with source-specific roots', async () => {
    const globalRoot = await makeTempDir();
    const sourceRoot = await makeTempDir();

    const roots = await discoverSessionRoots(
      {
        env: {
          CODEX_SESSION_ROOTS: sourceRoot,
        },
        configuredRoots: [globalRoot],
        host: 'test-host',
      },
      {
        envVar: 'CODEX_SESSION_ROOTS',
        defaultRoots: [],
        idPrefix: 'codex-root',
      }
    );

    expect(roots.map(root => root.path).sort()).toEqual([globalRoot, sourceRoot].sort());
  });
});
