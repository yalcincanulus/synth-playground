// A song's clips, as plain data: short patterns that belong to one track and loop on it. Three kinds, each
// reusing what the Play view already plays: a drum clip holds drum loop patterns, a step clip the step
// sequencer's settings, a note clip free notes (for the piano roll). Plain code, so it is tested without a browser.

import { emptyPattern, STEPS, TRACKS as DRUMS, type Pattern } from "../audio/sequencer";
import { clampHz, defaultNoteSeq, DIRECTIONS, NOTE_STEPS, RATES, type NoteSeqSettings } from "../audio/stepSequencer";
import { MAX_NAME, type Track } from "./song";

/** Note positions and lengths are counted in ticks: this many a beat. */
export const TICKS_PER_BEAT = 96;
/** 4/4 only, for now. */
export const BEATS_PER_BAR = 4;

export type ClipKind = "drums" | "steps" | "notes";

interface ClipBase {
  /** Stays the same for good ("clip-4"). */
  id: string;
  /** The track it belongs to (its id). */
  track: string;
  name: string;
  /** Length in bars; the clip loops after it. */
  bars: number;
}

/** The drum loop's patterns, one a bar (16 steps a bar, 8 drums). */
export interface DrumClip extends ClipBase {
  kind: "drums";
  patterns: Pattern[];
}

/** The step sequencer's settings, played by a NoteSequencer of its own, from step 1 at each start of the clip. */
export interface StepClip extends ClipBase {
  kind: "steps";
  seq: NoteSeqSettings;
}

export interface Note {
  /** Ticks from the start of the clip. */
  start: number;
  /** Ticks. */
  length: number;
  /** MIDI note number. */
  pitch: number;
  /** 1..127. */
  velocity: number;
}

export interface NoteClip extends ClipBase {
  kind: "notes";
  /** In order of start. */
  notes: Note[];
}

export type Clip = DrumClip | StepClip | NoteClip;

export const MAX_BARS: Record<ClipKind, number> = { drums: 4, steps: 8, notes: 8 };
export const CLIP_KIND_NAMES: Record<ClipKind, string> = { drums: "Drum clip", steps: "Step clip", notes: "Note clip" };

/** Whether a clip of this kind can go on this track: drum clips on the drum track, the others on synth tracks. */
export const fitsTrack = (kind: ClipKind, track: Track) => (kind === "drums") === (track.kind === "drums");

/** A clip's length in beats. */
export const clipBeats = (clip: Clip) => clip.bars * BEATS_PER_BAR;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : fallback);
const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A fresh clip id, not taken by any of `clips`. */
export function newClipId(clips: readonly Clip[]): string {
  let n = 1;
  while (clips.some((c) => c.id === `clip-${n}`)) n++;
  return `clip-${n}`;
}

/** The next free name for a track's clip: "Bass 1", "Bass 2"… */
export function newClipName(clips: readonly Clip[], track: Track): string {
  let n = 1;
  while (clips.some((c) => c.name === `${track.name} ${n}`)) n++;
  return `${track.name} ${n}`.slice(0, MAX_NAME);
}

const copyPattern = (p: Pattern): Pattern => p.map((row) => [...row]);

export function drumClip(clips: readonly Clip[], track: Track, patterns: Pattern[] = [emptyPattern()]): DrumClip {
  const bars = Math.max(1, Math.min(MAX_BARS.drums, patterns.length));
  return { id: newClipId(clips), track: track.id, name: newClipName(clips, track), bars, kind: "drums", patterns: patterns.slice(0, bars).map(copyPattern) };
}

/** A step clip from the step sequencer's settings (a copy, always switched on). */
export function stepClip(clips: readonly Clip[], track: Track, seq: NoteSeqSettings = defaultNoteSeq(), bars = 1): StepClip {
  return { id: newClipId(clips), track: track.id, name: newClipName(clips, track), bars: clampInt(bars, 1, MAX_BARS.steps, 1), kind: "steps", seq: copySeq(seq) };
}

export function noteClip(clips: readonly Clip[], track: Track, notes: Note[] = [], bars = 1): NoteClip {
  const clip: NoteClip = { id: newClipId(clips), track: track.id, name: newClipName(clips, track), bars: clampInt(bars, 1, MAX_BARS.notes, 1), kind: "notes", notes: [] };
  clip.notes = cleanNotes(notes, clip.bars);
  return clip;
}

function copySeq(seq: NoteSeqSettings): NoteSeqSettings {
  return { ...seq, steps: seq.steps.map((s) => ({ ...s })), enabled: true };
}

/**
 * The bars a step sequence fills without being cut off: the fewest (up to 4) after which its loop comes round
 * to step 1 again on a bar line, since the clip starts again from step 1 each time. One bar when there are none
 * (a Free clock, or a loop that never lines up).
 */
