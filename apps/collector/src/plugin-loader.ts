import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CollectorPlugin } from "@agent-watch/plugin-sdk";

export function extractSourceFromDirName(dirName: string): string | null {
  const match = /^plugin-([a-z0-9-]+)-watch$/.exec(dirName);
  return match?.[1] ?? null;
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
  const sources = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => extractSourceFromDirName(entry.name))
    .filter((source): source is string => Boolean(source))
    .sort((left, right) => left.localeCompare(right));
  return sources;
}

export async function loadPluginsFromSources(sources: string[]): Promise<CollectorPlugin[]> {
  const loaded: CollectorPlugin[] = [];
  for (const source of sources) {
    const pkgName = `@agent-watch/plugin-${source}-watch`;
    try {
      const mod = (await import(pkgName)) as { default?: () => CollectorPlugin };
      if (typeof mod.default !== "function") {
        // eslint-disable-next-line no-console
        console.warn(`[collector] plugin ${pkgName} missing default factory export`);
        continue;
      }
      loaded.push(mod.default());
    } catch (error) {
      // eslint-disable-next-line no-console
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
