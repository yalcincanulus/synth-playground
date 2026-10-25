// Scale lock and chord mode: every note played is moved to the nearest note of a chosen scale, and in
// chord mode one key plays a chord built from that scale.
//
// Chords are built the usual way, by stacking every other note of a 7-note scale (1-3-5, plus 7 for 7ths).
// Pentatonic and blues scales have 5 or 6 notes, so stacking theirs gives odd chords: they borrow the
// 7-note scale they come from (major pentatonic from major, the others from minor). The chord's root is
// always a note of the scale you chose.

export const SCALE_IDS = ["off", "major", "minor", "dorian", "mixolydian", "harmonicMinor", "majorPent", "minorPent", "blues"] as const;
export type ScaleId = (typeof SCALE_IDS)[number];

interface ScaleDef {
  name: string;
  /** Semitones above the root. */
  steps: number[];
  /** The 7-note scale chords are stacked from (when `steps` isn't one). */
  chords?: number[];
  /** One line for learners. */
  explain: string;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const SCALES: Record<Exclude<ScaleId, "off">, ScaleDef> = {
  major: { name: "Major", steps: MAJOR, explain: "Bright and happy: the white keys from C." },
  minor: { name: "Minor", steps: MINOR, explain: "Darker and sad: the white keys from A." },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10], explain: "Minor with a brighter 6th: funk, jazz, Daft Punk." },
  mixolydian: { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10], explain: "Major with a flat 7th: bluesy rock and house." },
  harmonicMinor: { name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11], explain: "Minor with a raised 7th: dramatic, a bit exotic." },
  majorPent: { name: "Major pentatonic", steps: [0, 2, 4, 7, 9], chords: MAJOR, explain: "5 notes, no clashes: hard to play a wrong note." },
  minorPent: { name: "Minor pentatonic", steps: [0, 3, 5, 7, 10], chords: MINOR, explain: "5 notes: the classic rock and blues solo scale." },
  blues: { name: "Blues", steps: [0, 3, 5, 6, 7, 10], chords: MINOR, explain: "Minor pentatonic plus the 'blue' note." },
};

export const CHORD_MODES = ["off", "triads", "sevenths"] as const;
export type ChordMode = (typeof CHORD_MODES)[number];
export const CHORD_MODE_NAMES: Record<ChordMode, string> = { off: "Off", triads: "Triads (3 notes)", sevenths: "7ths (4 notes)" };

/** The usual spelling when there is no key to follow. */
export const ROOT_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export interface ScaleSettings {
  /** 0 = C ... 11 = B. */
  root: number;
  scale: ScaleId;
  chords: ChordMode;
}

export const defaultScale = (): ScaleSettings => ({ root: 0, scale: "off", chords: "off" });

const pc = (n: number) => ((n % 12) + 12) % 12;

/** Whether a note is in the scale (always, with the scale off). */
export function inScale(note: number, s: ScaleSettings): boolean {
  return s.scale === "off" || SCALES[s.scale].steps.includes(pc(note - s.root));
}

/**
 * Whether a key plays this note itself (the keyboard greys out the others). In chord mode that is a
 * scale note with a chord on it: the blues scale's blue note has none, so it moves to a neighbour.
 */
export function playable(note: number, s: ScaleSettings): boolean {
  if (!inScale(note, s) || s.scale === "off" || s.chords === "off") return inScale(note, s);
  const def = SCALES[s.scale];
  return (def.chords ?? def.steps).includes(pc(note - s.root));
}

/** The nearest note of the scale; halfway between two, the lower one. */
export function snapToScale(note: number, s: ScaleSettings): number {
  return nearest(note, (n) => inScale(n, s));
}

function nearest(note: number, ok: (n: number) => boolean): number {
  for (let d = 0; d < 12; d++) {
    if (ok(note - d)) return note - d;
    if (ok(note + d)) return note + d;
  }
  return note;
}

/**
 * The notes one key plays: the snapped note, or in chord mode the chord built on it, root at the bottom.
 * With the scale off it is always the note alone.
 */
export function keyNotes(note: number, s: ScaleSettings): number[] {
  if (s.scale === "off" || s.chords === "off") return [snapToScale(note, s)];
  const root = nearest(note, (n) => playable(n, s));
  const def = SCALES[s.scale];
  const steps = def.chords ?? def.steps;
  const degree = steps.indexOf(pc(root - s.root));
  const notes = [root];
  const size = s.chords === "sevenths" ? 4 : 3;
  for (let k = 1; k < size; k++) {
    const d = degree + 2 * k;
    notes.push(root + steps[d % 7] + 12 * Math.floor(d / 7) - steps[degree]);
  }
  return notes.filter((n) => n >= 0 && n <= 127);
}

const QUALITIES: Record<string, string> = {
  "4,7": "",
  "3,7": "m",
  "3,6": "dim",
  "4,8": "aug",
  "4,7,11": "maj7",
  "4,7,10": "7",
  "3,7,10": "m7",
  "3,6,10": "m7b5",
  "3,6,9": "dim7",
  "3,7,11": "m(maj7)",
  "4,8,11": "maj7#5",
};

/**
 * Sharps or flats for this scale (the usual mix with the scale off): the way that gives each of its 7 notes its own letter (C minor is
 * C D Eb F G Ab Bb, not C D D# F G G# A#). Plain "b" and "#", so the MiniLab's screen can show them.
 */
export function spelling(s: ScaleSettings): string[] {
  if (s.scale === "off") return ROOT_NAMES;
  const def = SCALES[s.scale];
  const letters = (list: string[]) => new Set((def.chords ?? def.steps).map((st) => list[pc(st + s.root)][0])).size;
  return letters(FLAT_NAMES) > letters(SHARP_NAMES) ? FLAT_NAMES : SHARP_NAMES;
}

/** A note's name with its octave (C4 = 60), spelled for the scale. */
export function noteNameIn(note: number, s: ScaleSettings): string {
  return spelling(s)[pc(note)] + (Math.floor(note / 12) - 1);
}

/** A chord's name, from its notes (root first), e.g. "Dm7"; null when it isn't a chord we name. */
export function chordName(notes: number[], s: ScaleSettings = { root: 0, scale: "off", chords: "off" }): string | null {
  if (notes.length < 3) return null;
  const quality = QUALITIES[notes.slice(1).map((n) => n - notes[0]).join(",")];
  return quality === undefined ? null : spelling(s)[pc(notes[0])] + quality;
}

/** Every note of the scale from `low` to `high` (both included). */
export function scaleNotes(low: number, high: number, s: ScaleSettings): number[] {
  const out: number[] = [];
  for (let n = low; n <= high; n++) if (inScale(n, s)) out.push(n);
  return out;
}

export function scaleLabel(s: ScaleSettings): string {
  return s.scale === "off" ? "off" : `${ROOT_NAMES[s.root]} ${SCALES[s.scale].name.toLowerCase()}`;
}
