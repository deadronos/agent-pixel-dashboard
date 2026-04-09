import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { getFaceMood, getProviderPalette, getStatusLabel, type EntityStatus } from "./face.js";

interface EntityState {
  entityId: string;
  source: string;
  sourceHost: string;
  displayName: string;
  entityKind: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  lastSummary?: string;
  activityScore: number;
}

function drawPixelFace(
  canvas: HTMLCanvasElement,
  entity: EntityState,
  now: number
): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(width * dpr);
  const targetHeight = Math.floor(height * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const maybeContext = canvas.getContext("2d");
  if (!maybeContext) {
    return;
  }
  const context: CanvasRenderingContext2D = maybeContext;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;

  const palette = getProviderPalette(entity.source);
  const mood = getFaceMood(entity.currentStatus);
  const grid = 16;
  const cell = Math.max(3, Math.floor(Math.min(width, height) / grid));
  const faceSize = cell * 12;
  const bob =
    mood.animation === "bounce"
      ? Math.sin(now / 180) * cell * 0.28
      : mood.animation === "drift"
        ? Math.sin(now / 420) * cell * 0.2
        : mood.animation === "float"
          ? Math.sin(now / 320) * cell * 0.16
          : 0;
  const glowPulse = mood.animation === "pulse" ? (Math.sin(now / 420) + 1) / 2 : 0.55;
  const jitter = mood.animation === "glitch" ? (Math.sin(now / 40) > 0.8 ? cell * 0.2 : 0) : 0;
  const x = Math.floor((width - faceSize) / 2 + jitter);
  const y = Math.floor((height - faceSize) / 2 + bob);
  const blink = Math.sin(now / 460) > 0.95;

  function px(pxX: number, pxY: number, w = 1, h = 1, color = palette.shade): void {
    context.fillStyle = color;
    context.fillRect(x + pxX * cell, y + pxY * cell, w * cell, h * cell);
  }

  context.fillStyle = palette.glow;
  context.globalAlpha = 0.22 + glowPulse * 0.16;
  context.fillRect(x - cell, y - cell, faceSize + cell * 2, faceSize + cell * 2);
  context.globalAlpha = 1;

  px(1, 1, 10, 10, palette.base);
  px(2, 2, 8, 8, palette.glow);
  px(0, 2, 1, 6, palette.shade);
  px(11, 2, 1, 6, palette.shade);
  px(2, 0, 6, 1, palette.shade);
  px(2, 11, 6, 1, palette.shade);
  px(9, 1, 1, 1, palette.accent);
  px(1, 9, 1, 1, palette.accent);

  const eyeColor = entity.currentStatus === "error" ? "#7a1010" : palette.line;
  const cheekColor = entity.currentStatus === "error" ? "#f3a0a0" : palette.accent;

  if (mood.eyes === "wide") {
    px(3, blink ? 4 : 3, 2, blink ? 1 : 2, eyeColor);
    px(7, blink ? 4 : 3, 2, blink ? 1 : 2, eyeColor);
  } else if (mood.eyes === "calm") {
    px(3, 4, 2, 1, eyeColor);
    px(7, 4, 2, 1, eyeColor);
  } else if (mood.eyes === "sleepy") {
    px(3, 4, 2, 1, eyeColor);
    px(7, 4, 2, 1, eyeColor);
    px(3, 5, 1, 1, palette.shade);
    px(8, 5, 1, 1, palette.shade);
  } else if (mood.eyes === "closed") {
    px(3, 4, 2, 1, palette.shade);
    px(7, 4, 2, 1, palette.shade);
  } else if (mood.eyes === "happy") {
    px(3, 4, 2, 1, eyeColor);
    px(7, 4, 2, 1, eyeColor);
    px(4, 3, 1, 1, eyeColor);
    px(7, 3, 1, 1, eyeColor);
  } else {
    px(3, 3, 2, 1, eyeColor);
    px(7, 3, 2, 1, eyeColor);
    px(3, 5, 2, 1, eyeColor);
    px(7, 5, 2, 1, eyeColor);
  }

  px(2, 7, 1, 1, cheekColor);
  px(9, 7, 1, 1, cheekColor);

  if (mood.mouth === "smile") {
    px(4, 8, 4, 1, palette.line);
    px(3, 7, 1, 1, palette.line);
    px(8, 7, 1, 1, palette.line);
  } else if (mood.mouth === "soft") {
    px(4, 8, 3, 1, palette.line);
  } else if (mood.mouth === "open") {
    px(4, 8, 3, 2, palette.line);
  } else if (mood.mouth === "frown") {
    px(4, 8, 4, 1, palette.line);
    px(3, 9, 1, 1, palette.line);
    px(8, 9, 1, 1, palette.line);
  } else {
    px(4, 8, 3, 1, palette.shade);
  }

  if (mood.sparkle) {
    px(10, 2, 1, 1, "#ffffff");
    px(1, 1, 1, 1, "#ffffff");
  }

  if (entity.currentStatus === "sleepy") {
    px(10, 0, 1, 1, palette.line);
    px(9, -1, 1, 1, palette.line);
  }
}

export function AgentFaceCard({ entity }: { entity: EntityState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const palette = useMemo(() => getProviderPalette(entity.source), [entity.source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let frame = 0;
    const render = (now: number) => {
      drawPixelFace(canvas, entity, now);
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [entity]);

  return (
    <article
      className={`face-card ${entity.currentStatus}`}
      style={
        {
          "--card-bg": palette.background,
          "--card-accent": palette.accent,
          "--card-line": palette.line,
          "--card-glow": palette.glow
        } as CSSProperties
      }
    >
      <div className="face-card__meta face-card__meta--top">
        <span className="face-card__name">{entity.displayName}</span>
        <span className="face-card__status">{getStatusLabel(entity.currentStatus)}</span>
      </div>
      <div className="face-card__canvas-wrap">
        <canvas ref={canvasRef} className="face-card__canvas" />
      </div>
      <div className="face-card__meta face-card__meta--bottom">
        <span className="face-card__summary">{entity.lastSummary ?? "No summary yet"}</span>
        <span className="face-card__source">
          {entity.source} on {entity.sourceHost}
        </span>
      </div>
    </article>
  );
}
