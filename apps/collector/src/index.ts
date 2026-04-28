import "./env.js";

import { CollectorRuntime } from "./collector-runtime.js";
import { loadConfig } from "./config.js";
import { HubClient } from "./hub-client.js";
import {
  discoverCollectorPlugins,
  loadPluginsFromSources,
  resolvePluginDir,
  resolveRequestedSources
} from "./plugin-loader.js";

const config = loadConfig(process.env);

async function main(): Promise<void> {
  const pluginDir = resolvePluginDir(config.pluginsDir);
  const registrations = await discoverCollectorPlugins(pluginDir);
  const discoveredSources = registrations.map((entry) => entry.source);
  const selectedSources = resolveRequestedSources(config.watchSources, discoveredSources);
  const selectedPlugins = await loadPluginsFromSources(selectedSources, registrations);

  if (selectedPlugins.length === 0) {
    return;
  }

  const runtime = new CollectorRuntime(config, new HubClient({ hubUrl: config.hubUrl, hubToken: config.hubToken }));
  await runtime.attachPlugins(selectedPlugins);
  runtime.start();

  const shutdown = async (): Promise<void> => {
    try {
      await runtime.stop();
    } catch (error) {
      console.error("flush failed during shutdown:", error instanceof Error ? error.message : String(error));
    }
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
   
  console.error(error);
  process.exit(1);
});
