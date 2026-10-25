// The render check's measurements, as plain functions (no Web Audio), so they are unit-tested.
//
// Every preset plays the same short phrase offline; the result is checked for problems
// (non-finite samples, silence, clicks, notes cut off, levels far from the others) and
// summarised (loudness over time, spectrum) so two engines can be compared.

export interface PhraseNote {
  note: number;
  on: number;
  off: number;
}

export const RENDER_RATE = 48000;
/**
 * Times are moved onto the audio engine's 128-sample blocks, where an offline render can pause:
 * the render check plays each note at that moment, as a live key press would.
 */
const onBlock = (t: number) => (Math.round((t * RENDER_RATE) / 128) * 128) / RENDER_RATE;

/** A held low note, a held chord, then fast short notes (for retrigger clicks). */
export const PHRASE: PhraseNote[] = [
  { note: 48, on: 0.1, off: 1.1 },
  ...[60, 64, 67].map((note) => ({ note, on: 1.6, off: 2.6 })),
  ...Array.from({ length: 8 }, (_, i) => ({ note: i % 2 ? 67 : 60, on: 3.2 + i * 0.125, off: 3.2 + i * 0.125 + 0.0625 })),
].map((p) => ({ ...p, on: onBlock(p.on), off: onBlock(p.off) }));
export const RENDER_SECONDS = 7;
/** The chord's held part: where the spectrum is measured. */
const CHORD_FROM = 1.8;
const CHORD_TO = 2.55;

const ENVELOPE_FRAME_S = 0.05;
const FLOOR_DB = -100;
/** A jump this many times larger than the note's normal sample-to-sample movement counts as a click. */
const CLICK_RATIO = 2;
const CLICK_MIN = 0.02;
const SILENT_PEAK = 1e-4;
/** Levels compared with the median preset. */
const LOUD_DB = 8;
const QUIET_DB = -15;

export type IssueKind = "nan" | "silent" | "click" | "cut" | "loud" | "quiet";

export interface Issue {
  kind: IssueKind;
  /** Seconds into the render. */
  at?: number;
  detail: string;
}

export interface Analysis {
  peakDb: number;
  rmsDb: number;
  /** RMS level in dB for every 50 ms. */
  envelope: number[];
  /** Average level in dB per third-octave band during the chord. */
  bands: number[];
  /**
   * How wide the sound is: the level of what differs between left and right, as a share of what they
   * share (%). 0 is mono. Missing in references saved before stereo.
   */
  width?: number;
  issues: Issue[];
}

export interface Comparison {
  /** Overall loudness difference, dB (positive: louder than the reference). */
  loudnessDb: number;
  /** Average difference of the loudness over time, dB. */
  envelopeDb: number;
  /** Average difference of the chord's spectrum, dB. */
  spectrumDb: number;
}

const db = (x: number) => (x > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(x)) : FLOOR_DB);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Third-octave band centres from 31.5 Hz to 16 kHz. */
export const BAND_CENTRES = Array.from({ length: 28 }, (_, i) => 31.5 * Math.pow(2, i / 3));

