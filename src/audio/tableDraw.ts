// Drawing your own wavetable: 2 to 4 keyframes (single waves), drawn with the mouse or built from
// harmonic sliders, blended into a full table.
//
// Blending, two ways:
// - harmonics: each harmonic's strength moves from one keyframe's value to the next, and its timing
//   (phase) turns the short way round. Nothing cancels, so the sound stays full between keyframes.
// - crossfade: the waves are mixed sample by sample, as the oscillator does between neighbouring frames.
//   Simple, but two waves that are opposite in places partly cancel, so the middle can go thin and quiet.

import { FRAME_SIZE, fft } from "./wavetables";

export const MIN_KEYS = 2;
export const MAX_KEYS = 4;
/** Harmonic sliders per keyframe (and the most a slider-built wave has). */
export const HARMONIC_SLIDERS = 32;

export const BLEND_MODES = ["harmonics", "crossfade"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
export const BLEND_NAMES: Record<BlendMode, string> = { harmonics: "Harmonics (smooth)", crossfade: "Crossfade" };

/** Starting shapes, drawn the same way as the built-in tables (all start at 0 and rise, so they line up). */
export const SHAPES = {
  sine: (p: number) => Math.sin(2 * Math.PI * p),
  triangle: (p: number) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4),
  saw: (p: number) => 2 * ((p + 0.5) % 1) - 1,
  square: (p: number) => (p < 0.5 ? 1 : -1),
};
export type ShapeName = keyof typeof SHAPES;

export function shapeWave(shape: ShapeName | ((p: number) => number)): Float32Array {
  const f = typeof shape === "function" ? shape : SHAPES[shape];
  return Float32Array.from({ length: FRAME_SIZE }, (_, i) => f(i / FRAME_SIZE));
}

/**
 * Draw a straight line into a wave, from (p0, v0) to (p1, v1): p is the place in the cycle (0..1),
 * v the level (-1..1). Every sample between gets a value, so a fast mouse leaves no gaps.
 */
export function drawLine(wave: Float32Array, p0: number, v0: number, p1: number, v1: number) {
  const clampV = (v: number) => Math.max(-1, Math.min(1, v));
  const toIndex = (p: number) => Math.max(0, Math.min(FRAME_SIZE - 1, Math.round(p * (FRAME_SIZE - 1))));
  let i0 = toIndex(p0), i1 = toIndex(p1);
  v0 = clampV(v0);
  v1 = clampV(v1);
  if (i0 > i1) [i0, i1, v0, v1] = [i1, i0, v1, v0];
  for (let i = i0; i <= i1; i++) wave[i] = i1 === i0 ? v1 : v0 + ((v1 - v0) * (i - i0)) / (i1 - i0);
}

/** The wave's spectrum (unscaled FFT). */
function spectrum(wave: Float32Array): [Float64Array, Float64Array] {
  const re = Float64Array.from(wave);
  const im = new Float64Array(FRAME_SIZE);
  fft(re, im, false);
  return [re, im];
}

/**
 * The wave back from a spectrum, without its DC offset. The top bin (1024, real only) is kept, so a
 * keyframe comes back sample for sample: without it a drawn square would overshoot.
 */
function fromSpectrum(re: Float64Array, im: Float64Array): Float32Array {
  const r = new Float64Array(FRAME_SIZE);
  const i = new Float64Array(FRAME_SIZE);
  r[FRAME_SIZE / 2] = re[FRAME_SIZE / 2];
  for (let h = 1; h < FRAME_SIZE / 2; h++) {
    r[h] = re[h];
    i[h] = im[h];
    r[FRAME_SIZE - h] = re[h];
    i[FRAME_SIZE - h] = -im[h];
  }
  fft(r, i, true);
  return Float32Array.from(r, (x) => x / FRAME_SIZE);
}

/** Strength of harmonics 1..count, as the peak of each sine wave (a full-size sine is 1; a saw's first is 2/π). */
export function harmonicAmps(wave: Float32Array, count = HARMONIC_SLIDERS): number[] {
  const [re, im] = spectrum(wave);
  return Array.from({ length: count }, (_, k) => (2 * Math.hypot(re[k + 1], im[k + 1])) / FRAME_SIZE);
}

/**
 * A wave made of sine waves at these strengths (harmonic 1 first). Not scaled: the keyframe is as loud
 * as its sliders say (the table's one gain is set when the keyframes are blended).
 */
