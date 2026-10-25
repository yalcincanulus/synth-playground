import type { Action } from "svelte/action";

export interface Surface {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
}

// Live pictures (scopes, meters, LFO dots) redraw every frame. On a slow computer that is a large part of
// the work, so they share one animation loop that:
// - skips pictures that are off screen (the Synth view has about 20, many below the fold),
// - skips a picture whose `idle` says nothing changed (the scope while the sound is silent),
// - drops to every other frame (30 fps) while frames keep arriving late, and tries 60 fps again later.

interface Live {
  paint: () => void;
  visible: boolean;
  idle?: () => boolean;
}

const live = new Set<Live>();
let rafId = 0;
let lastT = 0;
/** Smoothed time between frames, ms. */
let gapAvg = 1000 / 60;
let half = false;
let odd = false;
/** While at half rate: when to try full rate again, and how long to wait the next time it fails. */
let retryAt = 0;
let holdMs = 5000;

function frame(t: number) {
  rafId = live.size ? requestAnimationFrame(frame) : 0;
  const gap = lastT ? Math.min(250, t - lastT) : 1000 / 60;
  lastT = t;
  gapAvg += (gap - gapAvg) * 0.1;
  if (!half && gapAvg > 24) {
    half = true;
    retryAt = t + holdMs;
  } else if (half && t > retryAt) {
    // Try full rate again; if it is still too slow it drops back, and waits longer before the next try.
    half = false;
    gapAvg = 1000 / 60;
    holdMs = Math.min(60000, holdMs * 2);
  }
  odd = !odd;
  if (half && odd) return;
  for (const l of live) if (l.visible && !l.idle?.()) l.paint();
}

/**
 * Keeps a canvas sized to its box at device pixel ratio, and calls `draw` whenever it resizes, plus
 * every frame when `animate` is set (then `idle`, if given, can say the picture wouldn't change).
 */
export const surface: Action<
  HTMLCanvasElement,
  { draw: (s: Surface) => void; animate?: boolean; idle?: () => boolean; /** Repaints when this changes. */ key?: unknown }
> = (canvas, initial) => {
  let opts = initial;
  const g = canvas.getContext("2d")!;

  const paint = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    opts.draw({ g, w, h });
  };
  const entry: Live = { paint, visible: true, idle: () => opts.idle?.() ?? false };
  const restart = () => {
    if (opts.animate) {
      live.add(entry);
      if (!rafId) rafId = requestAnimationFrame(frame);
    } else {
      live.delete(entry);
    }
    paint();
  };

  const ro = new ResizeObserver(() => paint());
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => (entry.visible = e.isIntersecting));
  io.observe(canvas);
  restart();

  return {
    update(next) {
      opts = next;
      restart();
    },
    destroy() {
      live.delete(entry);
      ro.disconnect();
      io.disconnect();
    },
  };
};

/**
 * Stroke the current path with a soft glow around it. Canvas shadowBlur looks the same but blurs the
 * whole canvas each frame, which made the scope the slowest thing on screen on a slow computer; two
 * wide, faint strokes under the line cost almost nothing. `strength` scales the glow (1: normal).
 */
export function glowStroke(g: CanvasRenderingContext2D, color: string, width: number, strength = 1) {
  g.strokeStyle = color;
  g.lineJoin = "round";
  g.globalAlpha = 0.1 * strength;
  g.lineWidth = width + 8;
  g.stroke();
  g.globalAlpha = 0.22 * strength;
  g.lineWidth = width + 3.5;
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = width;
  g.stroke();
}

/** A white dot of radius `r` with a coloured halo (see glowStroke). */
export function glowDot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.globalAlpha = 0.25;
  g.beginPath();
  g.arc(x, y, r + 4, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function grid(g: CanvasRenderingContext2D, w: number, h: number, xs: number[], ys: number[]) {
  g.strokeStyle = "#ffffff10";
  g.lineWidth = 1;
  g.beginPath();
  for (const x of xs) {
    g.moveTo(Math.round(x) + 0.5, 0);
    g.lineTo(Math.round(x) + 0.5, h);
  }
  for (const y of ys) {
    g.moveTo(0, Math.round(y) + 0.5);
    g.lineTo(w, Math.round(y) + 0.5);
  }
  g.stroke();
}

/** x position (0..w) of a frequency on a 20 Hz - 20 kHz log axis. */
export const freqX = (f: number, w: number) => (Math.log10(f / 20) / 3) * w;
export const xFreq = (x: number, w: number) => 20 * Math.pow(10, (x / w) * 3);
export const FREQ_GRID = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
