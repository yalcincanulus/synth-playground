import { describe, expect, test } from "bun:test";
import { defaultNoteSeq } from "../audio/stepSequencer";
import { TICKS_PER_BEAT, type Note } from "./clips";
import {
  addNote,
  barTicks,
  copyNotes,
  deleteNotes,
  doubleNotes,
  legato,
  moveNotes,
  notesInBox,
  pasteNotes,
  quantize,
  resizeNotes,
  reverse,
  shiftVelocity,
  snap,
  stepsToNotes,
  transpose,
} from "./noteEdit";

const Q = TICKS_PER_BEAT;
const n = (start: number, pitch: number, length = Q / 2, velocity = 100): Note => ({ start, length, pitch, velocity });
const sel = (...i: number[]) => new Set(i);

describe("note edits", () => {
  test("a drawn note lands in order and isn't selected", () => {
    const out = addNote([n(0, 60), n(2 * Q, 62)], n(Q, 64), 1);
    expect(out.notes.map((x) => x.pitch)).toEqual([60, 64, 62]);
    expect(out.index).toBe(1);
    expect(out.selected.size).toBe(0);
  });

  test("moving keeps the selection on the notes it held, and the group inside the clip", () => {
    const notes = [n(0, 60), n(Q, 62), n(2 * Q, 64)];
    const out = moveNotes(notes, sel(0), 3 * Q, 1, 1);
    expect(out.notes.map((x) => [x.start, x.pitch])).toEqual([[Q, 62], [2 * Q, 64], [3 * Q, 61]]);
    expect([...out.selected]).toEqual([2]);
    // Past the end: held back at the last tick of the clip; past the top: at 127.
    const far = moveNotes(notes, sel(1, 2), 100 * Q, 200, 1);
    expect(far.notes.filter((_, i) => far.selected.has(i)).map((x) => [x.start, x.pitch])).toEqual([[barTicks(1) - 1 - Q, 125], [barTicks(1) - 1, 127]]);
    // The group keeps its shape at the left edge.
    const left = moveNotes(notes, sel(1, 2), -10 * Q, 0, 1);
    expect(left.notes.filter((_, i) => left.selected.has(i)).map((x) => x.start)).toEqual([0, Q]);
  });

  test("resizing never goes below the shortest length nor past the clip's end", () => {
    const out = resizeNotes([n(0, 60), n(3 * Q, 62)], sel(0, 1), -Q, 12, 1);
    expect(out.notes.map((x) => x.length)).toEqual([12, 12]);
    const long = resizeNotes([n(3 * Q, 62)], sel(0), 10 * Q, 12, 1);
    expect(long.notes[0].length).toBe(Q);
  });

  test("velocity moves together and stays in 1..127", () => {
    const out = shiftVelocity([n(0, 60, Q, 120), n(Q, 62, Q, 50)], sel(0, 1), 20, 1);
    expect(out.notes.map((x) => x.velocity)).toEqual([127, 70]);
  });

  test("deleting leaves the others", () => {
    expect(deleteNotes([n(0, 60), n(Q, 62), n(2 * Q, 64)], sel(0, 2)).map((x) => x.pitch)).toEqual([62]);
  });

  test("quantize pulls starts to the grid by its strength; with nothing selected, every note", () => {
    const notes = [n(10, 60), n(Q + 40, 62)];
    expect(quantize(notes, sel(), 24, 1, 1).notes.map((x) => x.start)).toEqual([0, Q + 48]);
    expect(quantize(notes, sel(), 24, 0.5, 1).notes.map((x) => x.start)).toEqual([5, Q + 44]);
    expect(quantize(notes, sel(1), 24, 1, 1).notes.map((x) => x.start)).toEqual([10, Q + 48]);
    expect(snap(37, 24)).toBe(48);
  });

  test("transpose moves the selection or all, held inside the MIDI range as a group", () => {
    const notes = [n(0, 60), n(Q, 120)];
    expect(transpose(notes, sel(), 12, 1).notes.map((x) => x.pitch)).toEqual([67, 127]);
    expect(transpose(notes, sel(0), -12, 1).notes.map((x) => x.pitch)).toEqual([48, 120]);
  });

  test("reverse mirrors the clip, or the selection's span", () => {
    const notes = [n(0, 60, Q), n(Q, 62, 2 * Q)];
    expect(reverse(notes, sel(), 1).notes.map((x) => [x.start, x.pitch])).toEqual([[Q, 62], [3 * Q, 60]]);
    // Span 0..3Q: the 62 (Q..3Q) goes to 0..2Q, the 60 (0..Q) to 2Q..3Q.
    const out = reverse([...notes, n(3 * Q, 64)], sel(0, 1), 1);
    expect(out.notes.map((x) => [x.start, x.pitch])).toEqual([[0, 62], [2 * Q, 60], [3 * Q, 64]]);
    expect(out.selected).toEqual(sel(0, 1));
  });

  test("legato holds each note until the next starts, the last to the clip's end", () => {
    const notes = [n(0, 60, 10), n(0, 64, 10), n(Q, 62, 10)];
    expect(legato(notes, sel(), 1).notes.map((x) => x.length)).toEqual([Q, Q, 3 * Q]);
  });

  test("double plays the notes twice in a clip twice as long, up to 8 bars", () => {
    const out = doubleNotes([n(0, 60), n(Q, 62)], 2)!;
    expect(out.bars).toBe(4);
    expect(out.notes.map((x) => x.start)).toEqual([0, Q, barTicks(2), barTicks(2) + Q]);
    expect(doubleNotes([], 5)).toBeNull();
  });

  test("a box selects the notes it touches", () => {
    const notes = [n(0, 60), n(Q, 62), n(2 * Q, 70)];
    expect(notesInBox(notes, Q / 4, Q + 1, 61, 59)).toEqual([0]);
    expect(notesInBox(notes, 0, 4 * Q, 62, 70)).toEqual([1, 2]);
  });

  test("copy and paste keep the notes' shape, and the pasted notes become the selection", () => {
    const notes = [n(Q, 60), n(2 * Q, 62, Q)];
    const clip = copyNotes(notes, sel(0, 1))!;
    expect(clip.span).toBe(2 * Q);
    const out = pasteNotes(notes, clip, 3 * Q, 1);
    expect(out.notes.map((x) => x.start)).toEqual([Q, 2 * Q, 3 * Q]); // the second pasted note is past the end
    expect([...out.selected]).toEqual([2]);
    expect(copyNotes(notes, sel())).toBeNull();
  });
});

