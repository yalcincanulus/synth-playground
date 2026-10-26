// A spectrogram: time runs right to left, pitch runs up (on a log scale, like a keyboard stood on end),
// and the louder a frequency is, the brighter its row. A filter's work shows as the dark area above its
// cutoff; a harmonic is a bright horizontal line.

import { grid, type Surface } from "./canvas";

type Draw = (s: Surface) => void;

const LOW = 30;
const HIGH = 16000;
/**
 * Loudness shown: the loudest level of the last moments is full colour, RANGE_DB below it is black. It
 * follows the sound (quickly up, slowly down), so quiet and loud sounds both show their harmonics.
 */
const RANGE_DB = 60;
/** How fast the top of the range falls back after a loud sound, in dB per frame. */
const FALL_DB = 0.15;
/** Below this, it is silence. */
const SILENT_DB = -120;
/** How far the picture moves each frame, in pixels. */
const STEP = 2;
const GRID = [100, 1000, 10000];

export const freqY = (f: number, h: number) => h - (Math.log(f / LOW) / Math.log(HIGH / LOW)) * h;
const yFreq = (y: number, h: number) => LOW * Math.pow(HIGH / LOW, (h - y) / h);

/**
 * The level of the bins between `lo` and `hi` (fractional bin numbers): the loudest one when the row
 * covers several bins (high up), blended between the two nearest when it falls between two (low down).
 */
function levelAt(data: Float32Array, lo: number, hi: number): number {
  const last = data.length - 1;
  if (hi - lo >= 1) {
    let m = -Infinity;
    for (let i = Math.ceil(lo); i <= Math.min(last, Math.floor(hi)); i++) m = Math.max(m, data[i]);
    return m;
  }
  const b = Math.min(last - 1, (lo + hi) / 2);
  const i = Math.floor(b);
  return data[i] + (data[i + 1] - data[i]) * (b - i);
}

/**
 * `marker` draws a line at a frequency (the filter's live cutoff), with its name. Each call makes its own
 * history, so give each canvas its own spectrogram.
 */
export function spectrogram(analyser: () => AnalyserNode, color: () => string, marker?: () => { hz: number; label: string } | null): Draw {
  let hist: HTMLCanvasElement | null = null;
  let hg: CanvasRenderingContext2D | null = null;
  let data = new Float32Array(0);
  let top = SILENT_DB;
  return ({ g, w, h }) => {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    if (!hist || hist.width !== W || hist.height !== H) {
      hist = document.createElement("canvas");
      hist.width = W;
      hist.height = H;
      hg = hist.getContext("2d")!;
    }
    const a = analyser();
    if (data.length !== a.frequencyBinCount) data = new Float32Array(a.frequencyBinCount);
    a.getFloatFrequencyData(data);
    const binHz = a.context.sampleRate / a.fftSize;
    let loudest = SILENT_DB;
    for (let i = 1; i < data.length; i++) if (data[i] > loudest) loudest = data[i];
    top = Math.max(loudest, top - FALL_DB);

    // Move the history left, then paint the newest column at the right edge. "copy" replaces the old picture:
    // drawn over it, faint pixels would add up every frame until everything is solid.
    const c = hg!;
    c.globalAlpha = 1;
    c.globalCompositeOperation = "copy";
    c.drawImage(hist, -STEP, 0);
    c.globalCompositeOperation = "source-over";
    c.clearRect(W - STEP, 0, STEP, H);
    c.fillStyle = color();
    for (let y = 0; y < H; y++) {
      const t = (levelAt(data, yFreq(y + 1, H) / binHz, yFreq(y, H) / binHz) - (top - RANGE_DB)) / RANGE_DB;
      if (t <= 0 || top <= SILENT_DB) continue;
      c.globalAlpha = Math.min(1, t * t * t);
      c.fillRect(W - STEP, y, STEP, 1);
    }

    g.drawImage(hist, 0, 0, w, h);
    grid(g, w, h, [], GRID.map((f) => freqY(f, h)));
    g.font = "10px ui-monospace, monospace";
    g.fillStyle = "#ffffff60";
    for (const f of GRID) g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 3, freqY(f, h) - 3);

    const m = marker?.();
    if (m) {
      const y = freqY(Math.max(LOW, Math.min(HIGH, m.hz)), h);
      g.strokeStyle = "#ffffffb0";
      g.setLineDash([5, 4]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#ffffffd0";
      g.textAlign = "right";
      g.fillText(m.label, w - 4, Math.max(10, y - 4));
      g.textAlign = "left";
    }
  };
}
