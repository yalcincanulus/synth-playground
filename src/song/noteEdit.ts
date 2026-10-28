// The piano roll's edits, as plain functions on a note clip's notes: the grid, moving and resizing, the tools
// (quantize, transpose, reverse, legato, double), copy and paste, and turning a step clip into notes. A
// selection is a set of indexes into the notes; every edit returns the notes cleaned and in order, with the
// selection following the notes it held. Plain code, so it is tested without a browser.

import { NoteSequencer, type NoteSeqSettings } from "../audio/stepSequencer";
import { BEATS_PER_BAR, MAX_BARS, TICKS_PER_BEAT, type Note } from "./clips";

/** The grids notes snap to, in ticks (96 a beat). */
export const GRIDS = [
  { name: "1/4", ticks: 96 },
  { name: "1/8", ticks: 48 },
  { name: "1/16", ticks: 24 },
  { name: "1/32", ticks: 12 },
  { name: "1/4T", ticks: 64 },
  { name: "1/8T", ticks: 32 },
  { name: "1/16T", ticks: 16 },
  { name: "1/32T", ticks: 8 },
] as const;

export const barTicks = (bars: number) => bars * BEATS_PER_BAR * TICKS_PER_BEAT;

/** The grid point nearest a tick. */
export const snap = (tick: number, grid: number) => Math.round(tick / grid) * grid;
/** The grid point at or before a tick. */
export const snapDown = (tick: number, grid: number) => Math.floor(tick / grid + 1e-9) * grid;

export interface Edited {
  notes: Note[];
  selected: Set<number>;
}

const clampPitch = (p: number) => Math.max(0, Math.min(127, Math.round(p)));
const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

/**
 * Notes made to fit a clip of `bars` bars (cut at its end, whole ticks, in range) and put in order, with the
 * selection following them. Notes that start outside the clip are dropped.
 */
export function settle(items: { note: Note; sel: boolean }[], bars: number): Edited {
  const end = barTicks(bars);
  const kept = items
    .filter(({ note: n }) => n.start >= 0 && Math.round(n.start) < end && n.length > 0)
    .map(({ note: n, sel }) => {
      const start = Math.round(n.start);
      return { note: { start, length: Math.max(1, Math.round(Math.min(n.length, end - start))), pitch: clampPitch(n.pitch), velocity: clampVel(n.velocity) }, sel };
    })
    .sort((a, b) => a.note.start - b.note.start || a.note.pitch - b.note.pitch);
  const selected = new Set<number>();
  kept.forEach((k, i) => k.sel && selected.add(i));
  return { notes: kept.map((k) => k.note), selected };
}

/** Each note with whether it is selected; `fn` changes the ones it is given (all of them when nothing is selected and `allIfNone`). */
function map(notes: readonly Note[], selected: ReadonlySet<number>, bars: number, fn: (n: Note) => Note, allIfNone = false): Edited {
  const all = allIfNone && selected.size === 0;
  return settle(
    notes.map((n, i) => {
      const sel = selected.has(i);
      return { note: sel || all ? fn({ ...n }) : { ...n }, sel };
    }),
    bars,
  );
}

/** The notes the tools act on: the selection, or all of them when nothing is selected. */
export const targets = (notes: readonly Note[], selected: ReadonlySet<number>) => (selected.size ? [...selected] : notes.map((_, i) => i));

/** Add a drawn note (it isn't selected, so the next click draws again); `index` is where it landed. */
export function addNote(notes: readonly Note[], note: Note, bars: number): Edited & { index: number } {
  const marked = notes.map((n) => ({ note: { ...n }, sel: false }));
  marked.push({ note: { ...note }, sel: true });
  const out = settle(marked, bars);
  const index = [...out.selected][0] ?? -1;
  return { notes: out.notes, selected: new Set(), index };
}

export function deleteNotes(notes: readonly Note[], selected: ReadonlySet<number>): Note[] {
  return notes.filter((_, i) => !selected.has(i)).map((n) => ({ ...n }));
}

/**
 * How far a group of notes can move (in ticks and semitones) and stay inside the clip and the MIDI range: the
 * move asked for, held back at the edges, so the group keeps its shape.
 */
