// Recording into a clip: a take turns notes played live (at their beat, as heard) into a note clip's notes or
// a drum clip's steps. A take loops over the clip's length, so each time round adds to it (overdub); the
// app clears the clip first for "replace". Plain code, so it is tested without a browser.

import { STEPS } from "../audio/sequencer";
import { BEATS_PER_BAR, TICKS_PER_BEAT, type Note } from "./clips";
import { GRIDS, snap } from "./noteEdit";

export type RecordMode = "overdub" | "replace";

/** How takes are recorded, kept across reloads. */
export interface RecordSettings {
  /** A bar of clicks before the transport starts (when it starts with the recording). */
  countIn: boolean;
  /** Clicks on each beat while recording. */
  metronome: boolean;
  /** The click's volume, 0..1. */
  click: number;
  mode: RecordMode;
  /** Quantize on input: an index into GRIDS, or -1 for off. */
  quantize: number;
  /** How far notes are pulled onto the grid, 0..1. */
  strength: number;
  /** The velocity of the computer keys and the touch keys (they have no touch of their own). */
  velocity: number;
  /** The length of a clip made to record into, in bars. */
  bars: number;
}

export const defaultRecordSettings = (): RecordSettings => ({ countIn: true, metronome: true, click: 0.5, mode: "overdub", quantize: -1, strength: 1, velocity: 100, bars: 4 });

/** Saved settings, checked (anything unreadable takes its default). */
export function readRecordSettings(raw: unknown): RecordSettings {
  const d = defaultRecordSettings();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  return {
    countIn: typeof r.countIn === "boolean" ? r.countIn : d.countIn,
    metronome: typeof r.metronome === "boolean" ? r.metronome : d.metronome,
    click: num(r.click, 0, 1, d.click),
    mode: r.mode === "replace" ? "replace" : "overdub",
    quantize: Math.round(num(r.quantize, -1, GRIDS.length - 1, d.quantize)),
    strength: num(r.strength, 0, 1, d.strength),
    velocity: Math.round(num(r.velocity, 1, 127, d.velocity)),
    bars: Math.round(num(r.bars, 1, 8, d.bars)),
  };
}

/**
 * A note played this little before the take's start, or before the clip comes round again, is taken as on
 * its first beat (an early downbeat) rather than at the very end of the clip. A 32nd note (60 ms at 120 BPM).
 */
export const EARLY_BEATS = 1 / 8;

/** Ticks of a drum step (a 16th). */
const STEP_TICKS = (BEATS_PER_BAR * TICKS_PER_BEAT) / STEPS;

/** One recording pass after another over one clip, from the beat its first time round starts on. */
export class Take {
  /** The beat (since Play) the clip's first time round starts on; Infinity while that isn't known yet (it waits for the next bar). */
  start = Infinity;
  /** Notes held down: when each started (beat) and how hard. */
  private held = new Map<number, { beat: number; velocity: number }>();

  constructor(
    /** The clip's length in beats, as it is now (it can change during the take). */
    private beats: () => number,
    /** Quantize on input: a grid in ticks (null: off), and its strength. */
    private grid: number | null = null,
    private strength = 1,
  ) {}

  /** Whether a beat is inside the take (from its start, allowing an early downbeat). */
  covers(beat: number) {
    return beat >= this.start - EARLY_BEATS;
  }

  /** Which time round a beat falls in (0 for the first), or -1 before the take. */
  pass(beat: number): number {
    if (!this.covers(beat)) return -1;
    return Math.max(0, Math.floor((beat - this.start + EARLY_BEATS) / this.beats()));
  }

  /** Where a beat is in the clip, in ticks (an early downbeat counts as the clip's start). */
  private ticksAt(beat: number): number {
    const len = this.beats();
    let pos = (((beat - this.start) % len) + len) % len;
    if (len - pos < EARLY_BEATS) pos = 0;
    return pos * TICKS_PER_BEAT;
  }

  noteOn(pitch: number, velocity: number, beat: number) {
    if (!this.covers(beat)) return;
    this.held.set(pitch, { beat, velocity });
  }

  /** A note let go: the note to write into the clip, or null when its start wasn't recorded. */
  noteOff(pitch: number, beat: number): Note | null {
    const on = this.held.get(pitch);
    if (!on) return null;
    this.held.delete(pitch);
    return this.note(pitch, on.velocity, on.beat, beat);
  }

  /**
   * A note with both ends known (the arpeggiator's, at exact times), to write into the clip; null outside
   * the take. It isn't quantized again: it is already on its grid.
   */
  note(pitch: number, velocity: number, onBeat: number, offBeat: number, quantize = true): Note | null {
    if (!this.covers(onBeat)) return null;
    const clipTicks = this.beats() * TICKS_PER_BEAT;
    let start = this.ticksAt(onBeat);
    if (quantize && this.grid) {
      start += (snap(start, this.grid) - start) * this.strength;
      // Pulled onto the end of the clip: that is its first beat.
      if (start >= clipTicks - 1e-6) start = 0;
    }
    start = Math.round(start);
    // Held over the end of the clip: it ends there (the clip starts again).
    const length = Math.max(1, Math.min(Math.round((offBeat - onBeat) * TICKS_PER_BEAT), clipTicks - start));
    return { start, length, pitch, velocity: Math.max(1, Math.min(127, Math.round(velocity))) };
  }

  /** Every note still held, ended at `beat` (the take ends). */
  end(beat: number): Note[] {
    const out: Note[] = [];
    for (const pitch of [...this.held.keys()]) {
      const n = this.noteOff(pitch, beat);
      if (n) out.push(n);
    }
    return out;
  }

  /** A drum hit: the step of the clip it lands on (the nearest 16th, counted across its bars), or -1 outside the take. */
  drumStep(beat: number): number {
    if (!this.covers(beat)) return -1;
    const steps = Math.round(this.beats() / (BEATS_PER_BAR / STEPS));
    return Math.round(this.ticksAt(beat) / STEP_TICKS) % steps;
  }
}
