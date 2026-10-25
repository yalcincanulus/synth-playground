import { describe, expect, test } from "bun:test";
import { chordName, inScale, noteNameIn, keyNotes, playable, SCALE_IDS, SCALES, scaleNotes, snapToScale, type ScaleSettings } from "./scale";

const C_MAJOR: ScaleSettings = { root: 0, scale: "major", chords: "off" };
const chord = (note: number, s: ScaleSettings) => chordName(keyNotes(note, s), s);

describe("snapToScale", () => {
  test("scale off: every note stays", () => {
    const off: ScaleSettings = { root: 3, scale: "off", chords: "triads" };
    for (let n = 0; n < 128; n++) {
      expect(snapToScale(n, off)).toBe(n);
      expect(keyNotes(n, off)).toEqual([n]);
    }
  });

  test("C major: black keys go down to the nearest white key (halfway goes down)", () => {
    expect([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map((n) => snapToScale(n, C_MAJOR))).toEqual([60, 60, 62, 62, 64, 65, 65, 67, 67, 69, 69, 71]);
  });

  test("a gap of 3 in a pentatonic scale: the nearer note wins", () => {
    const pent: ScaleSettings = { root: 9, scale: "minorPent", chords: "off" }; // A C D E G
    expect(snapToScale(70, pent)).toBe(69); // A# -> A
    expect(snapToScale(71, pent)).toBe(72); // B -> C
    expect(snapToScale(65, pent)).toBe(64); // F -> E (halfway between E and G)
    expect(snapToScale(66, pent)).toBe(67); // F# -> G
  });

  test("every snapped note is in the scale, and at most 2 semitones away, for every scale and root", () => {
    for (const scale of SCALE_IDS) {
      if (scale === "off") continue;
      for (let root = 0; root < 12; root++) {
        const s: ScaleSettings = { root, scale, chords: "off" };
        for (let n = 2; n < 126; n++) {
          const m = snapToScale(n, s);
          expect(inScale(m, s)).toBe(true);
          expect(Math.abs(m - n)).toBeLessThanOrEqual(2);
          if (inScale(n, s)) expect(m).toBe(n);
        }
      }
    }
  });

  test("the root moves the scale: D dorian is the white keys from D", () => {
    const d: ScaleSettings = { root: 2, scale: "dorian", chords: "off" };
    expect(scaleNotes(60, 71, d)).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });
});

describe("chords", () => {
  test("C major triads on the white keys: C Dm Em F G Am Bdim", () => {
    const s: ScaleSettings = { ...C_MAJOR, chords: "triads" };
    expect([60, 62, 64, 65, 67, 69, 71].map((n) => chord(n, s))).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
    expect(keyNotes(60, s)).toEqual([60, 64, 67]);
    // Wraps into the next octave above the root.
    expect(keyNotes(69, s)).toEqual([69, 72, 76]);
  });

  test("C major 7ths: Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7♭5", () => {
    const s: ScaleSettings = { ...C_MAJOR, chords: "sevenths" };
    expect([60, 62, 64, 65, 67, 69, 71].map((n) => chord(n, s))).toEqual(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]);
  });

  test("chords are spelled for the scale: flats in C minor and F major, sharps in E major", () => {
    expect([60, 62, 63, 65, 67, 68, 70].map((n) => chord(n, { root: 0, scale: "minor", chords: "triads" }))).toEqual(["Cm", "Ddim", "Eb", "Fm", "Gm", "Ab", "Bb"]);
    expect(chord(70, { root: 5, scale: "major", chords: "triads" })).toBe("Bb");
    expect(chord(68, { root: 4, scale: "major", chords: "triads" })).toBe("G#m");
    expect(noteNameIn(63, { root: 0, scale: "minorPent", chords: "off" })).toBe("Eb4");
    expect(noteNameIn(63, { root: 0, scale: "off", chords: "off" })).toBe("Eb4");
    expect(noteNameIn(66, { root: 0, scale: "off", chords: "off" })).toBe("F#4");
  });

  test("a key outside the scale plays the chord of the note it snaps to", () => {
    const s: ScaleSettings = { ...C_MAJOR, chords: "triads" };
    expect(keyNotes(61, s)).toEqual(keyNotes(60, s));
  });

  test("A harmonic minor: E major (the raised 7th makes the V chord major)", () => {
    const s: ScaleSettings = { root: 9, scale: "harmonicMinor", chords: "triads" };
    expect(chord(64, s)).toBe("E");
    expect(chord(69, s)).toBe("Am");
  });

  test("pentatonic and blues borrow their 7-note scale: every chord note fits it, the root is the scale's", () => {
    for (const scale of ["majorPent", "minorPent", "blues"] as const) {
      for (const chords of ["triads", "sevenths"] as const) {
        const s: ScaleSettings = { root: 4, scale, chords };
        const parent = SCALES[scale].chords!;
        for (let n = 40; n < 90; n++) {
          const notes = keyNotes(n, s);
          expect(inScale(notes[0], s)).toBe(true);
          expect(chordName(notes)).not.toBeNull();
          for (const m of notes) expect(parent).toContain((((m - 4) % 12) + 12) % 12);
        }
      }
    }
  });

  test("the blues note has no chord: in chord mode its key plays a neighbour's", () => {
    const s: ScaleSettings = { root: 0, scale: "blues", chords: "triads" };
    expect(inScale(66, s)).toBe(true);
    expect(playable(66, s)).toBe(false);
    expect(playable(66, { ...s, chords: "off" })).toBe(true);
    expect(keyNotes(66, s)[0]).toBe(65);
  });

  test("every scale and root gives named chords in both modes", () => {
    for (const scale of SCALE_IDS) {
      if (scale === "off") continue;
      for (let root = 0; root < 12; root++) {
        for (const chords of ["triads", "sevenths"] as const) {
          const s: ScaleSettings = { root, scale, chords };
          for (let n = 48; n < 72; n++) {
            const notes = keyNotes(n, s);
            expect(notes.length).toBe(chords === "triads" ? 3 : 4);
            expect(chordName(notes)).not.toBeNull();
          }
        }
      }
    }
  });

  test("notes past the MIDI range are dropped, not sent", () => {
    const s: ScaleSettings = { ...C_MAJOR, chords: "sevenths" };
    expect(keyNotes(127, s).every((n) => n <= 127)).toBe(true);
  });
});