export function clampMove(notes: readonly Note[], selected: ReadonlySet<number>, dt: number, dp: number, bars: number): { dt: number; dp: number } {
  if (!selected.size) return { dt: 0, dp: 0 };
  const sel = [...selected].map((i) => notes[i]).filter(Boolean);
  const first = Math.min(...sel.map((n) => n.start));
  const last = Math.max(...sel.map((n) => n.start));
  const low = Math.min(...sel.map((n) => n.pitch));
  const high = Math.max(...sel.map((n) => n.pitch));
  return {
    dt: Math.max(-first, Math.min(barTicks(bars) - 1 - last, dt)),
    dp: Math.max(-low, Math.min(127 - high, dp)),
  };
}

/** Move the selected notes by `dt` ticks and `dp` semitones (held inside the clip, see clampMove). */
export function moveNotes(notes: readonly Note[], selected: ReadonlySet<number>, dt: number, dp: number, bars: number): Edited {
  const m = clampMove(notes, selected, dt, dp, bars);
  return map(notes, selected, bars, (n) => ({ ...n, start: n.start + m.dt, pitch: n.pitch + m.dp }));
}

/** Make the selected notes longer or shorter by `dl` ticks, none shorter than `min`. */
export function resizeNotes(notes: readonly Note[], selected: ReadonlySet<number>, dl: number, min: number, bars: number): Edited {
  return map(notes, selected, bars, (n) => ({ ...n, length: Math.max(min, n.length + dl) }));
}

/** Change the selected notes' velocity by `dv` (each keeps its place against the others, within 1..127). */
export function shiftVelocity(notes: readonly Note[], selected: ReadonlySet<number>, dv: number, bars: number): Edited {
  return map(notes, selected, bars, (n) => ({ ...n, velocity: n.velocity + dv }));
}

/**
 * Pull each note's start toward the nearest grid point: all the way at strength 1, halfway at 0.5. Lengths
 * stay as they are. The selection, or every note when nothing is selected.
 */
export function quantize(notes: readonly Note[], selected: ReadonlySet<number>, grid: number, strength: number, bars: number): Edited {
  const s = Math.max(0, Math.min(1, strength));
  return map(notes, selected, bars, (n) => ({ ...n, start: n.start + (snap(n.start, grid) - n.start) * s }), true);
}

/** Move the notes up or down by semitones (the selection, or every note), none past the MIDI range. */
export function transpose(notes: readonly Note[], selected: ReadonlySet<number>, semitones: number, bars: number): Edited {
  const idx = targets(notes, selected);
  if (!idx.length) return settle(notes.map((n) => ({ note: { ...n }, sel: false })), bars);
  const low = Math.min(...idx.map((i) => notes[i].pitch));
  const high = Math.max(...idx.map((i) => notes[i].pitch));
  const dp = Math.max(-low, Math.min(127 - high, semitones));
  return map(notes, selected, bars, (n) => ({ ...n, pitch: n.pitch + dp }), true);
}

/**
 * Play the notes backwards: each note's end becomes its start, mirrored within the selection's span (from its
 * first start to its last end), or within the whole clip when nothing is selected.
 */
export function reverse(notes: readonly Note[], selected: ReadonlySet<number>, bars: number): Edited {
  const idx = targets(notes, selected);
  if (!idx.length) return settle([], bars);
  const [from, to] = selected.size ? [Math.min(...idx.map((i) => notes[i].start)), Math.max(...idx.map((i) => notes[i].start + notes[i].length))] : [0, barTicks(bars)];
  return map(notes, selected, bars, (n) => ({ ...n, start: from + to - (n.start + n.length) }), true);
}

/**
 * Legato: each note is held until the next one starts (the next later start among the notes it acts on);
 * the last ones are held to the end of the clip. The selection, or every note.
 */
export function legato(notes: readonly Note[], selected: ReadonlySet<number>, bars: number): Edited {
  const starts = [...new Set(targets(notes, selected).map((i) => notes[i].start))].sort((a, b) => a - b);
  const end = barTicks(bars);
  return map(
    notes,
    selected,
    bars,
    (n) => {
      const next = starts.find((s) => s > n.start) ?? end;
      return { ...n, length: next - n.start };
    },
    true,
  );
}

