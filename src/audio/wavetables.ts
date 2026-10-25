// Built-in wavetables: each is a stack of single-cycle frames, and the Position
// control moves through the stack (blending neighbouring frames).
//
// The frames are drawn by the UI as they are. For playing, every frame is also
// prepared at 11 harmonic limits, one per octave ("mipmaps"): a note reads the
// version whose highest harmonic still fits under the Nyquist frequency, so
// high notes don't alias.

/** Samples per frame (the common wavetable size, also Serum's). */
export const FRAME_SIZE = 2048;
export const FRAMES = 32;
/** Mip level k keeps harmonics up to 1024 >> k (level 10 is a pure sine). */
export const MIP_LEVELS = 11;

export interface WavetableDef {
  name: string;
  /** Fits the OLED. */
  short: string;
  explain: string;
  /** Sample of frame `t` (0..1, position in the table) at phase `p` (0..1)... */
  frame?: (t: number, p: number) => number;
  /** ...or the amplitude of harmonic `h` (1 = fundamental) in frame `t`, with optional fixed phases. */
  harmonics?: { count: number; amp: (t: number, h: number) => number; phases?: number[] };
  /** ...or ready-made frames (an imported table), any number of them. */
  frames?: Float32Array[];
  /** An imported or drawn table's key in the browser's storage (see tableStore.ts). */
  storeKey?: number;
  /** A drawn table's keyframes and how they blend, so it can be opened and edited again (see tableDraw.ts). */
  drawn?: { keys: Float32Array[]; blend: "harmonics" | "crossfade" };
}

