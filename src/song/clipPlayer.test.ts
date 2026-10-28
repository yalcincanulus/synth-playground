import { describe, expect, test } from "bun:test";
import type { Ticker } from "../audio/clock";
import { emptyPattern, Sequencer } from "../audio/sequencer";
import { defaultNoteSeq, NoteSequencer } from "../audio/stepSequencer";
import { drumClip, noteClip, stepClip, TICKS_PER_BEAT, type Clip } from "./clips";
import { ClipPlayer } from "./clipPlayer";
import { defaultTracks } from "./song";

const [DRUMS, BASS, CHORDS] = defaultTracks();
const Q = TICKS_PER_BEAT;

type Event = { type: "on" | "off" | "drum" | "pitch"; track: string; note: number; time: number; velocity?: number };

/** A Sequencer on a fake audio clock with a ClipPlayer on it; `run` advances the clock in 25 ms ticks. */
function setup(clips: Clip[] = []) {
  const host = { ctx: { currentTime: 0 }, bpm: 120, drums: { trigger: (track: number, _v: number, time: number) => toyHits.push([track, time]) } };
  const toyHits: [number, number][] = [];
  const ticker: Ticker = { start() {}, stop() {} };
  const seq = new Sequencer(host, ticker);
  seq.pattern = emptyPattern();
  const events: Event[] = [];
  const player = new ClipPlayer(
    {
      noteOn: (track, note, velocity, time) => events.push({ type: "on", track, note, time, velocity }),
      noteOff: (track, note, time) => events.push({ type: "off", track, note, time }),
      pitchTo: (track, _from, note, time) => events.push({ type: "pitch", track, note, time }),
      drum: (pad, velocity, time) => events.push({ type: "drum", track: "drums", note: pad, time, velocity }),
    },
    (id) => clips.find((c) => c.id === id),
  );
  seq.clips = player;
  const run = (seconds: number) => {
    for (const end = host.ctx.currentTime + seconds; host.ctx.currentTime < end - 1e-9; ) {
      host.ctx.currentTime += 0.025;
      seq.schedule();
    }
  };
  /** The audio time of a beat, for a transport started at time 0 (the first beat comes 50 ms after Play). */
  const beat = (b: number, bpm = 120) => 0.05 + (b * 60) / bpm;
  return { host, seq, player, events, run, beat, toyHits, clips };
}

const ons = (events: Event[], track?: string) => events.filter((e) => e.type === "on" && (!track || e.track === track));
const offs = (events: Event[], track?: string) => events.filter((e) => e.type === "off" && (!track || e.track === track));

/** Every note-on has a note-off at or after it, and no note-off is left over. Events at the same time count in the order sent, as the engine takes them. */
function balanced(events: Event[]) {
  const open = new Map<string, number[]>();
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    const key = `${e.track}:${e.note}`;
    if (e.type === "on") open.set(key, [...(open.get(key) ?? []), e.time]);
    if (e.type === "off") {
      const starts = open.get(key) ?? [];
      expect(starts.length).toBeGreaterThan(0);
      expect(e.time).toBeGreaterThanOrEqual(starts[0] - 1e-9);
      starts.shift();
    }
  }
  for (const starts of open.values()) expect(starts.length).toBe(0);
}

describe("clip data", () => {
  test("a note clip keeps its notes inside it, in order", () => {
    const clip = noteClip([], BASS, [
      { start: 2 * Q, length: Q, pitch: 40, velocity: 90 },
      { start: 0, length: 8 * Q, pitch: 36, velocity: 100 },
      { start: 4 * Q, length: Q, pitch: 48, velocity: 100 },
    ]);
    expect(clip.notes.map((n) => n.pitch)).toEqual([36, 40]);
    expect(clip.notes[0].length).toBe(4 * Q);
  });

  test("ids and names are fresh per track", () => {
    const a = drumClip([], DRUMS);
    const b = drumClip([a], DRUMS);
    const c = stepClip([a, b], BASS);
    expect([a.id, b.id, c.id]).toEqual(["clip-1", "clip-2", "clip-3"]);
    expect([a.name, b.name, c.name]).toEqual(["Drums 1", "Drums 2", "Bass 1"]);
  });
});

