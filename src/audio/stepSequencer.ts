/**
 * 8-step note sequencer, in the spirit of the Oberheim Mini-Sequencer: one pitch per step,
 * steps switched on or off, and a slide that holds a step into the next one.
 * The drum Sequencer calls `schedule` for each slice of time it plans, so both share the transport.
 * Its clock has two modes, like an LFO's rate:
 * - Sync: steps fall on a note division of the tempo (RATES), locked to the drums.
 * - Free: a free-running clock in steps per second, like the Clock knob of the Oberheim Mini-Sequencer
 *   and other analog sequencers. It ignores the tempo, so it drifts against the drums unless matched by ear.
 *   It goes up to audio rates. From LEGATO_HZ up, a step is too short for an envelope, so it works like an
 *   analog sequencer's pitch voltage: one note is held and each step only moves its pitch. Fast enough,
 *   the steps blur into one sound with all the notes in it; turning the clock down reveals the line again.
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
/** Free clock range, steps per second. The knob is exponential: each part of its travel multiplies the speed. */
export const FREE_HZ_MIN = 0.5;
export const FREE_HZ_MAX = 2000;
/** From this speed up (steps per second) the free clock holds one note and steps its pitch: no gate, rests or slides. */
export const LEGATO_HZ = 40;
/** At legato speeds the playhead is reported at most this often (the screen and the pad lights can't follow faster). */
const REPORT_HZ = 20;
export const freeHzAt = (t: number) => FREE_HZ_MIN * (FREE_HZ_MAX / FREE_HZ_MIN) ** Math.max(0, Math.min(1, t));
export const freeHzPosition = (hz: number) => Math.log(hz / FREE_HZ_MIN) / Math.log(FREE_HZ_MAX / FREE_HZ_MIN);
export const clampHz = (hz: number) => Math.max(FREE_HZ_MIN, Math.min(FREE_HZ_MAX, hz));

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
  /** Index into RATES (the Sync clock). */
  rate: number;
  /** Clock mode: false = Sync (steps follow the tempo at `rate`), true = Free (steps at `hz`, tempo ignored). */
  free: boolean;
  /** Free clock speed, steps per second (FREE_HZ_MIN..FREE_HZ_MAX). */
  hz: number;
  /** Index into DIRECTIONS. */
  direction: number;
  /** Semitones added to every step (set by the keyboard). */
  transpose: number;
  enabled: boolean;
}

export const defaultNoteSeq = (): NoteSeqSettings => ({
  // G3, C4, Bb4, Bb4, C5, C5, C5, C5.
  steps: [55, 60, 70, 70, 72, 72, 72, 72].map((note) => ({ note, on: true, slide: false })),
  length: 8,
  gate: 0.5,
  rate: 2,
  free: false,
  hz: 8, // 16ths at 120 BPM
  direction: 0,
  transpose: 0,
  enabled: false,
});

export const noteName = (n: number) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

export interface NoteOut {
  noteOn: (note: number, velocity: number, time: number, slide: boolean) => void;
  noteOff: (note: number, time: number) => void;
  /** Move sounding note `from` to pitch `to` at once, without restarting its envelopes (legato speeds). */
  pitchTo?: (from: number, to: number, time: number) => void;
}

/** Whether the clock runs at legato speed (one held note, stepping in pitch). */
export const isLegato = (s: NoteSeqSettings) => s.free && s.hz >= LEGATO_HZ;

export class NoteSequencer {
  /** Called when each step is scheduled, with the audio time it will sound at (at legato speed, at most REPORT_HZ times a second). */
  onStep: (step: number, time: number) => void = () => {};
  /** The note a step plays, after its pitch and the transpose are added (scale lock moves it into the scale). */
  pitch: (note: number) => number = (note) => note;

