import { describe, expect, test } from "bun:test";
import { blendKeyframes, drawLine, frameCount, harmonicAmps, shapeWave, smooth, waveFromAmps } from "./tableDraw";
import { FRAME_SIZE } from "./wavetables";

const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const maxDiff = (a: Float32Array, b: Float32Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

describe("drawLine", () => {
  test("fills every sample between the two points", () => {
    const w = new Float32Array(FRAME_SIZE);
    drawLine(w, 0.75, 1, 0.25, -1);
    const i0 = Math.round(0.25 * (FRAME_SIZE - 1));
    const i1 = Math.round(0.75 * (FRAME_SIZE - 1));
    expect(w[i0]).toBeCloseTo(-1);
    expect(w[i1]).toBeCloseTo(1);
    expect(w[Math.round((i0 + i1) / 2)]).toBeCloseTo(0, 2);
    expect(w[i0 - 1]).toBe(0);
    expect(w[i1 + 1]).toBe(0);
  });

  test("keeps levels within -1..1 and places within the wave", () => {
    const w = new Float32Array(FRAME_SIZE);
    drawLine(w, -0.5, 3, 1.5, 3);
    expect(w[0]).toBe(1);
    expect(w[FRAME_SIZE - 1]).toBe(1);
  });
});

describe("harmonics", () => {
  test("one slider at full is a sine", () => {
    const w = waveFromAmps([1]);
    expect(maxDiff(w, shapeWave("sine"))).toBeLessThan(1e-5);
  });

  test("strengths are the peaks of the sine waves: a saw's are 2/π, then falling as 1/h", () => {
    expect(harmonicAmps(shapeWave("sine"), 1)[0]).toBeCloseTo(1, 4);
    const amps = harmonicAmps(shapeWave("saw"), 8);
    amps.forEach((a, k) => expect(a).toBeCloseTo(2 / Math.PI / (k + 1), 2));
  });

  test("sliders read back from the wave they built", () => {
    const amps = [0.2, 0, 0.5, 0, 0.25, 0.1];
    const back = harmonicAmps(waveFromAmps(amps), amps.length);
    back.forEach((a, k) => expect(a).toBeCloseTo(amps[k], 4));
  });

  test("all sliders down is a flat wave, not an error", () => {
    expect(peak(waveFromAmps([0, 0, 0]))).toBe(0);
    expect(harmonicAmps(new Float32Array(FRAME_SIZE))).toEqual(Array(32).fill(0));
  });
});

describe("smooth", () => {
  test("turns the high harmonics down and keeps the low ones and the level", () => {
    const square = shapeWave("square");
    const soft = smooth(square);
    const before = harmonicAmps(square, 64);
    const after = harmonicAmps(soft, 64);
    expect(after[2] / before[2]).toBeGreaterThan(0.95);
    expect(after[48] / before[48]).toBeLessThan(0.05);
    expect(peak(soft)).toBeCloseTo(1, 5);
  });
});

describe("blendKeyframes", () => {
  test("keyframes land on frames, spread from the start to the end", () => {
    expect(frameCount(2)).toBe(32);
    expect(frameCount(3)).toBe(31);
    expect(frameCount(4)).toBe(31);
    const keys = [shapeWave("sine"), shapeWave("triangle"), shapeWave("saw"), shapeWave("square")];
    for (const mode of ["harmonics", "crossfade"] as const) {
      const frames = blendKeyframes(keys, mode);
      expect(frames.length).toBe(31);
      // Keys 0..3 at frames 0, 10, 20, 30, all scaled by the table's one gain. (With harmonics, the frames
      // between the triangle and the saw peak higher than either, so the gain is below 1.)
      const gain = peak(frames[30]);
      [0, 10, 20, 30].forEach((f, k) => expect(maxDiff(frames[f].map((v) => v / gain), keys[k])).toBeLessThan(1e-3));
    }
  });

  test("crossfade mixes the waves: halfway is their average", () => {
    const a = shapeWave("sine"), b = shapeWave("square");
    const frames = blendKeyframes([a, b], "crossfade");
    const mid = Float32Array.from(a, (v, i) => v + (b[i] - v) * (16 / 31));
    expect(maxDiff(frames[16], mid)).toBeLessThan(1e-5);
  });

  test("a wave and its upside-down copy: crossfade goes silent halfway, harmonics stays full", () => {
    const up = shapeWave("saw");
    const down = up.map((v) => -v);
    const cross = blendKeyframes([up, down], "crossfade");
    const harm = blendKeyframes([up, down], "harmonics");
    // Frame 15 is just before halfway (15.5): crossfade has almost cancelled.
    expect(rms(cross[15])).toBeLessThan(0.05 * rms(cross[0]));
    expect(rms(harm[15])).toBeGreaterThan(0.95 * rms(harm[0]));
  });

  test("a quiet keyframe stays quiet: one gain for the whole table", () => {
    const loud = shapeWave("sine");
    const quiet = loud.map((v) => v * 0.25);
    const frames = blendKeyframes([loud, quiet], "harmonics");
    expect(peak(frames[0])).toBeCloseTo(1, 3);
    expect(peak(frames[31])).toBeCloseTo(0.25, 3);
  });

  test("a flat keyframe fades the other in, never NaN", () => {
    const frames = blendKeyframes([new Float32Array(FRAME_SIZE), shapeWave("saw")], "harmonics");
    expect(frames.every((f) => f.every(Number.isFinite))).toBe(true);
    expect(peak(frames[0])).toBe(0);
    expect(peak(frames[16])).toBeGreaterThan(0.4);
  });
});
