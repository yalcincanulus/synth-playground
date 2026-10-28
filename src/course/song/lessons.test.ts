import { describe, expect, test } from "bun:test";
import { PARAMS } from "../../audio/params";
import { readSongDoc } from "../../song/songDoc";
import { GUIDE_TARGETS, targetNames, type GuideState } from "./guide";
import { boldWords, lessonTexts, lessonTerms, SONG_GLOSSARY, songTerm, songTermLesson } from "./glossary";
import { SONG_LESSONS } from "./lessons";
import { COURSES, LOOP_COURSE } from "./courses";
import type { SongBody } from "./guide";
import type { Pattern } from "../../audio/sequencer";

/** What the guide sees right after a lesson opens its practice song (the Song view, stopped). */
function opened(body: SongBody): GuideState {
  const sounds: GuideState["sounds"] = {};
  for (const [id, s] of Object.entries(body.sounds)) sounds[id] = { preset: s.preset.id, dirty: false, reverb: s.values.reverbMix ?? 0, delay: s.values.delayMix ?? 0, cutoff: s.values.cutoff ?? 0 };
  return {
    view: "song",
    playing: false,
    tempo: body.tempo,
    songName: body.name,
    practice: true,
    tracks: body.tracks,
    sounds,
    selectedTrack: null,
    clips: body.clips,
    launched: Object.fromEntries(body.tracks.map((t) => [t.id, body.chosen[t.id] ?? null])),
    selectedClip: null,
    editClip: null,
    placements: body.placements,
    start: body.start,
    loop: body.loop,
    loopOn: body.loopOn,
    follow: true,
    armed: null,
    recording: false,
    rec: { countIn: false, metronome: false, mode: "overdub", quantize: -1 },
    scaleOn: false,
    arpOn: false,
    grid: 2,
    snap: true,
    browserOpen: false,
    looper: { bars: null, pads: Object.fromEntries(body.tracks.map((t) => [t.id, "off" as const])) },
    device: false,
    count: {},
  };
}

const EMPTY: SongBody = (() => {
  const { id: _, modified: __, ...body } = readSongDoc({ name: "My first song" });
  return body;
})();

