// Pictures for the course's widgets. Each returns a `(surface) => void` for the `surface` canvas action.

import { naive } from "../../audio/oscCore";
import { harmonicAmps } from "../../audio/tableDraw";
import { FRAME_SIZE } from "../../audio/wavetables";
import { glowStroke, grid, type Surface } from "../components/canvas";

type Draw = (s: Surface) => void;

const DIM = "#ffffff30";
const LABEL = "#ffffff70";

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = "left", color = LABEL) {
  g.font = "11px ui-monospace, monospace";
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(text, x, y);
  g.textAlign = "left";
}

/** Two cycles of a wave shape, faintly: what plays once you press a key. */
function idealLine(g: CanvasRenderingContext2D, w: number, h: number, wave: number, scale: number) {
  g.strokeStyle = DIM;
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= w; x++) {
    const y = h / 2 - naive(wave, ((x / w) * 2) % 1, 0.5) * scale;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

const buf = new Float32Array(4096);
const WINDOW = 960; // 20 ms at 48 kHz: a few cycles of a middle note

/**
 * The wave coming out, live. `gain` null zooms to fit (to see the shape); a number draws at a fixed scale
 * (to see the height change with loudness). While silent, `wave` is drawn faintly instead.
 */
export function liveWave(analyser: () => AnalyserNode, color: () => string, wave: () => number, gain: number | null): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [], [h / 2]);
    if (gain !== null) {
      // The fixed scale's top and bottom: full volume reaches them.
      g.strokeStyle = "#ffffff14";
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(0, h * 0.06);
      g.lineTo(w, h * 0.06);
      g.moveTo(0, h * 0.94);
      g.lineTo(w, h * 0.94);
      g.stroke();
      g.setLineDash([]);
    }
    const a = analyser();
    a.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    if (peak < 0.0005) {
      idealLine(g, w, h, wave(), h * 0.3);
      return label(g, "play a note", w - 8, h - 8, "right");
    }
    // Trigger on a rising zero crossing, so a steady wave stands still.
    let start = 0;
    for (let i = 1; i < buf.length - WINDOW; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) {
        start = i;
        break;
      }
    }
    const k = (gain ?? Math.min(8, 0.9 / peak)) * (h / 2) * 0.88;
    g.beginPath();
    for (let i = 0; i < WINDOW; i++) {
      const x = (i / (WINDOW - 1)) * w;
      const y = Math.max(1, Math.min(h - 1, h / 2 - buf[start + i] * k));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    glowStroke(g, color(), 2);
  };
}

/** How long the pitch picture shows: one hundredth of a second. */
export const PITCH_SECONDS = 0.01;

export const noteHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** A note's wave over 10 ms, so a higher note shows more swings. */
export function pitchWave(note: () => number | null, wave: () => number, color: () => string): Draw {
  return ({ g, w, h }) => {
    const ms = Array.from({ length: 9 }, (_, i) => ((i + 1) / 10) * w);
    grid(g, w, h, ms, [h / 2]);
    label(g, "0", 4, h - 6);
    label(g, "10 ms", w - 4, h - 6, "right");
    const n = note();
    if (n === null) {
      idealLine(g, w, h, wave(), h * 0.3);
      return label(g, "play a note", w / 2, 16, "center");
    }
    const cycles = noteHz(n) * PITCH_SECONDS;
    const steps = Math.min(4000, Math.max(w, cycles * 24));
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = (i / steps) * cycles;
      const y = h / 2 - naive(wave(), p - Math.floor(p), 0.5) * h * 0.36;
      const x = (i / steps) * w;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    glowStroke(g, color(), 1.8);
  };
}

/** The first HARMONICS harmonics of each basic wave, scaled so the strongest is 1. */
export const HARMONICS = 16;
const harmonicsCache = new Map<number, number[]>();
export function waveHarmonics(wave: number): number[] {
  let amps = harmonicsCache.get(wave);
  if (!amps) {
    const frame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = naive(wave, i / FRAME_SIZE, 0.5);
    const raw = harmonicAmps(frame, HARMONICS);
    const top = Math.max(...raw);
    amps = raw.map((a) => (a / top < 1e-3 ? 0 : a / top));
    harmonicsCache.set(wave, amps);
  }
  return amps;
}

/** One bar per harmonic of the wave, with the wave itself drawn small at the left. */
export function harmonicBars(wave: () => number, color: () => string): Draw {
  return ({ g, w, h }) => {
    const amps = waveHarmonics(wave());
    const thumb = Math.min(140, w * 0.22);
    // The wave, then "=", then its sines.
    g.save();
    g.translate(0, h * 0.2);
    idealLine(g, thumb, h * 0.6, wave(), h * 0.22);
    g.restore();
    label(g, "=", thumb + 14, h / 2 + 4, "center", "#ffffffb0");
    const left = thumb + 30;
    const bottom = h - 18;
    const top = 8;
    const bw = (w - left) / amps.length;
    amps.forEach((a, i) => {
      const x = left + i * bw + 2;
      g.fillStyle = "#ffffff0d";
      g.fillRect(x, top, bw - 4, bottom - top);
      g.fillStyle = color();
      const bh = a > 0 ? Math.max(2, (bottom - top) * a) : 0;
      g.fillRect(x, bottom - bh, bw - 4, bh);
      label(g, String(i + 1), x + (bw - 4) / 2, h - 4, "center", i === 0 ? "#ffffffd0" : LABEL);
    });
  };
}
