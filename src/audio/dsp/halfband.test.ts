import { describe, expect, test } from "bun:test";
import { Decimator2, HALFBAND_LATENCY, halfbandTaps } from "./halfband";

const SR2 = 96000;

/** The level (dB) of a sine at `hz` (at the 2x rate) after coming down, and the output itself. */
function through(hz: number, n = 8192) {
  const input = Float32Array.from({ length: 2 * n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR2));
  const out = new Float32Array(n);
  // In blocks of 128 output samples, as the voice engine calls it.
  const d = new Decimator2();
  for (let i = 0; i < n; i += 128) d.process(input.subarray(2 * i, 2 * i + 256), out.subarray(i, i + 128), 128);
  const peak = out.subarray(n / 2).reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  return { db: 20 * Math.log10(Math.max(peak, 1e-12)), out, input };
}

describe("Decimator2", () => {
  test("passes the audible range unchanged", () => {
    for (const hz of [50, 1000, 10000, 18000, 20000]) expect(Math.abs(through(hz).db)).toBeLessThan(0.05);
  });

  test("removes what would fold back into the audible range", () => {
    for (const hz of [28000, 32000, 40000, 47000]) expect(through(hz).db).toBeLessThan(-85);
  });

  test("is the plain half-band filter followed by dropping every other sample, with a fixed delay", () => {
    const { out, input } = through(3000, 1024);
    const taps = halfbandTaps();
    for (const n of [100, 500, 1000]) {
      let direct = 0;
      for (let k = 0; k < taps.length; k++) direct += taps[k] * (input[2 * n + 1 - k] ?? 0);
      expect(out[n]).toBeCloseTo(direct, 6);
    }
    // A 3 kHz sine comes out HALFBAND_LATENCY samples (at 48 kHz) late.
    const n = 800;
    expect(out[n]).toBeCloseTo(Math.sin((2 * Math.PI * 3000 * (2 * n + 1 - 2 * HALFBAND_LATENCY)) / SR2), 3);
  });
});
