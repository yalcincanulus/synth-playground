// Turning a sound file into wavetable frames.
//
// WAV files are read here, not by the browser's decodeAudioData, because the browser resamples to the
// audio context's rate: a Serum table made at 44.1 kHz would come out with 2229-sample frames at 48 kHz.
// Other formats (MP3, OGG, FLAC) go through the browser; their exact length doesn't matter, as they are
// cut by pitch or into slices, never read as ready-made frames.
//
// How a sound becomes frames ("cut modes"):
// - frames: the file already is a wavetable, frame after frame (Serum's format: 2048 samples each, and
//   a "clm " chunk saying so). Read as it is.
// - cycles: a pitched sound (a sung note, a synth recording). Its pitch is found, and single cycles are
//   taken from evenly spaced places in it, lined up so neighbouring frames blend without cancelling.
// - slices: anything else (noise, drums, speech). Short slices from evenly spaced places, each with its
//   end faded into its start so it loops without a click. These don't keep the sound's pitch.

import { FRAME_SIZE } from "./wavetables";

export const CUT_MODES = ["auto", "frames", "cycles", "slices"] as const;
export type CutMode = (typeof CUT_MODES)[number];
export const CUT_MODE_NAMES: Record<CutMode, string> = {
  auto: "Auto",
  frames: "Wavetable frames",
  cycles: "Single cycles (pitched)",
  slices: "Slices (any sound)",
};

/** Serum's limit, and plenty for any table. */
export const MAX_FRAMES = 256;
/** Frames taken from an ordinary sound (cycles or slices). */
export const CUT_FRAMES = 64;
/** Longest sound read for cutting; the rest is ignored. */
const MAX_CUT_SECONDS = 30;

export interface DecodedSound {
  sampleRate: number;
  /** The channels mixed to mono. */
  samples: Float32Array;
  /** Samples per frame, if the file says it is a wavetable (Serum's "clm " chunk). */
  frameSize?: number;
}

export interface CutResult {
  frames: Float32Array[];
  /** The mode used (auto picks one of the others). */
  mode: Exclude<CutMode, "auto">;
  /** What was done, in a sentence, for the table's description. */
  how: string;
}

// ------------------------------------------------------------------ WAV

/** Read a WAV file: 8/16/24/32-bit PCM or 32/64-bit float, any number of channels. Throws on anything else. */
export function parseWav(buffer: ArrayBuffer): DecodedSound {
  const view = new DataView(buffer);
  const tag = (at: number) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (buffer.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file.");

  let format = 0, channels = 0, sampleRate = 0, bits = 0;
  let data: { at: number; size: number } | null = null;
  let frameSize: number | undefined;
  for (let at = 12; at + 8 <= buffer.byteLength; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID.
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === "data") {
      data = { at: body, size: Math.min(size, buffer.byteLength - body) };
    } else if (id === "clm ") {
      // Serum: "<!>2048 ..." gives the frame size.
      const text = new TextDecoder().decode(new Uint8Array(buffer, body, Math.min(size, 64, buffer.byteLength - body)));
      const m = /<!>\s*(\d+)/.exec(text);
      if (m && +m[1] > 0) frameSize = +m[1];
    }
    at = body + size + (size & 1);
  }
  if (!data || !channels) throw new Error("The WAV file has no sound data.");
  const isFloat = format === 3;
  if (!(format === 1 || isFloat) || (isFloat && bits !== 32 && bits !== 64) || (!isFloat && ![8, 16, 24, 32].includes(bits))) {
    throw new Error(`This WAV encoding isn't supported (format ${format}, ${bits} bits). Use PCM or float.`);
  }

  const bytes = bits / 8;
  const length = Math.floor(data.size / (bytes * channels));
  const read = (at: number): number => {
    if (isFloat) return bits === 32 ? view.getFloat32(at, true) : view.getFloat64(at, true);
    switch (bits) {
      case 8:
        return (view.getUint8(at) - 128) / 128;
      case 16:
        return view.getInt16(at, true) / 32768;
      case 24:
        return ((view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) / 8388608);
      default:
        return view.getInt32(at, true) / 2147483648;
    }
  };
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(data.at + (i * channels + c) * bytes);
    samples[i] = sum / channels;
  }
  return { sampleRate, samples, frameSize };
}

