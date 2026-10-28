import { describe, expect, test } from "bun:test";
import { CpuGuard, pickVictim, voiceWeight, type LimitedVoice } from "./voiceLimit";

const v = (startedAt: number, owner = "keys", releasedAt: number | null = null, level = 1) => ({ startedAt, owner, releasedAt, level });
const level = (x: LimitedVoice & { level: number }) => x.level;

describe("pickVictim", () => {
  test("cuts the quietest released voice first", () => {
    const voices = [v(0), v(1, "keys", 2, 0.5), v(2, "seq"), v(3, "keys", 3, 0.1)];
    expect(pickVictim(voices, level)).toBe(voices[3]);
  });

  test("then the sequencer's oldest note, then your oldest", () => {
    const voices = [v(0), v(1, "seq"), v(2, "seq"), v(3)];
    expect(pickVictim(voices, level)).toBe(voices[1]);
    expect(pickVictim([v(5), v(4), v(6)], level)?.startedAt).toBe(4);
    expect(pickVictim([], level)).toBeUndefined();
  });

  test("a song track's notes go before the part your keys play", () => {
    const voices = [v(0, "track-1"), v(1, "seq"), v(2), v(3, "track-2")];
    expect(pickVictim(voices, level)).toBe(voices[0]);
    // Your keys play track 1 (the Song view): the others' notes go first, the Keys part's included.
    expect(pickVictim(voices, level, "track-1")).toBe(voices[1]);
    // Only your own notes left: the oldest of them.
    expect(pickVictim([v(1, "track-1"), v(0, "track-1")], level, "track-1")?.startedAt).toBe(0);
  });
});

describe("CpuGuard", () => {
  test("unlimited until measured, then fits the target", () => {
    const g = new CpuGuard(0.6, 0.8);
    expect(g.budget).toBe(Infinity);
    g.report(0.3, 10); // 3% per unit
    expect(g.budget).toBeCloseTo(20);
  });

  test("a heavier patch counts quickly, a lighter one slowly", () => {
    const g = new CpuGuard(0.6, 0.8);
    g.report(0.3, 10);
    g.report(0.6, 10);
    g.report(0.6, 10);
    expect(g.budget).toBeLessThan(12); // heading for 10
    const before = g.budget;
    g.report(0.3, 10);
    expect(g.budget).toBeGreaterThan(before);
    expect(g.budget).toBeLessThan(before * 1.2);
  });

  test("ignores reports without voices, and flags overload", () => {
    const g = new CpuGuard(0.6, 0.8);
    g.report(0.2, 0);
    expect(g.budget).toBe(Infinity);
    expect(g.overloaded(0.85)).toBe(true);
    expect(g.overloaded(0.5)).toBe(false);
  });

  test("voice weight follows unison", () => {
    expect([1, 2, 3].map(voiceWeight)).toEqual([2, 3, 4]);
  });
});
