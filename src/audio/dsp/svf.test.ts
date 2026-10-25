import { describe, expect, test } from "bun:test";
import { fft } from "../../render/analyse";
import { biquadMagnitude } from "../filterResponse";
import { filterQ } from "./voiceMath";
import { BANDPASS, HIGHPASS, LOWPASS, Svf, svfG, svfMagnitude } from "./svf";

const SR = 48000;
// Long enough for a resonant low filter's ringing to die out, so its response is measured fully.
const N = 65536;

/** The SVF's magnitude response, from its impulse response. */
function measured(morph: number, cutoff: number, k: number, freqs: number[]) {
  const f = new Svf();
  const g = svfG(cutoff, SR);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = f.process(i === 0 ? 1 : 0, g, k, morph);
  fft(re, im);
  return freqs.map((hz) => {
    const bin = Math.round((hz / SR) * N);
    return Math.hypot(re[bin], im[bin]);
  });
}

/** The old engine's filter types (Web Audio biquad index) and their morph positions. */
const TYPES: [number, number][] = [[0, LOWPASS], [1, HIGHPASS], [2, BANDPASS]];

/** The SVF's k (1/Q) for the old engine's filter type and resonance (lowpass/highpass Q is in dB there). */
const kFor = (type: number, resonance: number) => (type === 2 ? 1 / resonance : Math.pow(10, -filterQ(resonance) / 20));

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
// Exact bin frequencies, so both sides are measured at the same point.
const AT = [50, 200, 500, 1000, 2000, 4000, 8000, 15000].map((hz) => (Math.round((hz / SR) * N) * SR) / N);

describe("Svf", () => {
  test("matches the Web Audio biquad's response for every type", () => {
    for (const [type, morph] of TYPES) {
      for (const cutoff of [100, 1000, 6000]) {
        for (const resonance of [0.7, 2, 10]) {
          const ours = measured(morph, cutoff, kFor(type, resonance), AT);
          const theirs = biquadMagnitude(type, cutoff, resonance, SR, Float32Array.from(AT), new Float32Array(AT.length));
          ours.forEach((m, i) => expect(Math.abs(db(m) - db(theirs[i]))).toBeLessThan(0.02));
        }
      }
    }
  });

  test("matches its drawn response at every morph position", () => {
    for (const morph of [0, 0.2, 0.5, 0.65, 1]) {
      for (const cutoff of [200, 3000]) {
        const ours = measured(morph, cutoff, 0.3, AT);
        const drawn = svfMagnitude(morph, cutoff, 0.3, SR, Float32Array.from(AT), new Float32Array(AT.length));
        ours.forEach((m, i) => {
          if (db(drawn[i]) > -100) expect(Math.abs(db(m) - db(drawn[i]))).toBeLessThan(0.05);
        });
      }
    }
  });

  test("morphing moves smoothly from low-pass through band-pass to high-pass", () => {
    // Response at 100 Hz, the cutoff, and 10 kHz for a 1 kHz filter, morph 0..1 in small steps.
    const freqs = Float32Array.from([100, 1000, 10000]);
    const out = new Float32Array(3);
    let last: number[] | null = null;
    for (let m = 0; m <= 1.0001; m += 0.01) {
      const now = Array.from(svfMagnitude(m, 1000, 0.7, SR, freqs, out), db);
      // No step of 1% makes any of the three jump more than 2 dB.
      if (last) now.forEach((d, i) => expect(Math.abs(d - last![i])).toBeLessThan(2));
      last = now;
    }
    const [lpLow, , lpHigh] = svfMagnitude(0, 1000, 0.7, SR, freqs, new Float32Array(3));
    const [hpLow, , hpHigh] = svfMagnitude(1, 1000, 0.7, SR, freqs, new Float32Array(3));
    expect(lpLow).toBeGreaterThan(lpHigh * 100);
    expect(hpHigh).toBeGreaterThan(hpLow * 100);
  });

  test("an LFO sweeping the morph doesn't click", () => {
    const f = new Svf();
    const g = svfG(800, SR);
    let prev = 0;
    let maxStep = 0;
    for (let i = 0; i < SR; i++) {
      const morph = 0.5 + 0.5 * Math.sin((2 * Math.PI * 4 * i) / SR);
      const y = f.process(Math.sin((2 * Math.PI * 220 * i) / SR), g, 0.5, morph);
      if (i > 100) maxStep = Math.max(maxStep, Math.abs(y - prev));
      prev = y;
    }
    // A 220 Hz sine at about unit level moves at most 2π * 220 / 48000 ≈ 0.03 per sample; a click would be far more.
    expect(maxStep).toBeLessThan(0.1);
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
