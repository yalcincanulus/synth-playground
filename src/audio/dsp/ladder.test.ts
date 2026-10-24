import { describe, expect, test } from "bun:test";
import { fft } from "../../render/analyse";
import { Ladder, LADDER_MAX_K, ladderMagnitude } from "./ladder";
import { BANDPASS, HIGHPASS, LOWPASS, svfG } from "./svf";

const SR = 48000;
const N = 65536;
/** Small enough that the saturator is linear (tanh(x) = x within 1e-8). */
const TINY = 1e-4;

/** The ladder's magnitude response, from its impulse response. */
function measured(mode: number, cutoff: number, k: number, freqs: number[]) {
  const f = new Ladder();
  const g = svfG(cutoff, SR);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = f.process(i === 0 ? TINY : 0, g, k, mode, 1) / TINY;
  fft(re, im);
  return freqs.map((hz) => Math.hypot(re[Math.round((hz / SR) * N)], im[Math.round((hz / SR) * N)]));
}

/** Rising zero crossings per second. */
function pitchOf(x: Float64Array) {
  let crossings = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return crossings / (x.length / SR);
}

describe("Ladder", () => {
  test("matches its drawn response for every type", () => {
    const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
    const at = [50, 200, 500, 1000, 2000, 4000, 8000, 15000].map((hz) => (Math.round((hz / SR) * N) * SR) / N);
    for (const mode of [LOWPASS, HIGHPASS, BANDPASS]) {
      for (const cutoff of [100, 1000, 6000]) {
        for (const k of [0, 2, 3.5]) {
          const ours = measured(mode, cutoff, k, at);
          const drawn = ladderMagnitude(mode, cutoff, k, SR, Float32Array.from(at), new Float32Array(at.length));
          // Only where the level is above the noise of the measurement.
          ours.forEach((m, i) => {
            if (db(drawn[i]) > -100) expect(Math.abs(db(m) - db(drawn[i]))).toBeLessThan(0.05);
          });
        }
      }
    }
  });

  test("is 4-pole: a low-pass falls 24 dB per octave above the cutoff", () => {
    const [a, b] = ladderMagnitude(LOWPASS, 500, 0, SR, Float32Array.from([4000, 8000]), new Float32Array(2));
    expect(20 * Math.log10(a / b)).toBeGreaterThan(22);
  });

  test("resonance peaks at the cutoff", () => {
    const freqs = Float32Array.from([500, 1000, 2000]);
    const [below, at, above] = ladderMagnitude(LOWPASS, 1000, 3.5, SR, freqs, new Float32Array(3));
    expect(at).toBeGreaterThan(below * 2);
    expect(at).toBeGreaterThan(above * 2);
  });

  test("at the top of Resonance it sings on its own at the cutoff, at a steady level", () => {
    const f = new Ladder();
    const g = svfG(440, SR);
    const out = new Float64Array(SR * 2);
    // A short click to start it, then silence.
    for (let i = 0; i < out.length; i++) out[i] = f.process(i < 10 ? 0.5 : 0, g, LADDER_MAX_K, LOWPASS, 1);
    const late = out.subarray(SR);
    const peak = late.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(2);
    expect(Math.abs(pitchOf(late) - 440)).toBeLessThan(10);
  });

  test("below self-oscillation the ringing dies away", () => {
    const f = new Ladder();
    const g = svfG(440, SR);
    let tail = 0;
    for (let i = 0; i < SR; i++) {
      const y = f.process(i < 10 ? 0.5 : 0, g, 3.6, LOWPASS, 1);
      if (i > SR / 2) tail = Math.max(tail, Math.abs(y));
    }
    expect(tail).toBeLessThan(1e-4);
  });

  test("stays bounded with full drive, full resonance and the cutoff jumping every sample", () => {
    for (const mode of [LOWPASS, HIGHPASS, BANDPASS]) {
      const f = new Ladder();
      let peak = 0;
      for (let i = 0; i < SR; i++) {
        const cutoff = 30 * Math.pow(2, 9 * Math.abs(Math.sin(i * 0.37)));
        const y = f.process(Math.sin(i * 0.05), svfG(cutoff, SR), LADDER_MAX_K, mode, 13);
        expect(Number.isFinite(y)).toBe(true);
        peak = Math.max(peak, Math.abs(y));
      }
      expect(peak).toBeLessThan(20);
    }
  });
});
