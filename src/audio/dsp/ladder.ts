// A 4-pole "ladder" filter, after the Moog transistor ladder, in the zero-delay feedback form from
// Vadim Zavalishin's "The Art of VA Filter Design" (chapter 5).
//
// Four one-pole low-pass stages in a row, with the last one's output fed back to the input,
// subtracted. Feedback k sets the resonance: at k = 4 the filter rings on its own at the cutoff
// (self-oscillation). A tanh saturator where the feedback meets the input keeps that ringing at a
// steady level, and makes loud signals squash inside the filter: Drive pushes the input into it.
//
// The loop is solved for the current sample (no extra delay), so the cutoff is exactly in tune at
// any setting. The saturator uses the "cheap" method: solve the loop as if it were linear, then
// saturate that solution. One tanh per sample.
//
// High-pass and band-pass mix the stages' outputs (as in the Oberheim Xpander): each stage is a
// low-pass L, so (1 - L) is a high-pass, and the four stages' outputs give L^4 down to L^1.

import { HIGHPASS, LOWPASS } from "./svf";

/** Feedback at the Resonance knob's top end: just past self-oscillation (4). */
export const LADDER_MAX_K = 4.2;

/**
 * The low-pass loses bass as the feedback rises (its DC level is 1 / (1 + k)); this makes up about
 * half of it, as many analog designs do, so turning Resonance up doesn't empty the sound.
 */
const LOWPASS_MAKEUP = 0.5;

export class Ladder {
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  /**
   * Filter one sample. `g` comes from svfG(cutoff) (the same pre-warped frequency); `k` is the
   * feedback (0..LADDER_MAX_K); `gain` scales the input into the saturator (Drive).
   */
  process(x: number, g: number, k: number, mode: number, gain: number): number {
    const G = g / (1 + g);
    const a = 1 - G;
    const G2 = G * G;
    // Each stage's output is G * its input + its state's share; this is the stages' states seen at the end.
    const sigma = G2 * G * this.s1 * a + G2 * this.s2 * a + G * this.s3 * a + this.s4 * a;
    const u = Math.tanh((gain * x - k * sigma) / (1 + k * G2 * G2));
    let v = (u - this.s1) * G;
    const y1 = v + this.s1;
    this.s1 = y1 + v;
    v = (y1 - this.s2) * G;
    const y2 = v + this.s2;
    this.s2 = y2 + v;
    v = (y2 - this.s3) * G;
    const y3 = v + this.s3;
    this.s3 = y3 + v;
    v = (y3 - this.s4) * G;
    const y4 = v + this.s4;
    this.s4 = y4 + v;
    if (mode === LOWPASS) return y4 * (1 + LOWPASS_MAKEUP * k);
    if (mode === HIGHPASS) return u - 4 * y1 + 6 * y2 - 4 * y3 + y4;
    // L^2 (1 - L)^2, times 4 so it peaks at 0 dB without resonance.
    return 4 * (y2 - 2 * y3 + y4);
  }

  reset() {
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
  }
}

/** The input gain into the saturator for a Drive setting (the same range as the Drive stage's curve). */
export const ladderGain = (drive: number) => 1 + drive * 12;

/**
 * The output level for a Drive setting: with the input gain, the saturator is the Drive stage's curve,
 * tanh(gain x) / tanh(gain), so ±1 stays ±1 and more drive is louder for quiet signals.
 */
export const ladderOutGain = (drive: number) => 1 / Math.tanh(ladderGain(drive));

/**
 * The linear response (small signals) at the frequencies `freqs`, for the filter drawings. Each TPT
 * stage is exactly the bilinear transform of an analog one-pole, so the response is too.
 */
export function ladderMagnitude(mode: number, cutoff: number, k: number, sampleRate: number, freqs: Float32Array, out: Float32Array) {
  const fc = Math.min(Math.max(cutoff, 5), sampleRate * 0.49);
  const g = Math.tan((Math.PI * fc) / sampleRate);
  for (let i = 0; i < freqs.length; i++) {
    // One stage: L = 1 / (1 + j t / g), with t the pre-warped frequency.
    const t = Math.tan((Math.PI * Math.min(freqs[i], sampleRate * 0.4999)) / sampleRate) / g;
    const d = 1 + t * t;
    const [lr, li] = [1 / d, -t / d];
    const [hr, hi] = [1 - lr, -li];
    const [l2r, l2i] = mul(lr, li, lr, li);
    const [l4r, l4i] = mul(l2r, l2i, l2r, l2i);
    let nr: number, ni: number;
    if (mode === LOWPASS) [nr, ni] = [l4r * (1 + LOWPASS_MAKEUP * k), l4i * (1 + LOWPASS_MAKEUP * k)];
    else if (mode === HIGHPASS) {
      const [h2r, h2i] = mul(hr, hi, hr, hi);
      [nr, ni] = mul(h2r, h2i, h2r, h2i);
    } else {
      const [h2r, h2i] = mul(hr, hi, hr, hi);
      [nr, ni] = mul(4 * l2r, 4 * l2i, h2r, h2i);
    }
    // Divided by the feedback loop, 1 + k L^4.
    const dr = 1 + k * l4r;
    const di = k * l4i;
    out[i] = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return out;
}

const mul = (ar: number, ai: number, br: number, bi: number): [number, number] => [ar * br - ai * bi, ar * bi + ai * br];
