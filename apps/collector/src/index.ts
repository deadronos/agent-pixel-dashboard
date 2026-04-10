import "./env.js";
import { setInterval } from "node:timers";
import { parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import type { WatchHandle } from "@agent-watch/plugin-sdk";
import { buildSizedBatches } from "./batching.js";
import { loadConfig } from "./config.js";
import {
  discoverPluginSources,
  loadPluginsFromSources,
  resolvePluginDir,
  resolveRequestedSources
} from "./plugin-loader.js";

const config = loadConfig(process.env);

const queue: NormalizedEvent[] = [];
const handles: WatchHandle[] = [];

async function flushQueue(): Promise<void> {
  if (queue.length === 0) {
    return;
  }
  const payload = queue.splice(0, queue.length);
  const bodies = buildSizedBatches(payload, {
    collectorId: config.collectorId,
    maxBytes: config.maxBatchBytes
  });

  try {
    for (const body of bodies) {
      const response = await fetch(`${config.hubUrl}/api/events/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.hubToken}`
        },
        body
      });

      if (!response.ok) {
        throw new Error(`hub rejected batch: ${response.status} ${response.statusText}`);
      }
    }
  } catch (error) {
    queue.unshift(...payload);
    throw error;
  }
}

async function main(): Promise<void> {
  const pluginDir = resolvePluginDir(config.pluginsDir);
  const discoveredSources = await discoverPluginSources(pluginDir);
  const selectedSources = resolveRequestedSources(config.watchSources, discoveredSources);
  const selectedPlugins = await loadPluginsFromSources(selectedSources);

  if (selectedPlugins.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `collector found no plugins to load (WATCH_SOURCES=${config.watchSources.join(", ")} discovered=${discoveredSources.join(", ")})`
    );
    return;
  }

  for (const plugin of selectedPlugins) {
    const roots = await plugin.discover({
      host: config.hostName,
      configuredRoots: plugin.source === "codex" ? config.codexRoots : [],
      env: process.env
    });

    if (roots.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[${plugin.source}] no roots discovered (set ${plugin.source.toUpperCase()}_SESSION_ROOTS to override)`);
      continue;
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
          console.error(`[${plugin.source}] watch error [${root.path}]`, error.message);
        }
      });
      handles.push(handle);
      // eslint-disable-next-line no-console
      console.log(`[${plugin.source}] watching ${root.path}`);
    }

    // eslint-disable-next-line no-console
    console.log(`[${plugin.source}] watching ${roots.length} root(s)`);
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
