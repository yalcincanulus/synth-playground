import { describe, expect, test } from "bun:test";
import { fitPlacement, freeBar, readPlacements, readRange, SongClock, songEnd, uses, type Placement } from "./arrangement";
import { noteClip } from "./clips";
import { defaultTracks } from "./song";

const [, BASS, CHORDS] = defaultTracks();
const trackOf = (clip: string) => (clip.startsWith("b") ? BASS.id : CHORDS.id);
const place = (id: string, clip: string, bar: number, bars: number, transpose = 0): Placement => ({ id, clip, bar, bars, transpose });

describe("placements", () => {
  test("a placement makes room: one before it is cut short, one inside it removed, other tracks untouched", () => {
    const ps = [place("p1", "b1", 0, 4), place("p2", "b1", 6, 2), place("p3", "b1", 9, 4), place("p4", "c1", 0, 16)];
    const out = fitPlacement(ps, place("new", "b2", 2, 6), trackOf);
    expect(out.map((p) => [p.id, p.bar, p.bars])).toEqual([
      ["p1", 0, 2],
      ["p4", 0, 16],
      ["new", 2, 6],
      ["p3", 9, 4],
    ]);
  });

  test("a moved placement replaces itself, and stays inside the song", () => {
    const out = fitPlacement([place("p1", "b1", 0, 4)], place("p1", "b1", -3, 0, 99), trackOf);
    expect(out).toEqual([place("p1", "b1", 0, 1, 24)]);
  });

  test("the first free bar with room, the song's end and how often each clip is used", () => {
    const ps = [place("p1", "b1", 0, 4), place("p2", "b1", 5, 2), place("p3", "c1", 0, 8)];
    expect(freeBar(ps, BASS.id, 0, 1, trackOf)).toBe(4);
    expect(freeBar(ps, BASS.id, 0, 2, trackOf)).toBe(7);
    expect(songEnd(ps)).toBe(8);
    expect(uses([...ps, place("p4", "b1", 9, 1)]).get("b1")).toBe(3);
  });

  test("read back from storage: unknown clips and overlaps dropped, values kept in range", () => {
    const clips = [{ ...noteClip([], BASS), id: "b1" }];
    const raw = [place("p1", "b1", 0, 4), { id: "p2", clip: "gone", bar: 0, bars: 1 }, { id: "p3", clip: "b1", bar: 2, bars: "x", transpose: 3.4 }, null];
    expect(readPlacements(raw, clips)).toEqual([place("p1", "b1", 0, 2), place("p3", "b1", 2, 1, 3)]);
    expect(readRange({ start: 2, end: 6 })).toEqual({ start: 2, end: 6 });
    expect(readRange({ start: 6, end: 6 })).toBeNull();
  });
});

describe("the song's clock", () => {
  test("from the start bar on, and back to the loop's start each time its end comes", () => {
    const c = new SongClock();
    c.loop = { start: 8, end: 16 };
    c.reset(4);
    expect(c.songAt(0)).toBe(4);
    expect(c.nextJump(0)).toBe(12);
    c.plan(11.75, 12);
    expect(c.songAt(11.9)).toBeCloseTo(15.9, 9);
    expect(c.songAt(12)).toBe(8);
    expect(c.nextJump(12)).toBe(20);
    c.plan(19.75, 20);
    expect(c.songAt(21)).toBe(9);
  });

  test("started after the loop's end, it plays on", () => {
    const c = new SongClock();
    c.loop = { start: 0, end: 4 };
    c.reset(8);
    expect(c.nextJump(0)).toBe(Infinity);
    c.plan(0, 100);
    expect(c.songAt(50)).toBe(58);
  });

  test("no loop: no jumps", () => {
    const c = new SongClock();
    c.reset(0);
    c.plan(0, 1000);
    expect(c.songAt(999)).toBe(999);
  });
});
