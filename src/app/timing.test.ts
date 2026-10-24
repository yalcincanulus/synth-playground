import { describe, expect, test } from "bun:test";
import { Freezes, Rolling } from "./timing";

describe("Rolling", () => {
  test("keeps the last values only", () => {
    const r = new Rolling(3);
    expect(r.average).toBeNull();
    for (const v of [10, 1, 2, 3]) r.add(v);
    expect(r.count).toBe(3);
    expect(r.average).toBe(2);
    expect(r.max).toBe(3);
  });
});

describe("Freezes", () => {
  test("reports the longest freeze in the window", () => {
    const f = new Freezes(1000);
    f.add(100, 80);
    f.add(900, 60);
    expect(f.longest(1000)).toBe(80);
    expect(f.longest(1500)).toBe(60);
    expect(f.longest(2500)).toBe(0);
  });
});
