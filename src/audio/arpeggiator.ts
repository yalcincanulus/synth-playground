/**
 * Arpeggiator: plays the held notes one at a time, in a pattern, over 1-3 octaves. Like the note
 * sequencer it has no clock of its own: the drum Sequencer calls `schedule` for each slice of time it
 * plans, so the arpeggio stays in time with the drums and the step sequencer.
 */

import { RATES, type NoteOut } from "./stepSequencer";

export const ARP_PATTERNS = ["Up", "Down", "Up-down", "Random", "Played"] as const;
export const ARP_MAX_OCTAVES = 3;

export interface ArpSettings {
  on: boolean;
  /** Index into ARP_PATTERNS. */
  pattern: number;
  /** How many octaves the pattern climbs through, 1..3. */
  octaves: number;
  /** Index into RATES (shared with the step sequencer). */
  rate: number;
  /** Fraction of the step the note is held for, 0.05..1. */
  gate: number;
  /** Keep playing after the keys are released, until the next new chord. */
  latch: boolean;
}

export const defaultArp = (): ArpSettings => ({ on: false, pattern: 0, octaves: 1, rate: 2, gate: 0.5, latch: false });

interface Held {
  note: number;
  velocity: number;
}

/**
 * The notes one pass of the pattern plays, from the held notes (in the order they were played).
 * Up-down doesn't repeat its top and bottom notes, so it turns round without a stutter.
 */
export function arpSequence(held: readonly Held[], pattern: (typeof ARP_PATTERNS)[number], octaves: number): Held[] {
  const base = pattern === "Played" ? [...held] : [...held].sort((a, b) => a.note - b.note);
  const up: Held[] = [];
  for (let o = 0; o < octaves; o++) for (const h of base) if (h.note + 12 * o <= 127) up.push({ note: h.note + 12 * o, velocity: h.velocity });
  if (pattern === "Down") return up.reverse();
  if (pattern === "Up-down" && up.length > 2) return [...up, ...up.slice(1, -1).reverse()];
  return up;
}

export class Arpeggiator {
  /** Called with each note as it is planned (with the audio time it sounds at, and when it ends). */
  onNote: (note: number, time: number, end: number) => void = () => {};

  /** The notes it plays: the keys held, or latched, in the order they were played. */
  private held: Held[] = [];
  /** The keys down right now (with latch, `held` can keep notes whose keys are up). */
  private down = new Set<number>();
  private nextBeat = -1;
  /** Position in the pattern of the note played last; -1 to start from the first. */
  private index = -1;
  private lastRate = -1;

  constructor(
    public s: ArpSettings,
    private out: NoteOut,
  ) {}

  /** Whether it has notes to play (keys held, or latched). */
  get active() {
    return this.s.on && this.held.length > 0;
  }

  press(note: number, velocity: number) {
    // Latch: the first key of a new chord (no key was down) replaces the latched notes.
    if (this.s.latch && this.down.size === 0) this.held = [];
    this.down.add(note);
    if (!this.held.some((h) => h.note === note)) this.held.push({ note, velocity });
  }

  release(note: number) {
    this.down.delete(note);
    if (!this.s.latch) this.held = this.held.filter((h) => h.note !== note);
  }

  /** Latch off lets go of the notes whose keys are already up. */
  setLatch(on: boolean) {
    this.s.latch = on;
    if (!on) this.held = this.held.filter((h) => this.down.has(h.note));
  }

  /** Forget every note (the arpeggiator was switched off). Notes already planned still end on time. */
  clear() {
    this.held = [];
    this.down.clear();
    this.restart();
  }

  /** Start the pattern again on the next slice planned (the clock's beats started again from 0). */
  restart() {
    this.nextBeat = -1;
    this.index = -1;
  }

  /**
   * Play every arpeggio step that falls in [fromBeat, toBeat). `timeAt` turns a beat position into audio
   * time; `secPerBeat` gives note lengths. With `skip` (the time has already passed), the steps move on
   * silently, so the pattern stays on the beat.
   */
  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, secPerBeat: number, skip = false) {
    if (!this.active) return this.restart();
    const stepBeats = RATES[this.s.rate].beats;
    if (this.s.rate !== this.lastRate) {
      // New rate: carry on from the next point on the new grid.
      if (this.nextBeat >= 0) this.nextBeat = Math.ceil(this.nextBeat / stepBeats - 1e-6) * stepBeats;
      this.lastRate = this.s.rate;
    }
    // The first note after a rest: on the next step of the grid.
    if (this.nextBeat < fromBeat - 1e-6) this.nextBeat = Math.ceil(fromBeat / stepBeats - 1e-6) * stepBeats;
    while (this.nextBeat < toBeat - 1e-6) {
      this.play(timeAt(this.nextBeat), stepBeats * secPerBeat, skip);
      this.nextBeat += stepBeats;
    }
  }

  private play(time: number, duration: number, skip: boolean) {
    const pattern = ARP_PATTERNS[this.s.pattern] ?? "Up";
    const seq = arpSequence(this.held, pattern, this.s.octaves);
    if (pattern === "Random") {
      // Any note but the one just played (when there is a choice), so it never sounds stuck.
      const n = seq.length;
      const pick = n > 1 ? (this.index + 1 + Math.floor(Math.random() * (n - 1))) % n : 0;
      this.index = this.index < 0 ? Math.floor(Math.random() * n) : pick;
    } else this.index = (this.index + 1) % seq.length;
    if (skip) return;
    const { note, velocity } = seq[this.index];
    const end = time + duration * this.s.gate;
    this.out.noteOn(note, velocity, time, false);
    this.out.noteOff(note, end);
    this.onNote(note, time, end);
  }
}
