import { setInterval } from "node:timers";

import { parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import type { CollectorPlugin, WatchHandle } from "@agent-watch/plugin-sdk";

import { buildSizedBatches } from "./batching.js";
import type { CollectorConfig } from "./config.js";
import type { HubClient } from "./hub-client.js";

const MAX_QUEUE_SIZE = 10_000;

export class CollectorRuntime {
  private readonly queue: NormalizedEvent[] = [];
  private readonly handles: WatchHandle[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly config: CollectorConfig;
  private readonly hubClient: HubClient;
  private droppedCount = 0;
  private flushing = false;

  constructor(config: CollectorConfig, hubClient: HubClient) {
    this.config = config;
    this.hubClient = hubClient;
  }

  enqueue(event: NormalizedEvent): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      this.droppedCount++;
    }
    this.queue.push(parseNormalizedEvent(event));
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return;
    }
    if (this.queue.length === 0) {
      return;
    }

    this.flushing = true;
    const payload = this.queue.splice(0, this.queue.length);
    const bodies = buildSizedBatches(payload, {
      collectorId: this.config.collectorId,
      maxBytes: this.config.maxBatchBytes
    });

    try {
      await this.hubClient.postBodies(bodies);
    } catch (error) {
      this.queue.unshift(...payload);
      throw error;
    } finally {
      this.flushing = false;
    }
  }

  async attachPlugins(plugins: readonly CollectorPlugin[]): Promise<void> {
    for (const plugin of plugins) {
      const roots = await plugin.discover({
        host: this.config.hostName,
        configuredRoots: this.config.sessionRoots,
        env: process.env
      });

      if (roots.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`[${plugin.source}] no roots discovered (set ${plugin.source.toUpperCase()}_SESSION_ROOTS to override)`);
        continue;
      }

      for (const root of roots) {
        const handle = await plugin.watch(root, {
          onEvent: (event) => {
            try {
              this.enqueue(event);
            } catch {
              // keep queue robust
            }
          },
          onError: (error: Error) => {
            console.error(`[${plugin.source}] watch error [${root.path}]`, error.message);
          }
        });
        this.handles.push(handle);
        // eslint-disable-next-line no-console
        console.log(`[${plugin.source}] watching ${root.path}`);
      }

      // eslint-disable-next-line no-console
      console.log(`[${plugin.source}] watching ${roots.length} root(s)`);
    }
  }

  start(): void {
    this.timer = setInterval(() => {
      void this.flush().catch((error) => {
        console.error("flush failed", error instanceof Error ? error.message : String(error));
      });
    }, this.config.flushIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    const closeResults = await Promise.allSettled(this.handles.map((handle) => handle.close()));
    for (const result of closeResults) {
      if (result.status === "rejected") {
        console.error(
          "watcher close failed",
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        );
      }
    }
    await this.flush();
  }
}
