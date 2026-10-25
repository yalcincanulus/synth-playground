import { describe, expect, test } from "bun:test";
import { fft } from "../render/analyse";
import { lfoShape } from "./dsp/lfo";
import { CHORUS_LINES, dampingCutoff, reverbImpulse, triangleWave, waveAt } from "./fxShapes";

const TRIANGLE = 1;
const SR = 48000;

/** A repeatable generator for the impulse's noise. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("chorus LFOs", () => {
  test("each line's wave is the triangle, shifted by its phase", () => {
    for (const { phase } of CHORUS_LINES) {
      const { real, imag } = triangleWave(phase);
      for (let c = 0; c < 1; c += 0.01) {
        // 15 harmonics round the corners off by a few percent.
        expect(Math.abs(waveAt(real, imag, c) - lfoShape(TRIANGLE, (c + phase) % 1))).toBeLessThan(0.03);
      }
    }
  });

  test("the three sweeps cancel: their sum stays near zero", () => {
    const waves = CHORUS_LINES.map(({ phase }) => triangleWave(phase));
    for (let c = 0; c < 1; c += 0.01) {
      const sum = waves.reduce((a, w) => a + waveAt(w.real, w.imag, c), 0);
      expect(Math.abs(sum)).toBeLessThan(0.7);
    }
  });
});

describe("reverb impulse", () => {
  /** Energy per band (low: below 500 Hz, high: above 4 kHz) of a stretch of the impulse. */
  function bands(x: Float32Array, from: number) {
    const n = 8192;
    // Hann window, so the strong lows don't leak into the high bins.
    const re = Float64Array.from(x.subarray(from, from + n), (v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));
    const im = new Float64Array(n);
    fft(re, im);
    let low = 0, high = 0;
    for (let b = 1; b < n / 2; b++) {
      const hz = (b * SR) / n;
      const e = re[b] * re[b] + im[b] * im[b];
      if (hz < 500) low += e;
      if (hz > 4000) high += e;
    }
    return { low, high };
  }

  test("without damping it is the plain noise tail, as before", () => {
    const [left] = reverbImpulse(SR, 1, 0, seeded(5));
    const random = seeded(5);
    for (let i = 0; i < SR; i++) {
      const t = i / SR;
      expect(left[i]).toBeCloseTo((random() * 2 - 1) * Math.pow(1 - t, 3) * (i < 100 ? i / 100 : 1), 6);
    }
  });

  test("damping takes the highs out of the late tail but leaves its lows", () => {
    const [plain] = reverbImpulse(SR, 2, 0, seeded(1));
    const [damped] = reverbImpulse(SR, 2, 0.6, seeded(1));
    const late = SR; // halfway
    const a = bands(plain, late);
    const b = bands(damped, late);
    // Halfway through, 60% damping: the highs about 20 dB down.
    expect(b.high).toBeLessThan(a.high / 50);
    expect(b.low / a.low).toBeGreaterThan(0.5);
    expect(b.low / a.low).toBeLessThan(2);
  });

  test("the damping filter closes over the tail, and not at all at 0", () => {
    expect(dampingCutoff(0, 0)).toBe(dampingCutoff(0, 1));
    expect(dampingCutoff(1, 1)).toBeLessThan(dampingCutoff(1, 0) / 10);
    expect(dampingCutoff(1, 1)).toBeLessThan(200);
  });
});
