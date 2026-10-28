import { describe, expect, test } from "bun:test";
import { captureRuns, layerEnd, loopBarsFor, nextRound, padState, roundStart } from "./looper";

describe("the loop grid", () => {
  test("a beat's time round, with an early downbeat counted in the next", () => {
    expect(roundStart(5.5, 0, 4)).toBe(4);
    expect(roundStart(7.95, 0, 4)).toBe(8);
    expect(roundStart(7.8, 0, 4)).toBe(4);
    // Rounds of 2 bars from beat 4.
    expect(roundStart(13, 4, 8)).toBe(12);
    expect(roundStart(3, 4, 8)).toBe(-4);
  });

  test("the next round start at or after a beat", () => {
    expect(nextRound(5, 0, 4)).toBe(8);
    expect(nextRound(8, 0, 4)).toBe(8);
    expect(nextRound(13, 4, 16)).toBe(20);
  });

  test("a first take rounds to the nearest bar line, then up to 1, 2, 4 or 8 bars", () => {
    expect(loopBarsFor(0.5)).toBe(1);
    expect(loopBarsFor(7.8)).toBe(2);
    expect(loopBarsFor(8.6)).toBe(2);
    expect(loopBarsFor(10.5)).toBe(4);
    expect(loopBarsFor(20)).toBe(8);
    expect(loopBarsFor(60)).toBe(8);
    // A drum clip is 4 bars at most.
    expect(loopBarsFor(20, 4)).toBe(4);
  });

  test("a layer ends at the end of its time round, or at once when tapped just after one began", () => {
    expect(layerEnd(9, 0, 16)).toBe(16);
    expect(layerEnd(16.5, 0, 16)).toBe(16.5);
    expect(layerEnd(18, 0, 16)).toBe(32);
  });
});

describe("pads", () => {
  const s = { selected: false, ready: false, recording: false, chosen: false, hasLoop: false };
  test("each state, recording first", () => {
    expect(padState(s)).toBe("off");
    expect(padState({ ...s, selected: true })).toBe("selected");
    expect(padState({ ...s, selected: true, ready: true })).toBe("ready");
    expect(padState({ ...s, ready: true, recording: true, chosen: true })).toBe("recording");
    expect(padState({ ...s, selected: true, chosen: true, hasLoop: true })).toBe("playing");
    expect(padState({ ...s, selected: true, hasLoop: true })).toBe("stopped");
  });
});

describe("capture", () => {
  test("launched stretches become placements, from the start bar; the arrangement's stretches are left out", () => {
    const log = [
      { track: "bass", clip: "b1", at: 0, start: 0 },
      { track: "drums", clip: null, at: 0, start: 0 },
      // Recorded partway into bar 5: its round started on bar 5.
      { track: "drums", clip: "d1", at: 17.5, start: 16 },
      { track: "bass", clip: null, at: 32, start: 32 },
      { track: "bass", clip: "b2", at: 40, start: 40 },
    ];
    expect(captureRuns(log, 50, 2)).toEqual([
      { clip: "b1", bar: 2, bars: 8 },
      { clip: "b2", bar: 12, bars: 3 },
      { clip: "d1", bar: 6, bars: 9 },
    ]);
  });

  test("nothing for a clip that never got to play", () => {
    expect(captureRuns([{ track: "bass", clip: "b1", at: 16, start: 16 }], 16, 0)).toEqual([]);
  });
});
