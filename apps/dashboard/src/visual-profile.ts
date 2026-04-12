import type { ThemePreset, VisualRule } from "./dashboard-settings.js";
import {
  getFaceMood,
  getNamedPalette,
  getProviderPalette,
  isNamedPaletteId,
  type EntityStatus,
  type ProviderPalette
} from "./face.js";

interface VisualEntity {
  source: string;
  entityKind: string;
  entityId: string;
  currentStatus: EntityStatus;
}

export interface AgentVisualProfile {
  palette: ProviderPalette;
  faceVariant: "rounded-bot" | "square-bot" | "soft-ghost" | "terminal-sprite";
  animationMode: "full" | "reduced";
  accentStyle: "sparkles" | "antenna" | "frame" | "none";
  artStyleMode: "config" | "playful" | "minimal";
}

export function resolveVisualProfile(
  entity: VisualEntity,
  theme: ThemePreset,
  rules: VisualRule[],
  artStyleMode: "config" | "playful" | "minimal" = "config"
): AgentVisualProfile {
  const match = getBestMatchingRule(entity, rules);

  const mood = getFaceMood(entity.currentStatus);
  const palette = resolvePalette(match?.themePalette, entity.source);
  const animationMode =
    artStyleMode === "minimal"
      ? "reduced"
      : theme.id === "night-shift" && mood.animation === "pulse"
        ? "reduced"
        : "full";

  let accentStyle: AgentVisualProfile["accentStyle"] = mood.sparkle ? "sparkles" : "none";
  if (artStyleMode === "playful") {
    accentStyle =
      entity.entityKind === "worker"
        ? "antenna"
        : entity.entityKind === "session"
          ? "frame"
          : mood.sparkle
            ? "sparkles"
            : "frame";
  } else if (artStyleMode === "minimal") {
    accentStyle = "none";
  }

  return {
    palette,
    faceVariant: match?.faceVariant ?? "rounded-bot",
    animationMode,
    accentStyle,
    artStyleMode
  };
}

function matchesRule(rule: VisualRule, entity: VisualEntity): boolean {
  if (rule.source && rule.source !== entity.source) {
    return false;
  }

  if (rule.entityKind && rule.entityKind !== entity.entityKind) {
    return false;
  }

  return true;
}

function getBestMatchingRule(entity: VisualEntity, rules: VisualRule[]): VisualRule | undefined {
  let bestRule: VisualRule | undefined;
  let bestSpecificity = -1;
  let bestIndex = -1;

  rules.forEach((rule, index) => {
    if (!matchesRule(rule, entity)) {
      return;
    }

    const specificity = Number(Boolean(rule.source)) + Number(Boolean(rule.entityKind));
    if (specificity > bestSpecificity || (specificity === bestSpecificity && index > bestIndex)) {
      bestRule = rule;
      bestSpecificity = specificity;
      bestIndex = index;
    }
  });

  return bestRule;
}

function resolvePalette(themePalette: VisualRule["themePalette"] | undefined, fallbackKey: string): ProviderPalette {
  if (!themePalette) {
    return getProviderPalette(fallbackKey);
  }

  if (!isNamedPaletteId(themePalette)) {
    return getProviderPalette(fallbackKey);
  }

  return getNamedPalette(themePalette);
}