describe("Make a song", () => {
  test("lesson ids are unique, and step ids within each lesson", () => {
    const all = COURSES.flatMap((c) => c.lessons);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const l of all) expect(new Set(l.steps.map((s) => s.id)).size, l.id).toBe(l.steps.length);
  });

  test("eleven lessons and the final project, which starts from an empty song", () => {
    expect(SONG_LESSONS.length).toBe(12);
    expect(SONG_LESSONS.at(-1)!.practice).toBeNull();
    expect(SONG_LESSONS.at(-1)!.milestones).toBe(true);
    for (const l of SONG_LESSONS.slice(0, -1)) expect(l.practice, l.id).not.toBeNull();
  });

  test("steps point at known targets, and name real synth controls", () => {
    for (const l of COURSES.flatMap((c) => c.lessons)) {
      for (const s of l.steps) {
        const body = l.practice ? l.practice() : EMPTY;
        for (const t of targetNames(s, () => opened(body))) expect(GUIDE_TARGETS as readonly string[], `${l.id}/${s.id}`).toContain(t.split(":")[0]);
        for (const m of [s.text, ...(s.more ?? [])].join(" ").matchAll(/\[\[(\w+)\]\]/g)) expect(PARAMS, m[1]).toHaveProperty(m[1]);
        // Short steps: one or two sentences.
        expect(s.text.split(/\s+/).length, `${l.id}/${s.id}`).toBeLessThan(45);
      }
    }
  });

  for (const lesson of COURSES.flatMap((c) => c.lessons)) {
    describe(lesson.title, () => {
      const body = lesson.practice ? lesson.practice() : EMPTY;

      test("its practice song reads back whole (nothing dropped as unreadable)", () => {
        const doc = readSongDoc(JSON.parse(JSON.stringify(body)));
        expect(doc.tracks.length).toBe(body.tracks.length);
        expect(doc.clips.length).toBe(body.clips.length);
        expect(doc.placements.length).toBe(body.placements.length);
        expect(Object.keys(doc.sounds).sort()).toEqual(Object.keys(body.sounds).sort());
        expect(doc.loopOn).toBe(body.loopOn);
      });

      test("nothing ticks by itself when it opens", () => {
        const s = opened(body);
        if (lesson.milestones) for (const step of lesson.steps) expect(step.done(s, s), step.id).toBe(false);
        else expect(lesson.steps[0].done(s, s)).toBe(false);
      });
    });
  }

  describe("the final project's milestones", () => {
    const project = SONG_LESSONS.at(-1)!;
    const tick = (id: string, change: (s: GuideState) => GuideState) => {
      const base = opened(EMPTY);
      return project.steps.find((s) => s.id === id)!.done(change(structuredClone(base)), base);
    };
    const beat: Pattern = Array.from({ length: 8 }, (_, d) => Array.from({ length: 16 }, (_, i) => (d === 0 && i % 2 === 0 ? 100 : 0)));

    test("each ticks for what it asks", () => {
      expect(tick("beat", (s) => ({ ...s, clips: [{ id: "c", track: "drums", name: "B", bars: 1, kind: "drums", patterns: [beat] }] }))).toBe(true);
      const low = [36, 38, 40, 41].map((pitch, i) => ({ start: i * 96, length: 96, pitch, velocity: 100 }));
      expect(tick("bass", (s) => ({ ...s, clips: [{ id: "c", track: "track-1", name: "B", bars: 1, kind: "notes", notes: low }] }))).toBe(true);
      expect(tick("bass", (s) => ({ ...s, clips: [{ id: "c", track: "track-1", name: "B", bars: 1, kind: "notes", notes: low.slice(1) }] }))).toBe(false);
      const triad = [60, 64, 67].map((pitch) => ({ start: 0, length: 384, pitch, velocity: 80 }));
      expect(tick("chords", (s) => ({ ...s, clips: [{ id: "c", track: "track-2", name: "C", bars: 1, kind: "notes", notes: triad }] }))).toBe(true);
      expect(tick("arranged", (s) => ({ ...s, placements: [{ id: "p", clip: "c", bar: 8, bars: 8, transpose: 0 }] }))).toBe(true);
      expect(tick("arranged", (s) => ({ ...s, placements: [{ id: "p", clip: "c", bar: 8, bars: 7, transpose: 0 }] }))).toBe(false);
      expect(tick("mix", (s) => ({ ...s, tracks: s.tracks.map((t, i) => (i === 1 ? { ...t, pan: -0.4 } : t)) }))).toBe(true);
      expect(tick("wav", (s) => ({ ...s, count: { wav: 1 } }))).toBe(true);
    });
  });

  describe("words", () => {
    test("every bold word is in the glossary", () => {
      for (const l of COURSES.flatMap((c) => c.lessons)) for (const w of boldWords(lessonTexts(l))) expect(songTerm(w), `${l.id}: ${w}`).toBeDefined();
    });

    test("every word is explained in some lesson, in under 30 words", () => {
      for (const t of SONG_GLOSSARY) {
        expect(songTermLesson(t), t.term).not.toBeNull();
        expect(t.text.split(/\s+/).length, t.term).toBeLessThan(30);
      }
    });

    test("no spelling belongs to two words", () => {
      const all = SONG_GLOSSARY.flatMap((t) => [t.term, ...(t.also ?? [])].map((w) => w.toLowerCase()));
      expect(new Set(all).size).toBe(all.length);
    });

    test("the first lesson explains the basics", () => {
      expect(lessonTerms(SONG_LESSONS[0]).map((t) => t.term)).toEqual(expect.arrayContaining(["beat", "bar", "tempo", "track", "clip", "loop", "mute", "solo"]));
    });
  });

  describe("Live looping", () => {
    const lesson = (id: string) => LOOP_COURSE.lessons.find((l) => l.id === id)!;
    const step = (l: string, id: string) => lesson(l).steps.find((s) => s.id === id)!;
    const open = (l: string) => opened(lesson(l).practice!());
    const pads = (s: GuideState, states: Record<string, string>) => ({ ...s, looper: { ...s.looper, pads: { ...s.looper.pads, ...states } } }) as GuideState;

    test("five lessons, each with a practice band", () => {
      expect(LOOP_COURSE.lessons.length).toBe(5);
      for (const l of LOOP_COURSE.lessons) expect(open(l.id).tracks.map((t) => t.name)).toEqual(["Drums", "Bass", "Chords", "Lead"]);
    });

    test("the pads' steps follow their lights", () => {
      const base = open("loop-pads");
      expect(step("loop-pads", "select").done(pads(base, { "track-2": "selected" }), base)).toBe(true);
      expect(step("loop-pads", "select").done(pads(base, { "track-1": "selected" }), base)).toBe(false);
      expect(step("loop-pads", "ready").done(pads(base, { "track-2": "ready" }), base)).toBe(true);
    });

    test("a first loop counts once its take is over, with notes, playing", () => {
      const base = open("loop-first");
      const note = { start: 0, length: 96, pitch: 40, velocity: 100 };
      const take = (s: GuideState) => ({ ...s, looper: { ...s.looper, bars: 1 }, clips: [{ id: "c", track: "track-1", name: "B", bars: 1, kind: "notes" as const, notes: [note] }] });
      expect(step("loop-first", "tap").done(pads(take(base), { "track-1": "playing" }), base)).toBe(true);
      expect(step("loop-first", "tap").done({ ...pads(take(base), { "track-1": "recording" }), recording: true }, base)).toBe(false);
      expect(step("loop-first", "tap").done(pads(base, { "track-1": "playing" }), base)).toBe(false);
    });

    test("bringing a loop back needs it stopped first", () => {
      const base = pads(open("loop-layers"), { drums: "stopped" });
      expect(step("loop-layers", "back").done(pads(base, { drums: "playing" }), base)).toBe(true);
      expect(step("loop-layers", "back").done(pads(base, { drums: "playing" }), pads(base, { drums: "playing" }))).toBe(false);
    });

    test("the fixing lesson's practice song has drums and bass ready to loop", () => {
      const body = lesson("loop-fixing").practice!();
      expect(body.chosen).toEqual({ drums: "clip-1", "track-1": "clip-2" });
      expect(body.clips.find((c) => c.id === "clip-2")!.bars).toBe(2);
    });
  });
});
