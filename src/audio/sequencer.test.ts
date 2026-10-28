import { describe, expect, test } from "bun:test";
import type { Ticker } from "./clock";
import { Metronome } from "./metronome";
import { emptyPattern, LATE_TOLERANCE, Sequencer } from "./sequencer";
import { defaultNoteSeq, NoteSequencer } from "./stepSequencer";

/** A sequencer on a fake audio clock and a ticker that only runs when the test says so. */
function setup() {
  const host = { ctx: { currentTime: 0 }, bpm: 120, hits: [] as [number, number][], drums: { trigger: (t: number, _v: number, time: number) => host.hits.push([t, time]) } };
  const ticker: Ticker & { running: boolean } = { running: false, start() { this.running = true; }, stop() { this.running = false; } };
  const seq = new Sequencer(host, ticker);
  seq.pattern = emptyPattern();
  for (let s = 0; s < 16; s++) seq.pattern[0][s] = 100; // a kick on every step
  const notes: [number, number][] = [];
  const s = { ...defaultNoteSeq(), enabled: true };
  const noteSeq = new NoteSequencer(s, { noteOn: (n, _v, t) => notes.push([n, t]), noteOff: () => {} });
  seq.notes = noteSeq;
  /** Advance the audio clock in 25 ms ticks, as the worker clock would. */
  const run = (seconds: number) => {
    for (const end = host.ctx.currentTime + seconds; host.ctx.currentTime < end - 1e-9; ) {
      host.ctx.currentTime += 0.025;
      seq.schedule();
    }
  };
  return { host, ticker, seq, notes, run };
}

const STEP = 0.125; // a 16th at 120 BPM
/** Whether `t` lies on the 16th-note grid that starts at `start`. */
const onGrid = (t: number, start: number) => {
  const x = (t - start) / STEP;
  return Math.abs(x - Math.round(x)) < 1e-6;
};

describe("Sequencer timing", () => {
  test("starts and stops the clock", () => {
    const { seq, ticker } = setup();
    seq.start();
    expect(ticker.running).toBe(true);
    seq.stop();
    expect(ticker.running).toBe(false);
  });

  test("on time: every step plays, on the grid", () => {
    const { seq, host, run } = setup();
    seq.start();
    run(1);
    const times = host.hits.map(([, t]) => t);
    times.slice(1).forEach((t, i) => expect(t - times[i]).toBeCloseTo(STEP, 9));
    expect(seq.timing.lateSteps).toBe(0);
    // Ticks every 25 ms with 100 ms of lookahead: every step is planned at least 75 ms ahead.
    expect(seq.timing.closest).toBeGreaterThan(0.074);
  });

  test("after a freeze, late steps are skipped and the loop stays on the beat", () => {
    const { seq, host, notes, run } = setup();
    let steps = 0;
    seq.onStep = () => steps++;
    seq.start();
    run(0.5);
    // The page freezes for 300 ms: no ticks, but the audio clock goes on.
    host.ctx.currentTime += 0.3;
    run(0.5);
    const start = host.hits[0][1];
    // Every hit that did play is on the grid; the ones that were due during the freeze were skipped.
    for (const [, t] of host.hits) expect(onGrid(t, start)).toBe(true);
    expect(seq.timing.lateSteps).toBeGreaterThanOrEqual(1);
    expect(host.hits.length + seq.timing.lateSteps).toBe(steps);
    // The note sequencer skipped the same steps: its notes are on the grid too, and as many.
    for (const [, t] of notes) expect(onGrid(t, start)).toBe(true);
    expect(notes.length).toBe(host.hits.length);
  });

  test("a step only a little late still plays", () => {
    const { seq, host, run } = setup();
    seq.start();
    run(0.2);
    // The page wakes just under the tolerance after the next unplanned step was due.
    const next = host.hits[host.hits.length - 1][1] + STEP;
    host.ctx.currentTime = next + LATE_TOLERANCE / 2;
    seq.schedule();
    expect(seq.timing.lateSteps).toBe(0);
    expect(host.hits.some(([, t]) => Math.abs(t - next) < 1e-9)).toBe(true);
  });

  test("the note sequencer's free clock keeps its speed when the tempo changes", () => {
    const { seq, host, notes, run } = setup();
    seq.notes!.s.free = true;
    seq.notes!.s.hz = 5;
    seq.start();
    run(1);
    host.bpm = 200;
    run(1);
    const times = notes.map(([, t]) => t);
    expect(times.length).toBeGreaterThan(8);
    times.slice(1).forEach((t, i) => expect(t - times[i]).toBeCloseTo(0.2, 9));
  });
});

