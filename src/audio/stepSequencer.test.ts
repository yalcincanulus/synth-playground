import { describe, expect, test } from "bun:test";
import { defaultNoteSeq, NoteSequencer, type NoteSeqSettings } from "./stepSequencer";

type Event = { type: "on" | "off"; note: number; time: number; slide?: boolean };

const SEC_PER_BEAT = 0.5; // 120 BPM

/** Run the sequencer over `beats` beats the way the drum clock does: one quarter beat at a time. */
function run(s: NoteSeqSettings, beats: number, from = 0) {
  const events: Event[] = [];
  const steps: number[] = [];
  const seq = new NoteSequencer(s, {
    noteOn: (note, _v, time, slide) => events.push({ type: "on", note, time, slide }),
    noteOff: (note, time) => events.push({ type: "off", note, time }),
  });
  seq.onStep = (step) => steps.push(step);
  seq.reset();
  for (let b = from; b < from + beats - 1e-9; b += 0.25) seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
  return { events, steps, seq };
}

function settings(over: Partial<NoteSeqSettings> = {}): NoteSeqSettings {
  const s = defaultNoteSeq();
  s.steps.forEach((st, i) => {
    st.note = 60 + i;
    st.on = true;
    st.slide = false;
  });
  return { ...s, enabled: true, ...over };
}

const ons = (events: Event[]) => events.filter((e) => e.type === "on");

describe("NoteSequencer", () => {
  test("plays 16th notes forward and wraps at the length", () => {
    const { events, steps } = run(settings({ length: 3 }), 2);
    expect(steps).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
    expect(ons(events).map((e) => e.note)).toEqual([60, 61, 62, 60, 61, 62, 60, 61]);
    expect(ons(events).map((e) => e.time)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
  });

  test("releases each note after the gate", () => {
    const { events } = run(settings({ gate: 0.5 }), 0.5);
    const off = events.find((e) => e.type === "off" && e.note === 60)!;
    expect(off.time).toBeCloseTo(0.0625);
  });

  test("backward and ping-pong directions", () => {
    expect(run(settings({ length: 4, direction: 1 }), 2).steps).toEqual([3, 2, 1, 0, 3, 2, 1, 0]);
    expect(run(settings({ length: 4, direction: 2 }), 2.5).steps).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
  });

  test("random direction stays inside the length", () => {
    const { steps } = run(settings({ length: 5, direction: 3 }), 16);
    expect(steps.every((s) => s >= 0 && s < 5)).toBe(true);
    expect(new Set(steps).size).toBeGreaterThan(1);
  });

  test("rests play nothing", () => {
    const s = settings({ length: 4 });
    s.steps[1].on = false;
    expect(ons(run(s, 1).events).map((e) => e.note)).toEqual([60, 62, 63]);
  });

  test("a slide holds the note into the next step and glides there", () => {
    const s = settings({ length: 2 });
    s.steps[0].slide = true;
    const { events } = run(s, 0.5);
    // Step 2 starts (with slide) before step 1 is released, both at the step boundary.
    expect(events.slice(0, 3)).toEqual([
      { type: "on", note: 60, time: 0, slide: false },
      { type: "on", note: 61, time: 0.125, slide: true },
      { type: "off", note: 60, time: 0.125 },
    ]);
  });

  test("a slide into the same note is a tie: no new note", () => {
    const s = settings({ length: 2 });
    s.steps[1].note = 60;
    s.steps[0].slide = true;
    const { events } = run(s, 0.5);
    expect(ons(events).map((e) => e.time)).toEqual([0]);
  });

  test("a slide into a rest releases normally", () => {
    const s = settings({ length: 2 });
    s.steps[0].slide = true;
    s.steps[1].on = false;
    const off = run(s, 0.25).events.find((e) => e.type === "off")!;
    expect(off.time).toBeCloseTo(0.0625);
  });

  test("transpose shifts every note", () => {
    const { events } = run(settings({ length: 2, transpose: -12 }), 0.5);
    expect(ons(events).map((e) => e.note)).toEqual([48, 49]);
  });

  test("rates: 1/8 and 1/16 triplets", () => {
    expect(ons(run(settings({ rate: 0 }), 1).events).map((e) => e.time)).toEqual([0, 0.25]);
    const triplets = ons(run(settings({ rate: 3 }), 1).events).map((e) => e.time);
    expect(triplets.length).toBe(6);
    triplets.forEach((t, i) => expect(t).toBeCloseTo((i * SEC_PER_BEAT) / 6));
  });

  test("changing the rate while playing lands on the new grid", () => {
    const s = settings();
    const events: Event[] = [];
    const seq = new NoteSequencer(s, { noteOn: (note, _v, time) => events.push({ type: "on", note, time }), noteOff: () => {} });
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    tick(0);
    tick(0.25); // 16ths at beats 0 and 0.25
    s.rate = 0; // 1/8: the next step must be on a multiple of half a beat
    for (let b = 0.5; b < 2; b += 0.25) tick(b);
    expect(ons(events).map((e) => e.time / SEC_PER_BEAT)).toEqual([0, 0.25, 0.5, 1, 1.5]);
  });

  test("switched off, it releases a held slide; switched back on, it restarts on the next beat", () => {
    const s = settings({ length: 2 });
    s.steps[0].slide = true;
    const events: Event[] = [];
    const steps: number[] = [];
    const seq = new NoteSequencer(s, {
      noteOn: (note, _v, time) => events.push({ type: "on", note, time }),
      noteOff: (note, time) => events.push({ type: "off", note, time }),
    });
    seq.onStep = (st) => steps.push(st);
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    tick(0); // step 1 plays and is held by its slide
    s.enabled = false;
    tick(0.25);
    expect(events.at(-1)).toEqual({ type: "off", note: 60, time: 0.125 });
    tick(0.5);
    s.enabled = true;
    tick(0.75); // mid-beat: waits for beat 1
    tick(1);
    expect(steps).toEqual([0, 0]);
    expect(events.filter((e) => e.type === "on").at(-1)!.time).toBe(1 * SEC_PER_BEAT);
  });

  test("release() lets go of a note held by a slide", () => {
    const s = settings({ length: 2 });
    s.steps[0].slide = true;
    const { events, seq } = run(s, 0.25);
    seq.release(9);
    expect(events.at(-1)).toEqual({ type: "off", note: 60, time: 9 });
  });
});
