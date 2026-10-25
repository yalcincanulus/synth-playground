import { describe, expect, test } from "bun:test";
import { defaultValues, EFFECTS, effectChain, effectOrder, fxSlotId, type ParamValues } from "../params";
import { DIST_LATENCY, Distortion, Flanger, flangerMagnitude, flangerMakeUp, makeUp, Phaser, phaserMagnitude, phaserMakeUp } from "./effects";
import { Decimator2, Interpolator2 } from "./halfband";

const SR = 48000;
const N = 16384;

const sine = (hz: number, amp = 0.3, n = N) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

/** Run a stereo effect over the same signal on both sides, in blocks of 128 as the browser does. */
function run(fx: { process(l: Float32Array, r: Float32Array, n: number): void }, input: Float32Array) {
  const left = input.slice();
  const right = input.slice();
  for (let i = 0; i < left.length; i += 128) fx.process(left.subarray(i, i + 128), right.subarray(i, i + 128), 128);
  return { left, right };
}

/** The nearest frequency that fits a whole number of cycles in the measured half (no leakage). */
const bin = (hz: number) => (Math.round((hz * N) / 2 / SR) * SR * 2) / N;

/** The level of `hz` in the second half of a signal (its steady state). */
function level(x: Float32Array, hz: number) {
  let re = 0;
  let im = 0;
  const from = x.length / 2;
  for (let i = from; i < x.length; i++) {
    re += x[i] * Math.cos((2 * Math.PI * hz * i) / SR);
    im += x[i] * Math.sin((2 * Math.PI * hz * i) / SR);
  }
  return (2 * Math.hypot(re, im)) / (x.length - from);
}

const rms = (x: Float32Array) => Math.sqrt(x.subarray(x.length / 2).reduce((s, v) => s + v * v, 0) / (x.length / 2));
const values = (over: Partial<ParamValues>): ParamValues => ({ ...defaultValues(), ...over });

describe("up and down again (2x)", () => {
  test("gives the sound back, DIST_LATENCY samples late", () => {
    const x = sine(1000, 0.5, 4096);
    const up = new Interpolator2();
    const down = new Decimator2();
    const two = new Float32Array(256);
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i += 128) {
      up.process(x.subarray(i, i + 128), two, 128);
      down.process(two, out.subarray(i, i + 128), 128);
    }
    for (const i of [1000, 2000, 3000]) expect(out[i]).toBeCloseTo(x[i - DIST_LATENCY], 3);
  });
});

describe("Distortion", () => {
  test("at Mix 0 it is only the dry sound, held back to line up with the wet one", () => {
    const d = new Distortion(SR);
    d.set(values({ distMix: 0, distDrive: 1 }));
    const x = sine(440);
    const { left } = run(d, x);
    for (const i of [5000, 9000]) expect(left[i]).toBeCloseTo(x[i - DIST_LATENCY], 5);
  });

  test("Drive changes the character, not the volume", () => {
    for (const type of [0, 1, 2]) {
      for (const drive of [0.2, 0.6, 1]) {
        const d = new Distortion(SR);
        d.set(values({ distType: type, distDrive: drive, distTone: 18000 }));
        const db = 20 * Math.log10(rms(run(d, sine(220)).left) / rms(sine(220)));
        expect(Math.abs(db)).toBeLessThan(1.5);
      }
    }
    // Crush doesn't change the level, so it needs no make-up.
    expect(makeUp(3, 1)).toBe(1);
  });

  test("makes harmonics: hard clipping a sine adds odd ones", () => {
    const d = new Distortion(SR);
    d.set(values({ distType: 1, distDrive: 0.8, distTone: 18000 }));
    const { left } = run(d, sine(300));
    expect(level(left, 900) / level(left, 300)).toBeGreaterThan(0.1);
  });

  test("oversampling keeps folded-back tones low on soft and hard", () => {
    // A 7 kHz sine hard-clipped: its harmonics above 24 kHz (35, 49 kHz) would fold back to 13 and 1 kHz.
    const d = new Distortion(SR);
    d.set(values({ distType: 1, distDrive: 0.7, distTone: 18000 }));
    const { left } = run(d, sine(7000));
    const fund = level(left, 7000);
    expect(20 * Math.log10(level(left, 13000) / fund)).toBeLessThan(-30);
    expect(20 * Math.log10(level(left, 1000) / fund)).toBeLessThan(-30);
  });

  test("crush keeps fewer levels and holds samples", () => {
    const d = new Distortion(SR);
    d.set(values({ distType: 3, distDrive: 1, distTone: 18000 }));
    const { left } = run(d, sine(100, 0.9));
    // 2 bits: only -1, -0.5, 0, 0.5 and 1 (the tone filter rounds the corners a little).
    const part = left.subarray(8000, 12000);
    const onStep = part.filter((v) => Math.abs(v * 2 - Math.round(v * 2)) < 0.05).length;
    expect(onStep / part.length).toBeGreaterThan(0.8);
  });
});

