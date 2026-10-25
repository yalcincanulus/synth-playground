import { describe, expect, test } from "bun:test";
import { CLIP_RANGE, KNEE, softClip, softClipCurve } from "./softClip";

describe("soft clipper", () => {
  test("leaves quiet sound untouched", () => {
    for (const x of [-KNEE, -0.3, 0, 0.2, 0.5, KNEE]) expect(softClip(x)).toBe(x);
  });

  test("bends loud peaks smoothly below full scale", () => {
    let last = 0;
    for (let x = 0; x <= 4; x += 0.001) {
      const y = softClip(x);
      expect(y).toBeLessThan(1);
      expect(y).toBeGreaterThanOrEqual(last);
      // No corner: the slope never jumps (it is 1 at the knee on both sides).
      if (x > 0) expect(Math.abs((y - last) / 0.001 - (softClip(x + 0.001) - y) / 0.001)).toBeLessThan(0.01);
      last = y;
    }
    expect(softClip(-1.5)).toBe(-softClip(1.5));
  });

  test("the WaveShaper curve covers ±CLIP_RANGE and is centred", () => {
    const c = softClipCurve(4097);
    expect(c[2048]).toBe(0);
    expect(c[4096]).toBeCloseTo(softClip(CLIP_RANGE), 6);
    expect(c[0]).toBeCloseTo(-softClip(CLIP_RANGE), 6);
  });
});
