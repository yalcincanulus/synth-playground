import { describe, expect, test } from "bun:test";
import { arpSequence, Arpeggiator, defaultArp, type ArpSettings } from "./arpeggiator";
import type { Ticker } from "./clock";
import { emptyPattern, Sequencer } from "./sequencer";

const held = (...notes: number[]) => notes.map((note) => ({ note, velocity: 100 }));
const notesOf = (seq: { note: number }[]) => seq.map((h) => h.note);

describe("arpSequence", () => {
  // Played E, C, G.
  const chord = held(64, 60, 67);

  test("up and down sort by pitch; played keeps the order", () => {
    expect(notesOf(arpSequence(chord, "Up", 1))).toEqual([60, 64, 67]);
    expect(notesOf(arpSequence(chord, "Down", 1))).toEqual([67, 64, 60]);
    expect(notesOf(arpSequence(chord, "Played", 1))).toEqual([64, 60, 67]);
  });

  test("octaves repeat the notes higher up", () => {
    expect(notesOf(arpSequence(chord, "Up", 2))).toEqual([60, 64, 67, 72, 76, 79]);
    expect(notesOf(arpSequence(chord, "Down", 2))).toEqual([79, 76, 72, 67, 64, 60]);
    // Notes above 127 are left out.
    expect(notesOf(arpSequence(held(120), "Up", 3))).toEqual([120]);
  });

  test("up-down turns round without playing the ends twice", () => {
    expect(notesOf(arpSequence(chord, "Up-down", 1))).toEqual([60, 64, 67, 64]);
    expect(notesOf(arpSequence(held(60, 64), "Up-down", 1))).toEqual([60, 64]);
    expect(notesOf(arpSequence(held(60), "Up-down", 2))).toEqual([60, 72]);
  });
});

/** An arpeggiator driven beat by beat: 1 beat = 1 second, so times read as beats. */
function setup(change: Partial<ArpSettings> = {}) {
  const s = { ...defaultArp(), on: true, ...change };
  const played: [number, number, number][] = []; // note, on, off
  const arp = new Arpeggiator(s, {
    noteOn: (n, _v, t) => played.push([n, t, NaN]),
    noteOff: (n, t) => {
      for (let i = played.length - 1; i >= 0; i--) {
        if (played[i][0] === n && Number.isNaN(played[i][2])) {
          played[i][2] = t;
          break;
        }
      }
    },
  });
  let beat = 0;
  const run = (beats: number) => {
    for (const end = beat + beats; beat < end - 1e-9; beat += 0.25) arp.schedule(beat, beat + 0.25, (b) => b, 1);
  };
  return { arp, s, played, run, notes: () => played.map(([n]) => n) };
}

describe("Arpeggiator", () => {
  test("plays the held notes in turn, on the 16th-note grid, with the gate's length", () => {
    const { arp, played, run, notes } = setup();
    arp.press(64, 100);
    arp.press(60, 100);
    run(2);
    expect(notes()).toEqual([60, 64, 60, 64, 60, 64, 60, 64]);
    played.forEach(([, on, off], i) => {
      expect(on).toBeCloseTo(i * 0.25, 9);
      expect(off - on).toBeCloseTo(0.125, 9); // half of a 16th
    });
  });

  test("starts on the next step of the grid, and a new note joins the pattern in place", () => {
    const { arp, run, played, notes } = setup({ rate: 0 }); // 1/8
    run(1.25);
    arp.press(60, 100);
    run(1);
    expect(played[0][1]).toBeCloseTo(1.5, 9);
    arp.press(67, 100);
    run(1);
    expect(notes()).toEqual([60, 60, 67, 60]);
  });

  test("triplets fill the slices of time it is given evenly", () => {
    const { arp, played, run } = setup({ rate: 3 }); // 1/16T
    arp.press(60, 100);
    run(1);
    expect(played.length).toBe(6);
    played.forEach(([, on], i) => expect(on).toBeCloseTo(i / 6, 9));
  });

  test("stops when the keys are released; latch keeps it going until a new chord", () => {
    const { arp, run, notes } = setup();
    arp.press(60, 100);
    run(0.5);
    arp.release(60);
    expect(arp.active).toBe(false);
    run(0.5);
    expect(notes()).toEqual([60, 60]);

    const l = setup({ latch: true });
    l.arp.press(60, 100);
    l.arp.press(64, 100);
    l.arp.release(60);
    l.arp.release(64);
    expect(l.arp.active).toBe(true);
    l.run(0.5);
    expect(l.notes()).toEqual([60, 64]);
    // A new chord (no key was down) replaces the latched one; keys added to it while held join it.
    l.arp.press(67, 100);
    l.arp.press(72, 100);
    l.run(0.5);
    expect(l.notes().slice(2)).toEqual([67, 72]);
    // Latch off lets go of the keys that are up.
    l.arp.release(67);
    l.arp.setLatch(false);
    l.run(0.5);
    expect(l.notes().slice(4)).toEqual([72, 72]);
  });

  test("random never plays the same note twice in a row", () => {
    const { arp, run, notes } = setup({ pattern: 3, octaves: 2 });
    arp.press(60, 100);
    arp.press(64, 100);
    run(25);
    const n = notes();
    n.slice(1).forEach((x, i) => expect(x).not.toBe(n[i]));
    expect(new Set(n)).toEqual(new Set([60, 64, 72, 76]));
  });

  test("a late slice moves the pattern on without playing", () => {
    const { arp, played, notes } = setup();
    arp.press(60, 100);
    arp.press(64, 100);
    arp.schedule(0, 0.25, (b) => b, 1, true);
    arp.schedule(0.25, 0.5, (b) => b, 1);
    expect(notes()).toEqual([64]);
    expect(played[0][1]).toBeCloseTo(0.25, 9);
  });
});

