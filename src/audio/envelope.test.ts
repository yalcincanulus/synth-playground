import { describe, expect, test } from "bun:test";
import { envelopeAt, type Adsr } from "./envelope";

const env: Adsr = { attack: 0.1, decay: 0.4, sustain: 0.5, release: 1 };

describe("envelopeAt", () => {
  test("attack rises in a straight line to the peak", () => {
    expect(envelopeAt(env, 0.05, 0, null)).toMatchObject({ stage: "attack", level: 0.5 });
    expect(envelopeAt(env, 0.1, 0, null).level).toBeCloseTo(1);
  });

  test("decay falls toward sustain and is within 2% of it after one decay time", () => {
    const mid = envelopeAt(env, 0.3, 0, null);
    expect(mid.stage).toBe("decay");
    expect(mid.level).toBeLessThan(1);
    expect(mid.level).toBeGreaterThan(0.5);
    const end = envelopeAt(env, 0.1 + 0.4 + 0.001, 0, null);
    expect(end.stage).toBe("sustain");
    expect(Math.abs(end.level - 0.5)).toBeLessThan(0.02 * 0.5 + 0.01);
  });

  test("release starts from wherever the envelope was, and ends", () => {
    // Released during the attack, at half level.
    expect(envelopeAt(env, 0.05, 0, 0.05).level).toBeCloseTo(0.5);
    expect(envelopeAt(env, 0.05 + 0.25, 0, 0.05).level).toBeCloseTo(0.5 * Math.exp(-1));
    expect(envelopeAt(env, 3, 0, 0.05).stage).toBe("off");
  });

  test("before the release time, it is still held", () => {
    expect(envelopeAt(env, 0.2, 0, 1).stage).toBe("decay");
  });
});