describe("Phaser", () => {
  test("matches its drawing (no feedback), with its make-up level", () => {
    const p = values({ phaserDepth: 0, phaserFeedback: 0, phaserMix: 0.5, phaserRate: 0.03 });
    const up = phaserMakeUp(p, SR);
    for (const hz of [80, 300, 1000, 4000].map(bin)) {
      const ph = new Phaser(SR);
      ph.set(p);
      const got = level(run(ph, sine(hz)).left, hz) / 0.3 / up;
      expect(got).toBeCloseTo(phaserMagnitude(p, 0, hz, SR), 2);
    }
  });

  test("cuts notches: with Mix at 50% some frequency all but cancels", () => {
    const p = values({ phaserDepth: 0, phaserFeedback: 0, phaserMix: 0.5 });
    const lows = [100, 200, 400, 800, 1600, 3200, 6400].map((hz) => phaserMagnitude(p, 0, hz, SR));
    expect(Math.min(...lows)).toBeLessThan(0.5);
    // Mix 0: unchanged.
    expect(phaserMagnitude({ ...p, phaserMix: 0 }, 0, 500, SR)).toBeCloseTo(1, 6);
  });

  test("the sides sweep apart (wide)", () => {
    const ph = new Phaser(SR);
    ph.set(values({ phaserRate: 1, phaserDepth: 1, phaserMix: 0.5 }));
    const { left, right } = run(ph, sine(800));
    let diff = 0;
    for (let i = 0; i < N; i++) diff += Math.abs(left[i] - right[i]);
    expect(diff / N).toBeGreaterThan(0.01);
  });
});

describe("make-up level", () => {
  test("none at Mix 0; notches turn the sound up, ringing feedback down", () => {
    const p = defaultValues();
    expect(phaserMakeUp({ ...p, phaserMix: 0 }, SR)).toBeCloseTo(1, 6);
    expect(flangerMakeUp({ ...p, flangerMix: 0 })).toBeCloseTo(1, 6);
    expect(phaserMakeUp({ ...p, phaserFeedback: 0 }, SR)).toBeGreaterThan(1);
    expect(flangerMakeUp({ ...p, flangerMix: 1, flangerFeedback: 0.9 })).toBeLessThan(1);
  });
});

describe("Flanger", () => {
  test("a comb: the delay's half cycle cancels, a whole cycle adds", () => {
    // Depth 0: 0.5 ms, so 1 kHz is half a cycle late (cancels) and 2 kHz a whole one (adds).
    const p = values({ flangerDepth: 0, flangerFeedback: 0, flangerMix: 0.5 });
    const at = (hz: number) => {
      const f = new Flanger(SR);
      f.set(p);
      return level(run(f, sine(hz)).left, hz) / 0.3 / flangerMakeUp(p);
    };
    expect(at(1000)).toBeLessThan(0.02);
    expect(at(2000)).toBeCloseTo(1, 2);
    expect(flangerMagnitude(p, 0, 1000)).toBeLessThan(1e-6);
    expect(flangerMagnitude(p, 0, 2000)).toBeCloseTo(1, 6);
  });

  test("feedback rings at the comb's peaks", () => {
    const p = values({ flangerDepth: 0, flangerFeedback: 0.8, flangerMix: 0.5 });
    expect(flangerMagnitude(p, 0, 2000)).toBeGreaterThan(2);
    const f = new Flanger(SR);
    f.set(p);
    expect(level(run(f, sine(2000)).left, 2000) / 0.3 / flangerMakeUp(p)).toBeCloseTo(flangerMagnitude(p, 0, 2000), 1);
  });
});

describe("effect order", () => {
  test("the default order, and only the effects that are on", () => {
    const p = defaultValues();
    expect(effectOrder(p)).toEqual([...EFFECTS]);
    expect(effectChain(p)).toEqual(["chorus", "delay", "reverb"]);
  });

  test("a broken order is repaired: repeats dropped, missing effects added in the default order", () => {
    const p = defaultValues();
    p[fxSlotId(1)] = EFFECTS.indexOf("reverb");
    p[fxSlotId(2)] = EFFECTS.indexOf("reverb");
    p[fxSlotId(3)] = 99;
    // Slots 4-8 still hold phaser to reverb; the second reverb and the 99 are dropped.
    expect(effectOrder(p)).toEqual(["reverb", "phaser", "flanger", "chorus", "delay", "distortion", "compressor", "eq"]);
  });
});