const TAU = 2 * Math.PI;
const sine = (p: number) => Math.sin(TAU * p);
const tri = (p: number) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4);
/** Saw starting at 0 rising, like the sine and triangle, so morphs between them line up. */
const saw = (p: number) => 2 * ((p + 0.5) % 1) - 1;
const square = (p: number) => (p < 0.5 ? 1 : -1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic random numbers, so the "random" table is the same every time. */
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Vowel formants (Hz) and their strengths, sung on a low note.
const VOWELS: [string, number[]][] = [
  ["a", [730, 1090, 2440]],
  ["e", [530, 1840, 2480]],
  ["i", [270, 2290, 3010]],
  ["o", [570, 840, 2410]],
  ["u", [300, 870, 2240]],
];
const VOWEL_F0 = 110;
const FORMANT_GAIN = [1, 0.5, 0.25];
const FORMANT_WIDTH = [90, 120, 160];

const digitalRand = prng(7);
const DIGITAL_KEYS = Array.from({ length: 5 }, () => Array.from({ length: 40 }, (_, h) => (digitalRand() < 0.35 ? digitalRand() / Math.sqrt(h + 1) : 0)));
const DIGITAL_PHASES = Array.from({ length: 40 }, () => digitalRand() * TAU);

const DRAWBARS = [1, 2, 3, 4, 6, 8, 10, 12, 16];

export const WAVETABLES: WavetableDef[] = [
  {
    name: "Basic Shapes",
    short: "Shapes",
    explain: "The four classic waves in a row: sine, triangle, saw, square. Moving the position morphs smoothly from one to the next.",
    frame: (t, p) => {
      const shapes = [sine, tri, saw, square];
      const s = Math.min(2.9999, t * 3);
      const i = Math.floor(s);
      return lerp(shapes[i](p), shapes[i + 1](p), s - i);
    },
  },
  {
    name: "Pulse Width",
    short: "PWM",
    explain: "A square that gets narrower along the table, from 50% to a thin 4% pulse: like the Pulse Width knob, but as a table.",
    frame: (t, p) => (p < lerp(0.5, 0.04, t) ? 1 : -1),
  },
  {
    name: "Sync Sweep",
    short: "Sync",
    explain: "A hard-synced saw: each frame squeezes more cycles of the saw into one cycle of the note. Sweeping it gives the sync lead sound.",
    frame: (t, p) => 2 * ((p * (1 + 7 * t)) % 1) - 1,
  },
  {
    name: "Wavefolder",
    short: "Fold",
    explain: "A sine wave pushed harder and harder into a 'folder', which bends its peaks back down. More folding adds more and brighter harmonics.",
    frame: (t, p) => Math.sin(lerp(1, 9, t * t) * Math.sin(TAU * p)),
  },
  {
    name: "Formant Sweep",
    short: "Formant",
    explain: "A band of loud harmonics that moves up through the sound, like a resonant filter sweep built into the wave.",
    harmonics: { count: 64, amp: (t, h) => (h === 1 ? 0.35 : 0) + Math.exp(-(((h - lerp(2, 40, t)) / lerp(1.5, 5, t)) ** 2)) / Math.sqrt(h) },
  },
  {
    name: "Vowels",
    short: "Vowels",
    explain: "The vowels a, e, i, o, u, made from the frequency peaks ('formants') a voice makes for each. Sweep it for a talking synth.",
    harmonics: {
      count: 64,
      amp: (t, h) => {
        const s = Math.min(VOWELS.length - 1.0001, t * (VOWELS.length - 1));
        const i = Math.floor(s);
        const f = VOWELS[i][1].map((a, k) => lerp(a, VOWELS[i + 1][1][k], s - i));
        const hz = h * VOWEL_F0;
        return 0.02 / h + f.reduce((sum, F, k) => sum + FORMANT_GAIN[k] * Math.exp(-(((hz - F) / FORMANT_WIDTH[k]) ** 2)), 0);
      },
    },
  },
  {
    name: "Organ Drawbars",
    short: "Organ",
    explain: "An organ: a pure tone, then higher harmonics (the organ's drawbars) are pulled in one by one along the table.",
    frame: (t, p) => DRAWBARS.reduce((y, h, i) => y + Math.min(1, Math.max(0, t * DRAWBARS.length - i + 1)) * Math.sin(TAU * h * p) * (i === 0 ? 1 : 0.7), 0),
  },
  {
    name: "Digital",
    short: "Digital",
    explain: "Random mixes of harmonics, fading from one to the next: cold, glassy, 'digital' tones that don't sound like any analog wave.",
    harmonics: {
      count: 40,
      amp: (t, h) => {
        const s = Math.min(DIGITAL_KEYS.length - 1.0001, t * (DIGITAL_KEYS.length - 1));
        const i = Math.floor(s);
        return lerp(DIGITAL_KEYS[i][h - 1], DIGITAL_KEYS[i + 1][h - 1], s - i);
      },
      phases: DIGITAL_PHASES,
    },
  },
];

/** The built-in tables come first; imported ones follow, in the order they were imported. */
export const BUILTIN_TABLES = WAVETABLES.length;

/** Short names of every table, built-in and imported (the Wavetable parameter's choices: kept in step with WAVETABLES). */
export const WAVETABLE_NAMES = WAVETABLES.map((w) => w.short);

/** Add an imported table at the end of the list; returns its id. */
export function addTable(def: WavetableDef): number {
  WAVETABLES.push(def);
  WAVETABLE_NAMES.push(def.short);
  return WAVETABLES.length - 1;
}

/** Take an imported table out of the list. The ones after it move down one id. */
export function removeTable(id: number) {
  if (id < BUILTIN_TABLES || id >= WAVETABLES.length) return;
  WAVETABLES.splice(id, 1);
  WAVETABLE_NAMES.splice(id, 1);
  for (const cache of [frameCache, harmonicsCache]) for (const key of [...cache.keys()]) if (key >= id) cache.delete(key);
}

/** Give a table a new name (a drawing when it is saved). */
export function renameTable(id: number, name: string, short: string) {
  const def = WAVETABLES[id];
  if (!def || id < BUILTIN_TABLES) return;
  def.name = name;
  def.short = short;
  WAVETABLE_NAMES[id] = short;
}

/** New frames for an imported or drawn table (a drawing being edited, or saved over). */
export function replaceFrames(id: number, frames: Float32Array[]) {
  const def = WAVETABLES[id];
  if (!def || id < BUILTIN_TABLES) return;
  def.frames = frames;
  frameCache.delete(id);
  harmonicsCache.delete(id);
}

/** A table's id after table `removed` was taken out (a table that was removed falls back to the first). */
export const idAfterRemoval = (id: number, removed: number) => (id === removed ? 0 : id > removed ? id - 1 : id);

/** The table with this id, or the first one if there is none (say a preset names an imported table since deleted). */
export const tableDef = (id: number): WavetableDef => WAVETABLES[id] ?? WAVETABLES[0];

const frameCache = new Map<number, Float32Array[]>();

/** The table's frames, normalised to a peak of 1 with no DC offset. */
export function tableFrames(id: number): Float32Array[] {
  if (!WAVETABLES[id]) id = 0;
  let frames = frameCache.get(id);
  if (frames) return frames;
  const def = WAVETABLES[id];
  // Imported frames were cleaned up when they were cut (wavImport.ts).
  if (def.frames) {
    frameCache.set(id, def.frames);
    return def.frames;
  }
  frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const x = def.harmonics ? fromHarmonics(def.harmonics, t) : new Float32Array(FRAME_SIZE);
    if (def.frame) for (let i = 0; i < FRAME_SIZE; i++) x[i] = def.frame(t, i / FRAME_SIZE);
    let dc = 0;
    for (let i = 0; i < FRAME_SIZE; i++) dc += x[i];
    dc /= FRAME_SIZE;
    let peak = 0;
    for (let i = 0; i < FRAME_SIZE; i++) peak = Math.max(peak, Math.abs((x[i] -= dc)));
    if (peak > 0) for (let i = 0; i < FRAME_SIZE; i++) x[i] /= peak;
    frames.push(x);
  }
  frameCache.set(id, frames);
  return frames;
}