export function waveFromAmps(amps: number[]): Float32Array {
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  // sin(θ) is the imaginary part: a·sin(2πhn/N) has bin h = -i·a·N/2.
  amps.forEach((a, k) => (im[k + 1] = (-a * FRAME_SIZE) / 2));
  return fromSpectrum(re, im);
}

/** Soften a drawn wave: higher harmonics are turned down, more the higher they are. Again for more. */
export function smooth(wave: Float32Array): Float32Array {
  const [re, im] = spectrum(wave);
  for (let h = 1; h < FRAME_SIZE / 2; h++) {
    const k = Math.exp(-((h / 24) ** 2));
    re[h] *= k;
    im[h] *= k;
  }
  const out = fromSpectrum(re, im);
  // Keep the loudness of the drawing, so a few presses don't make it fade away.
  const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const gain = peak(out) > 1e-9 ? peak(wave) / peak(out) : 0;
  return out.map((v) => v * gain);
}

/** Frames in a drawn table: as close to 32 as lets every keyframe land exactly on a frame. */
export function frameCount(keys: number): number {
  return 1 + (keys - 1) * Math.floor(31 / (keys - 1));
}

/**
 * The full table from the keyframes, spread evenly from the start to the end of the table. The frames
 * have no DC offset and share one gain (the loudest sample is 1), so a quiet keyframe stays quiet.
 */
export function blendKeyframes(keys: Float32Array[], mode: BlendMode): Float32Array[] {
  const count = frameCount(keys.length);
  const per = (count - 1) / (keys.length - 1);
  const spectra = mode === "harmonics" ? keys.map(spectrum) : [];
  const frames: Float32Array[] = [];
  for (let f = 0; f < count; f++) {
    const k = Math.min(keys.length - 2, Math.floor(f / per));
    const t = f / per - k;
    if (mode === "crossfade") {
      const a = keys[k], b = keys[k + 1];
      frames.push(Float32Array.from(a, (v, i) => v + (b[i] - v) * t));
    } else {
      frames.push(morph(spectra[k], spectra[k + 1], t));
    }
  }
  frames.forEach(removeDc);
  normalise(frames);
  return frames;
}

/** Between two spectra: each harmonic's strength by straight line, its phase the short way round. */
function morph([ar, ai]: [Float64Array, Float64Array], [br, bi]: [Float64Array, Float64Array], t: number): Float32Array {
  if (t === 0) return fromSpectrum(ar, ai);
  if (t === 1) return fromSpectrum(br, bi);
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  let loudest = 0;
  for (let h = 1; h < FRAME_SIZE / 2; h++) loudest = Math.max(loudest, Math.hypot(ar[h], ai[h]), Math.hypot(br[h], bi[h]));
  // Below this a harmonic is too weak to have a meaningful phase: the other keyframe's phase is used.
  const quiet = loudest * 1e-6;
  const top = FRAME_SIZE / 2;
  re[top] = ar[top] + (br[top] - ar[top]) * t;
  for (let h = 1; h < FRAME_SIZE / 2; h++) {
    const ma = Math.hypot(ar[h], ai[h]);
    const mb = Math.hypot(br[h], bi[h]);
    const m = ma + (mb - ma) * t;
    if (m <= quiet) continue;
    const pa = Math.atan2(ai[h], ar[h]);
    const pb = Math.atan2(bi[h], br[h]);
    let ph: number;
    if (ma <= quiet) ph = pb;
    else if (mb <= quiet) ph = pa;
    else {
      let d = pb - pa;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      ph = pa + d * t;
    }
    re[h] = m * Math.cos(ph);
    im[h] = m * Math.sin(ph);
  }
  return fromSpectrum(re, im);
}

function removeDc(frame: Float32Array) {
  let dc = 0;
  for (let i = 0; i < frame.length; i++) dc += frame[i];
  dc /= frame.length;
  for (let i = 0; i < frame.length; i++) frame[i] -= dc;
}

/** Scale the frames together so the loudest sample is 1. */
function normalise(frames: Float32Array[]) {
  let peak = 0;
  for (const f of frames) for (let i = 0; i < f.length; i++) peak = Math.max(peak, Math.abs(f[i]));
  if (peak > 1e-9) for (const f of frames) for (let i = 0; i < f.length; i++) f[i] /= peak;
}
