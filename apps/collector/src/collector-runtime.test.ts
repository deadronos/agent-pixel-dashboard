import type { NormalizedEvent } from '@agent-watch/event-schema';
import type { CollectorPlugin, WatchHandle } from '@agent-watch/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectorRuntime } from './collector-runtime.js';
import type { CollectorConfig } from './config.js';
import type { HubClient } from './hub-client.js';

const MAX_QUEUE_SIZE = 10_000;

function mkEvent(id: number): NormalizedEvent {
  return {
    eventId: `evt_${id}`,
    timestamp: '2026-04-15T12:00:00.000Z',
    source: 'test',
    sourceHost: 'test-host',
    entityId: `entity-${id}`,
    sessionId: `session-${id}`,
    parentEntityId: null,
    entityKind: 'session',
    displayName: 'Test Entity',
    eventType: 'message',
    status: 'active',
    summary: 'test summary',
    detail: 'test detail',
    activityScore: 0.5,
    sequence: id,
    meta: {},
  };
}

function makeHubClientMock(): HubClient {
  return {
    postBodies: vi.fn<() => Promise<void>>(),
  } as unknown as HubClient;
}

function makeWatchHandle(closeFn?: () => void | Promise<void>): WatchHandle {
  return {
    close: vi.fn<() => Promise<void>>(async () => {
      await closeFn?.();
    }),
  };
}

function makePlugin(discoveredRoots?: DiscoveredSessionRoot[], watchHandle?: WatchHandle): CollectorPlugin {
  return {
    id: 'test-plugin',
    source: 'test-plugin',
    discover: vi.fn<() => Promise<DiscoveredSessionRoot[]>>(
      () => Promise.resolve(discoveredRoots ?? [])
    ),
    watch: vi.fn<(root: DiscoveredSessionRoot, ctx: { onEvent: (e: NormalizedEvent) => void; onError: (e: Error) => void }) => Promise<WatchHandle>>(
      () => Promise.resolve(watchHandle ?? makeWatchHandle())
    ),
  };
}

interface DiscoveredSessionRoot {
  id: string;
  path: string;
  host: string;
  metadata?: Record<string, unknown>;
}

function makeConfig(overrides: Partial<CollectorConfig> = {}): CollectorConfig {
  return {
    collectorId: 'test-collector',
    hostName: 'test-host',
    hubUrl: 'http://localhost:3030',
    hubToken: 'test-token',
    sessionRoots: [],
    flushIntervalMs: 60_000,
    maxBatchBytes: 1_500_000,
    watchSources: ['auto'],
    pluginsDir: '',
    ...overrides,
  };
}

