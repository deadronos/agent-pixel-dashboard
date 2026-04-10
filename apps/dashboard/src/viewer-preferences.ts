import type { ViewerPreferences } from "./dashboard-settings.js";

const STORAGE_KEY = "agent-watch.viewer-preferences";

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStoredPreferences(value: unknown): value is ViewerPreferences {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDensity(value: unknown): value is NonNullable<ViewerPreferences["density"]> {
  return value === "compact" || value === "comfortable";
}

function isValidSortMode(value: unknown): value is NonNullable<ViewerPreferences["sortMode"]> {
  return value === "activity" || value === "recent";
}

function isValidArtStyleMode(value: unknown): value is NonNullable<ViewerPreferences["artStyleMode"]> {
  return value === "config" || value === "playful" || value === "minimal";
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value.filter((entry): entry is string => typeof entry === "string");
  return sanitized.length > 0 ? sanitized : [];
}

function sanitizeViewerPreferences(value: unknown): ViewerPreferences {
  if (!isStoredPreferences(value)) {
    return {};
  }

  const preferences: ViewerPreferences = {};
  const maxAgentsShown = value.maxAgentsShown;

  if (typeof maxAgentsShown === "number" && Number.isInteger(maxAgentsShown) && maxAgentsShown > 0) {
    preferences.maxAgentsShown = maxAgentsShown;
  }
  if (isValidDensity(value.density)) {
    preferences.density = value.density;
  }
  if (isValidSortMode(value.sortMode)) {
    preferences.sortMode = value.sortMode;
  }
  if (typeof value.hideDormant === "boolean") {
    preferences.hideDormant = value.hideDormant;
  }
  if (typeof value.hideDone === "boolean") {
    preferences.hideDone = value.hideDone;
  }
  if (typeof value.themeId === "string") {
    preferences.themeId = value.themeId;
  }
  if (isValidArtStyleMode(value.artStyleMode)) {
    preferences.artStyleMode = value.artStyleMode;
  }

  const visibleSources = sanitizeStringArray(value.visibleSources);
  if (visibleSources !== undefined) {
    preferences.visibleSources = visibleSources;
  }

  const visibleEntityKinds = sanitizeStringArray(value.visibleEntityKinds);
  if (visibleEntityKinds !== undefined) {
    preferences.visibleEntityKinds = visibleEntityKinds;
  }

  return preferences;
}

export function loadViewerPreferences(): ViewerPreferences {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    return sanitizeViewerPreferences(parsed);
  } catch {
    return {};
  }
}

export function saveViewerPreferences(preferences: ViewerPreferences): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (Object.keys(preferences).length === 0) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function resetViewerPreferences(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(STORAGE_KEY);
}