describe("a step clip as notes", () => {
  const spb = 0.5; // 120 BPM

  test("8 sixteenths, gate and transpose, twice in a bar", () => {
    const seq = defaultNoteSeq();
    const notes = stepsToNotes({ ...seq, transpose: 2 }, 1, spb);
    const on = seq.steps.filter((s) => s.on).length;
    expect(notes.length).toBe(on * 2);
    const first = seq.steps.findIndex((s) => s.on);
    expect(notes[0]).toMatchObject({ start: (first * Q) / 4, pitch: seq.steps[first].note + 2, length: Math.round((Q / 4) * seq.gate) });
    expect(notes.every((x) => x.start + x.length <= barTicks(1))).toBe(true);
  });

  test("a slide holds its note into the next step", () => {
    const seq = defaultNoteSeq();
    seq.steps.forEach((s, i) => ((s.on = true), (s.note = 60 + i), (s.slide = i === 0)));
    const notes = stepsToNotes(seq, 1, spb);
    expect(notes[0]).toMatchObject({ start: 0, pitch: 60, length: Q / 4 });
  });

  test("scale lock's pitch is written in, and a Free clock is turned into beats", () => {
    const seq = defaultNoteSeq();
    seq.steps.forEach((s) => ((s.on = true), (s.note = 61)));
    expect(stepsToNotes(seq, 1, spb, (p) => p - 1).every((x) => x.pitch === 60)).toBe(true);
    // 4 steps a second at 120 BPM: a step every half beat.
    const free = stepsToNotes({ ...seq, free: true, hz: 4 }, 1, spb);
    expect(free.map((x) => x.start).slice(0, 3)).toEqual([0, Q / 2, Q]);
    expect(free.length).toBe(8);
  });
});