describe("clip player", () => {
  test("a drum clip plays its steps at exact times and loops at its end", () => {
    const clip = drumClip([], DRUMS);
    clip.patterns[0][0][0] = 100; // kick on beat 1
    clip.patterns[0][1][4] = 90; // snare on beat 2
    const { player, seq, events, run, beat } = setup([clip]);
    player.launch(DRUMS.id, clip.id);
    seq.start();
    run(4.5); // a little over two bars at 120 BPM
    const hits = events.filter((e) => e.type === "drum");
    expect(hits.map((h) => h.note)).toEqual([0, 1, 0, 1, 0, 1]);
    const expected = [0, 1, 4, 5, 8, 9].map((b) => beat(b));
    hits.forEach((h, i) => expect(h.time).toBeCloseTo(expected[i], 9));
  });

  test("a note clip: exact times across its end, and notes cut at the end of the clip", () => {
    const clip = noteClip([], BASS, [
      { start: 0, length: Q, pitch: 36, velocity: 100 },
      { start: 3 * Q, length: 4 * Q, pitch: 43, velocity: 80 }, // held past the clip's end
    ]);
    const { player, seq, events, run, beat } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(4.2);
    const on = ons(events).filter((e) => e.time < beat(8) - 1e-9);
    expect(on.map((e) => [e.note, e.velocity])).toEqual([
      [36, 100],
      [43, 80],
      [36, 100],
      [43, 80],
    ]);
    [0, 3, 4, 7].forEach((b, i) => expect(on[i].time).toBeCloseTo(beat(b), 9));
    const off43 = offs(events).filter((e) => e.note === 43);
    expect(off43[0].time).toBeCloseTo(beat(4), 9);
    seq.stop();
    balanced(events);
  });

  test("a tempo change mid-clip: later notes follow the new tempo, from where the clip is", () => {
    const clip = noteClip([], BASS, [0, 1, 2, 3].map((b) => ({ start: b * Q, length: Q / 2, pitch: 40, velocity: 100 })));
    const { host, player, seq, events, run, beat } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(beat(2) - 0.06); // planned up to just past beat 2
    host.bpm = 60;
    run(6);
    const t = ons(events).map((e) => e.time);
    // Beats 0-2 at 120 BPM. The 16th after beat 2 was already planned at the old tempo, the rest of the beat
    // lasts 3/4 s at the new one; from then on each beat lasts a second.
    [0, 1, 2].forEach((b, i) => expect(t[i]).toBeCloseTo(beat(b), 9));
    expect(t[3] - t[2]).toBeCloseTo(0.125 + 0.75, 9);
    for (let i = 4; i < t.length; i++) expect(t[i] - t[i - 1]).toBeCloseTo(1, 9);
    expect(t.length).toBeGreaterThan(6);
    seq.stop();
    balanced(events);
  });

  test("a long run: no note late or lost, and every note-on has its note-off", () => {
    const notes = noteClip([], BASS, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ start: (i * Q) / 2, length: Q / 2, pitch: 36 + i, velocity: 100 })));
    const steps = stepClip([notes], CHORDS, { ...defaultNoteSeq(), enabled: true });
    const clips = [notes, steps];
    const { player, seq, events, run } = setup(clips);
    player.launch(BASS.id, notes.id);
    player.launch(CHORDS.id, steps.id);
    seq.start();
    run(120); // two minutes, 60 bars
    expect(seq.timing.lateSteps).toBe(0);
    // 8 notes a bar on the bass, 8 sixteenths a half-bar on the step clip (defaultNoteSeq: all steps on).
    const bars = 60;
    expect(ons(events, BASS.id).length).toBeGreaterThanOrEqual(8 * bars - 8);
    expect(ons(events, CHORDS.id).length).toBeGreaterThanOrEqual(16 * bars - 16);
    seq.stop();
    balanced(events);
  });

  test("Stop ends every note at once, even one held longer", () => {
    const clip = noteClip([], BASS, [{ start: 0, length: 16 * Q, pitch: 36, velocity: 100 }], 4);
    const { host, player, seq, events, run } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(1);
    seq.stop();
    const off = offs(events);
    expect(off.length).toBe(1);
    expect(off[0].time).toBeCloseTo(host.ctx.currentTime, 9);
    balanced(events);
  });

  test("a clip chosen while playing starts on the next bar, and the old one ends there", () => {
    const a = noteClip([], BASS, [{ start: 0, length: 16 * Q, pitch: 36, velocity: 100 }], 4);
    const b = noteClip([a], BASS, [{ start: 0, length: Q, pitch: 48, velocity: 100 }]);
    const { player, seq, events, run, beat } = setup([a, b]);
    const changes: [string | null, number][] = [];
    player.onChange = (_t, clip, time) => changes.push([clip, time]);
    player.launch(BASS.id, a.id);
    seq.start();
    run(1); // in bar 1 (beat 2 at 120 BPM)
    player.launch(BASS.id, b.id);
    expect(player.state(BASS.id)).toEqual({ clip: a.id, next: b.id });
    run(2);
    expect(offs(events).find((e) => e.note === 36)!.time).toBeCloseTo(beat(4), 9);
    expect(ons(events).find((e) => e.note === 48)!.time).toBeCloseTo(beat(4), 9);
    expect(changes).toEqual([[b.id, beat(4)]]);
    // Stopping the track also waits for the bar.
    player.launch(BASS.id, null);
    run(2);
    expect(changes[1][0]).toBe(null);
    expect(changes[1][1]).toBeCloseTo(beat(8), 9);
    balanced(events);
  });

  test("a deleted clip falls silent; its held notes end", () => {
    const clip = noteClip([], BASS, [{ start: 0, length: 4 * Q, pitch: 36, velocity: 100 }]);
    const { player, seq, events, run, clips } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(0.5);
    clips.length = 0;
    run(0.5);
    expect(player.state(BASS.id).clip).toBe(null);
    balanced(events);
  });

  test("a step clip with slides: the slid note is held into the next and ends at the clip's end", () => {
    const s = { ...defaultNoteSeq(), enabled: true, length: 4 };
    s.steps[3].slide = true; // the last step slides into step 1 of the next time round…
    const clip = stepClip([], BASS, s, 1); // …but 4 sixteenths loop 4 times a bar: only the bar's last is cut
    const { player, seq, events, run, beat } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(2.2);
    const slides = events.filter((e) => e.type === "on").length;
    expect(slides).toBeGreaterThan(8);
    // Each time round starts again from step 1, so step 4's slide is let go at the bar line.
    const atBar = offs(events).filter((e) => Math.abs(e.time - beat(4)) < 1e-9);
    expect(atBar.length).toBeGreaterThanOrEqual(1);
    seq.stop();
    balanced(events);
  });

  test("a step clip on a Free clock starts from step 1 at each start of the clip", () => {
    const s = { ...defaultNoteSeq(), enabled: true, free: true, hz: 2.7 }; // 5.4 steps in a 2 s bar
    s.steps.forEach((st, i) => (st.note = 60 + i));
    const clip = stepClip([], BASS, s, 1);
    const { player, seq, events, run, beat } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(4.2);
    const on = ons(events);
    const firstOfBar = (b: number) => on.find((e) => Math.abs(e.time - beat(b)) < 1e-9);
    expect(firstOfBar(0)?.note).toBe(60);
    expect(firstOfBar(4)?.note).toBe(60);
    // The free clock ignores the tempo: a third of a second apart inside the bar.
    expect(on[1].time - on[0].time).toBeCloseTo(1 / 2.7, 9);
    seq.stop();
    balanced(events);
  });

  test("toys and clips on one clock: the drum loop, the step sequencer and clips land together", () => {
    const clip = drumClip([], DRUMS);
    for (const s of [0, 4, 8, 12]) clip.patterns[0][0][s] = 100;
    const { host, seq, player, events, run, toyHits } = setup([clip]);
    for (const s of [0, 4, 8, 12]) seq.pattern[1][s] = 100;
    const toyNotes: number[] = [];
    seq.notes = new NoteSequencer({ ...defaultNoteSeq(), enabled: true, rate: 0 }, { noteOn: (_n, _v, t) => toyNotes.push(t), noteOff: () => {} });
    seq.notes.reset();
    player.launch(DRUMS.id, clip.id);
    seq.start();
    run(4);
    const clipHits = events.filter((e) => e.type === "drum").map((e) => e.time);
    const toy = toyHits.map(([, t]) => t);
    expect(clipHits.length).toBeGreaterThan(6);
    clipHits.forEach((t, i) => expect(t).toBeCloseTo(toy[i], 9));
    // The step sequencer's 1/8 notes fall on every other drum step: each beat is on both.
    for (const t of clipHits) expect(toyNotes.some((n) => Math.abs(n - t) < 1e-9)).toBe(true);
    expect(host.ctx.currentTime).toBeGreaterThan(3.9);
  });

  test("Play starts every chosen clip again from bar 1; Stop keeps the choice", () => {
    const clip = noteClip([], BASS, [{ start: 0, length: Q, pitch: 36, velocity: 100 }], 2);
    const { player, seq, events, run } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(1);
    seq.stop();
    expect(player.chosen).toEqual({ [BASS.id]: clip.id });
    events.length = 0;
    const t0 = 2;
    run(t0 - 1);
    seq.start();
    run(0.5);
    expect(ons(events).length).toBe(1);
  });
});
