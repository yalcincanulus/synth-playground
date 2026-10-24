import { describe, expect, test } from "bun:test";
import { fft } from "../../render/analyse";
import { driveShape, Oversampled2x } from "./drive";

const SR = 48000;
const N = 16384;

/** Level (dB) of each frequency in the driven output of a sine, relative to the strongest. */
function spectrum(process: (x: number) => number, hz: number, at: number[]) {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N + 512; i++) {
    const y = process(0.9 * Math.sin((2 * Math.PI * hz * i) / SR));
    if (i >= 512) re[i - 512] = y * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i - 512)) / N));
  }
  fft(re, im);
  const mag = (f: number) => {
    const bin = Math.round((f / SR) * N);
    let m = 0;
    for (let b = bin - 2; b <= bin + 2; b++) m = Math.max(m, Math.hypot(re[b], im[b]));
    return m;
  };
  const ref = mag(hz);
  return at.map((f) => 20 * Math.log10(mag(f) / ref));
}

describe("drive", () => {
  test("oversampling keeps the low notes' tone: the same curve, a sliver of delay", () => {
    const os = new Oversampled2x();
    const out = Array.from({ length: 2000 }, (_, i) => os.process(0.5 * Math.sin((2 * Math.PI * 100 * i) / SR), 0.5));
    const peak = Math.max(...out.slice(1000).map(Math.abs));
    expect(Math.abs(peak - driveShape(0.5, 0.5))).toBeLessThan(0.01);
  });

  test("oversampling cuts the fold-back (aliasing) of a high driven note", () => {
    // A 7 kHz sine driven hard: its 5th harmonic (35 kHz) folds back to 13 kHz without oversampling.
    const [naive] = spectrum((x) => driveShape(x, 1), 7000, [13000]);
    const os = new Oversampled2x();
    const [over] = spectrum((x) => os.process(x, 1), 7000, [13000]);
    expect(over).toBeLessThan(naive - 20);
  });
});
