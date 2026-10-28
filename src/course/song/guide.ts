// "Make a song": lessons that teach the Song view to someone who has never made music on a computer.
//
// A lesson opens a practice song of its own (not among your songs unless you keep it) and shows its steps
// in the guide panel beside the Song view. A step ticks itself when its check holds: a plain function of
// what the app shows now (`GuideState`), and of how it was when the step began (so "add a clip" means one
// more clip than before, not any clip). Checks are plain code, so they can be tested without the app.

import type { Pattern } from "../../audio/sequencer";
import type { BarRange, Placement } from "../../song/arrangement";
import type { Clip, NoteClip } from "../../song/clips";
import type { Track } from "../../song/song";
import type { SongDoc } from "../../song/songDoc";

/** Things done that leave no trace in the song (or leave one too hard to read back), counted as they happen. */
export type GuideEvent =
  | "note" // a key played on the keyboard, the screen's keys or the MiniLab
  | "undo"
  | "redo"
  | "sendDrums" // the drum loop sent to the song
  | "sendSteps" // the step sequence sent to the song
  | "duplicate" // a clip duplicated
  | "quantize"
  | "transpose"
  | "legato"
  | "reverse"
  | "double"
  | "convert" // a step clip turned into notes
  | "take" // a recording ended
  | "makeUnique"
  | "backToArrangement"
  | "wav" // a WAV exported
  | "recordOut" // a recording of what you hear stopped
  | "songFile" // the song exported as a file
  | "link" // a link to the song copied
  | "saved"; // a practice song kept among your songs

/** What a lesson's checks can see: the song and the app, as plain data. */
export interface GuideState {
  view: string;
  playing: boolean;
  tempo: number;
  songName: string;
  /** The open song is a practice song (not kept). */
  practice: boolean;
  tracks: Track[];
  /** Each synth track's sound: the preset it started from, whether it was changed, and its effects' mix. */
  sounds: Record<string, { preset: string; dirty: boolean; reverb: number; delay: number; cutoff: number }>;
  selectedTrack: string | null;
  clips: Clip[];
  /** The clip the launcher plays on each track (null: the track plays the arrangement). */
  launched: Record<string, string | null>;
  selectedClip: string | null;
  /** The clip "Edit in Play" works on. */
  editClip: string | null;
  placements: Placement[];
  /** The bar Play starts from (from 0). */
  start: number;
  loop: BarRange | null;
  loopOn: boolean;
  follow: boolean;
  armed: string | null;
  /** A take is being recorded. */
  recording: boolean;
  rec: { countIn: boolean; metronome: boolean; mode: "overdub" | "replace"; quantize: number };
  scaleOn: boolean;
  arpOn: boolean;
  /** The piano roll's grid (an index into GRIDS) and snap. */
  grid: number;
  snap: boolean;
  browserOpen: boolean;
  /** How often each event happened since the app started. */
  count: Partial<Record<GuideEvent, number>>;
}

/** A step's check: whether it is done, from the state now and the state when the step began. */
export type Check = (now: GuideState, base: GuideState) => boolean;

/** The drawn pictures a step can show under "Tell me more". */
export type DiagramKind = "beats" | "grid" | "placements" | "automation";

export interface GuideStep {
  /** Unique within its lesson (the walkthrough test acts on it by this). */
  id: string;
  /**
   * What to do, in one or two sentences. `**word**` is a glossary word (or just bold), `[[cutoff]]` a
   * synth control, `{{…}}` an aside only shown with a MiniLab connected.
   */
  text: string;
  /** "Tell me more": the idea behind the step, in a few short paragraphs (same marks). */
  more?: string[];
  diagram?: DiagramKind;
  /**
   * The `data-guide` names of the buttons or areas the step is about, apart by spaces: they glow. A function
   * when they depend on the song (the track you added, the buttons that are on now).
   */
  target?: string | ((now: GuideState) => string);
  done: Check;
  /** The check must hold for a moment (a slider dragged through the range doesn't count on the way). */
  hold?: true;
  /** Only possible with a MiniLab (its knobs): skipped without one. */
  miniLab?: true;
}

/** A song's contents, as the example songs make them. */
export type SongBody = Omit<SongDoc, "id" | "modified">;

