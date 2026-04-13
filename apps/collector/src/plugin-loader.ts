import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectorPlugin } from "@agent-watch/plugin-sdk";
import { isSessionSource, type SessionSource } from "@agent-watch/plugin-sdk";

export interface CollectorPluginRegistration {
  source: SessionSource;
  directoryName: string;
  packageName: string;
}

export function extractSourceFromDirName(dirName: string): SessionSource | null {
  const match = /^plugin-(.+)-watch$/.exec(dirName.trim());
  if (!match) {
    return null;
  }
  return isSessionSource(match[1]) ? match[1] : null;
}

export function resolveRequestedSources(requestedSources: string[], discoveredSources: string[]): string[] {
  const normalized = requestedSources.map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0 || normalized.includes("auto") || normalized.includes("all")) {
    return [...discoveredSources];
  }
  return normalized.filter((source) => discoveredSources.includes(source));
}

async function readPluginRegistration(pluginDir: string, dirName: string): Promise<CollectorPluginRegistration | null> {
  const source = extractSourceFromDirName(dirName);
  if (!source) {
    return null;
  }

  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(pluginDir, dirName, "package.json"), "utf8")
    ) as { name?: unknown };
    const packageName = typeof packageJson.name === "string" ? packageJson.name : "";
    if (!packageName) {
      return null;
    }

    return {
      source,
      directoryName: dirName,
      packageName
    };
  } catch {
    return null;
  }
}

export async function discoverCollectorPlugins(pluginDir: string): Promise<CollectorPluginRegistration[]> {
  const entries = await fs.readdir(pluginDir, { withFileTypes: true });
  const registrations = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readPluginRegistration(pluginDir, entry.name))
  );

  return registrations
    .filter((registration): registration is CollectorPluginRegistration => registration !== null)
    .sort((left, right) => left.source.localeCompare(right.source));
}

export async function discoverPluginSources(pluginDir: string): Promise<string[]> {
  const registrations = await discoverCollectorPlugins(pluginDir);
  return registrations.map((entry) => entry.source);
}

export async function loadPluginsFromSources(
  sources: string[],
  registrations: readonly CollectorPluginRegistration[]
): Promise<CollectorPlugin[]> {
  const loaded: CollectorPlugin[] = [];
  for (const source of sources) {
    const registration = registrations.find((entry) => entry.source === source);
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