/** The clip twice as long, its notes played twice (null when it is already more than half the longest clip). */
export function doubleNotes(notes: readonly Note[], bars: number): { notes: Note[]; bars: number } | null {
  if (bars * 2 > MAX_BARS.notes) return null;
  const len = barTicks(bars);
  const both = [...notes, ...notes.map((n) => ({ ...n, start: n.start + len }))].map((note) => ({ note, sel: false }));
  return { notes: settle(both, bars * 2).notes, bars: bars * 2 };
}

/** The selected notes in a box: from tick `t0` to `t1`, pitches `p0` to `p1` (either way round). A note is in when any of it is. */
export function notesInBox(notes: readonly Note[], t0: number, t1: number, p0: number, p1: number): number[] {
  const [a, b] = [Math.min(t0, t1), Math.max(t0, t1)];
  const [lo, hi] = [Math.min(p0, p1), Math.max(p0, p1)];
  const out: number[] = [];
  notes.forEach((n, i) => {
    if (n.pitch >= lo && n.pitch <= hi && n.start < b && n.start + n.length > a) out.push(i);
  });
  return out;
}

/** What copy keeps: the selected notes, counted from the first one's start, and the span they cover. */
export interface Clipboard {
  notes: Note[];
  /** Ticks from the first start to the last end. */
  span: number;
}

export function copyNotes(notes: readonly Note[], selected: ReadonlySet<number>): Clipboard | null {
  const sel = [...selected].sort((a, b) => a - b).map((i) => notes[i]).filter(Boolean);
  if (!sel.length) return null;
  const first = Math.min(...sel.map((n) => n.start));
  const last = Math.max(...sel.map((n) => n.start + n.length));
  return { notes: sel.map((n) => ({ ...n, start: n.start - first })), span: last - first };
}

/** Paste a clipboard's notes from tick `at`; the pasted notes become the selection. Ones past the clip's end are left out. */
export function pasteNotes(notes: readonly Note[], clip: Clipboard, at: number, bars: number): Edited {
  return settle([...notes.map((n) => ({ note: { ...n }, sel: false })), ...clip.notes.map((n) => ({ note: { ...n, start: n.start + at }, sel: true }))], bars);
}

/**
 * A step clip as notes: its sequencer run through the clip's length, each note it plays written down. Gate,
 * rests, slides (a slide holds its note into the next), direction, transpose and the clock all count; a Free
 * clock is turned into beats at `secPerBeat`. `pitch` is what scale lock does to the steps, so the notes sound
 * as the step clip did. Random direction gives one of its possible orders.
 */
export function stepsToNotes(seq: NoteSeqSettings, bars: number, secPerBeat: number, pitch: (note: number) => number = (n) => n): Note[] {
  const end = barTicks(bars);
  const tick = (time: number) => Math.round((time / secPerBeat) * TICKS_PER_BEAT);
  const open = new Map<number, { start: number; velocity: number }>();
  const out: Note[] = [];
  const close = (note: number, time: number) => {
    const o = open.get(note);
    if (!o) return;
    open.delete(note);
    const stop = Math.min(end, tick(time));
    if (stop > o.start) out.push({ start: o.start, length: stop - o.start, pitch: note, velocity: o.velocity });
  };
  const s = new NoteSequencer({ ...seq, steps: seq.steps.map((st) => ({ ...st })), enabled: true }, {
    noteOn: (note, velocity, time) => {
      close(note, time);
      const start = tick(time);
      if (start < end) open.set(note, { start, velocity });
    },
    noteOff: close,
  });
  s.pitch = pitch;
  s.reset();
  const beats = bars * BEATS_PER_BAR;
  s.schedule(0, beats, (b) => b * secPerBeat, secPerBeat);
  s.release(beats * secPerBeat);
  for (const note of [...open.keys()]) close(note, beats * secPerBeat);
  return settle(out.map((note) => ({ note, sel: false })), bars).notes;
}
