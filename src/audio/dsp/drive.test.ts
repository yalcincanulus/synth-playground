import { describe, expect, test } from "bun:test";
import { fft } from "../../render/analyse";
import { DriveAdaa, driveShape } from "./drive";

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
  test("anti-aliasing keeps the low notes' tone: the same curve", () => {
    for (const drive of [0.1, 0.5, 1]) {
      const d = new DriveAdaa();
      const out = Array.from({ length: 4000 }, (_, i) => d.process(1.5 * Math.sin((2 * Math.PI * 50 * i) / SR), drive));
      const peak = Math.max(...out.slice(2000).map(Math.abs));
      expect(Math.abs(peak - driveShape(1.5, drive))).toBeLessThan(0.01);
    }
  });

  test("anti-aliasing cuts the fold-back of a high driven note", () => {
    // A 7 kHz sine driven hard: its 5th harmonic (35 kHz) folds back to 13 kHz.
    const [naive] = spectrum((x) => driveShape(x, 1), 7000, [13000]);
    const d = new DriveAdaa();
    const [adaa] = spectrum((x) => d.process(x, 1), 7000, [13000]);
    expect(adaa).toBeLessThan(naive - 10);
  });

  test("stays finite and in range for any input, including a sudden change of drive", () => {
    const d = new DriveAdaa();
    for (let i = 0; i < 10000; i++) {
      const y = d.process(Math.sin(i * 1.3) * 3 + (i % 7 === 0 ? 1e-7 : 0), i < 5000 ? 0.2 : 1);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
    }
  });
});