/**
 * Any sound file: WAV is read here (exact samples, original rate); anything else is decoded by the
 * browser at the context's rate. Throws with a readable message if neither can read it.
 */
export async function decodeSoundFile(buffer: ArrayBuffer, ctx: BaseAudioContext): Promise<DecodedSound> {
  const head = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  const isWav = String.fromCharCode(...head.subarray(0, 4)) === "RIFF" && String.fromCharCode(...head.subarray(8, 12)) === "WAVE";
  if (isWav) {
    try {
      return parseWav(buffer);
    } catch (e) {
      // An unusual WAV encoding (say A-law): the browser may still read it.
      if (!(e instanceof Error && e.message.includes("isn't supported"))) throw e;
    }
  }
  let audio: AudioBuffer;
  try {
    // decodeAudioData takes the buffer over, so it gets a copy.
    audio = await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    throw new Error("The browser can't read this file as sound. Try a WAV.");
  }
  const samples = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < ch.length; i++) samples[i] += ch[i] / audio.numberOfChannels;
  }
  return { sampleRate: audio.sampleRate, samples };
}

/** A minimal 32-bit float mono WAV, with Serum's "clm " chunk when a frame size is given (for tests). */
export function makeWav(samples: Float32Array, sampleRate = 44100, frameSize?: number): ArrayBuffer {
  const clm = frameSize ? new TextEncoder().encode(`<!>${frameSize} 00000000 wavetable (minilab3)`) : null;
  const clmSize = clm ? 8 + clm.length + (clm.length & 1) : 0;
  const size = 12 + 24 + clmSize + 8 + samples.length * 4;
  const out = new ArrayBuffer(size);
  const v = new DataView(out);
  const put = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, size - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 32, true);
  let at = 36;
  if (clm) {
    put(at, "clm ");
    v.setUint32(at + 4, clm.length, true);
    new Uint8Array(out, at + 8, clm.length).set(clm);
    at += clmSize;
  }
  put(at, "data");
  v.setUint32(at + 4, samples.length * 4, true);
  // Serum's clm chunk leaves the samples unaligned, so no Float32Array view here.
  samples.forEach((x, i) => v.setFloat32(at + 8 + i * 4, x, true));
  return out;
}

// ------------------------------------------------------------------ cutting

/** Turn a decoded sound into frames of FRAME_SIZE samples, each with no DC offset and peaking at 1 at most. */
export function cutIntoFrames(sound: DecodedSound, mode: CutMode = "auto"): CutResult {
  const { samples } = sound;
  if (!samples.length) throw new Error("The sound is empty.");
  if (mode === "auto") mode = pickMode(sound);
  if (mode === "frames") return asFrames(samples, sound.frameSize ?? FRAME_SIZE);

  const sound2 = trimSilence(samples.subarray(0, MAX_CUT_SECONDS * sound.sampleRate));
  if (!sound2) throw new Error("The sound is silent.");
  if (mode === "cycles") {
    const period = detectPeriod(sound2, sound.sampleRate);
    if (period) {
      const hz = sound.sampleRate / period;
      const frames = cutCycles(sound2, period);
      return { frames, mode, how: `Pitch found at ${hz.toFixed(hz < 100 ? 1 : 0)} Hz: ${frames.length} single cycles from across the sound.` };
    }
    const frames = cutSlices(sound2);
    return { frames, mode: "slices", how: `No clear pitch, so ${frames.length} slices from across the sound, each looped.` };
  }
  const frames = cutSlices(sound2);
  return { frames, mode: "slices", how: `${frames.length} slices from across the sound, each looped.` };
}

/** What a file most likely is: a wavetable if it says so or its length is whole frames, else a pitched sound or not. */
function pickMode(sound: DecodedSound): Exclude<CutMode, "auto"> {
  if (sound.frameSize) return "frames";
  const n = sound.samples.length;
  if (n % FRAME_SIZE === 0 && n / FRAME_SIZE <= MAX_FRAMES) return "frames";
  return "cycles";
}

