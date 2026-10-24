/** Drive's saturation curve: tanh, scaled so ±1 stays ±1. Inputs beyond ±1 are clipped first, like a WaveShaperNode. */
export function driveShape(x: number, drive: number): number {
  const k = 1 + drive * 12;
  return Math.tanh(k * Math.max(-1, Math.min(1, x))) / Math.tanh(k);
}

/** Below this, drive is off and the signal passes untouched. */
export const DRIVE_MIN = 0.01;

/**
 * Half-band low-pass filter taps (windowed sinc, Blackman window), for 2x oversampling. In a half-band
 * filter every other tap is zero, so only the centre and the odd offsets are stored.
 */
const TAPS = 47;
const CENTRE = (TAPS - 1) / 2;
const OFFSETS: number[] = [];
const WEIGHTS: number[] = [];
for (let k = 0; k < TAPS; k++) {
  const m = k - CENTRE;
  if (m !== 0 && m % 2 === 0) continue;
  const sinc = m === 0 ? 1 : Math.sin((Math.PI * m) / 2) / ((Math.PI * m) / 2);
  const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * k) / (TAPS - 1)) + 0.08 * Math.cos((4 * Math.PI * k) / (TAPS - 1));
  OFFSETS.push(k);
  WEIGHTS.push(0.5 * sinc * w);
}
const SUM = WEIGHTS.reduce((a, b) => a + b, 0);
for (let i = 0; i < WEIGHTS.length; i++) WEIGHTS[i] /= SUM;

/**
 * Drive at twice the sample rate, like the classic engine's WaveShaperNode (oversample "2x"): the curve
 * makes new high harmonics, and above the sample rate's limit they would fold back down as harsh,
 * unrelated tones (aliasing). Running at 2x and filtering before coming back down removes most of them.
 */
export class Oversampled2x {
  // Ring buffers at the 2x rate: the zero-stuffed input, and the shaped signal.
  private up = new Float64Array(TAPS);
  private down = new Float64Array(TAPS);
  private pos = 0;

  process(x: number, drive: number): number {
    // Upsample: x then a zero (times 2 to keep the level), each followed by the low-pass.
    const a = driveShape(this.filterUp(2 * x), drive);
    this.pushDown(a);
    const b = driveShape(this.filterUp(0), drive);
    return this.pushDown(b);
  }

  private filterUp(v: number): number {
    this.pos = (this.pos + 1) % TAPS;
    this.up[this.pos] = v;
    return this.convolve(this.up);
  }

  /** Store a shaped 2x sample and return the low-passed signal (only every second value is kept). */
  private pushDown(v: number): number {
    this.down[this.pos] = v;
    return this.convolve(this.down);
  }

  private convolve(buf: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < OFFSETS.length; i++) {
      let j = this.pos - OFFSETS[i];
      if (j < 0) j += TAPS;
      sum += buf[j] * WEIGHTS[i];
    }
    return sum;
  }
}
