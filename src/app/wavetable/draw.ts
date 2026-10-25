// Draw functions for the Wavetable tab.

import type { Engine } from "../../audio/engine";
import { FRAME_SIZE, frameAt, tableFrames, tableHarmonics } from "../../audio/wavetables";
import { grid, type Surface } from "../components/canvas";

type Draw = (s: Surface) => void;

const POINTS = 160;
/** Most frames drawn in the stack. */
const MAX_DRAWN = 48;

function wavePath(g: CanvasRenderingContext2D, frame: (p: number) => number, x0: number, y0: number, width: number, amp: number) {
  g.beginPath();
  for (let i = 0; i <= POINTS; i++) {
    const x = x0 + (i / POINTS) * width;
    const y = y0 - frame(Math.min(0.9999, i / POINTS)) * amp;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

const sampler = (f: Float32Array) => (p: number) => f[Math.floor(p * FRAME_SIZE)];

/**
 * The whole table as a stack of frames receding into the distance (first frame at the
 * front), with the frame playing right now lit up at its place in the stack.
 */
export function stack(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    const frames = tableFrames(engine.params.wtTable);
    const n = frames.length;
    const pad = 12;
    const depthX = w * 0.28;
    const depthY = h * 0.42;
    const width = w - depthX - pad * 2;
    const amp = h * 0.16;
    const baseY = h - amp - pad;
    const last = Math.max(1, n - 1);
    const at = (f: number) => [pad + (f / last) * depthX, baseY - (f / last) * depthY] as const;

    // Back to front, each frame hiding the ones behind it. Big imported tables show every few frames.
    const step = Math.ceil(n / MAX_DRAWN);
    const drawn: number[] = [];
    for (let f = 0; f < n; f += step) drawn.push(f);
    if (drawn[drawn.length - 1] !== n - 1) drawn.push(n - 1);
    for (const f of drawn.reverse()) {
      const [x0, y0] = at(f);
      wavePath(g, sampler(frames[f]), x0, y0, width, amp);
      g.lineTo(x0 + width, y0 + amp + 4);
      g.lineTo(x0, y0 + amp + 4);
      g.closePath();
      g.fillStyle = "#0b0e10";
      g.fill();
      wavePath(g, sampler(frames[f]), x0, y0, width, amp);
      g.strokeStyle = `rgba(255,255,255,${0.12 + 0.18 * (1 - f / n)})`;
      g.lineWidth = 1;
      g.stroke();
    }

    // The Position knob (faint) and where the sound is right now (bright, moves with the LFO).
    const base = engine.params.wtPos;
    const live = engine.livePosition();
    if (Math.abs(base - live) > 0.005) {
      const [x0, y0] = at(base * (n - 1));
      wavePath(g, (p) => frameAt(frames, base, p), x0, y0, width, amp);
      g.setLineDash([4, 4]);
      g.strokeStyle = "#ffffff70";
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
    }
    const [x0, y0] = at(live * (n - 1));
    wavePath(g, (p) => frameAt(frames, live, p), x0, y0, width, amp);
    g.strokeStyle = color();
    g.lineWidth = 2.5;
    g.shadowColor = color();
    g.shadowBlur = engine.part.activeVoices > 0 ? 16 : 6;
    g.stroke();
    g.shadowBlur = 0;

    // Position axis along the depth.
    g.font = "10px ui-monospace, monospace";
    g.fillStyle = "#ffffff70";
    g.fillText("position 0", pad, h - 2);
    g.textAlign = "right";
    const [ex, ey] = at(n - 1);
    g.fillText("100%", ex + width, ey - amp - 4);
    g.fillText(`now ${Math.round(live * 100)}%`, w - pad, h - 2);
    g.textAlign = "left";
  };
}

/** The single wave playing right now, large. */
export function current(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [w / 2], [h / 2]);
    const frames = tableFrames(engine.params.wtTable);
    const pos = engine.livePosition();
    // Two cycles, like the oscillator pictures in the Synth view.
    wavePath(g, (p) => frameAt(frames, pos, (p * 2) % 1), 4, h / 2, w - 8, h * 0.4);
    g.strokeStyle = color();
    g.lineWidth = 2;
    g.stroke();
  };
}

/** How strong each harmonic is in the wave playing right now. */
export function harmonics(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    const table = tableHarmonics(engine.params.wtTable);
    const fp = engine.livePosition() * (table.length - 1);
    const f0 = Math.floor(fp);
    const f1 = Math.min(table.length - 1, f0 + 1);
    const count = table[0].length;
    const bottom = h - 14;
    const bw = w / count;
    g.font = "10px ui-monospace, monospace";
    g.textAlign = "center";
    for (let i = 0; i < count; i++) {
      const m = table[f0][i] + (table[f1][i] - table[f0][i]) * (fp - f0);
      // Square root, so quiet harmonics still show.
      const bh = Math.sqrt(m) * (bottom - 6);
      g.fillStyle = "#ffffff10";
      g.fillRect(i * bw + 1, 6, bw - 2, bottom - 6);
      g.fillStyle = color();
      g.fillRect(i * bw + 1, bottom - bh, bw - 2, bh);
      if ([1, 2, 4, 8, 16, 32].includes(i + 1)) {
        g.fillStyle = "#ffffff80";
        g.fillText(String(i + 1), i * bw + bw / 2, h - 2);
      }
    }
    g.textAlign = "left";
  };
}

/** A small overlay of a few frames, for the table list. */
export function thumbnail(id: number, color: string): Draw {
  return ({ g, w, h }) => {
    const frames = tableFrames(id);
    const picks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * (frames.length - 1))))];
    picks.forEach((f, i) => {
      wavePath(g, sampler(frames[f]), 2, h / 2, w - 4, h * 0.4);
      g.strokeStyle = color;
      g.globalAlpha = 0.25 + (0.75 * i) / Math.max(1, picks.length - 1);
      g.lineWidth = 1.2;
      g.stroke();
    });
    g.globalAlpha = 1;
  };
}