/** Consecutive frames of `size` samples, resampled to FRAME_SIZE if needed, normalised together. */
function asFrames(samples: Float32Array, size: number): CutResult {
  const count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(samples.length / size)));
  const frames: Float32Array[] = [];
  for (let f = 0; f < count; f++) {
    const src = samples.subarray(f * size, (f + 1) * size);
    frames.push(size === FRAME_SIZE && src.length === FRAME_SIZE ? Float32Array.from(src) : resampleCycle(src, 0, src.length));
  }
  frames.forEach(removeDc);
  // One gain for the whole table, as Serum does: a table that fades out should still fade out.
  normalise(frames);
  const cut = samples.length > count * size;
  const sizeNote = size === FRAME_SIZE ? "" : ` of ${size} samples (stretched to ${FRAME_SIZE})`;
  return {
    frames,
    mode: "frames",
    how: `Read as a wavetable: ${count} frame${count > 1 ? "s" : ""}${sizeNote}${cut ? ", the rest left out" : ""}.`,
  };
}

/** The part of the sound louder than 40 dB below its peak, or null if all silent. */
function trimSilence(x: Float32Array): Float32Array | null {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-5) return null;
  const floor = peak * 0.01;
  let a = 0;
  while (Math.abs(x[a]) < floor) a++;
  let b = x.length - 1;
  while (Math.abs(x[b]) < floor) b--;
  return x.subarray(a, b + 1);
}

/**
 * The sound's pitch period in samples (fractional), or null if it has no clear pitch. YIN (de Cheveigné and
 * Kawahara, 2002) on a few windows across the sound; the median of the ones that found a pitch.
 */
export function detectPeriod(x: Float32Array, sampleRate: number): number | null {
  const minTau = Math.max(2, Math.floor(sampleRate / 2000));
  const maxTau = Math.floor(sampleRate / 25);
  const win = Math.min(2048, Math.floor((x.length - maxTau) / 2));
  if (win < 256) return null;
  const found: number[] = [];
  const spots = 5;
  for (let s = 0; s < spots; s++) {
    const start = Math.floor(((x.length - win - maxTau - 1) * (s + 0.5)) / spots);
    const tau = yin(x, start, win, minTau, maxTau);
    if (tau) found.push(tau);
  }
  if (found.length < Math.ceil(spots / 2)) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

const YIN_THRESHOLD = 0.15;

function yin(x: Float32Array, start: number, win: number, minTau: number, maxTau: number): number | null {
  const d = new Float64Array(maxTau + 2);
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let sum = 0;
    for (let i = start; i < start + win; i++) {
      const diff = x[i] - x[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference: 1 on average, dips towards 0 at the period.
  let running = 0;
  const cmnd = new Float64Array(maxTau + 2);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] >= YIN_THRESHOLD) continue;
    // The first dip below the threshold: walk down to its bottom, then refine between samples.
    while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const bend = a - 2 * b + c;
    return tau + (bend > 0 ? (a - c) / (2 * bend) : 0);
  }
  return null;
}

/** Single cycles of `period` samples from evenly spaced places, each lined up with the one before. */
function cutCycles(x: Float32Array, period: number): Float32Array[] {
  // Start the first cycle on a rising zero crossing, so the table starts near 0 like the built-in ones.
  const first = risingZero(x, 1, Math.min(x.length - 2, Math.ceil(period)));
  const usable = x.length - first - 2 * period - 4;
  const count = Math.max(1, Math.min(CUT_FRAMES, Math.floor(usable / period)));
  const last = x.length - period - 3;
  const search = Math.max(1, Math.round(period / 4));
  const frames: Float32Array[] = [];
  let prev: Float32Array | null = null;
  let drift = 0;
  for (let f = 0; f < count; f++) {
    // A whole number of periods after the first cycle keeps the phase; then fine-tuned against the frame before,
    // which follows slow pitch drift (vibrato) without the frames slipping out of line.
    const n = count > 1 ? Math.round((usable * f) / (count - 1) / period) : 0;
    const nominal = first + n * period;
    let at = Math.min(last, Math.max(1, nominal + drift));
    if (prev) at = Math.min(last, Math.max(1, bestMatch(x, prev, Math.round(at), period, search)));
    drift = at - nominal;
    const frame = resampleCycle(x, at, period);
    frames.push(frame);
    prev = frame;
  }
  frames.forEach(removeDc);
  frames.forEach((f) => normalise([f]));
  return frames;
}

