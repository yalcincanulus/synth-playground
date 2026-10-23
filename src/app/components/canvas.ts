import type { Action } from "svelte/action";

export interface Surface {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/**
 * Keeps a canvas sized to its box at device pixel ratio, and calls `draw`
 * whenever it resizes, plus every frame when `animate` is set.
 */
export const surface: Action<HTMLCanvasElement, { draw: (s: Surface) => void; animate?: boolean; /** Repaints when this changes. */ key?: unknown }> = (canvas, initial) => {
  let opts = initial;
  let frame = 0;
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
  const loop = () => {
    paint();
    frame = requestAnimationFrame(loop);
  };
  const restart = () => {
    cancelAnimationFrame(frame);
    if (opts.animate) loop();
    else paint();
  };

  const ro = new ResizeObserver(() => (opts.animate ? undefined : paint()));
  ro.observe(canvas);
  restart();

  return {
    update(next) {
      opts = next;
      restart();
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro.disconnect();
    },
  };
};

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
