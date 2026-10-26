import { describe, expect, test } from "bun:test";
import { defaultNoteSeq, FREE_HZ_MAX, LEGATO_HZ, FREE_HZ_MIN, freeHzAt, freeHzPosition, NoteSequencer, type NoteSeqSettings } from "./stepSequencer";

type Event = { type: "on" | "off"; note: number; time: number; slide?: boolean };

const SEC_PER_BEAT = 0.5; // 120 BPM

/** Run the sequencer over `beats` beats the way the drum clock does: one quarter beat at a time. */
function run(s: NoteSeqSettings, beats: number, from = 0, pitch?: (note: number) => number, secPerBeat = SEC_PER_BEAT) {
  const events: Event[] = [];
  const steps: number[] = [];
  const seq = new NoteSequencer(s, {
    noteOn: (note, _v, time, slide) => events.push({ type: "on", note, time, slide }),
    noteOff: (note, time) => events.push({ type: "off", note, time }),
  });
  seq.onStep = (step) => steps.push(step);
  if (pitch) seq.pitch = pitch;
  seq.reset();
  for (let b = from; b < from + beats - 1e-9; b += 0.25) seq.schedule(b, b + 0.25, (x) => x * secPerBeat, secPerBeat);
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

  test("pitch (scale lock) moves the transposed note, and notes that land together tie through a slide", () => {
    const s = settings({ length: 2, transpose: 1 });
    s.steps[0].slide = true;
    const down = (n: number) => n - (n % 2); // even notes only
    const { events } = run(s, 0.5, 0, down);
    // 60 + 1 and 61 + 1 become 60 and 62.
    expect(ons(events).map((e) => e.note)).toEqual([60, 62]);
    s.steps[1].note = 60;
    const tie = run(s, 0.5, 0, down).events;
    expect(ons(tie).map((e) => e.note)).toEqual([60]);
    expect(tie.filter((e) => e.type === "off").map((e) => e.note)).toEqual([60]);
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

  test("the default line: G3 C4 Bb4 Bb4 C5 C5 C5 C5", () => {
    const s = { ...defaultNoteSeq(), enabled: true };
    expect(ons(run(s, 2).events).map((e) => e.note)).toEqual([55, 60, 70, 70, 72, 72, 72, 72]);
  });
});

describe("NoteSequencer free clock", () => {
  const free = (hz: number, over: Partial<NoteSeqSettings> = {}) => settings({ free: true, hz, ...over });
  const times = (events: Event[]) => ons(events).map((e) => e.time);

  test("steps at the free speed, whatever the tempo", () => {
    // 4 steps per second: 2 beats at 120 BPM (1 s), or 2 beats at 200 BPM (0.6 s).
    times(run(free(4), 2).events).forEach((t, i) => expect(t).toBeCloseTo(i * 0.25));
    expect(times(run(free(4), 2).events).length).toBe(4);
    const fast = times(run(free(4), 2, 0, undefined, 0.3).events);
    expect(fast.length).toBe(3); // 0, 0.25, 0.5 fit in 0.6 s
    fast.forEach((t, i) => expect(t).toBeCloseTo(i * 0.25));
  });

  test("gate is a fraction of the free step", () => {
    const off = run(free(2, { gate: 0.5 }), 1).events.find((e) => e.type === "off")!;
    expect(off.time).toBeCloseTo(0.25);
  });

  test("a new speed counts from the last step played", () => {
    const s = free(4);
    const events: Event[] = [];
    const seq = new NoteSequencer(s, { noteOn: (note, _v, time) => events.push({ type: "on", note, time }), noteOff: () => {} });
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    for (let b = 0; b < 0.75; b += 0.25) tick(b); // planned up to 0.375 s: steps at 0 and 0.25
    s.hz = 8; // next step 0.125 s after the last one (0.375), then every 0.125 s
    for (let b = 0.75; b < 2; b += 0.25) tick(b);
    const got = times(events);
    [0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].forEach((t, i) => expect(got[i]).toBeCloseTo(t));
    expect(got.length).toBe(7);
  });

  test("sped up past a slice already planned, the next step plays at the start of the next slice", () => {
    const s = free(4);
    const events: Event[] = [];
    const seq = new NoteSequencer(s, { noteOn: (note, _v, time) => events.push({ type: "on", note, time }), noteOff: () => {} });
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    for (let b = 0; b < 1; b += 0.25) tick(b); // planned up to 0.5 s: steps at 0 and 0.25
    s.hz = 10; // due at 0.35, already planned past: plays at 0.5, then every 0.1 s
    tick(1);
    expect(times(events).slice(2)).toEqual([0.5, 0.6]);
  });

  test("Sync to Free carries on where the next step was due; Free to Sync lands on the tempo grid", () => {
    const s = settings({ rate: 0, hz: 3 }); // 1/8: a step every 0.25 s at 120 BPM
    const events: Event[] = [];
    const seq = new NoteSequencer(s, { noteOn: (note, _v, time) => events.push({ type: "on", note, time }), noteOff: () => {} });
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    tick(0); // Sync step at 0; the next is due at beat 0.5 (0.25 s)
    s.free = true;
    for (let b = 0.25; b < 2; b += 0.25) tick(b); // free from 0.25 s, every 1/3 s: 0.25, 0.583, 0.917
    s.free = false;
    for (let b = 2; b < 3; b += 0.25) tick(b); // next free step was due at 1.25 s = beat 2.5: Sync carries on there
    const got = times(events);
    [0, 0.25, 0.25 + 1 / 3, 0.25 + 2 / 3, 1.25].forEach((t, i) => expect(got[i]).toBeCloseTo(t));
    expect(got.length).toBe(5);
  });

  test("the knob is exponential over the whole range", () => {
    expect(freeHzAt(0)).toBeCloseTo(FREE_HZ_MIN);
    expect(freeHzAt(1)).toBeCloseTo(FREE_HZ_MAX);
    expect(freeHzPosition(freeHzAt(0.37))).toBeCloseTo(0.37);
    expect(freeHzAt(0.5)).toBeCloseTo(Math.sqrt(FREE_HZ_MIN * FREE_HZ_MAX));
  });
});

describe("NoteSequencer at legato (audio) speed", () => {
  type Ev = { type: "on" | "off" | "to"; note: number; time: number; from?: number };
  function legato(s: NoteSeqSettings, seconds: number) {
    const events: Ev[] = [];
    const steps: number[] = [];
    const seq = new NoteSequencer(s, {
      noteOn: (note, _v, time) => events.push({ type: "on", note, time }),
      noteOff: (note, time) => events.push({ type: "off", note, time }),
      pitchTo: (from, to, time) => events.push({ type: "to", from, note: to, time }),
    });
    seq.onStep = (st) => steps.push(st);
    seq.reset();
    const tick = (b: number) => seq.schedule(b, b + 0.25, (x) => x * SEC_PER_BEAT, SEC_PER_BEAT);
    let b = 0;
    const runFor = (sec: number) => {
      for (const end = b + sec / SEC_PER_BEAT; b < end - 1e-9; b += 0.25) tick(b);
    };
    runFor(seconds);
    return { events, steps, seq, runFor };
  }

  test("one note is held and each step moves its pitch: no gates, repeats and rests send nothing", () => {
    const s = settings({ free: true, hz: 400, length: 4 });
    s.steps[1].note = 60; // same as step 1: no change
    s.steps[3].on = false; // a rest holds step 3's pitch
    const { events } = legato(s, 0.125); // one slice: 50 steps
    expect(events.filter((e) => e.type === "on")).toHaveLength(1);
    expect(events.filter((e) => e.type === "off")).toHaveLength(0);
    // Steps: 60 60 62 rest | 60 60 62 rest | ...
    expect(events.slice(0, 4).map((e) => [e.type, e.note])).toEqual([
      ["on", 60],
      ["to", 62],
      ["to", 60],
      ["to", 62],
    ]);
    expect(events[1].from).toBe(60);
    expect(events[1].time).toBeCloseTo(2 / 400);
  });

  test("turned down below legato speed, the held note ends and notes with gates come back", () => {
    const s = settings({ free: true, hz: 400, length: 2 });
    const { events, runFor } = legato(s, 0.01);
    s.hz = 4;
    runFor(1);
    const after = events.slice(events.findIndex((e) => e.type === "off"));
    // The held note ends where the first slow step starts, and that step is a fresh note with its gate.
    expect(after[0].type).toBe("off");
    expect(after[1]).toMatchObject({ type: "on" });
    expect(after[1].time).toBeCloseTo(after[0].time);
    expect(after[2]).toMatchObject({ type: "off", note: after[1].note });
    expect(after[2].time - after[1].time).toBeCloseTo(0.25 * s.gate);
  });

  test("the playhead is reported at most 20 times a second", () => {
    const { steps } = legato(settings({ free: true, hz: 1000 }), 1);
    expect(steps.length).toBeLessThanOrEqual(21);
    expect(steps.length).toBeGreaterThanOrEqual(19);
  });

  test("release() ends the held note at its current pitch", () => {
    const s = settings({ free: true, hz: LEGATO_HZ * 10, length: 3 });
    const { events, seq } = legato(s, 0.125); // 50 steps through 60, 61, 62
    const last = events.at(-1)!.note;
    seq.release(5);
    expect(events.at(-1)).toEqual({ type: "off", note: last, time: 5 });
  });
});