/** Interpolated frame at a position 0..1: what the oscillator plays there (before band-limiting). */
export function frameAt(frames: Float32Array[], position: number, phase: number): number {
  const fp = Math.min(1, Math.max(0, position)) * (frames.length - 1);
  const f0 = Math.floor(fp);
  const f1 = Math.min(frames.length - 1, f0 + 1);
  const i = Math.floor(phase * FRAME_SIZE) % FRAME_SIZE;
  return lerp(frames[f0][i], frames[f1][i], fp - f0);
}

// ------------------------------------------------------------------ mipmaps

/** Samples per frame at each mip level: fewer for levels with fewer harmonics. */
export const mipSize = (level: number) => Math.min(FRAME_SIZE, Math.max(512, 16 * (1024 >> level)));

/** One frame as a sum of sines: built as a spectrum, then turned into a wave by an inverse FFT. */
function fromHarmonics(def: NonNullable<WavetableDef["harmonics"]>, t: number): Float32Array {
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  for (let h = 1; h <= def.count && h < FRAME_SIZE / 2; h++) {
    // a·sin(θ + φ) is the real part of (a/2)(sin φ − i cos φ)e^{iθ} plus its mirror bin.
    const a = def.amp(t, h) / 2;
    const ph = def.phases?.[h - 1] ?? 0;
    re[h] = a * Math.sin(ph);
    im[h] = -a * Math.cos(ph);
    re[FRAME_SIZE - h] = re[h];
    im[FRAME_SIZE - h] = -im[h];
  }
  fft(re, im, true);
  return Float32Array.from(re);
}

/** cos and sin of 2πk/n for k < n/2, per FFT size. */
const twiddles = new Map<number, [Float64Array, Float64Array]>();
function twiddle(n: number) {
  let t = twiddles.get(n);
  if (!t) {
    const c = new Float64Array(n / 2);
    const s = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      c[k] = Math.cos((2 * Math.PI * k) / n);
      s[k] = Math.sin((2 * Math.PI * k) / n);
    }
    twiddles.set(n, (t = [c, s]));
  }
  return t;
}

/** In-place radix-2 FFT (inverse = conjugate twiddles, unscaled). */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  const [cos, sin] = twiddle(n);
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
    const step = n / len;
    const sign = inverse ? 1 : -1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = cos[k * step];
        const s = sign * sin[k * step];
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * c - im[b] * s;
        const xi = re[b] * s + im[b] * c;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** One Float32Array per mip level, holding all frames back to back (frame f at f * mipSize(level)). */
export function buildMips(frames: Float32Array[]): Float32Array[] {
  const levels = Array.from({ length: MIP_LEVELS }, (_, k) => new Float32Array(frames.length * mipSize(k)));
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  frames.forEach((frame, f) => {
    re.set(frame);
    im.fill(0);
    fft(re, im, false);
    for (let k = 0; k < MIP_LEVELS; k++) {
      const size = mipSize(k);
      const top = Math.min(1024 >> k, size / 2 - 1);
      const r = new Float64Array(size);
      const i = new Float64Array(size);
      for (let h = 1; h <= top; h++) {
        r[h] = re[h];
        i[h] = im[h];
        r[size - h] = re[h];
        i[size - h] = -im[h];
      }
      fft(r, i, true);
      const out = levels[k];
      for (let s = 0; s < size; s++) out[f * size + s] = r[s] / FRAME_SIZE;
    }
  });
  return levels;
}

const harmonicsCache = new Map<number, Float32Array[]>();

/** Strength of harmonics 1..count in every frame of a table, scaled so the loudest is 1, for drawing. */
export function tableHarmonics(id: number, count = 32): Float32Array[] {
  if (!WAVETABLES[id]) id = 0;
  let out = harmonicsCache.get(id);
  if (out) return out;
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  out = tableFrames(id).map((frame) => {
    re.set(frame);
    im.fill(0);
    fft(re, im, false);
    const mags = new Float32Array(count);
    for (let h = 1; h <= count; h++) mags[h - 1] = Math.hypot(re[h], im[h]);
    const top = Math.max(...mags) || 1;
    return mags.map((m) => m / top);
  });
  harmonicsCache.set(id, out);
  return out;
}
