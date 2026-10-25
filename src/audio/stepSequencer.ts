/**
 * 8-step note sequencer, in the spirit of the Oberheim Mini-Sequencer: one pitch per step,
 * steps switched on or off, and a slide that holds a step into the next one.
 * It has no clock of its own: the drum Sequencer calls `schedule` for each slice of time it plans,
 * so both stay locked to the same transport and tempo.
 */

export const NOTE_STEPS = 8;
/** Lowest note a step knob reaches; the knob covers two octaves above it. */
export const STEP_NOTE_LOW = 48; // C3
export const STEP_NOTE_RANGE = 24;
/** What the keys do while the sequencer plays. */
export const KEYS_MODES = ["Play", "Transpose", "Split"] as const;
export type KeysMode = (typeof KEYS_MODES)[number];
/** Transpose mode: transpose is measured from this key. */
export const TRANSPOSE_ROOT = 60; // C4
/** Split mode: keys below this transpose (measured from SPLIT_ROOT), this key and above play notes. */
export const SPLIT_NOTE = 60; // C4
export const SPLIT_ROOT = 48; // C3

export const RATES = [
  { name: "1/8", beats: 1 / 2 },
  { name: "1/8T", beats: 1 / 3 },
  { name: "1/16", beats: 1 / 4 },
  { name: "1/16T", beats: 1 / 6 },
] as const;
export const DIRECTIONS = ["Forward", "Backward", "Ping-pong", "Random"] as const;

const VELOCITY = 100;

export interface NoteStep {
  note: number;
  on: boolean;
  /** Hold this step into the next one and glide to its pitch (like a TB-303 slide). */
  slide: boolean;
}

export interface NoteSeqSettings {
  steps: NoteStep[];
  /** Steps played, 1..8. */
  length: number;
  /** Fraction of the step the note is held for, 0.05..1. */
  gate: number;
  /** Index into RATES. */
  rate: number;
  /** Index into DIRECTIONS. */
  direction: number;
  /** Semitones added to every step (set by the keyboard). */
  transpose: number;
  enabled: boolean;
}

export const defaultNoteSeq = (): NoteSeqSettings => ({
  // A small bass line: root, octave jump, minor third, fifth, with one slide.
  steps: [48, 48, 60, 48, 51, 48, 55, 58].map((note, i) => ({ note, on: true, slide: i === 2 })),
  length: 8,
  gate: 0.5,
  rate: 2,
  direction: 0,
  transpose: 0,
  enabled: false,
});

export const noteName = (n: number) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

export interface NoteOut {
  noteOn: (note: number, velocity: number, time: number, slide: boolean) => void;
  noteOff: (note: number, time: number) => void;
}

export class NoteSequencer {
  /** Called when each step is scheduled, with the audio time it will sound at. */
  onStep: (step: number, time: number) => void = () => {};
  /** The note a step plays, after its pitch and the transpose are added (scale lock moves it into the scale). */
  pitch: (note: number) => number = (note) => note;

  private nextBeat = 0;
  private pos = -1;
  /** Ping-pong direction: +1 or -1. */
  private dir = 1;
  /** The step after the current one, chosen ahead so a slide knows whether it has somewhere to go. */
  private upcoming = 0;
  /** A note held over by a slide, waiting for the next step to release it. */
  private held: number | null = null;
  private lastRate = -1;

  constructor(
    public s: NoteSeqSettings,
    private out: NoteOut,
  ) {}

  reset() {
    this.nextBeat = 0;
    this.pos = -1;
    this.dir = 1;
    this.upcoming = this.advance();
    this.lastRate = this.s.rate;
  }

  /** Release a note held by a slide (on stop, or when the sequencer is switched off). */
  release(time: number) {
    if (this.held !== null) this.out.noteOff(this.held, time);
    this.held = null;
  }

  /**
   * Play every step that falls in [fromBeat, toBeat). `timeAt` turns a beat position into audio time;
   * `secPerBeat` gives note lengths. With `skip` (the time has already passed), the steps move on
   * silently, so the sequence stays in place on the beat.
   */
  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, secPerBeat: number, skip = false) {
    if (!this.s.enabled) {
      if (this.nextBeat >= 0) {
        this.release(timeAt(fromBeat));
        this.reset();
        this.nextBeat = -1; // start over from step 1 when switched back on
      }
      return;
    }
    const stepBeats = RATES[this.s.rate].beats;
    if (this.s.rate !== this.lastRate) {
      // New rate: carry on from the next point on the new grid, so the sequence stays in time with the drums.
      this.nextBeat = Math.ceil(this.nextBeat / stepBeats - 1e-6) * stepBeats;
      this.lastRate = this.s.rate;
    }
    // Switched on while playing: start on the next beat.
    if (this.nextBeat < fromBeat - 1e-6) this.nextBeat = Math.ceil(fromBeat - 1e-6);
    while (this.nextBeat < toBeat - 1e-6) {
      const time = timeAt(this.nextBeat);
      this.play(time, stepBeats * secPerBeat, skip);
      this.nextBeat += stepBeats;
    }
  }

  private play(time: number, duration: number, skip: boolean) {
    const step = this.upcoming < this.s.length ? this.upcoming : 0;
    this.pos = step;
    this.upcoming = this.advance();
    this.onStep(step, time);

    const st = this.s.steps[step];
    if (!st.on || skip) return this.release(time);
    const note = Math.max(0, Math.min(127, this.pitch(st.note + this.s.transpose)));
    if (this.held === note) {
      // Slide into the same pitch: a tie, the note just keeps going.
    } else if (this.held !== null) {
      this.out.noteOn(note, VELOCITY, time, true);
      this.out.noteOff(this.held, time);
    } else {
      this.out.noteOn(note, VELOCITY, time, false);
    }
    this.held = null;

    const next = this.s.steps[this.upcoming];
    if (st.slide && next.on && this.s.length > 1) this.held = note;
    else this.out.noteOff(note, time + duration * this.s.gate);
  }

  /** Pick the step after `pos` for the current direction and length. */
  private advance(): number {
    const n = this.s.length;
    if (n <= 1) return 0;
    const p = Math.min(this.pos, n - 1);
    switch (DIRECTIONS[this.s.direction]) {
      case "Backward":
        return p <= 0 ? n - 1 : p - 1;
      case "Ping-pong": {
        if (p < 0) return 0;
        if (p + this.dir >= n || p + this.dir < 0) this.dir = -this.dir;
        return p + this.dir;
      }
      case "Random":
        return Math.floor(Math.random() * n);
      default:
        return (p + 1) % n;
    }
  }
}
