import { describe, expect, test } from "bun:test";
import { fft } from "../../render/analyse";
import { biquadMagnitude } from "../filterResponse";
import { filterQ } from "./voiceMath";
import { BANDPASS, HIGHPASS, LOWPASS, Svf, svfG } from "./svf";

const SR = 48000;
// Long enough for a resonant low filter's ringing to die out, so its response is measured fully.
const N = 65536;

/** The SVF's magnitude response, from its impulse response. */
function svfMagnitude(mode: number, cutoff: number, k: number, freqs: number[]) {
  const f = new Svf();
  const g = svfG(cutoff, SR);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = f.process(i === 0 ? 1 : 0, g, k, mode);
  fft(re, im);
  return freqs.map((hz) => {
    const bin = Math.round((hz / SR) * N);
    return Math.hypot(re[bin], im[bin]);
  });
}

/** The SVF's k (1/Q) for the old engine's filter type and resonance (lowpass/highpass Q is in dB there). */
const kFor = (type: number, resonance: number) => {
  const q = filterQ(type, resonance);
  return type === BANDPASS ? 1 / q : Math.pow(10, -q / 20);
};

describe("Svf", () => {
  test("matches the Web Audio biquad's response for every type", () => {
    const freqs = [50, 200, 500, 1000, 2000, 4000, 8000, 15000];
    for (const mode of [LOWPASS, HIGHPASS, BANDPASS]) {
      for (const cutoff of [100, 1000, 6000]) {
        for (const resonance of [0.7, 2, 10]) {
          // Use the exact bin frequencies, so both sides are measured at the same point.
          const at = freqs.map((hz) => (Math.round((hz / SR) * N) * SR) / N);
          const ours = svfMagnitude(mode, cutoff, kFor(mode, resonance), at);
          const theirs = biquadMagnitude(mode, cutoff, resonance, SR, Float32Array.from(at), new Float32Array(at.length));
          ours.forEach((m, i) => {
            const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
            expect(Math.abs(db(m) - db(theirs[i]))).toBeLessThan(0.02);
          });
        }
      }
    }
  });

  test("stays stable and finite when the cutoff jumps around every sample", () => {
    const f = new Svf();
    let peak = 0;
    for (let i = 0; i < SR; i++) {
      const cutoff = 50 * Math.pow(2, 8 * Math.abs(Math.sin(i * 0.37)));
      const y = f.process(Math.sin(i * 0.05), svfG(cutoff, SR), 0.1, LOWPASS);
      expect(Number.isFinite(y)).toBe(true);
      peak = Math.max(peak, Math.abs(y));
    }
    expect(peak).toBeLessThan(50);
  });
});
