// The two LFOs, as plain code: they run inside the voice processor (voiceBank.ts), sample by sample,
// and their maths is shared with the Synth view's drawings.

import { LFO_WAVES, type ParamValues } from "../params";

/** LFO depth 1.0 means: ±60 cents of pitch, ±3 octaves of cutoff, ±50% volume, ±45% pulse width or ±50% wavetable position. */
export const LFO_PITCH_CENTS = 60;
export const LFO_FILTER_CENTS = 3600;
export const LFO_AMP = 0.5;
export const LFO_WIDTH = 0.45;
export const LFO_POSITION = 0.5;
/** Per LFO target (LFO_TARGETS order: pitch, filter, amp, width, position), what depth 1.0 means. */
export const LFO_SCALE = [LFO_PITCH_CENTS, LFO_FILTER_CENTS, LFO_AMP, LFO_WIDTH, LFO_POSITION] as const;
export const LFO_AMP_TARGET = 2;

export type PerTarget<T> = [T, T, T, T, T];

const RANDOM = LFO_WAVES.indexOf("random");

/** A smooth shape's value at a cycle position 0..1. All start at 0, rising (as Web Audio's oscillators do). */
export function lfoShape(wave: number, p: number): number {
  switch (LFO_WAVES[wave]) {
    case "sine": return Math.sin(2 * Math.PI * p);
    case "triangle": return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    case "saw": return p < 0.5 ? 2 * p : 2 * p - 2;
    default: return p < 0.5 ? 1 : -1;
  }
}

/**
 * Effective depth (0..1) of LFO `i` per target. Each LFO's depth goes to its target; the mod strip
 * (`mod`, 0..1) adds depth to LFO 1's mod target.
 */
export function lfoDepths(p: ParamValues, i: number, mod: number): PerTarget<number> {
  const [target, depth] = i === 0 ? [p.lfoTarget, p.lfoDepth] : [p.lfo2Target, p.lfo2Depth];
  const extra = (t: number) => (i === 0 && p.modTarget === t ? mod : 0);
  return LFO_SCALE.map((_, t) => Math.min(1, (target === t ? depth : 0) + extra(t))) as PerTarget<number>;
}

/**
 * One LFO, -1..1. "random" (sample & hold) picks a new value at the start of each cycle from a
 * seeded generator, so a render repeats exactly.
 */
export class LfoCore {
  phase = 0;
  /** The held value of the random shape. */
  held = 0;
  wave = 0;
  /** Set by tick() when a cycle starts; cleared by whoever reads it. */
  wrapped = false;
  private rate: number;
  private target: number;
  private seed: number;

  constructor(
    rate: number,
    seed: number,
    /** Rate changes glide with this per-sample factor (see coefFor). */
    private rateCoef: number,
    private sampleRate: number,
  ) {
    this.rate = this.target = rate;
    this.seed = seed >>> 0 || 1;
  }

  setRate(hz: number) {
    this.target = hz;
  }

  get hz() {
    return this.rate;
  }

  /** The value for this sample; then moves one sample on (setting `wrapped` when a new cycle starts). */
  tick(): number {
    const v = this.wave === RANDOM ? this.held : lfoShape(this.wave, this.phase);
    this.rate = this.target + (this.rate - this.target) * this.rateCoef;
    this.phase += this.rate / this.sampleRate;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.held = this.nextRandom();
      this.wrapped = true;
    }
    return v;
  }

  /** -1..1 (mulberry32). */
  private nextRandom() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
}
