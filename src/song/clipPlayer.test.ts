import { describe, expect, test } from "bun:test";
import type { Ticker } from "../audio/clock";
import { emptyPattern, Sequencer } from "../audio/sequencer";
import { defaultNoteSeq, NoteSequencer } from "../audio/stepSequencer";
import { drumClip, noteClip, stepClip, TICKS_PER_BEAT, type Clip } from "./clips";
import { ClipPlayer } from "./clipPlayer";
import type { Placement } from "./arrangement";
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
  /** Automation: a value from a time, or (null) back to the track's own. */
  const autos: { track: string; target: string; value: number | null; time: number }[] = [];
  const player = new ClipPlayer(
    {
      noteOn: (track, note, velocity, time) => events.push({ type: "on", track, note, time, velocity }),
      noteOff: (track, note, time) => events.push({ type: "off", track, note, time }),
      pitchTo: (track, _from, note, time) => events.push({ type: "pitch", track, note, time }),
      drum: (pad, velocity, time) => events.push({ type: "drum", track: "drums", note: pad, time, velocity }),
      automate: (track, target, value, time) => autos.push({ track, target, value, time }),
      endAutomation: (track, target, time) => autos.push({ track, target, value: null, time }),
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
  return { host, seq, player, events, autos, run, beat, toyHits, clips };
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

  test("a step clip turned into notes while it plays: a note held by a slide ends, and the notes play", () => {
    const s = { ...defaultNoteSeq(), enabled: true };
    s.steps.forEach((st) => (st.slide = true)); // every note is held into the next
    const clip = stepClip([], BASS, s, 1);
    const clips: Clip[] = [clip];
    const { player, seq, events, run } = setup(clips);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(0.6);
    clips[0] = { id: clip.id, track: clip.track, name: clip.name, bars: 1, kind: "notes", notes: [{ start: 0, length: Q, pitch: 40, velocity: 100 }] };
    run(2.5);
    seq.stop();
    // Let go where the notes take over (within the lookahead), not at the end of the bar.
    const stepOffs = offs(events).filter((e) => e.note !== 40);
    expect(Math.max(...stepOffs.map((e) => e.time))).toBeLessThan(1);
    expect(ons(events).some((e) => e.note === 40)).toBe(true);
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

describe("the arrangement", () => {
  /** A player whose arrangement is `places` (bass and chords clips), on the fake clock. */
  function arranged(clips: Clip[], places: Placement[]) {
    const s = setup(clips);
    s.player.arrangement = () => {
      const m = new Map<string, Placement[]>();
      for (const p of places) {
        const track = clips.find((c) => c.id === p.clip)!.track;
        m.set(track, [...(m.get(track) ?? []), p]);
      }
      return m;
    };
    return s;
  }
  const bassClip = () => noteClip([], BASS, [{ start: 0, length: Q / 2, pitch: 40, velocity: 100 }], 1);

  test("a placement plays its clip from its bar, again for each of its bars, transposed", () => {
    const clip = bassClip();
    const { seq, events, run, beat } = arranged([clip], [{ id: "p", clip: clip.id, bar: 1, bars: 3, transpose: 2 }]);
    seq.start();
    run(10);
    const got = ons(events, BASS.id).map((e) => [e.note, e.time]);
    expect(got.map(([n]) => n)).toEqual([42, 42, 42]);
    [4, 8, 12].forEach((b, i) => expect(got[i][1]).toBeCloseTo(beat(b), 9));
    balanced(events);
  });

  test("a placement longer than its clip cuts its last time round at its end", () => {
    const clip = noteClip([], BASS, [{ start: 4 * Q + Q, length: 2 * Q, pitch: 40, velocity: 100 }], 2);
    const { seq, events, run, beat } = arranged([clip], [{ id: "p", clip: clip.id, bar: 0, bars: 3, transpose: 0 }]);
    seq.start();
    run(8);
    // Bar 2's note (beat 5) plays; bar 4 of the clip is never reached (cut at bar 3).
    expect(ons(events, BASS.id).map((e) => e.time)).toEqual([beat(5)]);
    balanced(events);
  });

  test("Play from a bar: the arrangement starts there, mid-placement too", () => {
    const clip = bassClip();
    const { seq, player, events, run, beat } = arranged([clip], [{ id: "p", clip: clip.id, bar: 0, bars: 8, transpose: 0 }]);
    player.from = 2 * 4 + 2; // two beats into bar 3
    seq.start();
    run(3);
    expect(ons(events, BASS.id)[0].time).toBeCloseTo(beat(2), 9);
    expect(player.songBeat(0)).toBe(10);
  });

  test("a loop region plays over and over, and a note held at its end ends there", () => {
    const clip = noteClip([], BASS, [{ start: 3 * Q, length: 4 * Q, pitch: 40, velocity: 100 }], 1);
    const { seq, player, events, run, beat } = arranged([clip], [{ id: "p", clip: clip.id, bar: 0, bars: 8, transpose: 0 }]);
    player.clock.loop = { start: 4, end: 12 };
    seq.start();
    run(12);
    const times = ons(events, BASS.id).map((e) => e.time);
    // Song beats 3, 7, 11, then the loop: 15→7, 19→11, ...
    [3, 7, 11, 15, 19].forEach((b, i) => expect(times[i]).toBeCloseTo(beat(b), 9));
    const firstOff = offs(events, BASS.id)[0].time;
    expect(firstOff).toBeCloseTo(beat(4), 9);
    balanced(events);
  });

  test("a clip from the launcher takes over the track on the next bar; stopped, the arrangement comes back", () => {
    const clip = bassClip();
    const other = noteClip([clip], BASS, [{ start: 0, length: Q / 2, pitch: 50, velocity: 100 }], 1);
    const { seq, player, events, run, beat } = arranged([clip, other], [{ id: "p", clip: clip.id, bar: 0, bars: 16, transpose: 0 }]);
    seq.start();
    run(1.2);
    player.launch(BASS.id, other.id);
    run(2);
    player.launch(BASS.id, null);
    run(2.5);
    const got = ons(events, BASS.id).map((e) => e.note);
    expect(got).toEqual([40, 50, 40]);
    expect(ons(events, BASS.id)[1].time).toBeCloseTo(beat(4), 9);
    expect(ons(events, BASS.id)[2].time).toBeCloseTo(beat(8), 9);
    balanced(events);
  });

  test("a gap between placements is silent, and Stop ends what sounds", () => {
    const clip = noteClip([], BASS, [{ start: 0, length: 16 * Q, pitch: 40, velocity: 100 }], 4);
    const { seq, events, run, host } = arranged([clip], [{ id: "a", clip: clip.id, bar: 0, bars: 1, transpose: 0 }, { id: "b", clip: clip.id, bar: 3, bars: 1, transpose: 0 }]);
    seq.start();
    run(7);
    expect(ons(events, BASS.id).length).toBe(2);
    run(0.3);
    seq.stop();
    expect(offs(events, BASS.id).at(-1)!.time).toBeLessThanOrEqual(host.ctx.currentTime + 1e-9);
    balanced(events);
  });

  test("a placement removed while it plays: its note ends at once", () => {
    const clip = noteClip([], BASS, [{ start: 0, length: 16 * Q, pitch: 40, velocity: 100 }], 4);
    const places: Placement[] = [{ id: "a", clip: clip.id, bar: 0, bars: 4, transpose: 0 }];
    const { seq, events, run, host } = arranged([clip], places);
    seq.start();
    run(1);
    places.length = 0;
    run(0.3);
    expect(offs(events, BASS.id)[0].time).toBeLessThan(host.ctx.currentTime + 0.2);
    balanced(events);
  });
});

describe("automation", () => {
  /** A 1-bar note clip whose Cutoff lane rises from 0 to 1 over its first 2 beats, then holds. */
  const sweep = () => ({ ...noteClip([], BASS, [{ start: 0, length: Q, pitch: 40, velocity: 100 }], 1), lanes: [{ target: "cutoff" as const, points: [{ tick: 0, value: 0 }, { tick: 2 * Q, value: 1 }] }] });

  test("a lane plays at exact times, the same every time round, and only sends changes", () => {
    const clip = sweep();
    const { player, seq, autos, run, beat } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(4.2); // two times round
    const sent = autos.filter((a) => a.value !== null && a.time < beat(8) - 1e-9);
    const round = (r: number) => sent.filter((a) => a.time >= beat(4 * r) - 1e-9 && a.time < beat(4 * r + 4) - 1e-9);
    const [one, two] = [round(0), round(1)];
    expect(one.length).toBeGreaterThan(10);
    expect(two.map((a) => a.value)).toEqual(one.map((a) => a.value));
    two.forEach((a, i) => expect(a.time - one[i].time).toBeCloseTo(beat(4) - beat(0), 9));
    expect(one[0]).toMatchObject({ track: BASS.id, target: "cutoff", value: 0 });
    expect(one[0].time).toBeCloseTo(beat(0), 9);
    // Beat 1 is halfway up; from beat 2 on it holds, so nothing more is sent until the next time round.
    expect(one.find((a) => Math.abs(a.time - beat(1)) < 1e-9)?.value).toBeCloseTo(0.5, 9);
    expect(one[one.length - 1].value).toBe(1);
    expect(one[one.length - 1].time).toBeCloseTo(beat(2), 9);
  });

  test("Stop gives the setting back to the track", () => {
    const clip = sweep();
    const { player, seq, autos, run } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(1);
    seq.stop();
    const last = autos[autos.length - 1];
    expect(last).toMatchObject({ target: "cutoff", value: null });
    expect(last.time).toBeCloseTo(1, 1);
  });

  test("a lane deleted while it plays gives its setting back; a knob being recorded keeps its lane quiet", () => {
    const clip = sweep();
    const { player, seq, autos, run } = setup([clip]);
    player.launch(BASS.id, clip.id);
    seq.start();
    run(0.5);
    player.touch(BASS.id, "cutoff", true);
    const n = autos.length;
    run(1);
    expect(autos.length).toBe(n);
    player.touch(BASS.id, "cutoff", false);
    run(0.2);
    expect(autos.length).toBeGreaterThan(n);
    clip.lanes = [];
    run(0.2);
    expect(autos[autos.length - 1]).toMatchObject({ target: "cutoff", value: null });
  });
});

describe("launching on the loop grid", () => {
  test("a clip can wait for its loop's next time round, or start partway through one that began on a given beat", () => {
    const a = noteClip([], BASS, [{ start: 0, length: Q, pitch: 36, velocity: 100 }], 2);
    const b = noteClip([a], CHORDS, [{ start: 0, length: Q, pitch: 60, velocity: 100 }, { start: 6 * Q, length: Q, pitch: 62, velocity: 100 }], 2);
    const { player, seq, events, run, beat } = setup([a, b]);
    player.launch(BASS.id, a.id);
    seq.start();
    run(1.1); // beat ~2: rounds of 2 bars from beat 0
    player.launch(CHORDS.id, b.id, { origin: 0, period: 8 });
    run(3);
    // Not on the next bar (beat 4) but on the next round (beat 8).
    expect(ons(events, CHORDS.id)[0].time).toBeCloseTo(beat(8), 9);
    // Stopped, then started partway through a round that began on beat 16: the note on beat 22 plays, the one on 16 doesn't.
    player.launch(CHORDS.id, null);
    run(5.5); // beat ~19
    player.launch(CHORDS.id, b.id, { start: 16 });
    run(3);
    const later = ons(events, CHORDS.id).filter((e) => e.time > beat(15));
    expect(later.map((e) => e.note)).toEqual([62, 60]);
    expect(later[0].time).toBeCloseTo(beat(22), 9);
    expect(later[1].time).toBeCloseTo(beat(24), 9);
    // The log: what the launcher played and from when, its time rounds counted from `start`.
    expect(player.log.filter((e) => e.track === CHORDS.id).map((e) => [e.clip, e.start])).toEqual([
      [b.id, 8],
      [null, 12],
      [b.id, 16],
    ]);
    expect(player.log[0]).toEqual({ track: BASS.id, clip: a.id, at: 0, start: 0 });
    balanced(events);
  });
});