export interface SongLesson {
  id: string;
  title: string;
  /** One line for the list: what you will learn. */
  summary: string;
  /** A few short paragraphs before the steps (same marks as a step's text). */
  intro: string[];
  /** The practice song the lesson opens. `null`: a new empty song of your own (the final project). */
  practice: (() => SongBody) | null;
  steps: GuideStep[];
  /** The steps are milestones: each ticks by itself whenever it holds, in any order, and stays ticked. */
  milestones?: true;
  /** Said when every step is done. */
  outro: string;
}

// ------------------------------------------------------------------ helpers for checks

export const count = (s: GuideState, e: GuideEvent) => s.count[e] ?? 0;
/** The event happened since the step began. */
export const did = (e: GuideEvent): Check => (now, base) => count(now, e) > count(base, e);

export const trackOf = (s: GuideState, id: string | null | undefined) => s.tracks.find((t) => t.id === id);
export const clipOf = (s: GuideState, id: string | null | undefined) => s.clips.find((c) => c.id === id);
export const trackNamed = (s: GuideState, name: string) => s.tracks.find((t) => t.name === name);
export const clipNamed = (s: GuideState, name: string) => s.clips.find((c) => c.name === name);
/** Clips made since the step began. */
export const newClips = (now: GuideState, base: GuideState) => now.clips.filter((c) => !base.clips.some((b) => b.id === c.id));

export const noteClips = (s: GuideState) => s.clips.filter((c): c is NoteClip => c.kind === "notes");
export const noteCount = (c: Clip | undefined) => (c?.kind === "notes" ? c.notes.length : 0);
/** Drum hits in a pattern, or in a whole drum clip. */
export const hitsIn = (p: Pattern) => p.reduce((n, row) => n + row.filter((v) => v > 0).length, 0);
export const hits = (c: Clip | undefined) => (c?.kind === "drums" ? c.patterns.reduce((n, p) => n + hitsIn(p), 0) : 0);
/** The steps of one drum's row that have a hit, in the clip's first bar. */
export const drumSteps = (c: Clip | undefined, drum: number) => (c?.kind === "drums" ? c.patterns[0][drum].flatMap((v, i) => (v > 0 ? [i] : [])) : []);

/** The bar after the last placement: how long the arranged song is. */
export const songBars = (s: GuideState) => s.placements.reduce((m, p) => Math.max(m, p.bar + p.bars), 0);
export const placementsOf = (s: GuideState, clip: string) => s.placements.filter((p) => p.clip === clip);

/** The most notes a note clip starts at the same moment (3 or more: a chord). */
export function widestChord(c: NoteClip): number {
  const at = new Map<number, number>();
  for (const n of c.notes) at.set(n.start, (at.get(n.start) ?? 0) + 1);
  return Math.max(0, ...at.values());
}

/** Two values the same as data (for "the clip changed"). */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every `data-guide` name a step may point at ("mute:Lead" is the Lead track's mute: the part before ":"). */
export const GUIDE_TARGETS = [
  "play", "tempo", "keys", "view-song", "view-synth", "scale", "arp",
  "mute", "solo", "select", "sound", "add-track", "track-name", "swatch", "volume", "pan", "remove", "arm", "meter", "song-undo",
  "clips", "launch", "add-drum-clip", "add-step-clip", "clip-length", "duplicate", "edit-in-play", "convert", "step-panel",
  "record", "rec-quantize", "rec-mode",
  "drum-grid", "back-to-pattern", "send-drums", "send-steps",
  "roll", "grid", "roll-tools", "auto-lane",
  "timeline", "copy-after", "make-unique", "place-transpose", "back-arr",
  "save-song", "song-name", "wav", "wav-record", "song-export", "copy-link",
] as const;

/** A step's target names, for the app as it is now. */
export const targetNames = (step: GuideStep, now: () => GuideState): string[] =>
  (typeof step.target === "function" ? step.target(now()) : (step.target ?? "")).split(" ").filter(Boolean);

/** A target's name for one thing on screen: "mute:Lead", spaces as "_" (data-guide holds names apart by spaces). */
export const guideKey = (kind: string, name: string) => `${kind}:${name.replace(/\s+/g, "_")}`;