  private nextBeat = 0;
  private pos = -1;
  /** Ping-pong direction: +1 or -1. */
  private dir = 1;
  /** The step after the current one, chosen ahead so a slide knows whether it has somewhere to go. */
  private upcoming = 0;
  /** A note held over by a slide, waiting for the next step to release it; or the note held at legato speed. */
  private held: number | null = null;
  private lastRate = -1;
  /** The clock mode the last slice was planned in, to carry the position over when it changes. */
  private lastFree = false;
  /** Free clock: audio time of the last step played (NaN: none yet). */
  private lastTime = NaN;
  /** Free clock: where the first step goes, when it carries on from the Sync grid (NaN: at the next slice). */
  private freeStart = NaN;
  /** The held note is a legato-speed note (not a slide): it ends when the clock slows down. */
  private legato = false;
  /** When the playhead was last reported at legato speed. */
  private lastReport = -Infinity;

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
    this.lastFree = this.s.free;
    this.lastTime = NaN;
    this.freeStart = NaN;
    this.lastReport = -Infinity;
  }

  /** Release a note held by a slide (on stop, or when the sequencer is switched off). */
  release(time: number) {
    if (this.held !== null) this.out.noteOff(this.held, time);
    this.held = null;
    this.legato = false;
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
    if (this.s.free !== this.lastFree) this.switchClock(fromBeat, timeAt, secPerBeat);
    if (this.s.free) return this.scheduleFree(timeAt(fromBeat), timeAt(toBeat), skip);

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

  /** Free clock: play every step in [from, to) seconds. A new speed counts from the last step played. */
  private scheduleFree(from: number, to: number, skip: boolean) {
    const period = 1 / clampHz(this.s.hz);
    let t = !Number.isNaN(this.lastTime) ? this.lastTime + period : !Number.isNaN(this.freeStart) ? this.freeStart : from;
    // Sped up so much that the next step falls in a slice already planned: play it at the start of this one.
    t = Math.max(t, from);
    while (t < to - 1e-9) {
      this.play(t, period, skip);
      this.lastTime = t;
      t += period;
    }
  }

  /** The clock mode changed while running: carry on from where the next step was due. */
  private switchClock(fromBeat: number, timeAt: (beat: number) => number, secPerBeat: number) {
    this.lastFree = this.s.free;
    const start = timeAt(fromBeat);
    if (this.s.free) {
      // To Free: the first free step goes where the next Sync step would have been.
      this.lastTime = NaN;
      this.freeStart = this.nextBeat >= fromBeat ? timeAt(this.nextBeat) : start;
    } else {
      // To Sync: the next step goes on the next point of the tempo grid after the next free step.
      const due = !Number.isNaN(this.lastTime) ? this.lastTime + 1 / clampHz(this.s.hz) : start;
      const beat = fromBeat + (Math.max(due, start) - start) / secPerBeat;
      const stepBeats = RATES[this.s.rate].beats;
      this.nextBeat = Math.ceil(beat / stepBeats - 1e-6) * stepBeats;
      this.lastRate = this.s.rate;
      this.lastTime = NaN;
      this.freeStart = NaN;
    }
  }

  private play(time: number, duration: number, skip: boolean) {
    const step = this.upcoming < this.s.length ? this.upcoming : 0;
    this.pos = step;
    this.upcoming = this.advance();
    const st = this.s.steps[step];

    if (isLegato(this.s)) {
      if (time - this.lastReport >= 1 / REPORT_HZ - 1e-9) {
        this.lastReport = time;
        this.onStep(step, time);
      }
      return this.playLegato(st, time, skip);
    }
    this.onStep(step, time);
    // Slowed down out of legato speed: end the held note, and go on with notes and gates.
    if (this.legato) this.release(time);

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

  /**
   * Legato speed, like an analog sequencer's pitch voltage: the gate stays open, each step moves the held
   * note's pitch. A rest holds the pitch before it; slides do nothing (every step is already joined).
   */
  private playLegato(st: NoteStep, time: number, skip: boolean) {
    if (skip && this.held !== null) return; // late: keep the note, skip the pitch change
    const note = Math.max(0, Math.min(127, this.pitch(st.note + this.s.transpose)));
    if (this.held === null || !this.legato) {
      if (!st.on && this.held === null) return; // nothing to hold yet
      // Entering legato speed (from silence, or from a note a slide holds): one note to hold from now on.
      this.release(time);
      this.out.noteOn(note, VELOCITY, time, false);
      this.held = note;
      this.legato = true;
      return;
    }
    if (!st.on || note === this.held) return;
    if (this.out.pitchTo) this.out.pitchTo(this.held, note, time);
    else {
      this.out.noteOn(note, VELOCITY, time, true);
      this.out.noteOff(this.held, time);
    }
    this.held = note;
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