function risingZero(x: Float32Array, from: number, to: number): number {
  for (let i = from; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) return i;
  return from;
}

/** Near `at`, the start whose cycle looks most like `prev` (normalised correlation, coarse then fine). */
function bestMatch(x: Float32Array, prev: Float32Array, at: number, period: number, search: number): number {
  const score = (s: number) => {
    if (s < 1 || s + period + 2 >= x.length) return -Infinity;
    let dot = 0, energy = 0;
    const step = period / FRAME_SIZE;
    for (let i = 0; i < FRAME_SIZE; i += 8) {
      const v = x[Math.floor(s + i * step)];
      dot += v * prev[i];
      energy += v * v;
    }
    return energy > 0 ? dot / Math.sqrt(energy) : -Infinity;
  };
  let best = at, bestScore = score(at);
  const coarse = Math.max(1, Math.floor(search / 16));
  for (let s = at - search; s <= at + search; s += coarse) {
    const v = score(s);
    if (v > bestScore) [best, bestScore] = [s, v];
  }
  for (let s = best - coarse; s <= best + coarse; s++) {
    const v = score(s);
    if (v > bestScore) [best, bestScore] = [s, v];
  }
  return best;
}

/** FRAME_SIZE samples from `length` (fractional) samples of `x` starting at `start`, by cubic interpolation. */
function resampleCycle(x: ArrayLike<number>, start: number, length: number): Float32Array {
  const out = new Float32Array(FRAME_SIZE);
  const at = (i: number) => x[Math.min(x.length - 1, Math.max(0, i))];
  for (let i = 0; i < FRAME_SIZE; i++) {
    const pos = start + (i * length) / FRAME_SIZE;
    const k = Math.floor(pos);
    const t = pos - k;
    const y0 = at(k - 1), y1 = at(k), y2 = at(k + 1), y3 = at(k + 2);
    // Catmull-Rom.
    out[i] = y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)));
  }
  return out;
}

/** Fade length at the end of a slice, into the samples just before its start. */
const SLICE_FADE = 256;

/** FRAME_SIZE-sample slices from evenly spaced places, each fading at its end into what came just before its start. */
function cutSlices(x: Float32Array): Float32Array[] {
  // Too short for one slice: stretch the whole sound into one frame (with the fade as far as it fits).
  if (x.length < FRAME_SIZE + SLICE_FADE) {
    const frame = resampleCycle(x, 0, x.length);
    removeDc(frame);
    normalise([frame]);
    return [frame];
  }
  const room = x.length - FRAME_SIZE - SLICE_FADE;
  const count = Math.max(1, Math.min(CUT_FRAMES, Math.floor(room / (FRAME_SIZE / 4)) + 1));
  const frames: Float32Array[] = [];
  for (let f = 0; f < count; f++) {
    const s = SLICE_FADE + (count > 1 ? Math.round((room * f) / (count - 1)) : 0);
    const frame = Float32Array.from(x.subarray(s, s + FRAME_SIZE));
    for (let j = 0; j < SLICE_FADE; j++) {
      const w = (j + 1) / SLICE_FADE;
      const i = FRAME_SIZE - SLICE_FADE + j;
      // At the very end this equals the sample just before the start, so the loop is seamless.
      frame[i] = frame[i] * (1 - w) + x[s - SLICE_FADE + j] * w;
    }
    frames.push(frame);
  }
  frames.forEach(removeDc);
  frames.forEach((f) => normalise([f]));
  return frames;
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
  if (peak > 0) for (const f of frames) for (let i = 0; i < f.length; i++) f[i] /= peak;
}