describe("Arpeggiator on the drum clock", () => {
  function clocked() {
    const host = { ctx: { currentTime: 0 }, bpm: 120, hits: [] as number[], drums: { trigger: (_t: number, _v: number, time: number) => host.hits.push(time) } };
    const ticker: Ticker & { running: boolean } = { running: false, start() { this.running = true; }, stop() { this.running = false; } };
    const seq = new Sequencer(host, ticker);
    seq.pattern = emptyPattern();
    for (let s = 0; s < 16; s++) seq.pattern[0][s] = 100;
    const ons: number[] = [];
    const arp = new Arpeggiator({ ...defaultArp(), on: true }, { noteOn: (_n, _v, t) => ons.push(t), noteOff: () => {} });
    seq.arp = arp;
    const run = (seconds: number) => {
      for (const end = host.ctx.currentTime + seconds; host.ctx.currentTime < end - 1e-9; ) {
        host.ctx.currentTime += 0.025;
        if (ticker.running) seq.schedule();
      }
    };
    return { host, ticker, seq, arp, ons, run };
  }

  test("with the transport stopped it runs the clock on its own, first note at once, drums silent", () => {
    const { ticker, seq, arp, ons, host, run } = clocked();
    host.ctx.currentTime = 1;
    arp.press(60, 100);
    seq.setFree(true);
    expect(ticker.running).toBe(true);
    expect(ons[0]).toBeCloseTo(1, 9);
    run(0.5);
    expect(host.hits.length).toBe(0);
    ons.slice(1).forEach((t, i) => expect(t - ons[i]).toBeCloseTo(0.125, 9));
    arp.release(60);
    seq.setFree(false);
    expect(ticker.running).toBe(false);
  });

  test("Play while it runs: the drums start where it had planned to, on its grid, with no note twice", () => {
    const { seq, arp, ons, host, run } = clocked();
    arp.press(60, 100);
    seq.setFree(true);
    run(0.3);
    seq.start();
    run(1);
    const first = host.hits[0];
    expect(first).toBeGreaterThan(ons[ons.findIndex((t) => t >= first) - 1]);
    // From the first drum hit on, every arpeggio note is on a drum step.
    for (const t of ons.filter((t) => t >= first)) expect(host.hits.some((h) => Math.abs(h - t) < 1e-9)).toBe(true);
    ons.slice(1).forEach((t, i) => expect(t - ons[i]).toBeGreaterThan(0.1));
    // Stop: the drums end, the arpeggio keeps the clock going.
    seq.stop();
    const hits = host.hits.length;
    const before = ons.length;
    run(0.5);
    expect(host.hits.length).toBe(hits);
    expect(ons.length).toBeGreaterThan(before);
  });
});
