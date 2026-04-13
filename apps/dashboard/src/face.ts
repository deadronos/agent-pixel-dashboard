import {
  getStatusFromTimestamp as getSharedStatusFromTimestamp,
  resolveEntityStatus,
  type EntityStatus
} from "@agent-watch/event-schema";

export type { DashboardEntity, EntityStatus } from "@agent-watch/event-schema";

export interface ProviderPalette {
  base: string;
  accent: string;
  glow: string;
  shade: string;
  line: string;
  background: string;
}

export const namedPaletteIds = ["mint", "rose", "sky"] as const;

export type NamedPaletteId = (typeof namedPaletteIds)[number];

const namedPalettes: Record<NamedPaletteId, ProviderPalette> = {
  mint: {
    base: "hsl(162 70% 58%)",
    accent: "hsl(181 84% 52%)",
    glow: "hsl(166 94% 78%)",
    shade: "hsl(164 42% 18%)",
    line: "hsl(168 30% 12%)",
    background: "linear-gradient(160deg, hsl(154 68% 94%), hsl(182 72% 84%))"
  },
  rose: {
    base: "hsl(344 72% 64%)",
    accent: "hsl(12 88% 58%)",
    glow: "hsl(339 96% 82%)",
    shade: "hsl(342 44% 20%)",
    line: "hsl(341 32% 14%)",
    background: "linear-gradient(160deg, hsl(338 88% 95%), hsl(18 76% 86%))"
  },
  sky: {
    base: "hsl(204 74% 62%)",
    accent: "hsl(221 90% 58%)",
    glow: "hsl(197 96% 84%)",
    shade: "hsl(210 44% 20%)",
    line: "hsl(214 32% 14%)",
    background: "linear-gradient(160deg, hsl(203 90% 95%), hsl(219 80% 86%))"
  }
};

export function isNamedPaletteId(value: string): value is NamedPaletteId {
  return (namedPaletteIds as readonly string[]).includes(value);
}

export interface FaceMood {
  eyes: "wide" | "calm" | "sleepy" | "closed" | "happy" | "error";
  mouth: "smile" | "soft" | "flat" | "open" | "frown";
  animation: "bounce" | "float" | "drift" | "pulse" | "glitch";
  sparkle: boolean;
}

export type FaceVariant = "rounded-bot" | "square-bot" | "soft-ghost" | "terminal-sprite";

export interface FaceShell {
  outline: Array<[number, number, number, number]>;
  fill: Array<[number, number, number, number]>;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function getProviderPalette(provider: string): ProviderPalette {
  const hue = hashString(provider || "agent") % 360;
  return {
    base: hsl(hue, 72, 62),
    accent: hsl((hue + 24) % 360, 88, 58),
    glow: hsl((hue + 8) % 360, 96, 76),
    shade: hsl(hue, 46, 22),
    line: hsl(hue, 32, 14),
    background: `linear-gradient(160deg, ${hsl(hue, 88, 94)}, ${hsl((hue + 20) % 360, 78, 84)})`
  };
}

export function getNamedPalette(name: NamedPaletteId): ProviderPalette {
  return namedPalettes[name];
}

export function getFaceShell(variant: FaceVariant): FaceShell {
  switch (variant) {
    case "square-bot":
      return {
        outline: [
          [0, 0, 12, 1],
          [0, 1, 1, 11],
          [11, 1, 1, 11],
          [0, 11, 12, 1]
        ],
        fill: [
          [1, 1, 10, 10],
          [2, 2, 8, 8]
        ]
      };
    case "soft-ghost":
      return {
        outline: [
          [2, 1, 8, 1],
          [1, 2, 10, 7],
          [2, 9, 8, 1]
        ],
        fill: [
          [3, 2, 6, 6],
          [2, 9, 1, 1],
          [5, 9, 1, 1],
          [8, 9, 1, 1]
        ]
      };
    case "terminal-sprite":
      return {
        outline: [
          [0, 0, 12, 1],
          [0, 1, 1, 10],
          [11, 1, 1, 10],
          [0, 11, 12, 1],
          [2, 2, 8, 1]
        ],
        fill: [
          [1, 1, 10, 10],
          [2, 2, 8, 8],
          [3, 9, 6, 1]
        ]
      };
    case "rounded-bot":
    default:
      return {
        outline: [
          [1, 0, 10, 1],
          [0, 1, 1, 9],
          [11, 1, 1, 9],
          [1, 10, 10, 1]
        ],
        fill: [
          [2, 1, 8, 9],
          [3, 2, 6, 7]
        ]
      };
  }
}

export function getFaceMood(status: EntityStatus): FaceMood {
  switch (status) {
    case "active":
      return { eyes: "wide", mouth: "smile", animation: "bounce", sparkle: true };
    case "idle":
      return { eyes: "calm", mouth: "soft", animation: "float", sparkle: false };
    case "sleepy":
      return { eyes: "sleepy", mouth: "flat", animation: "drift", sparkle: false };
    case "dormant":
      return { eyes: "closed", mouth: "flat", animation: "pulse", sparkle: false };
    case "done":
      return { eyes: "happy", mouth: "smile", animation: "pulse", sparkle: true };
    case "error":
      return { eyes: "error", mouth: "frown", animation: "glitch", sparkle: false };
  }
}

export function getStatusLabel(status: EntityStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getStatusFromTimestamp(timestamp: string): EntityStatus {
  return getSharedStatusFromTimestamp(timestamp);
}

export function resolveLiveStatus(currentStatus: EntityStatus | undefined, lastEventAt: string): EntityStatus {
  return resolveEntityStatus(currentStatus, lastEventAt);
}