/** Analyse one render. `channels` are the output channels; problems are looked for in each. */
export function analyse(channels: Float32Array[], sampleRate: number, phrase: PhraseNote[] = PHRASE): Analysis {
  const n = channels[0].length;
  const mid = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mid[i] += ch[i] / channels.length;

  const issues: Issue[] = [];
  const bad = channels.reduce((count, ch) => count + ch.filter((v) => !Number.isFinite(v)).length, 0);
  if (bad) issues.push({ kind: "nan", detail: `${bad} samples are NaN or infinite` });

  let peak = 0;
  let sum = 0;
  for (const ch of channels)
    for (let i = 0; i < n; i++) {
      const v = Number.isFinite(ch[i]) ? ch[i] : 0;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
  const rms = Math.sqrt(sum / (n * channels.length));
  if (peak < SILENT_PEAK) issues.push({ kind: "silent", detail: "no sound" });
  else for (const ch of channels) issues.push(...findClicks(ch, sampleRate, phrase), ...findCuts(ch, sampleRate));

  return {
    peakDb: round1(db(peak)),
    rmsDb: round1(db(rms)),
    envelope: envelope(mid, sampleRate),
    bands: bands(mid, sampleRate, CHORD_FROM, CHORD_TO),
    width: stereoWidth(channels),
    issues: dedupe(issues),
  };
}

/** Side level over mid level, in % (0 for mono). */
export function stereoWidth(channels: Float32Array[]): number {
  if (channels.length < 2) return 0;
  const [l, r] = channels;
  let mid = 0;
  let side = 0;
  for (let i = 0; i < l.length; i++) {
    mid += ((l[i] + r[i]) / 2) ** 2;
    side += ((l[i] - r[i]) / 2) ** 2;
  }
  return mid > 0 ? Math.round(Math.sqrt(side / mid) * 100) : 0;
}

/** Same kind within 10 ms (e.g. on both channels) counts once. */
function dedupe(issues: Issue[]): Issue[] {
  const out: Issue[] = [];
  for (const i of issues) if (!out.some((o) => o.kind === i.kind && Math.abs((o.at ?? -1) - (i.at ?? -1)) < 0.01)) out.push(i);
  return out.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

function maxDiff(x: Float32Array, from: number, to: number) {
  let m = 0;
  for (let i = Math.max(1, from); i < Math.min(x.length, to); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
  return m;
}

/**
 * Clicks at note starts and ends: the largest sample-to-sample jump just after a note-on (or around a
 * note-off), compared with the largest jump while that note sounds normally. A saw's own drop is a big
 * jump too, so only jumps clearly bigger than anything in the steady sound count.
 */
export function findClicks(x: Float32Array, sampleRate: number, phrase: PhraseNote[]): Issue[] {
  const ms = (t: number) => Math.round((t * sampleRate) / 1000);
  const s = (t: number) => Math.round(t * sampleRate);
  const times = [...new Set(phrase.flatMap((p) => [p.on, p.off]))].sort((a, b) => a - b);
  const next = (t: number) => times.find((u) => u > t + 0.001) ?? x.length / sampleRate;
  const prev = (t: number) => [...times].reverse().find((u) => u < t - 0.001) ?? 0;
  const issues: Issue[] = [];
  const check = (at: number, kind: string, win: [number, number], ref: [number, number]) => {
    if (ref[1] - ref[0] < ms(10)) return; // not enough steady sound to compare with
    const jump = maxDiff(x, win[0], win[1]);
    const normal = maxDiff(x, ref[0], ref[1]);
    if (jump > CLICK_MIN && jump > CLICK_RATIO * normal)
      issues.push({ kind: "click", at, detail: `click at ${kind} (${at.toFixed(2)} s): jump ${jump.toFixed(3)} vs normal ${normal.toFixed(3)}` });
  };
  for (const on of [...new Set(phrase.map((p) => p.on))]) {
    check(on, "note start", [s(on), s(on) + ms(3)], [s(on) + ms(20), Math.min(s(on) + ms(300), s(next(on)) - ms(2))]);
  }
  for (const off of [...new Set(phrase.map((p) => p.off))]) {
    check(off, "note end", [s(off) - ms(1), s(off) + ms(3)], [Math.max(s(off) - ms(100), s(prev(off)) + ms(20)), s(off) - ms(5)]);
  }
  return issues;
}

/**
 * Sound that stops dead: clearly audible in one 2 ms window, silent in the next, and not already
 * fading away (a fade that reaches zero is smooth, a cut keeps its level until the end).
 */
export function findCuts(x: Float32Array, sampleRate: number): Issue[] {
  const w = Math.round(sampleRate * 0.002);
  const hop = Math.round(sampleRate * 0.001);
  const maxAbs = (from: number, to: number) => {
    let m = 0;
    for (let i = from; i < to; i++) m = Math.max(m, Math.abs(x[i]));
    return m;
  };
  const issues: Issue[] = [];
  for (let i = 2 * w; i + w <= x.length; i += hop) {
    const before = maxAbs(i - w, i);
    if (before > 0.003 && maxAbs(i, i + w) < 1e-4 && before > 0.7 * maxAbs(i - 2 * w, i - w)) {
      issues.push({ kind: "cut", at: i / sampleRate, detail: `sound stops dead at ${(i / sampleRate).toFixed(2)} s` });
      i += w * 10;
    }
  }
  return issues;
}

function envelope(x: Float32Array, sampleRate: number): number[] {
  const frame = Math.round(sampleRate * ENVELOPE_FRAME_S);
  const out: number[] = [];
  for (let i = 0; i + frame <= x.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += x[j] * x[j];
    out.push(round1(db(Math.sqrt(sum / frame))));
  }
  return out;
}

const FFT_SIZE = 4096;

function bands(x: Float32Array, sampleRate: number, from: number, to: number): number[] {
  const power = new Float64Array(FFT_SIZE / 2);
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let frames = 0;
  for (let start = Math.round(from * sampleRate); start + FFT_SIZE <= Math.round(to * sampleRate); start += FFT_SIZE / 2) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (x[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < FFT_SIZE / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const binHz = sampleRate / FFT_SIZE;
  return BAND_CENTRES.map((c) => {
    const lo = Math.max(1, Math.floor((c / Math.pow(2, 1 / 6)) / binHz));
    const hi = Math.max(lo + 1, Math.ceil((c * Math.pow(2, 1 / 6)) / binHz));
    let sum = 0;
    for (let k = lo; k < hi && k < power.length; k++) sum += power[k];
    // Normalised so a full-scale sine reads about 0 dB in its band.
    return round1(10 * Math.log10(Math.max(1e-10, sum / Math.max(1, frames) / ((FFT_SIZE / 4) ** 2 / 2))));
  });
}

/** In-place radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/**
 * How much of a steady periodic sound is aliasing: the energy away from the harmonics of `f0`, relative to
 * the energy on them, in dB (lower is cleaner). Aliases are harmonics above the Nyquist frequency folded
 * back down, so they land between the real harmonics. Measured over `n` samples from `start`, with a
 * Blackman-Harris window (its leakage is below -92 dB, the floor of this measurement).
 */
export function aliasLevel(x: Float32Array, sampleRate: number, f0: number, start = 0, n = 32768): number {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / (n - 1);
    const w = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
    re[i] = (x[start + i] ?? 0) * w;
  }
  fft(re, im);
  const binHz = sampleRate / n;
  // The window's main lobe is 4 bins either side; 6 leaves room for the harmonics' own width.
  const near = 6;
  let harmonic = 0;
  let other = 0;
  for (let b = Math.ceil(20 / binHz); b < n / 2; b++) {
    const e = re[b] * re[b] + im[b] * im[b];
    const k = Math.round((b * binHz) / f0);
    if (k >= 1 && Math.abs(b - (k * f0) / binHz) <= near) harmonic += e;
    else other += e;
  }
  return 10 * Math.log10(Math.max(other, 1e-30) / Math.max(harmonic, 1e-30));
}

/** Add "loud" and "quiet" issues to presets far from the median level. */
export function levelOutliers(results: Map<string, Analysis>) {
  const levels = [...results.values()].filter((a) => !a.issues.some((i) => i.kind === "silent")).map((a) => a.rmsDb);
  if (levels.length < 3) return;
  const sorted = [...levels].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const a of results.values()) {
    a.issues = a.issues.filter((i) => i.kind !== "loud" && i.kind !== "quiet");
    const d = a.rmsDb - median;
    if (d > LOUD_DB) a.issues.push({ kind: "loud", detail: `${d.toFixed(1)} dB louder than the median preset` });
    else if (d < QUIET_DB && !a.issues.some((i) => i.kind === "silent")) a.issues.push({ kind: "quiet", detail: `${(-d).toFixed(1)} dB quieter than the median preset` });
  }
}

/** How far a render is from a reference render of the same preset. */
export function compare(a: Analysis, ref: Analysis): Comparison {
  const audible = (x: number, y: number) => Math.max(x, y) > -60;
  let envSum = 0;
  let envCount = 0;
  for (let i = 0; i < Math.min(a.envelope.length, ref.envelope.length); i++) {
    if (!audible(a.envelope[i], ref.envelope[i])) continue;
    envSum += Math.abs(a.envelope[i] - ref.envelope[i]);
    envCount++;
  }
  const loudest = Math.max(...ref.bands, ...a.bands);
  let specSum = 0;
  let specCount = 0;
  ref.bands.forEach((r, i) => {
    if (Math.max(r, a.bands[i]) < loudest - 60) return;
    specSum += Math.abs(a.bands[i] - r);
    specCount++;
  });
  return {
    loudnessDb: round1(a.rmsDb - ref.rmsDb),
    envelopeDb: round1(envCount ? envSum / envCount : 0),
    spectrumDb: round1(specCount ? specSum / specCount : 0),
  };
}
