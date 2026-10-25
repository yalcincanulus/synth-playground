import { describe, expect, test } from "bun:test";
import { detectChord } from "./chordDetect";
import { keyNotes, SCALE_IDS, type ScaleSettings } from "./scale";

const OFF: ScaleSettings = { root: 0, scale: "off", chords: "off" };
const C_MAJOR: ScaleSettings = { root: 0, scale: "major", chords: "off" };
const name = (notes: number[], s = OFF) => detectChord(notes, s)?.name;

describe("detectChord", () => {
  test("nothing held: no chord", () => {
    expect(detectChord([], OFF)).toBeNull();
  });

  test("one note, and one note in octaves", () => {
    expect(detectChord([60], OFF)).toMatchObject({ name: "C", detail: "one note" });
    expect(detectChord([48, 60, 72], OFF)).toMatchObject({ name: "C", detail: "one note, in octaves" });
  });

  test("two notes: the interval, or a power chord", () => {
    expect(detectChord([60, 64], OFF)).toMatchObject({ name: "C + E", detail: "major 3rd" });
    expect(detectChord([60, 67], OFF)).toMatchObject({ name: "C5" });
    expect(name([55, 60])).toBe("C5/G");
    expect(name([60, 66])).toBe("C + F#");
  });

  test("triads in root position", () => {
    expect(name([60, 64, 67])).toBe("C");
    expect(name([62, 65, 69])).toBe("Dm");
    expect(name([71, 74, 77])).toBe("Bdim");
    expect(name([60, 64, 68])).toBe("Caug");
    expect(name([60, 65, 67])).toBe("Csus4");
    expect(name([60, 62, 67])).toBe("Csus2");
  });

  test("any order, any octave, doubled notes", () => {
    expect(name([76, 48, 67, 60, 55])).toBe("C");
    expect(detectChord([62, 65, 69], OFF)?.detail).toBe("D minor");
  });

  test("inversions are slash chords", () => {
    expect(name([64, 67, 72])).toBe("C/E");
    expect(name([55, 60, 64])).toBe("C/G");
    expect(detectChord([64, 67, 72], OFF)?.detail).toBe("C major, E in the bass");
    expect(name([60, 62, 65, 69])).toBe("Dm7/C");
    expect(name([65, 69, 72, 74])).toBe("F6"); // the same notes as Dm7, F in the bass: F6
  });

  test("7ths, 6ths and 9ths", () => {
    expect(name([67, 71, 74, 77])).toBe("G7");
    expect(name([60, 64, 67, 71])).toBe("Cmaj7");
    expect(name([69, 72, 76, 79])).toBe("Am7");
    expect(name([71, 74, 77, 81])).toBe("Bm7b5");
    expect(name([71, 74, 77, 80])).toBe("Bdim7");
    expect(name([60, 62, 64, 67])).toBe("Cadd9");
    expect(name([60, 64, 67, 70, 74])).toBe("C9");
    expect(name([60, 63, 67, 70, 74])).toBe("Cm9");
    expect(name([67, 72, 74, 77])).toBe("G7sus4");
  });

  test("the bass decides between chords with the same notes", () => {
    expect(name([60, 64, 67, 69])).toBe("C6");
    expect(name([57, 60, 64, 67])).toBe("Am7");
    expect(name([60, 62, 67])).toBe("Csus2");
    expect(name([67, 72, 74])).toBe("Gsus4");
  });

  test("a 7th chord without its 5th is still that chord", () => {
    expect(name([60, 64, 70])).toBe("C7");
    expect(name([60, 63, 70])).toBe("Cm7");
  });

  test("notes that make no named chord are listed, not misnamed", () => {
    expect(detectChord([60, 61, 62], OFF)).toMatchObject({ name: "C C# D", detail: "no chord name: a cluster of notes" });
  });

  test("spelled for the key, and the usual way with the scale off", () => {
    expect(name([63, 67, 70])).toBe("Eb");
    expect(name([66, 70, 73])).toBe("F#");
    expect(name([68, 71, 75], { root: 4, scale: "major", chords: "off" })).toBe("G#m");
    expect(detectChord([63, 67, 70], { root: 0, scale: "minor", chords: "off" })?.notes).toEqual(["Eb", "G", "Bb"]);
  });

  test("with scale lock: the chord's number in the key", () => {
    const n = (notes: number[], s = C_MAJOR) => detectChord(notes, s)?.numeral;
    expect([[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72], [67, 71, 74], [69, 72, 76], [71, 74, 77]].map((c) => n(c))).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
    expect(n([67, 71, 74, 77])).toBe("V7");
    expect(n([62, 65, 69, 72])).toBe("ii7");
    expect(n([71, 74, 77, 81])).toBe("viiø7");
    expect(n([60, 64, 67, 71])).toBe("Imaj7");
    expect(n([64, 67, 72])).toBe("I"); // an inversion keeps its number
    expect(n([60, 64, 67], OFF)).toBeNull();
    expect(detectChord([60, 64, 67], OFF)?.inKey).toBeNull();
  });

  test("with scale lock: a chord with notes outside the key says so", () => {
    expect(detectChord([62, 66, 69], C_MAJOR)).toMatchObject({ name: "D", inKey: false, numeral: "II" });
    expect(detectChord([61, 65, 68], C_MAJOR)).toMatchObject({ inKey: false, numeral: null });
    expect(detectChord([62, 65, 69], C_MAJOR)?.inKey).toBe(true);
  });

  test("every chord that chord mode plays is detected under the same name, in key, with a number", () => {
    for (const scale of SCALE_IDS) {
      if (scale === "off") continue;
      for (let root = 0; root < 12; root++) {
        for (const chords of ["triads", "sevenths"] as const) {
          const s: ScaleSettings = { root, scale, chords };
          for (let note = 48; note < 72; note++) {
            const played = keyNotes(note, s);
            const found = detectChord(played, s)!;
            expect(found.name).not.toContain("/");
            expect(found.inKey).toBe(true);
            expect(found.numeral).not.toBeNull();
          }
        }
      }
    }
  });
});
