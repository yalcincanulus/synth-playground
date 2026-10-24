import { describe, expect, test } from "bun:test";
import { analyse, compare, findClicks, findCuts, levelOutliers, stereoWidth, type Analysis, type PhraseNote } from "./analyse";

const SR = 48000;
const PHRASE: PhraseNote[] = [{ note: 69, on: 0.1, off: 0.6 }];

/** One note of `wave` (0..1 phase -> sample) with linear attack/release times, in a 1 s buffer. */
function note(wave: (phase: number) => number, attack: number, release: number, f = 440, length = 1) {
  const x = new Float32Array(SR * length);
  const { on, off } = PHRASE[0];
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (t < on || t > off + release) continue;
    const env = t < off ? Math.min(1, attack ? (t - on) / attack : 1) : release ? Math.max(0, 1 - (t - off) / release) : 0;
    x[i] = 0.5 * env * wave(((t - on) * f) % 1);
  }
  return x;
}

const sine = (p: number) => Math.sin(2 * Math.PI * p);
const cosine = (p: number) => Math.cos(2 * Math.PI * p);
const saw = (p: number) => 2 * p - 1;
const kinds = (a: { kind: string }[]) => a.map((i) => i.kind);

describe("render analysis", () => {
  test("a clean note has no issues", () => {
    const x = note(sine, 0.005, 0.05);
    expect(analyse([x, x], SR, PHRASE).issues).toEqual([]);
  });

  test("a note that starts at full level mid-wave clicks", () => {
    const issues = findClicks(note(cosine, 0, 0.05), SR, PHRASE);
    expect(kinds(issues)).toEqual(["click"]);
    expect(issues[0].at).toBe(0.1);
  });

  test("a saw's own drops are not clicks", () => {
    expect(findClicks(note(saw, 0.005, 0.05), SR, PHRASE)).toEqual([]);
  });

  test("a note released instantly mid-wave clicks at its end and stops dead", () => {
    const x = note(cosine, 0.005, 0);
    expect(kinds(findClicks(x, SR, PHRASE))).toEqual(["click"]);
    expect(kinds(findCuts(x, SR))).toEqual(["cut"]);
  });

  test("silence and broken samples are reported", () => {
    expect(kinds(analyse([new Float32Array(SR)], SR, PHRASE).issues)).toEqual(["silent"]);
    const x = note(sine, 0.005, 0.05);
    x[1000] = NaN;
    expect(kinds(analyse([x], SR, PHRASE).issues)).toContain("nan");
  });

  test("the spectrum (measured during the chord) peaks in the tone's band", () => {
    const tone = new Float32Array(SR * 3).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR));
    const { bands } = analyse([tone], SR, PHRASE);
    expect(bands.indexOf(Math.max(...bands))).toBe(15); // 31.5 Hz * 2^(15/3) = 1008 Hz
  });

  test("compare: identical renders differ by nothing, a louder one by its gain", () => {
    const x = note(sine, 0.005, 0.05);
    const a = analyse([x], SR, PHRASE);
    expect(compare(a, a)).toEqual({ loudnessDb: 0, envelopeDb: 0, spectrumDb: 0 });
    const louder = analyse([x.map((v) => v * 2)], SR, PHRASE);
    const c = compare(louder, a);
    expect(c.loudnessDb).toBeCloseTo(6, 0);
    expect(c.envelopeDb).toBeCloseTo(6, 0);
  });

  test("level outliers are measured against the median preset", () => {
    const at = (rmsDb: number): Analysis => ({ peakDb: 0, rmsDb, envelope: [], bands: [], issues: [] });
    const results = new Map([["a", at(-20)], ["b", at(-21)], ["c", at(-19)], ["loud", at(-5)], ["quiet", at(-40)]]);
    levelOutliers(results);
    expect(kinds(results.get("loud")!.issues)).toEqual(["loud"]);
    expect(kinds(results.get("quiet")!.issues)).toEqual(["quiet"]);
    expect(results.get("a")!.issues).toEqual([]);
  });
});

describe("stereoWidth", () => {
  test("is 0 for mono and grows with the difference between the sides", () => {
    const a = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10));
    const b = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7));
    expect(stereoWidth([a, a])).toBe(0);
    expect(stereoWidth([a])).toBe(0);
    expect(stereoWidth([a, b])).toBeGreaterThan(50);
  });
});
