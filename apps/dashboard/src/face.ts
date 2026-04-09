export type EntityStatus = "active" | "idle" | "sleepy" | "dormant" | "done" | "error";

export interface ProviderPalette {
  base: string;
  accent: string;
  glow: string;
  shade: string;
  line: string;
  background: string;
}

export interface FaceMood {
  eyes: "wide" | "calm" | "sleepy" | "closed" | "happy" | "error";
  mouth: "smile" | "soft" | "flat" | "open" | "frown";
  animation: "bounce" | "float" | "drift" | "pulse" | "glitch";
  sparkle: boolean;
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
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (ageMs <= 10_000) return "active";
  if (ageMs <= 30_000) return "idle";
  if (ageMs <= 90_000) return "sleepy";
  if (ageMs <= 300_000) return "dormant";
  return "dormant";
}
