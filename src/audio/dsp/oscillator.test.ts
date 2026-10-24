import { describe, expect, test } from "bun:test";
import { naive } from "../oscCore";
import { buildMips, FRAME_SIZE } from "../wavetables";
import { Oscillator, type OscParams, type Table } from "./oscillator";

const SR = 48000;
const BLOCK = 128;
const SINE = 0, TRIANGLE = 1, SAW = 2, PULSE = 3, TABLE = 4;

type Settings = Partial<Record<keyof OscParams, number>>;

function params(s: Settings): OscParams {
  const d: Record<keyof OscParams, number> = {
    frequency: 440, detune: 0, pitchEnv: 0, envTarget: 0, osc2Detune: 0, spread: 0, width: 0.5,
    fm: 0, sync: 0, wave1: SAW, wave2: SAW, table: 0, position: 0, ...s,
  };
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, new Float32Array([v])])) as OscParams;
}

/** Render `seconds` of audio; returns [osc1, osc2, sub]. */
function render(s: Settings, seconds = 0.5, unison = 1, tables?: Map<number, Table>) {
  const osc = new Oscillator(unison, SR, tables, () => 0.37);
  const n = Math.floor((seconds * SR) / BLOCK) * BLOCK;
  const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const p = params(s);
  for (let i = 0; i < n; i += BLOCK) osc.render(p, out[0].subarray(i, i + BLOCK), out[1].subarray(i, i + BLOCK), out[2].subarray(i, i + BLOCK));
  return out;
}

/** Rising zero crossings per second. */
function frequencyOf(x: Float32Array) {
  let count = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) count++;
  return count / (x.length / SR);
}

const mean = (x: Float32Array) => x.reduce((a, b) => a + b, 0) / x.length;
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / x.length);
const peak = (x: Float32Array) => x.reduce((a, b) => Math.max(a, Math.abs(b)), 0);

describe("Oscillator", () => {
  test("every wave plays at the right pitch", () => {
    for (const wave of [SINE, TRIANGLE, SAW, PULSE]) {
      const [o1] = render({ wave1: wave, frequency: 440 }, 1);
      expect(Math.abs(frequencyOf(o1) - 440)).toBeLessThanOrEqual(1);
    }
  });

  test("detune in cents moves the pitch", () => {
    const [o1] = render({ wave1: SINE, frequency: 440, detune: 1200 }, 1);
    expect(Math.abs(frequencyOf(o1) - 880)).toBeLessThanOrEqual(1);
  });

  test("osc 2 follows its own offset; the sub is an octave below", () => {
    const [, o2, sub] = render({ wave2: SINE, frequency: 220, osc2Detune: 700 }, 1);
    expect(Math.abs(frequencyOf(o2) - 220 * Math.pow(2, 7 / 12))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(frequencyOf(sub) - 110)).toBeLessThanOrEqual(1);
  });

  test("waves have no DC offset and stay in range", () => {
    for (const wave of [SINE, TRIANGLE, SAW, PULSE]) {
      // 480 Hz is exactly 100 samples per cycle, so the mean covers whole cycles.
      const [o1] = render({ wave1: wave, frequency: 480 }, 0.5);
      expect(Math.abs(mean(o1))).toBeLessThan(0.01);
      expect(peak(o1)).toBeLessThan(1.15);
    }
  });

  test("pulse width sets how long the wave is high", () => {
    for (const width of [0.1, 0.25, 0.5, 0.75]) {
      const [o1] = render({ wave1: PULSE, frequency: 480, width }, 0.5);
      const high = o1.filter((v) => v > 0).length / o1.length;
      expect(Math.abs(high - width)).toBeLessThan(0.02);
    }
  });

  test("polyBLEP: a high saw is much closer to an ideal band-limited saw than a naive one", () => {
    const f = 3000;
    const [o1] = render({ wave1: SAW, frequency: f }, 0.2);
    let errBlep = 0, errNaive = 0;
    for (let i = 1; i < o1.length; i++) {
      // The phase advances before each read and the output runs one sample late, so o1[i] is the wave at time i.
      const t = i / SR;
      let ideal = 0;
      for (let k = 1; k * f < SR / 2; k++) ideal += Math.sin(2 * Math.PI * k * f * t) / k;
      ideal *= -2 / Math.PI;
      errBlep += (o1[i] - ideal) ** 2;
      errNaive += (naive(SAW, (f * t) % 1, 0.5) - ideal) ** 2;
    }
    expect(errBlep).toBeLessThan(errNaive * 0.5);
  });

  test("hard sync restarts osc 2 with every osc 1 cycle", () => {
    // Osc 1 at 480 Hz repeats every 100 samples; osc 2 a non-integer ratio above it.
    const [, synced] = render({ frequency: 480, osc2Detune: 550, sync: 1 }, 0.2);
    const [, free] = render({ frequency: 480, osc2Detune: 550, sync: 0 }, 0.2);
    const repeatError = (x: Float32Array) => {
      let e = 0;
      for (let i = 1000; i < x.length - 100; i++) e += Math.abs(x[i] - x[i + 100]);
      return e / (x.length - 1100);
    };
    expect(repeatError(synced)).toBeLessThan(0.02);
    expect(repeatError(free)).toBeGreaterThan(0.2);
  });

  test("FM and sync at extreme settings stay finite and bounded", () => {
    for (const s of [{ fm: 2, wave1: SINE, wave2: SAW }, { fm: 2, sync: 1, wave1: PULSE, wave2: PULSE, width: 0.03 }]) {
      for (const frequency of [30, 2000, 12000]) {
        const outs = render({ ...s, frequency, osc2Detune: 1900 }, 0.1);
        for (const o of outs) {
          expect(o.every(Number.isFinite)).toBe(true);
          expect(peak(o)).toBeLessThan(1.5);
        }
      }
    }
  });

  test("unison copies add up, without exceeding their count", () => {
    const [one] = render({ wave1: SAW, frequency: 220 }, 0.5, 1);
    const [three] = render({ wave1: SAW, frequency: 220, spread: 20 }, 0.5, 3);
    expect(rms(three)).toBeGreaterThan(rms(one) * 1.3);
    expect(peak(three)).toBeLessThan(3.3);
  });

  test("the table wave reads a loaded wavetable, and is silent without one", () => {
    const frame = new Float32Array(FRAME_SIZE).map((_, i) => Math.sin((2 * Math.PI * i) / FRAME_SIZE));
    const tables = new Map<number, Table>([[0, { frames: 1, levels: buildMips([frame]) }]]);
    const [loaded] = render({ wave1: TABLE, frequency: 440, table: 0 }, 0.5, 1, tables);
    expect(Math.abs(frequencyOf(loaded) - 440)).toBeLessThanOrEqual(1);
    expect(rms(loaded)).toBeCloseTo(Math.SQRT1_2, 1);
    const [missing] = render({ wave1: TABLE, frequency: 440, table: 5 }, 0.1, 1, tables);
    expect(peak(missing)).toBe(0);
  });
});
