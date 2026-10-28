// The factory songs: three short pieces on the Classics presets, so the Song view isn't empty the first time
// and shows what its clips and arrangement can do. Each is opened as a copy among your songs. The tunes are
// written for this app. The helpers that build them build the course's practice songs too.

import { emptyPattern, type Pattern } from "../audio/sequencer";
import { defaultNoteSeq, type NoteSeqSettings } from "../audio/stepSequencer";
import { FACTORY_PRESETS, factoryId, presetValues } from "../presets/presets";
import type { Placement } from "./arrangement";
import { cleanNotes, TICKS_PER_BEAT, type Clip, type Note } from "./clips";
import { DRUM_TRACK_ID, defaultTracks, type Track } from "./song";
import { readSongDoc, type SongDoc, type SongSound } from "./songDoc";

// The drums' rows (DRUM_NAMES).
export const KICK = 0;
export const SNARE = 1;
export const CLAP = 2;
export const HAT = 3;
export const OPEN_HAT = 4;
export const TOM_LO = 5;
export const TOM_HI = 6;

/** A drum bar: each drum's steps (0..15), at one velocity or one a step. */
export function beat(hits: [drum: number, steps: number[], velocity: number | number[]][]): Pattern {
  const p = emptyPattern();
  for (const [drum, steps, velocity] of hits) steps.forEach((s, i) => (p[drum][s] = Array.isArray(velocity) ? velocity[i] : velocity));
  return p;
}

/** Notes from [beat, length in beats, pitch, velocity?]; `bar` moves them along by whole bars. */
export const notes = (list: [number, number, number, number?][], bar = 0): Note[] =>
  list.map(([b, len, pitch, velocity = 100]) => ({ start: Math.round((bar * 4 + b) * TICKS_PER_BEAT), length: Math.round(len * TICKS_PER_BEAT), pitch, velocity }));

/** A chord held from a beat for some beats. */
export const chord = (b: number, len: number, pitches: number[], velocity = 80): [number, number, number, number][] => pitches.map((p) => [b, len, p, velocity]);

export const synth = (id: string, name: string, color: number): Track => ({ ...defaultTracks()[0], id, kind: "synth", name, color });

function sound(preset: string): SongSound {
  const p = FACTORY_PRESETS.find((x) => x.id === factoryId(preset));
  if (!p) throw new Error(`No preset ${preset}`);
  return { preset: p, values: presetValues(p), dirty: false };
}

export const noteClip = (id: string, track: string, name: string, bars: number, list: Note[]): Clip => ({ id, track, name, bars, kind: "notes", notes: cleanNotes(list, bars) });
export const drumClip = (id: string, name: string, patterns: Pattern[]): Clip => ({ id, track: DRUM_TRACK_ID, name, bars: patterns.length, kind: "drums", patterns });
export const stepClip = (id: string, track: string, name: string, seq: Partial<NoteSeqSettings>): Clip => ({ id, track, name, bars: 1, kind: "steps", seq: { ...defaultNoteSeq(), ...seq, enabled: true } });

let placeN = 0;
export const place = (clip: string, bar: number, bars: number, transpose = 0): Placement => ({ id: `place-${++placeN}`, clip, bar, bars, transpose });

export function song(name: string, tempo: number, tracks: Track[], sounds: Record<string, string>, clips: Clip[], placements: Placement[]): Omit<SongDoc, "id" | "modified"> {
  const doc = readSongDoc({
    name,
    tempo,
    tracks,
    clips,
    placements,
    sounds: Object.fromEntries(Object.entries(sounds).map(([t, p]) => [t, sound(p)])),
  });
  const { id: _, modified: __, ...rest } = doc;
  return rest;
}

// ------------------------------------------------------------------ Night Drive: synthwave funk in A minor