export function barsForSteps(seq: NoteSeqSettings): number {
  if (seq.free) return 1;
  const loop = seq.length * RATES[seq.rate].beats;
  for (let bars = 1; bars <= 4; bars++) {
    const loops = (bars * BEATS_PER_BAR) / loop;
    if (Math.abs(loops - Math.round(loops)) < 1e-6) return bars;
  }
  return 1;
}

/** Notes inside a clip of `bars` bars, cut to fit and in order of start. */
export function cleanNotes(notes: readonly Note[], bars: number): Note[] {
  const end = bars * BEATS_PER_BAR * TICKS_PER_BEAT;
  return notes
    .filter((n) => n.start >= 0 && n.start < end && n.length > 0)
    .map((n) => ({ start: Math.round(n.start), length: Math.max(1, Math.round(Math.min(n.length, end - n.start))), pitch: clampInt(n.pitch, 0, 127, 60), velocity: clampInt(n.velocity, 1, 127, 100) }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/**
 * The clip with a new length. A drum clip made longer repeats its bars (so a 1-bar beat becomes 2 bars of the
 * same beat, ready to vary); a note clip made shorter loses the notes past its end.
 */
export function withBars(clip: Clip, bars: number): Clip {
  const n = clampInt(bars, 1, MAX_BARS[clip.kind], clip.bars);
  switch (clip.kind) {
    case "drums":
      return { ...clip, bars: n, patterns: Array.from({ length: n }, (_, i) => copyPattern(clip.patterns[i] ?? clip.patterns[i % clip.bars])) };
    case "steps":
      return { ...clip, bars: n };
    case "notes":
      return { ...clip, bars: n, notes: cleanNotes(clip.notes, n) };
  }
}

/** A copy of a clip, with a new id and name, on the same track. */
export function duplicateClip(clips: readonly Clip[], clip: Clip, track: Track): Clip {
  return { ...structuredClone(clip), id: newClipId(clips), name: newClipName(clips, track) };
}

function readPattern(raw: unknown): Pattern {
  const p = emptyPattern();
  if (!Array.isArray(raw)) return p;
  for (let d = 0; d < DRUMS; d++) for (let s = 0; s < STEPS; s++) p[d][s] = clampInt((raw[d] as unknown[] | undefined)?.[s], 0, 127, 0);
  return p;
}

function readSeq(raw: Record<string, unknown> | undefined): NoteSeqSettings {
  const d = defaultNoteSeq();
  if (!raw || typeof raw !== "object") return { ...d, enabled: true };
  const steps = Array.isArray(raw.steps) ? (raw.steps as Record<string, unknown>[]) : [];
  return {
    steps: d.steps.map((def, i) => ({
      note: clampInt(steps[i]?.note, 12, 108, def.note),
      on: typeof steps[i]?.on === "boolean" ? (steps[i].on as boolean) : def.on,
      slide: steps[i]?.slide === true,
    })),
    length: clampInt(raw.length, 1, NOTE_STEPS, d.length),
    gate: clampNum(raw.gate, 0.05, 1, d.gate),
    rate: clampInt(raw.rate, 0, RATES.length - 1, d.rate),
    free: raw.free === true,
    hz: clampHz(clampNum(raw.hz, 0, Infinity, d.hz)),
    direction: clampInt(raw.direction, 0, DIRECTIONS.length - 1, d.direction),
    transpose: clampInt(raw.transpose, -24, 24, 0),
    enabled: true,
  };
}

/**
 * Clips from storage, checked: unreadable ones, and ones whose track is gone or of the wrong kind, are dropped;
 * values are kept in range.
 */
export function readClips(raw: unknown, tracks: readonly Track[]): Clip[] {
  if (!Array.isArray(raw)) return [];
  const out: Clip[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || out.some((c) => c.id === r.id)) continue;
    const track = tracks.find((t) => t.id === r.track);
    const kind = r.kind;
    if (!track || (kind !== "drums" && kind !== "steps" && kind !== "notes") || !fitsTrack(kind, track)) continue;
    const bars = clampInt(r.bars, 1, MAX_BARS[kind], 1);
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, MAX_NAME) : track.name;
    const base = { id: r.id, track: track.id, name, bars };
    if (kind === "drums") {
      const patterns = Array.isArray(r.patterns) ? r.patterns : [];
      out.push({ ...base, kind, patterns: Array.from({ length: bars }, (_, i) => readPattern(patterns[i])) });
    } else if (kind === "steps") out.push({ ...base, kind, seq: readSeq(r.seq as Record<string, unknown>) });
    else {
      const notes = (Array.isArray(r.notes) ? r.notes : []).filter((n): n is Note => !!n && typeof n === "object" && ["start", "length", "pitch", "velocity"].every((k) => typeof n[k] === "number" && Number.isFinite(n[k])));
      out.push({ ...base, kind, notes: cleanNotes(notes, bars) });
    }
  }
  return out;
}
