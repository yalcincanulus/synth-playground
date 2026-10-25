import { FILTER_MODELS, type ParamValues } from "./params";
import { ladderMagnitude } from "./dsp/ladder";
import { svfMagnitude } from "./dsp/svf";
import { filterK, filterQ, ladderK } from "./dsp/voiceMath";

/** Filter 1's magnitude response (its model, morph and resonance) with the cutoff at `cutoff`. */
export function filterMagnitude(p: ParamValues, cutoff: number, sampleRate: number, freqs: Float32Array, out: Float32Array) {
  if (FILTER_MODELS[p.filterModel] === "ladder") return ladderMagnitude(p.filterMorph, cutoff, ladderK(p.resonance), sampleRate, freqs, out);
  return svfMagnitude(p.filterMorph, cutoff, filterK(filterQ(p.resonance)), sampleRate, freqs, out);
}

/** Filter 2's magnitude response (always the clean model). */
export function filter2Magnitude(p: ParamValues, cutoff: number, sampleRate: number, freqs: Float32Array, out: Float32Array) {
  return svfMagnitude(p.filter2Morph, cutoff, filterK(filterQ(p.filter2Resonance)), sampleRate, freqs, out);
}

const BIQUAD_TYPES = ["lowpass", "highpass", "bandpass"] as const;

/**
 * The reference the clean filter is tested against (svf.test.ts): the old engine's filter.
 * Magnitude response of a Web Audio BiquadFilterNode, computed with the same
 * Audio EQ Cookbook formulas the spec uses. Computed directly because a
 * disconnected BiquadFilterNode doesn't reliably apply parameter changes
 * before getFrequencyResponse().
 */
export function biquadMagnitude(
  /** 0 lowpass, 1 highpass, 2 bandpass. */
  type: number,
  cutoff: number,
  resonance: number,
  sampleRate: number,
  freqs: Float32Array,
  out: Float32Array,
) {
  const kind = BIQUAD_TYPES[type];
  const q = kind === "bandpass" ? resonance : filterQ(resonance);
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate / 2 - 1)) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  // lowpass/highpass take Q in dB; bandpass takes it as a plain factor.
  const alpha = kind === "bandpass" ? sin / (2 * Math.max(q, 0.0001)) : sin / (2 * Math.pow(10, q / 20));

  let b0: number, b1: number, b2: number;
  if (kind === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (kind === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  for (let i = 0; i < freqs.length; i++) {
    const w = (2 * Math.PI * freqs[i]) / sampleRate;
    // H(e^jw) = (b0 + b1 z^-1 + b2 z^-2) / (a0 + a1 z^-1 + a2 z^-2)
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    out[i] = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return out;
}
