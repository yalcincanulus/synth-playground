// Coming back down from twice the sample rate (the voice engine's sound path runs at 2x, see
// voiceBank.ts). Before every other sample is dropped, everything above the final Nyquist frequency
// has to go, or it folds back down as harsh tones that aren't in tune with the note (aliasing).
//
// A half-band low-pass does that: its cutoff is exactly half the 2x Nyquist frequency, and every
// other tap is zero, so it costs about half a normal filter of its length. It is a windowed sinc
// (Kaiser window): flat to 20 kHz, and at least 85 dB down from 28 kHz, the lowest frequency that
// folds back into the audible range (to 20 kHz) at 48 kHz.

const TAPS = 63;
const CENTRE = (TAPS - 1) / 2;
const KAISER_BETA = 8;

/** The decimator's delay, in output samples. */
export const HALFBAND_LATENCY = CENTRE / 2;

function besselI0(x: number) {
  let sum = 1;
  let term = 1;
  for (let i = 1; i < 30; i++) {
    term *= (x / 2 / i) ** 2;
    sum += term;
  }
  return sum;
}

/** The filter's taps, normalised to a gain of 1 at 0 Hz. */
export function halfbandTaps(): Float64Array {
  const w = new Float64Array(TAPS);
  for (let k = 0; k < TAPS; k++) {
    const m = k - CENTRE;
    const sinc = m === 0 ? 1 : m % 2 === 0 ? 0 : Math.sin((Math.PI * m) / 2) / ((Math.PI * m) / 2);
    const r = (2 * k) / (TAPS - 1) - 1;
    w[k] = 0.5 * sinc * (besselI0(KAISER_BETA * Math.sqrt(1 - r * r)) / besselI0(KAISER_BETA));
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

// The non-zero taps: the odd offsets from the centre (they meet the input's later sample of each pair)
// and the centre itself (it meets an earlier sample).
const ALL = halfbandTaps();
const ODD: number[] = [];
for (let k = 0; k < TAPS; k += 2) ODD.push(ALL[k]);
const N_ODD = ODD.length;
const W_CENTRE = ALL[CENTRE];
/** How many pairs back the centre tap reads. */
const CENTRE_PAIRS = (CENTRE - 1) / 2;
const N_EVEN = CENTRE_PAIRS + 1;

/** Halves the sample rate of one signal: two samples in, one out. Keeps its history between blocks. */
export class Decimator2 {
  // Ring buffers, written twice so the newest N values are always in one run: [pos, pos + N).
  private late = new Float64Array(2 * N_ODD);
  private early = new Float64Array(2 * N_EVEN);
  private pLate = 0;
  private pEarly = 0;

  /** `input` holds 2n samples at the 2x rate; fills `out[0..n)`. */
  process(input: Float32Array, out: Float32Array, n: number) {
    const late = this.late;
    const early = this.early;
    for (let i = 0; i < n; i++) {
      this.pEarly = this.pEarly === 0 ? N_EVEN - 1 : this.pEarly - 1;
      early[this.pEarly] = early[this.pEarly + N_EVEN] = input[2 * i];
      this.pLate = this.pLate === 0 ? N_ODD - 1 : this.pLate - 1;
      late[this.pLate] = late[this.pLate + N_ODD] = input[2 * i + 1];
      let sum = W_CENTRE * early[this.pEarly + CENTRE_PAIRS];
      const p = this.pLate;
      for (let j = 0; j < N_ODD; j++) sum += ODD[j] * late[p + j];
      out[i] = sum;
    }
  }

  reset() {
    this.late.fill(0);
    this.early.fill(0);
  }
}