function nightDrive() {
  placeN = 0;
  const tracks = [{ ...defaultTracks()[0] }, synth("track-1", "Bass", 1), synth("track-2", "Keys", 6), synth("track-3", "Lead", 5), synth("track-4", "Pad", 2)];
  // Am7, Fmaj7, Dm7, Em7: a bar each.
  const chords = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [50, 53, 57, 60],
    [52, 55, 59, 62],
  ];
  const roots = [33, 29, 38, 40];
  const bass = roots.flatMap((r, bar) =>
    notes(
      [
        [0, 0.5, r, 110],
        [0.75, 0.25, r + 12, 90],
        [1.5, 0.25, r, 100],
        [2, 0.5, r + 7, 100],
        [3, 0.25, r, 95],
        [3.5, 0.5, r + 10, 100],
      ],
      bar,
    ),
  );
  const stabs = chords.flatMap((c, bar) => notes([...chord(1.5, 0.3, c.map((p) => p + 12), 85), ...chord(3.5, 0.3, c.map((p) => p + 12), 75)], bar));
  const pad = chords.flatMap((c, bar) => notes(chord(0, 4, c, 70), bar));
  const lead = [
    ...notes([[0, 0.5, 76], [0.75, 0.25, 79], [1, 0.5, 81], [1.5, 0.5, 79], [2, 1, 76], [3.5, 0.5, 74]], 0),
    ...notes([[0, 1, 72], [1, 0.5, 69], [1.5, 0.5, 72], [2, 1.5, 74]], 1),
    ...notes([[0, 0.5, 76], [0.5, 0.5, 81], [1, 0.5, 79], [1.5, 0.5, 76], [2, 0.5, 74], [2.5, 0.5, 72], [3, 1, 74]], 2),
    ...notes([[0, 2, 76], [2.5, 0.5, 74], [3, 1, 71]], 3),
  ];
  const groove = beat([
    [KICK, [0, 7, 10], 115],
    [SNARE, [4, 12], 105],
    [HAT, [0, 2, 4, 6, 8, 10, 12], [85, 55, 80, 55, 85, 55, 80]],
    [OPEN_HAT, [14], 70],
  ]);
  const fill = beat([
    [KICK, [0, 10], 115],
    [SNARE, [4, 12, 13, 14, 15], [100, 70, 80, 95, 110]],
    [HAT, [0, 2, 4, 6], 75],
    [TOM_HI, [8, 9], 95],
    [TOM_LO, [10, 11], 100],
  ]);
  const clips = [
    drumClip("clip-1", "Groove", [groove]),
    drumClip("clip-2", "Fill", [fill]),
    noteClip("clip-3", "track-1", "Bass line", 4, bass),
    noteClip("clip-4", "track-2", "Stabs", 4, stabs),
    noteClip("clip-5", "track-3", "Riff", 4, lead),
    noteClip("clip-6", "track-4", "Chords", 4, pad),
  ];
  const placements = [
    place("clip-6", 0, 16),
    place("clip-4", 4, 12),
    place("clip-3", 4, 12),
    place("clip-1", 4, 3),
    place("clip-2", 7, 1),
    place("clip-1", 8, 7),
    place("clip-2", 15, 1),
    place("clip-5", 8, 8),
  ];
  return song("Night Drive", 100, tracks, { "track-1": "Funk Moog Bass", "track-2": "FM Tine Piano", "track-3": "Axel Lead", "track-4": "Juno Pad" }, clips, placements);
}

// ------------------------------------------------------------------ Acid Morning: a 303 line over strings

