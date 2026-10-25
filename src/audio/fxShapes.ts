// The effects' shapes, as plain code (fx.ts builds the Web Audio nodes from them; the Synth view
// draws them; tests check them).

// ---------------------------------------------------------------- chorus

/** The chorus: three delay lines, each swept by a triangle LFO, a third of a cycle apart. */
export const CHORUS_RATE = 0.45;
/** Each line's middle delay and how far it sweeps either side, in seconds. */
export const CHORUS_DELAY = 0.012;
export const CHORUS_DEPTH = 0.003;
/** Where each line sits, left to right, and the LFO phase (cycles) that sweeps it. */
export const CHORUS_LINES = [
  { pan: -0.85, phase: 0 },
  { pan: 0, phase: 1 / 3 },
  { pan: 0.85, phase: 2 / 3 },
] as const;

/** Harmonics in the LFO's triangle: plenty for a 0.45 Hz sweep (its corners are rounded off a little). */
const TRIANGLE_HARMONICS = 15;

/**
 * Coefficients for a PeriodicWave that plays a triangle (-1..1, starting at 0 rising, like lfoShape)
 * shifted by `phase` cycles. OscillatorNodes can't start at a chosen phase, but a wave can be shifted.
 * Use with disableNormalization, so the triangle peaks at ±1.
 */
export function triangleWave(phase: number): { real: Float32Array<ArrayBuffer>; imag: Float32Array<ArrayBuffer> } {
  const real = new Float32Array(TRIANGLE_HARMONICS + 1);
  const imag = new Float32Array(TRIANGLE_HARMONICS + 1);
  for (let k = 1; k <= TRIANGLE_HARMONICS; k += 2) {
    // Triangle = sum over odd k of (8 / pi^2) (-1)^((k-1)/2) sin(k x) / k^2; shifting x by 2 pi phase
    // splits each sine into a sine and a cosine part.
    const b = ((8 / (Math.PI * Math.PI)) * ((k - 1) / 2 % 2 === 0 ? 1 : -1)) / (k * k);
    const shift = 2 * Math.PI * k * phase;
    imag[k] = b * Math.cos(shift);
    real[k] = b * Math.sin(shift);
  }
  return { real, imag };
}

/** The value of a PeriodicWave's coefficients at a cycle position (what the oscillator plays). */
export function waveAt(real: Float32Array, imag: Float32Array, cycle: number): number {
  let v = 0;
  for (let k = 1; k < real.length; k++) v += real[k] * Math.cos(2 * Math.PI * k * cycle) + imag[k] * Math.sin(2 * Math.PI * k * cycle);
  return v;
}

// ---------------------------------------------------------------- reverb

/** The tail's brightest point at the start, and how far down it falls by the end, per unit of Damping. */
const DAMP_TOP_HZ = 18000;
const DAMP_START_OCTAVES = 1.5;
const DAMP_END_OCTAVES = 7;
/** The damping filter is updated this often (samples): it moves slowly. */
const DAMP_STEP = 32;

/** Where the reverb's damping filter is, `t` (0..1) of the way through the tail. 0 Damping: none. */
export function dampingCutoff(damping: number, t: number): number {
  const start = DAMP_TOP_HZ * Math.pow(2, -DAMP_START_OCTAVES * damping);
  const end = DAMP_TOP_HZ * Math.pow(2, -DAMP_END_OCTAVES * damping);
  return start * Math.pow(end / start, t);
}

/**
 * The reverb's impulse response, left and right: noise (different on each side, so the tail is wide)
 * fading out over `seconds`, its first 100 samples faded in. Damping passes each side through a
 * low-pass (two one-pole stages, 12 dB per octave) that closes as the tail goes on, so the highs die away sooner than the lows (as in a real
 * room, where air and soft surfaces absorb the highs first). The lows decay exactly as without damping.
 */
export function reverbImpulse(sampleRate: number, seconds: number, damping: number, random: () => number = Math.random): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const out: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  for (const data of out) {
    let y1 = 0;
    let y2 = 0;
    let a = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      let n = random() * 2 - 1;
      if (damping > 0) {
        if (i % DAMP_STEP === 0) a = Math.exp((-2 * Math.PI * Math.min(dampingCutoff(damping, t), sampleRate * 0.45)) / sampleRate);
        y1 = (1 - a) * n + a * y1;
        n = y2 = (1 - a) * y1 + a * y2;
      }
      data[i] = n * Math.pow(1 - t, 3) * (i < 100 ? i / 100 : 1);
    }
  }
  return out;
}

/** The level (0..1) of the damping filter at `hz`, `t` of the way through the tail: for the drawing. */
export function dampingGain(damping: number, t: number, hz: number, sampleRate: number): number {
  if (damping <= 0) return 1;
  const a = Math.exp((-2 * Math.PI * Math.min(dampingCutoff(damping, t), sampleRate * 0.45)) / sampleRate);
  const w = (2 * Math.PI * hz) / sampleRate;
  // Two one-pole stages.
  return ((1 - a) * (1 - a)) / (1 - 2 * a * Math.cos(w) + a * a);
}