describe("Song or toys", () => {
  /** A song that only counts what it is asked to plan. */
  function withSong() {
    const t = setup();
    const song = { resets: 0, planned: 0, reset() { this.resets++; }, schedule() { this.planned++; }, stop() {} };
    t.seq.clips = song;
    return { ...t, song };
  }

  test("the toys: the drum loop and the note sequencer play, the song isn't started", () => {
    const { seq, host, notes, run, song } = withSong();
    seq.start();
    run(1);
    expect(host.hits.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
    expect(song.resets + song.planned).toBe(0);
  });

  test("the song: its clips play, the drum loop and the note sequencer are silent", () => {
    const { seq, host, notes, run, song } = withSong();
    seq.song = true;
    seq.start();
    run(1);
    expect(song.resets).toBe(1);
    expect(song.planned).toBeGreaterThan(0);
    expect(host.hits.length).toBe(0);
    expect(notes.length).toBe(0);
  });
});

describe("Count-in and metronome", () => {
  function withClicks() {
    const s = setup();
    const clicks: [number, boolean][] = [];
    let cancelled = -1;
    const metronome = new Metronome({ click: (t, accent) => clicks.push([t, accent]), cancel: (t) => (cancelled = t) });
    s.seq.metronome = metronome;
    return { ...s, clicks, metronome, cancelled: () => cancelled };
  }

  test("a count-in: a bar of clicks, and beat 0 right after it", () => {
    const { seq, host, run, clicks, metronome } = withClicks();
    const lead = 0.05 + 4 * 0.5;
    seq.start(lead);
    metronome.countIn(lead, 0.5);
    expect(clicks.map(([, a]) => a)).toEqual([true, false, false, false]);
    [0.05, 0.55, 1.05, 1.55].forEach((t, i) => expect(clicks[i][0]).toBeCloseTo(t, 9));
    // Beats before 0 during the count-in.
    expect(seq.beatAt(0.05)).toBeCloseTo(-4, 9);
    run(lead + 0.1);
    expect(host.hits[0][1]).toBeCloseTo(lead, 9);
    expect(seq.beatAt(lead + 0.25)).toBeCloseTo(0.5, 9);
  });

  test("a count-in while the arpeggiator's clock runs still waits for its end", () => {
    const { seq, host, run, ticker } = setup();
    seq.setFree(true);
    run(0.3);
    seq.start(2);
    expect(ticker.running).toBe(true);
    run(2.1);
    expect(host.hits[0][1]).toBeCloseTo(2.3, 6);
  });

  test("on, it clicks every beat while playing, the bar's first higher; Stop silences what is planned", () => {
    const { seq, run, clicks, metronome, cancelled } = withClicks();
    metronome.on = true;
    seq.start();
    run(2);
    [0.05, 0.55, 1.05, 1.55, 2.05].forEach((t, i) => expect(clicks[i][0]).toBeCloseTo(t, 9));
    expect(clicks.map(([, a]) => a).slice(0, 5)).toEqual([true, false, false, false, true]);
    seq.stop();
    expect(cancelled()).toBeCloseTo(2, 9);
  });

  test("off, it doesn't click", () => {
    const { seq, run, clicks } = withClicks();
    seq.start();
    run(2);
    expect(clicks).toEqual([]);
  });
});
