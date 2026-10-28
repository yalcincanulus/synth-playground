import { describe, expect, test } from "bun:test";
import { automatable, cleanLanes, drawLine, lanesForLength, movePoint, readLanes, setPoint, thin, valueAt, volumeAt, volumeControl, writeRange } from "./automation";
import { VOLUME_MAX, VOLUME_MIN } from "./song";

const END = 384; // a bar

describe("automation", () => {
  test("a lane's value: straight lines between its points, flat outside them", () => {
    const pts = [{ tick: 96, value: 0.2 }, { tick: 192, value: 0.6 }];
    expect(valueAt(pts, 0)).toBe(0.2);
    expect(valueAt(pts, 144)).toBeCloseTo(0.4);
    expect(valueAt(pts, 300)).toBe(0.6);
    expect(valueAt([], 10)).toBeNaN();
  });

  test("only settings that turn smoothly have lanes", () => {
    expect(automatable("cutoff")).toBe(true);
    expect(automatable("delayMix")).toBe(true);
    expect(automatable("osc1Wave")).toBe(false);
    expect(automatable("unison")).toBe(false);
    expect(automatable("reverbSize")).toBe(false);
  });

  test("points are kept in order, one a tick, inside the clip", () => {
    let pts = setPoint([], 96, 0.5, END);
    pts = setPoint(pts, 0, 0.1, END);
    pts = setPoint(pts, 96, 0.9, END);
    pts = setPoint(pts, 999, 1, END);
    expect(pts).toEqual([{ tick: 0, value: 0.1 }, { tick: 96, value: 0.9 }]);
    // A point dragged past its neighbour stops beside it.
    expect(movePoint(pts, 0, 200, 2, END)).toEqual([{ tick: 95, value: 1 }, { tick: 96, value: 0.9 }]);
  });

  test("a straight line replaces the points it crosses", () => {
    const pts = [0, 96, 192, 288, 384].map((tick) => ({ tick, value: 0.5 }));
    expect(drawLine(pts, { tick: 300, value: 0 }, { tick: 100, value: 1 }, END)).toEqual([
      { tick: 0, value: 0.5 },
      { tick: 96, value: 0.5 },
      { tick: 100, value: 1 },
      { tick: 300, value: 0 },
      { tick: 384, value: 0.5 },
    ]);
    expect(writeRange(pts, 90, 200, [], END).map((p) => p.tick)).toEqual([0, 288, 384]);
  });

  test("thinning keeps the corners of a recorded line", () => {
    const ramp = Array.from({ length: 11 }, (_, i) => ({ tick: i * 10, value: i / 10 }));
    const down = Array.from({ length: 10 }, (_, i) => ({ tick: 110 + i * 10, value: 1 - (i + 1) / 10 }));
    expect(thin([...ramp, ...down])).toEqual([{ tick: 0, value: 0 }, { tick: 100, value: 1 }, { tick: 200, value: 0 }]);
  });

  test("a shorter clip ends its lanes at its end; Double plays them twice", () => {
    const lanes = [{ target: "cutoff" as const, points: [{ tick: 0, value: 0 }, { tick: 768, value: 1 }] }];
    expect(lanesForLength(lanes, 768, 384)[0].points).toEqual([{ tick: 0, value: 0 }, { tick: 384, value: 0.5 }]);
    const one = [{ target: "cutoff" as const, points: [{ tick: 0, value: 0 }, { tick: 383, value: 1 }] }];
    expect(lanesForLength(one, 384, 768, true)[0].points.map((p) => p.tick)).toEqual([0, 383, 384, 767]);
  });

  test("lanes from storage are checked", () => {
    const raw = [
      { target: "cutoff", points: [{ tick: 10, value: 3 }, { tick: "x" }] },
      { target: "cutoff", points: [{ tick: 5, value: 0 }] }, // the same setting twice
      { target: "osc1Wave", points: [{ tick: 0, value: 0 }] }, // steps, not automated
      { target: "trackPan", points: [] }, // empty
      { target: "trackVolume", points: [{ tick: 0, value: 0.5 }] },
      null,
    ];
    expect(readLanes(raw, END)).toEqual([
      { target: "cutoff", points: [{ tick: 10, value: 1 }] },
      { target: "trackVolume", points: [{ tick: 0, value: 0.5 }] },
    ]);
    expect(readLanes("nonsense", END)).toEqual([]);
    expect(cleanLanes([], END)).toEqual([]);
  });

  test("track volume runs evenly in dB from off to its top", () => {
    expect(volumeAt(0)).toBe(VOLUME_MIN);
    expect(volumeAt(1)).toBe(VOLUME_MAX);
    expect(volumeControl(volumeAt(0.3))).toBeCloseTo(0.3);
  });
});
