// Chord detection: the name of the chord in a set of held notes, in any order, octave or inversion.
//
// Every held note is tried as the root, and the intervals above it are matched against the chord
// shapes below. The best match wins:
// - a root that is also the lowest note (otherwise it is an inversion, written as a slash chord: C/E),
// - then every note used (a 7th or 9th chord may leave out its 5th, as players often do),
// - then the simpler chord (C E G A is C6 over C, Am7 over A).
// With scale lock on, the chord also gets its number in the key ("ii", "V7"): what it does in the key.

import { SCALES, spelling, type ScaleSettings } from "./scale";

interface Shape {
  /** Added to the root's name: "m7" makes "Dm7". */
  suffix: string;
  /** Said in full, for learners. */
  long: string;
  /** Semitones above the root, within an octave. */
  intervals: number[];
}

// Simplest first: the order breaks ties.
const SHAPES: Shape[] = [
  { suffix: "", long: "major", intervals: [0, 4, 7] },
  { suffix: "m", long: "minor", intervals: [0, 3, 7] },
  { suffix: "dim", long: "diminished", intervals: [0, 3, 6] },
  { suffix: "aug", long: "augmented", intervals: [0, 4, 8] },
  { suffix: "sus4", long: "suspended 4th", intervals: [0, 5, 7] },
  { suffix: "sus2", long: "suspended 2nd", intervals: [0, 2, 7] },
  { suffix: "7", long: "dominant 7th", intervals: [0, 4, 7, 10] },
  { suffix: "maj7", long: "major 7th", intervals: [0, 4, 7, 11] },
  { suffix: "m7", long: "minor 7th", intervals: [0, 3, 7, 10] },
  { suffix: "6", long: "major 6th", intervals: [0, 4, 7, 9] },
  { suffix: "m6", long: "minor 6th", intervals: [0, 3, 7, 9] },
  { suffix: "m7b5", long: "half-diminished", intervals: [0, 3, 6, 10] },
  { suffix: "dim7", long: "diminished 7th", intervals: [0, 3, 6, 9] },
  { suffix: "7sus4", long: "dominant 7th, suspended 4th", intervals: [0, 5, 7, 10] },
  { suffix: "m(maj7)", long: "minor, major 7th", intervals: [0, 3, 7, 11] },
  { suffix: "maj7#5", long: "augmented major 7th", intervals: [0, 4, 8, 11] },
  { suffix: "add9", long: "major, added 9th", intervals: [0, 2, 4, 7] },
  { suffix: "madd9", long: "minor, added 9th", intervals: [0, 2, 3, 7] },
  { suffix: "9", long: "dominant 9th", intervals: [0, 2, 4, 7, 10] },
  { suffix: "maj9", long: "major 9th", intervals: [0, 2, 4, 7, 11] },
  { suffix: "m9", long: "minor 9th", intervals: [0, 2, 3, 7, 10] },
];

const INTERVALS = ["octave", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th"];
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

export interface DetectedChord {
  /** "Dm7", "C/E", "C5", "C + E", or the notes when they make no chord we name. */
  name: string;
  /** In words: "D minor 7th", "major 3rd", "no chord: a cluster". */
  detail: string;
  /** The chord's number in the key with scale lock on ("ii7", "V"), else null. */
  numeral: string | null;
  /** With scale lock on, whether every note of it belongs to the key; null with the scale off. */
  inKey: boolean | null;
  /** The held notes from low to high, spelled for the key (each once). */
  notes: string[];
}

const pc = (n: number) => ((n % 12) + 12) % 12;
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The chord in these notes (MIDI numbers, any order); null for no notes. */
export function detectChord(held: Iterable<number>, scale: ScaleSettings): DetectedChord | null {
  const sorted = [...new Set(held)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const names = spelling(scale);
  const classes: number[] = [];
  for (const n of sorted) if (!classes.includes(pc(n))) classes.push(pc(n));
  const bass = classes[0];
  const notes = classes.map((c) => names[c]);
  const key = keyOf(classes, scale);

  if (classes.length === 1) {
    return { name: names[bass], detail: sorted.length > 1 ? "one note, in octaves" : "one note", numeral: null, inKey: key.inKey, notes };
  }
  if (classes.length === 2) {
    const up = pc(classes[1] - bass);
    // A 5th, or a 4th (a 5th upside down): a power chord, the root and its 5th.
    if (up === 7) return { name: `${names[bass]}5`, detail: "power chord: root and 5th", numeral: null, inKey: key.inKey, notes };
    if (up === 5) return { name: `${names[classes[1]]}5/${names[bass]}`, detail: "power chord, 5th at the bottom", numeral: null, inKey: key.inKey, notes };
    return { name: `${names[bass]} + ${names[classes[1]]}`, detail: INTERVALS[up], numeral: null, inKey: key.inKey, notes };
  }

  let best: { root: number; shape: Shape; score: number } | null = null;
  for (const root of classes) {
    const intervals = classes.map((c) => pc(c - root));
    SHAPES.forEach((shape, rank) => {
      const full = sameSet(intervals, shape.intervals);
      // A 4-note chord or bigger may leave out its 5th (C E Bb is still C7).
      const noFifth = !full && shape.intervals.length >= 4 && shape.intervals.includes(7) && sameSet(intervals, shape.intervals.filter((i) => i !== 7));
      if (!full && !noFifth) return;
      const score = (root === bass ? 0 : 100) + (noFifth ? 50 : 0) + rank;
      if (!best || score < best.score) best = { root, shape, score };
    });
  }
  if (!best) return { name: notes.join(" "), detail: "no chord name: a cluster of notes", numeral: null, inKey: key.inKey, notes };

  const { root, shape } = best as { root: number; shape: Shape };
  const slash = root === bass ? "" : `/${names[bass]}`;
  const inversion = root === bass ? "" : `, ${names[bass]} in the bass`;
  return {
    name: names[root] + shape.suffix + slash,
    detail: `${names[root]} ${shape.long}${inversion}`,
    numeral: key.degree(root, shape),
    inKey: key.inKey,
    notes,
  };
}

/** What the key says about these notes: whether they all belong, and a root's number in it. */
function keyOf(classes: number[], s: ScaleSettings) {
  if (s.scale === "off") return { inKey: null, degree: () => null };
  const def = SCALES[s.scale];
  // Chords come from the 7-note scale (the pentatonic and blues scales borrow theirs, as chord mode does).
  const steps = [...new Set([...def.steps, ...(def.chords ?? [])])];
  const inKey = classes.every((c) => steps.includes(pc(c - s.root)));
  const seven = def.chords ?? def.steps;
  return {
    inKey,
    degree: (root: number, shape: Shape): string | null => {
      const d = seven.indexOf(pc(root - s.root));
      if (d < 0) return null;
      return numeral(d, shape);
    },
  };
}

/** Roman numeral: upper case for a major 3rd, lower case for a minor one; ° diminished, ø half-diminished, + augmented. */
function numeral(degree: number, shape: Shape): string {
  const minor = shape.intervals.includes(3) && !shape.intervals.includes(4);
  const base = minor ? NUMERALS[degree].toLowerCase() : NUMERALS[degree];
  const marks: Record<string, string> = {
    "": "",
    m: "",
    dim: "°",
    aug: "+",
    m7: "7",
    m6: "6",
    m7b5: "ø7",
    dim7: "°7",
    "m(maj7)": "(maj7)",
    "maj7#5": "+maj7",
    madd9: "add9",
    m9: "9",
  };
  return base + (shape.suffix in marks ? marks[shape.suffix] : shape.suffix);
}
