import { setInterval } from "node:timers";
import { parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import type { CollectorPlugin, WatchHandle } from "@agent-watch/plugin-sdk";
import createCodexPlugin from "@agent-watch/plugin-codex-watch";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
const plugin: CollectorPlugin = createCodexPlugin();

const queue: NormalizedEvent[] = [];
const handles: WatchHandle[] = [];

async function flushQueue(): Promise<void> {
  if (queue.length === 0) {
    return;
  }
  const payload = queue.splice(0, queue.length);

  const response = await fetch(`${config.hubUrl}/api/events/batch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.hubToken}`
    },
    body: JSON.stringify({
      collectorId: config.collectorId,
      events: payload
    })
  });

  if (!response.ok) {
    throw new Error(`hub rejected batch: ${response.status} ${response.statusText}`);
  }
}

async function main(): Promise<void> {
  const roots = await plugin.discover({
    host: config.hostName,
    configuredRoots: config.codexRoots,
    env: process.env
  });

  if (roots.length === 0) {
    // eslint-disable-next-line no-console
    console.log("collector found no codex roots; set CODEX_SESSION_ROOTS to override");
  }

  for (const root of roots) {
    const handle = await plugin.watch(root, {
      onEvent: (event: NormalizedEvent) => {
        try {
          queue.push(parseNormalizedEvent(event));
        } catch {
          // keep queue robust
        }
      },
      onError: (error: Error) => {
        // eslint-disable-next-line no-console
        console.error(`watch error [${root.path}]`, error.message);
      }
    });
    handles.push(handle);
    // eslint-disable-next-line no-console
    console.log(`watching ${root.path}`);
  }

  const timer = setInterval(() => {
    void flushQueue().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("flush failed", error.message);
    });
  }, config.flushIntervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await Promise.all(handles.map((handle) => handle.close()));
    try {
      await flushQueue();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
