import { describe, expect, test } from "bun:test";
import { basicBeat } from "../audio/sequencer";
import { defaultNoteSeq } from "../audio/stepSequencer";
import { barsForSteps, drumClip, noteClip, readClips, stepClip, TICKS_PER_BEAT, withBars } from "./clips";
import { defaultTracks } from "./song";

const tracks = defaultTracks();
const [DRUMS, BASS] = tracks;
const Q = TICKS_PER_BEAT;

describe("clips", () => {
  test("a step clip is a copy of the sequencer's settings, switched on", () => {
    const seq = defaultNoteSeq();
    const clip = stepClip([], BASS, seq);
    expect(clip.seq.enabled).toBe(true);
    clip.seq.steps[0].note = 30;
    expect(seq.steps[0].note).toBe(55);
  });

  test("the bars a step sequence fills before it comes round on a bar line", () => {
    const seq = defaultNoteSeq(); // 8 sixteenths: half a bar
    expect(barsForSteps(seq)).toBe(1);
    expect(barsForSteps({ ...seq, length: 3 })).toBe(3); // 3 sixteenths: 16 loops in 3 bars
    expect(barsForSteps({ ...seq, rate: 1 })).toBe(2); // 8 eighth-note triplets: 8/3 beats, 3 loops in 2 bars
    expect(barsForSteps({ ...seq, length: 5, rate: 1 })).toBe(1); // never lines up within 4 bars
    expect(barsForSteps({ ...seq, free: true })).toBe(1);
  });

  test("a longer drum clip repeats its bars; a shorter note clip loses the notes past its end", () => {
    const drums = withBars(drumClip([], DRUMS, [basicBeat()]), 3);
    expect(drums.kind === "drums" && drums.patterns.length).toBe(3);
    if (drums.kind === "drums") {
      expect(drums.patterns[2]).toEqual(basicBeat());
      drums.patterns[2][0][0] = 0;
      expect(drums.patterns[0][0][0]).toBe(110);
    }
    const notes = noteClip([], BASS, [{ start: 0, length: 8 * Q, pitch: 36, velocity: 100 }, { start: 5 * Q, length: Q, pitch: 40, velocity: 100 }], 2);
    const short = withBars(notes, 1);
    expect(short.kind === "notes" && short.notes).toEqual([{ start: 0, length: 4 * Q, pitch: 36, velocity: 100 }]);
  });

  test("clips from storage are checked", () => {
    const good = [drumClip([], DRUMS, [basicBeat()]), stepClip([], BASS)].map((c, i) => ({ ...c, id: `clip-${i + 1}` }));
    const raw = [
      ...good,
      { ...good[0] }, // the same id twice
      { ...good[1], id: "clip-9", track: "track-99" }, // its track is gone
      { ...good[0], id: "clip-8", track: BASS.id }, // a drum clip on a synth track
      { id: "clip-7", track: BASS.id, kind: "notes", bars: 99, notes: [{ start: 0, length: Q, pitch: 300, velocity: 0 }, { start: "x" }] },
      null,
    ];
    const clips = readClips(raw, tracks);
    expect(clips.map((c) => c.id)).toEqual(["clip-1", "clip-2", "clip-7"]);
    expect(clips[0]).toEqual(good[0]);
    const notes = clips[2];
    expect(notes.bars).toBe(8);
    expect(notes.kind === "notes" && notes.notes).toEqual([{ start: 0, length: Q, pitch: 127, velocity: 1 }]);
    expect(readClips("nonsense", tracks)).toEqual([]);
  });

  test("a note clip keeps its automation lanes, made to fit its length", () => {
    const clip = { ...noteClip([], BASS, [], 1), id: "clip-1", lanes: [{ target: "cutoff" as const, points: [{ tick: 0, value: 0 }, { tick: 4 * Q, value: 1 }] }] };
    expect(readClips([clip], tracks)[0]).toEqual(clip);
    expect(readClips([{ ...clip, lanes: [{ target: "nope", points: [] }] }], tracks)[0]).not.toHaveProperty("lanes");
    const longer = withBars(clip, 2);
    expect(longer.kind === "notes" && longer.lanes).toEqual(clip.lanes);
    const shorter = withBars({ ...clip, bars: 2, lanes: [{ target: "cutoff", points: [{ tick: 0, value: 0 }, { tick: 8 * Q, value: 1 }] }] }, 1);
    expect(shorter.kind === "notes" && shorter.lanes).toEqual([{ target: "cutoff", points: [{ tick: 0, value: 0 }, { tick: 4 * Q, value: 0.5 }] }]);
  });
});