describe('CollectorRuntime', () => {
  let hubClient: HubClient;
  let config: CollectorConfig;

  beforeEach(() => {
    hubClient = makeHubClientMock();
    config = makeConfig();
  });

  describe('enqueue', () => {
    it('silently drops oldest event when queue reaches MAX_QUEUE_SIZE', () => {
      const runtime = new CollectorRuntime(config, hubClient);
      // Fill queue to capacity
      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        runtime.enqueue(mkEvent(i));
      }
      // Verify queue is full
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(MAX_QUEUE_SIZE);

      // Enqueue one more — oldest should be dropped silently
      const additionalEvent = mkEvent(MAX_QUEUE_SIZE);
      expect(() => runtime.enqueue(additionalEvent)).not.toThrow();

      // Queue should still be at max size
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(MAX_QUEUE_SIZE);
      // The droppedCount should reflect the overflow
      expect(runtime.getDroppedCount()).toBe(1);
      // The last event should be in the queue
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue[MAX_QUEUE_SIZE - 1].eventId).toBe(`evt_${MAX_QUEUE_SIZE}`);
      // The first event (evt_0) should be gone
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue[0].eventId).toBe('evt_1');
    });
  });

  describe('flush', () => {
    it('does not send to hub when queue is empty', async () => {
      const runtime = new CollectorRuntime(config, hubClient);
      await runtime.flush();
      expect(hubClient.postBodies).not.toHaveBeenCalled();
    });

    it('sends all queued events to hub and clears the queue', async () => {
      const runtime = new CollectorRuntime(config, hubClient);
      runtime.enqueue(mkEvent(1));
      runtime.enqueue(mkEvent(2));

      await runtime.flush();

      expect(hubClient.postBodies).toHaveBeenCalledTimes(1);
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(0);
    });

    it('restores queue when hubClient.postBodies throws', async () => {
      hubClient.postBodies = vi.fn<() => Promise<void>>(() => Promise.reject(new Error('network error')));

      const runtime = new CollectorRuntime(config, hubClient);
      runtime.enqueue(mkEvent(1));
      runtime.enqueue(mkEvent(2));

      await expect(runtime.flush()).rejects.toThrow('network error');
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(2);
      expect(hubClient.postBodies).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent flush calls — second flush returns early while first is in flight', async () => {
      let resolvePostBodies: () => void;
      hubClient.postBodies = vi.fn<() => Promise<void>>(
        () => new Promise<void>((resolve) => { resolvePostBodies = resolve; })
      );

      const runtime = new CollectorRuntime(config, hubClient);
      runtime.enqueue(mkEvent(1));

      // Fire two flushes concurrently
      const flush1 = runtime.flush();
      const flush2 = runtime.flush();

      // Second flush should return early (no second postBodies call)
      await new Promise((r) => setTimeout(r, 10));
      expect(hubClient.postBodies).toHaveBeenCalledTimes(1);

      // Resolve the in-flight postBodies
      resolvePostBodies!();
      await flush1;
      await flush2;

      // Queue should be empty
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(0);
    });
  });

  describe('stop', () => {
    it('clears timer, closes handles, and calls flush', async () => {
      const closeFn = vi.fn<() => void | Promise<void>>(() => Promise.resolve());
      const handle = makeWatchHandle(closeFn);
      const plugin = makePlugin(
        [{ id: 'root1', path: '/test', host: 'test-host' }],
        handle
      );

      const runtime = new CollectorRuntime(config, hubClient);
      await runtime.attachPlugins([plugin]);

      // Enqueue an event
      runtime.enqueue(mkEvent(1));

      await runtime.stop();

      // Handles should be closed
      expect(closeFn).toHaveBeenCalled();
      // Flush should have been called (postBodies should be called)
      expect(hubClient.postBodies).toHaveBeenCalled();
      // Queue should be empty after flush
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(0);
    });

    it('drains the queue even if no plugins were attached', async () => {
      const runtime = new CollectorRuntime(config, hubClient);
      runtime.enqueue(mkEvent(1));
      runtime.enqueue(mkEvent(2));

      await runtime.stop();

      expect(hubClient.postBodies).toHaveBeenCalled();
      expect((runtime as unknown as { queue: NormalizedEvent[] }).queue).toHaveLength(0);
    });

    it('still flushes queued events when a watcher close fails', async () => {
      const handle = makeWatchHandle(() => Promise.reject(new Error('close failed')));
      const plugin = makePlugin(
        [{ id: 'root1', path: '/test', host: 'test-host' }],
        handle
      );
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const runtime = new CollectorRuntime(config, hubClient);
        await runtime.attachPlugins([plugin]);
        runtime.enqueue(mkEvent(1));

        await runtime.stop();

        expect(hubClient.postBodies).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('watcher close failed', 'close failed');
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('attachPlugins', () => {
    it('calls onError handler when plugin reports an error', async () => {
      // We need to capture the onError callback passed to watch
      let capturedOnError: ((error: Error) => void) | undefined;
      const watchFn = vi.fn<
        (root: DiscoveredSessionRoot, ctx: { onEvent: (e: NormalizedEvent) => void; onError: (e: Error) => void }) => Promise<WatchHandle>
      >(
        (_root: DiscoveredSessionRoot, ctx: { onEvent: (e: NormalizedEvent) => void; onError: (e: Error) => void }) => {
          capturedOnError = ctx.onError;
          return Promise.resolve(makeWatchHandle());
        }
      );

      const plugin: CollectorPlugin = {
        id: 'test-plugin',
        source: 'test-plugin',
        discover: vi.fn<() => Promise<DiscoveredSessionRoot[]>>(
          () => Promise.resolve([{ id: 'root1', path: '/test', host: 'test-host' }])
        ),
        watch: watchFn,
      };

      const runtime = new CollectorRuntime(config, hubClient);
      await runtime.attachPlugins([plugin]);

      expect(capturedOnError).toBeDefined();

      // Spy on console.error to verify the onError callback actually invokes it
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        capturedOnError!(new Error('plugin error message'));
        // The onError callback logs via console.error with the error message
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('test-plugin'),
          'plugin error message'
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('swallows errors thrown inside onEvent callback without crashing the runtime', async () => {
      let capturedOnEvent: ((event: NormalizedEvent) => void) | undefined;
      const watchFn = vi.fn<
        (root: DiscoveredSessionRoot, ctx: { onEvent: (e: NormalizedEvent) => void; onError: (e: Error) => void }) => Promise<WatchHandle>
      >(
        (_root: DiscoveredSessionRoot, ctx: { onEvent: (e: NormalizedEvent) => void; onError: (e: Error) => void }) => {
          capturedOnEvent = ctx.onEvent;
          return Promise.resolve(makeWatchHandle());
        }
      );

      const plugin: CollectorPlugin = {
        id: 'test-plugin',
        source: 'test-plugin',
        discover: vi.fn<() => Promise<DiscoveredSessionRoot[]>>(
          () => Promise.resolve([{ id: 'root1', path: '/test', host: 'test-host' }])
        ),
        watch: watchFn,
      };

      const runtime = new CollectorRuntime(config, hubClient);
      await runtime.attachPlugins([plugin]);

      expect(capturedOnEvent).toBeDefined();

      // Passing an invalid event causes parseNormalizedEvent (inside enqueue) to throw.
      // The onEvent callback wraps enqueue in try/catch, so the error must be swallowed.
      expect(() => capturedOnEvent!({} as NormalizedEvent)).not.toThrow();

      // Runtime remains functional after the silent catch
      runtime.enqueue(mkEvent(1));
      await runtime.flush();
      expect(hubClient.postBodies).toHaveBeenCalled();
    });
  });
});
