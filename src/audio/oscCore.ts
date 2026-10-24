// The oscillator's wave maths, shared by the audio worklet (which makes the sound)
// and the Synth view (which draws what the oscillators would produce).
//
// Wave indices match WAVES in params.ts: 0 sine, 1 triangle, 2 saw, 3 square/pulse.
// All waves start at phase 0; sine and triangle start at 0 rising, saw at -1 rising,
// the pulse is high (+1) from phase 0 until the pulse width, then low (-1).

/** Narrowest pulse width the oscillator allows (LFO modulation is clamped to this). */
export const MIN_WIDTH = 0.03;
/** FM amount 1.0 means a modulation index of this many radians. */
export const FM_INDEX = 8;

export function naive(wave: number, phase: number, width: number): number {
  switch (wave) {
    case 0: return Math.sin(2 * Math.PI * phase);
    case 1: return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
    case 2: return 2 * phase - 1;
    default: return phase < width ? 1 : -1;
  }
}

export const clampWidth = (w: number) => Math.min(1 - MIN_WIDTH, Math.max(MIN_WIDTH, w));

export interface OscShape {
  wave1: number;
  wave2: number;
  /** Osc 2 frequency relative to Osc 1. */
  ratio: number;
  width: number;
  sync: boolean;
  /** 0..1 */
  fm: number;
}

/**
 * Two cycles of Osc 1 (time 0..1 -> two Osc 1 cycles) with sync and FM applied,
 * for drawing. Returns [osc1, osc2] at time x.
 */
export function shapeAt(s: OscShape, x: number): [number, number] {
  const t1 = x * 2;
  const p1 = t1 % 1;
  // With sync, Osc 2 restarts at every Osc 1 cycle.
  const p2 = ((s.sync ? p1 : t1) * s.ratio) % 1;
  const o2 = naive(s.wave2, p2, s.width);
  const pm = (s.fm * FM_INDEX * o2) / (2 * Math.PI);
  return [naive(s.wave1, (((p1 + pm) % 1) + 1) % 1, s.width), o2];
}
