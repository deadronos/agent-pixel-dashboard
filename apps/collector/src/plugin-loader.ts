import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectorPlugin } from "@agent-watch/plugin-sdk";

export interface CollectorPluginRegistration {
  source: string;
  directoryName: string;
  packageName: string;
}

export const collectorPluginRegistry: CollectorPluginRegistration[] = [
  {
    source: "claude",
    directoryName: "plugin-claude-watch",
    packageName: "@agent-watch/plugin-claude-watch"
  },
  {
    source: "codex",
    directoryName: "plugin-codex-watch",
    packageName: "@agent-watch/plugin-codex-watch"
  },
  {
    source: "copilot",
    directoryName: "plugin-copilot-watch",
    packageName: "@agent-watch/plugin-copilot-watch"
  },
  {
    source: "gemini",
    directoryName: "plugin-gemini-watch",
    packageName: "@agent-watch/plugin-gemini-watch"
  },
  {
    source: "openclaw",
    directoryName: "plugin-openclaw-watch",
    packageName: "@agent-watch/plugin-openclaw-watch"
  }
];

export function extractSourceFromDirName(dirName: string): string | null {
  const registration = collectorPluginRegistry.find((entry) => entry.directoryName === dirName);
  return registration?.source ?? null;
}

export function resolveRequestedSources(requestedSources: string[], discoveredSources: string[]): string[] {
  const normalized = requestedSources.map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0 || normalized.includes("auto") || normalized.includes("all")) {
    return [...discoveredSources];
  }
  return normalized.filter((source) => discoveredSources.includes(source));
}

export async function discoverPluginSources(pluginDir: string): Promise<string[]> {
  const entries = await fs.readdir(pluginDir, { withFileTypes: true });
  const availableDirectories = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));

  return collectorPluginRegistry
    .filter((entry) => availableDirectories.has(entry.directoryName))
    .map((entry) => entry.source);
}

export async function loadPluginsFromSources(sources: string[]): Promise<CollectorPlugin[]> {
  const loaded: CollectorPlugin[] = [];
  for (const source of sources) {
    const registration = collectorPluginRegistry.find((entry) => entry.source === source);
    if (!registration) {
      continue;
    }

    const pkgName = registration.packageName;
    try {
      const mod = (await import(pkgName)) as { default?: () => CollectorPlugin };
      if (typeof mod.default !== "function") {
         
        console.warn(`[collector] plugin ${pkgName} missing default factory export`);
        continue;
      }
      loaded.push(mod.default());
    } catch (error) {
       
      console.warn(`[collector] failed to load ${pkgName}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return loaded;
}

export function resolvePluginDir(pluginDir: string): string {
  const trimmed = pluginDir.trim();
  if (trimmed.length === 0) {
    return getDefaultPluginsDir();
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(getRepoRoot(), trimmed);
}

export function getDefaultPluginsDir(): string {
  return path.join(getRepoRoot(), "plugins");
}

function getRepoRoot(): string {
  const repoUrl = new URL("../../../", import.meta.url);
  return path.resolve(fileURLToPath(repoUrl));
}
