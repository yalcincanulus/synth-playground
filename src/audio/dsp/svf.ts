// State-variable filter (the "TPT" form from Vadim Zavalishin's "The Art of VA Filter Design").
//
// For a fixed cutoff it has exactly the frequency response of the Web Audio BiquadFilterNode the
// old engine used (both are the bilinear transform of the same analog 2-pole filter), but it
// stays clean when the cutoff moves every sample, as envelopes and LFOs make it do.

// The filter's response is set by a morph position: 0 low-pass, 0.5 band-pass, 1 high-pass. In between,
// the two neighbouring outputs are crossfaded. All three come from the same filter, so the blend is
// smooth (going from low-pass straight to high-pass would leave a notch in the middle).
export const LOWPASS = 0;
export const BANDPASS = 0.5;
export const HIGHPASS = 1;

/** How much of the low-pass, band-pass and high-pass outputs a morph position takes. */
export function morphWeights(morph: number): [number, number, number] {
  const m = Math.max(0, Math.min(1, morph));
  return m < 0.5 ? [1 - 2 * m, 2 * m, 0] : [0, 2 - 2 * m, 2 * m - 1];
}

export class Svf {
  private ic1 = 0;
  private ic2 = 0;

  /**
   * Filter one sample. `g` comes from svfG(cutoff); `k` is 1 / Q; `morph` is 0..1 (see above). The
   * band-pass is scaled by k so its peak is at 0 dB, like the Web Audio band-pass.
   */
  process(x: number, g: number, k: number, morph: number): number {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (morph <= 0) return v2;
    if (morph >= 1) return x - k * v1 - v2;
    if (morph === 0.5) return k * v1;
    if (morph < 0.5) return v2 + (k * v1 - v2) * 2 * morph;
    const hp = x - k * v1 - v2;
    return k * v1 + (hp - k * v1) * (2 * morph - 1);
  }

  /**
   * Filter `input` from `lo` to `hi` into `out` (which may be the same array), with the settings for
   * sample o at index (o / step) | 0. One call per block: the voice engine runs at 2x the sample rate
   * with settings per sample (step 2), and a loop here inlines process(), which allocates nothing.
   */
  processBlock(input: Float64Array, out: Float64Array, g: Float64Array, k: Float64Array, morph: Float64Array, lo: number, hi: number, step: number) {
    for (let o = lo; o < hi; o++) {
      const i = (o / step) | 0;
      out[o] = this.process(input[o], g[i], k[i], morph[i]);
    }
  }

  reset() {
    this.ic1 = this.ic2 = 0;
  }
}

/** The filter's frequency coefficient. The cutoff is kept between 5 Hz and just under Nyquist. */
export function svfG(cutoff: number, sampleRate: number) {
  const fc = Math.min(Math.max(cutoff, 5), sampleRate * 0.49);
  return Math.tan((Math.PI * fc) / sampleRate);
}

/**
 * The filter's response at the frequencies `freqs`, for the drawings. The TPT filter is exactly the
 * bilinear transform of the analog 2-pole, so this is exact.
 */
export function svfMagnitude(morph: number, cutoff: number, k: number, sampleRate: number, freqs: Float32Array, out: Float32Array) {
  const g = svfG(cutoff, sampleRate);
  const [wl, wb, wh] = morphWeights(morph);
  for (let i = 0; i < freqs.length; i++) {
    // s = j w, with w the pre-warped frequency relative to the cutoff: H = (wl + wb k s + wh s^2) / (s^2 + k s + 1).
    const w = Math.tan((Math.PI * Math.min(freqs[i], sampleRate * 0.4999)) / sampleRate) / g;
    const nr = wl - wh * w * w;
    const ni = wb * k * w;
    const dr = 1 - w * w;
    const di = k * w;
    out[i] = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return out;
}
