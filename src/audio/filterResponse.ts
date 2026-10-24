import { FILTER_TYPES } from "./params";
import { filterQ } from "./dsp/voiceMath";

/**
 * Magnitude response of a Web Audio BiquadFilterNode, computed with the same
 * Audio EQ Cookbook formulas the spec uses. Computed directly because a
 * disconnected BiquadFilterNode doesn't reliably apply parameter changes
 * before getFrequencyResponse().
 */
export function biquadMagnitude(
  type: number,
  cutoff: number,
  resonance: number,
  sampleRate: number,
  freqs: Float32Array,
  out: Float32Array,
) {
  const q = filterQ(type, resonance);
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate / 2 - 1)) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const kind = FILTER_TYPES[type];
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
