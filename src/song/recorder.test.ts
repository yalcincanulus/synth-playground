import { describe, expect, test } from "bun:test";
import { TICKS_PER_BEAT } from "./clips";
import { GRIDS } from "./noteEdit";
import { defaultRecordSettings, EARLY_BEATS, readRecordSettings, Take } from "./recorder";

const Q = TICKS_PER_BEAT;
const SIXTEENTH = GRIDS.find((g) => g.name === "1/16")!.ticks;

/** A take over a clip of `bars` bars, starting on beat `start`. */
function take(bars = 1, start = 0, grid: number | null = null, strength = 1) {
  const t = new Take(() => bars * 4, grid, strength);
  t.start = start;
  return t;
}

describe("Take", () => {
  test("a note lands at its beat in the clip, with its length and velocity", () => {
    const t = take(2, 8);
    t.noteOn(60, 90, 9.5);
    expect(t.noteOff(60, 10.25)).toEqual({ start: 1.5 * Q, length: 0.75 * Q, pitch: 60, velocity: 90 });
  });

  test("later times round fold back into the clip", () => {
    const t = take(1, 0);
    t.noteOn(64, 100, 4 * 3 + 1);
    expect(t.noteOff(64, 4 * 3 + 2)).toMatchObject({ start: Q, length: Q });
    expect(t.pass(13)).toBe(3);
  });

  test("before the take starts, nothing is recorded; still waiting (start unknown), neither", () => {
    const t = take(1, 4);
    t.noteOn(60, 100, 3);
    expect(t.noteOff(60, 3.5)).toBeNull();
    const waiting = new Take(() => 4);
    waiting.noteOn(60, 100, 100);
    expect(waiting.noteOff(60, 101)).toBeNull();
    expect(waiting.pass(100)).toBe(-1);
  });

  test("an early downbeat counts as the clip's first beat, also when the clip comes round again", () => {
    const t = take(1, 4);
    t.noteOn(60, 100, 4 - EARLY_BEATS / 2);
    expect(t.noteOff(60, 5)?.start).toBe(0);
    t.noteOn(62, 100, 8 - EARLY_BEATS / 2);
    expect(t.noteOff(62, 9)?.start).toBe(0);
    // A little more than that is a note at the end of the clip.
    t.noteOn(64, 100, 8 - 0.25);
    expect(t.noteOff(64, 8)?.start).toBe(3.75 * Q);
  });

  test("a note held over the end of the clip ends there", () => {
    const t = take(1, 0);
    t.noteOn(60, 100, 3);
    expect(t.noteOff(60, 6)).toMatchObject({ start: 3 * Q, length: Q });
  });

  test("quantize on input pulls the start onto the grid at its strength, and keeps the length", () => {
    const full = take(1, 0, SIXTEENTH, 1);
    full.noteOn(60, 100, 1.1);
    expect(full.noteOff(60, 1.6)).toMatchObject({ start: Q, length: Math.round(0.5 * Q) });
    const half = take(1, 0, SIXTEENTH, 0.5);
    half.noteOn(60, 100, 1.1);
    expect(half.noteOff(60, 1.6)?.start).toBe(Math.round(Q * 1.05));
  });

  test("quantized onto the clip's end, a note goes to its start", () => {
    const t = take(1, 0, Q, 1);
    t.noteOn(60, 100, 3.8);
    expect(t.noteOff(60, 4.2)?.start).toBe(0);
  });

  test("the arpeggiator's notes are written as they are, without quantizing", () => {
    const t = take(1, 0, Q, 1);
    expect(t.note(60, 80, 1.25, 1.375, false)).toEqual({ start: 1.25 * Q, length: 0.125 * Q, pitch: 60, velocity: 80 });
    expect(t.note(60, 80, -1, 0, false)).toBeNull();
  });

  test("ending the take ends the held notes", () => {
    const t = take(1, 0);
    t.noteOn(60, 100, 1);
    t.noteOn(67, 100, 2);
    expect(t.end(3).map((n) => [n.pitch, n.start, n.length])).toEqual([
      [60, Q, 2 * Q],
      [67, 2 * Q, Q],
    ]);
    expect(t.end(4)).toEqual([]);
  });

  test("a note pressed again before it was let go starts over", () => {
    const t = take(1, 0);
    t.noteOn(60, 100, 1);
    t.noteOn(60, 50, 2);
    expect(t.noteOff(60, 2.5)).toMatchObject({ start: 2 * Q, velocity: 50 });
    expect(t.noteOff(60, 3)).toBeNull();
  });

  test("drum hits land on the nearest step, across the clip's bars", () => {
    const t = take(2, 4);
    expect(t.drumStep(4)).toBe(0);
    expect(t.drumStep(4 + 0.26)).toBe(1);
    expect(t.drumStep(4 + 4 + 0.1)).toBe(16);
    // Late on the last step of the clip, near enough to the next time round: step 1.
    expect(t.drumStep(4 + 8 - 0.05)).toBe(0);
    expect(t.drumStep(3)).toBe(-1);
  });

  test("the clip's length is read as it is now", () => {
    let bars = 1;
    const t = new Take(() => bars * 4);
    t.start = 0;
    bars = 2;
    t.noteOn(60, 100, 5);
    expect(t.noteOff(60, 6)?.start).toBe(5 * Q);
  });
});

describe("record settings", () => {
  test("read back, and kept in range", () => {
    expect(readRecordSettings(null)).toEqual(defaultRecordSettings());
    const s = readRecordSettings({ countIn: false, metronome: false, click: 3, mode: "replace", quantize: 2, strength: -1, velocity: 200, bars: 0 });
    expect(s).toEqual({ countIn: false, metronome: false, click: 1, mode: "replace", quantize: 2, strength: 0, velocity: 127, bars: 1 });
    expect(readRecordSettings({ mode: "nonsense", quantize: 99 }).quantize).toBe(GRIDS.length - 1);
  });
});

describe("a take that starts the transport", () => {
  test("a note played just before the clock's first beat is on it, and keeps its length from there", () => {
    const t = take(1, 0);
    t.from = 0;
    t.noteOn(48, 100, -0.3);
    expect(t.noteOff(48, 0.5)).toEqual({ start: 0, length: 0.5 * Q, pitch: 48, velocity: 100 });
  });
});
