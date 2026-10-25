/** Drive's saturation curve: tanh, scaled so ±1 stays ±1. Inputs beyond ±1 are clipped first, like a WaveShaperNode. */
export function driveShape(x: number, drive: number): number {
  const k = 1 + drive * 12;
  return Math.tanh(k * Math.max(-1, Math.min(1, x))) / Math.tanh(k);
}

/** Below this, drive is off and the signal passes untouched. */
export const DRIVE_MIN = 0.01;

/** ln(cosh(y)), without overflow for large y. */
const logCosh = (y: number) => {
  const a = Math.abs(y);
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2;
};

/** The antiderivative of driveShape (in x), for the anti-aliasing below. */
function driveIntegral(x: number, k: number, tanhK: number) {
  const a = Math.abs(x);
  // Inside ±1 the curve is tanh; outside it is clipped flat at ±1, so the integral grows by |x| - 1.
  return a <= 1 ? logCosh(k * x) / (k * tanhK) : logCosh(k) / (k * tanhK) + (a - 1);
}

/**
 * Drive with first-order antiderivative anti-aliasing (ADAA, Parker et al., "Reducing the aliasing of
 * nonlinear waveshaping using continuous-time convolution", DAFx 2016). Instead of the curve's value at
 * each sample, it outputs the curve's average between this sample and the last one: the area under
 * the curve (its integral) divided by the distance. Sharp corners that the input jumps across are
 * smoothed, which removes much of the fold-back, at the cost of half a sample of delay and a gentle
 * treble roll-off (none to speak of at the sound path's 2x rate).
 */
export class DriveAdaa {
  private x1 = 0;
  private f1 = 0;
  private k = 0;
  private tanhK = 1;

  process(x: number, drive: number): number {
    const k = 1 + drive * 12;
    if (k !== this.k) {
      this.k = k;
      this.tanhK = Math.tanh(k);
      this.f1 = driveIntegral(this.x1, k, this.tanhK);
    }
    const f = driveIntegral(x, k, this.tanhK);
    const dx = x - this.x1;
    // When the input barely moves, the division is unreliable; the curve at the midpoint is the same average.
    const y = Math.abs(dx) > 1e-5 ? (f - this.f1) / dx : driveShape(0.5 * (x + this.x1), drive);
    this.x1 = x;
    this.f1 = f;
    return y;
  }
}
