import { describe, expect, test } from "bun:test";
import { defaultValues, MOD_DESTS, MOD_SOURCES } from "../audio/params";
import { diffValues, History, MAX_STEPS, MERGE_MS } from "./history";

describe("History", () => {
  test("undo and redo walk back and forth", () => {
    const h = new History<number>();
    let v = 0;
    h.record(() => v, "a", null, 0);
    v = 1;
    h.record(() => v, "b", null, 10);
    v = 2;

    const u1 = h.undo(v)!;
    expect(u1).toEqual({ state: 1, label: "b" });
    v = u1.state;
    v = h.undo(v)!.state;
    expect(v).toBe(0);
    expect(h.undo(v)).toBeNull();

    v = h.redo(v)!.state;
    expect(v).toBe(1);
    v = h.redo(v)!.state;
    expect(v).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  test("one knob turned a long way is one step", () => {
    const h = new History<number>();
    for (let t = 0; t < 5000; t += 100) h.record(() => t, "Cutoff", "cutoff", t);
    expect(h.undo(99)!.state).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  test("a pause, or another control, starts a new step", () => {
    const h = new History<string>();
    h.record(() => "s0", "Cutoff", "cutoff", 0);
    h.record(() => "s1", "Cutoff", "cutoff", MERGE_MS + 1);
    h.record(() => "s2", "Resonance", "resonance", MERGE_MS + 2);
    h.record(() => "s3", "Cutoff", "cutoff", MERGE_MS + 3);
    expect([h.undo("x")!.state, h.undo("x")!.state, h.undo("x")!.state, h.undo("x")!.state]).toEqual(["s3", "s2", "s1", "s0"]);
  });

  test("after an undo the same control starts a new step", () => {
    const h = new History<string>();
    h.record(() => "s0", "Cutoff", "cutoff", 0);
    h.undo("s1");
    h.record(() => "s0", "Cutoff", "cutoff", 10);
    expect(h.canUndo).toBe(true);
  });

  test("a new change clears redo", () => {
    const h = new History<number>();
    h.record(() => 0, "a", null, 0);
    h.undo(1);
    expect(h.canRedo).toBe(true);
    h.record(() => 0, "b", null, 10);
    expect(h.canRedo).toBe(false);
  });

  test("keeps at most MAX_STEPS", () => {
    const h = new History<number>();
    for (let i = 0; i < MAX_STEPS + 10; i++) h.record(() => i, "x", null, i);
    let n = 0;
    while (h.undo(0)) n++;
    expect(n).toBe(MAX_STEPS);
  });
});

describe("diffValues", () => {
  test("names each change with its readable values", () => {
    const saved = defaultValues();
    const now = { ...saved, cutoff: 400 };
    const changes = diffValues(saved, now);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("cutoff");
    expect(changes[0].to).toBe("400 Hz");
  });

  test("ignores the settings of empty routes, but not a route's source", () => {
    const saved = defaultValues();
    expect(diffValues(saved, { ...saved, mod1Amt: 0.7 })).toEqual([]);
    const ids = diffValues(saved, { ...saved, mod1Src: MOD_SOURCES.indexOf("lfo 1"), mod1Dst: MOD_DESTS.indexOf("pan"), mod1Amt: 0.7 }).map((c) => c.id);
    expect(ids).toEqual(["mod1Src", "mod1Dst", "mod1Amt"]);
  });
});
