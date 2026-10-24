import { describe, expect, test } from "bun:test";
import { Ramp } from "./ramp";

const run = (r: Ramp, n: number) => Array.from({ length: n }, () => r.tick());

describe("Ramp (AudioParam-style automation)", () => {
  test("a linear ramp reaches its target exactly after its length, then approaches the next target", () => {
    const r = new Ramp(0);
    r.ramp(1, 4, 0.5, 10);
    const v = run(r, 6);
    expect(v.slice(0, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    // setTargetAtTime from 1 toward 0.5 with a 10-sample time constant.
    expect(v[5]).toBeCloseTo(0.5 + 0.5 * Math.exp(-1 / 10));
  });

  test("an exponential approach follows target + (start - target) * e^(-t/tc)", () => {
    const r = new Ramp(1);
    r.approach(0, 100);
    const v = run(r, 301);
    for (const t of [0, 100, 300]) expect(v[t]).toBeCloseTo(Math.exp(-t / 100), 6);
  });

  test("a ramp shorter than a sample jumps", () => {
    const r = new Ramp(0.3);
    r.ramp(1, 0);
    expect(run(r, 2)).toEqual([1, 1]);
  });

  test("a new ramp starts from wherever the value is (an envelope retriggered mid-release)", () => {
    const r = new Ramp(1);
    r.approach(0, 10);
    run(r, 10);
    const from = r.value;
    r.ramp(1, 2);
    expect(r.tick()).toBeCloseTo(from);
  });
});