function acidMorning() {
  placeN = 0;
  const tracks = [{ ...defaultTracks()[0] }, synth("track-1", "Acid", 4), synth("track-2", "Strings", 3)];
  const steps = (list: [number, boolean, boolean?][]) => list.map(([note, on, slide = false]) => ({ note, on, slide }));
  const line = steps([
    [45, true],
    [45, true, true],
    [57, true],
    [45, false],
    [48, true],
    [45, true, true],
    [55, true],
    [57, true],
  ]);
  const four = beat([
    [KICK, [0, 4, 8, 12], 115],
    [CLAP, [4, 12], 95],
    [HAT, [2, 6, 10, 14], 80],
    [OPEN_HAT, [14], 55],
  ]);
  const intro = beat([
    [KICK, [0, 4, 8, 12], 110],
    [HAT, [2, 6, 10, 14], 60],
  ]);
  // Am for two bars, F, G.
  const strings = notes([...chord(0, 8, [57, 60, 64], 75), ...chord(8, 4, [53, 57, 60], 75), ...chord(12, 4, [55, 59, 62], 75)]);
  const clips = [
    drumClip("clip-1", "Intro", [intro]),
    drumClip("clip-2", "Four", [four]),
    stepClip("clip-3", "track-1", "Line", { steps: line, length: 8, rate: 2, gate: 0.55 }),
    stepClip("clip-4", "track-1", "Line up", { steps: line, length: 8, rate: 2, gate: 0.55, transpose: 5 }),
    noteClip("clip-5", "track-2", "Strings", 4, strings),
  ];
  const placements = [
    place("clip-1", 0, 4),
    place("clip-2", 4, 12),
    place("clip-3", 0, 8),
    place("clip-4", 8, 4),
    place("clip-3", 12, 4),
    place("clip-5", 4, 12),
  ];
  return song("Acid Morning", 124, tracks, { "track-1": "Acid 303", "track-2": "Oxygene Strings" }, clips, placements);
}

// ------------------------------------------------------------------ Sunrise: offbeat trance chords

function sunrise() {
  placeN = 0;
  const tracks = [{ ...defaultTracks()[0] }, synth("track-1", "Bass", 1), synth("track-2", "Supersaw", 2)];
  // Am, F, C, G.
  const chords = [
    [57, 60, 64, 69],
    [57, 60, 65, 69],
    [55, 60, 64, 67],
    [55, 59, 62, 67],
  ];
  const roots = [33, 29, 36, 31];
  const offbeats = [0.5, 1.5, 2.5, 3.5];
  const stabs = chords.flatMap((c, bar) => notes(offbeats.flatMap((b) => chord(b, 0.35, c, 90)), bar));
  const bass = roots.flatMap((r, bar) => notes(offbeats.map((b): [number, number, number, number] => [b, 0.4, r, 105]), bar));
  const drums = beat([
    [KICK, [0, 4, 8, 12], 118],
    [CLAP, [4, 12], 90],
    [HAT, [2, 6, 10, 14], 85],
    [HAT, [1, 3, 5, 7, 9, 11, 13, 15], 40],
  ]);
  const build = beat([
    [KICK, [0, 4, 8, 12], 115],
    [SNARE, [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15], [50, 55, 60, 65, 70, 75, 80, 85, 95, 100, 110, 120]],
  ]);
  const clips = [
    drumClip("clip-1", "Beat", [drums]),
    drumClip("clip-2", "Build", [build]),
    noteClip("clip-3", "track-1", "Offbeat", 4, bass),
    noteClip("clip-4", "track-2", "Stabs", 4, stabs),
  ];
  const placements = [place("clip-4", 0, 16), place("clip-1", 4, 3), place("clip-2", 7, 1), place("clip-1", 8, 8), place("clip-3", 8, 8)];
  return song("Sunrise", 136, tracks, { "track-1": "Monday Bass", "track-2": "Trance Supersaw" }, clips, placements);
}

/** The factory songs, made fresh each time (a copy to open). */
export const EXAMPLE_SONGS: { name: string; about: string; make: () => Omit<SongDoc, "id" | "modified"> }[] = [
  { name: "Night Drive", about: "Synthwave funk: a Minimoog bass, DX7 stabs, a Jupiter lead and a Juno pad, 16 bars.", make: nightDrive },
  { name: "Acid Morning", about: "A 303 line from a step clip, with slides, over string-machine chords.", make: acidMorning },
  { name: "Sunrise", about: "Trance: offbeat supersaw chords and bass, with a snare build.", make: sunrise },
];
