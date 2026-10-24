// State-variable filter (the "TPT" form from Vadim Zavalishin's "The Art of VA Filter Design").
//
// For a fixed cutoff it has exactly the frequency response of the Web Audio BiquadFilterNode the
// classic engine uses (both are the bilinear transform of the same analog 2-pole filter), but it
// stays clean when the cutoff moves every sample, as envelopes and LFOs make it do.

export const LOWPASS = 0;
export const HIGHPASS = 1;
export const BANDPASS = 2;

export class Svf {
  private ic1 = 0;
  private ic2 = 0;

  /**
   * Filter one sample. `g` comes from svfG(cutoff); `k` is 1 / Q. The band-pass is scaled by k so its
   * peak is at 0 dB, like the Web Audio band-pass.
   */
  process(x: number, g: number, k: number, mode: number): number {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (mode === LOWPASS) return v2;
    if (mode === HIGHPASS) return x - k * v1 - v2;
    return k * v1;
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
