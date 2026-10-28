import type { Arpeggiator } from "./arpeggiator";
import type { Ticker } from "./clock";
import type { NoteSequencer } from "./stepSequencer";

/** Something else planned on the same clock while the transport plays (the song's clips). */
export interface BeatPlanner {
  /** Play: start from beat 0. */
  reset(): void;
  /** Plan [fromBeat, toBeat), like NoteSequencer.schedule. */
  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, secPerBeat: number, skip: boolean): void;
  /** Stop: end every note at `time`. */
  stop(time: number): void;
}

export const STEPS = 16;
export const TRACKS = 8;

/** pattern[track][step] = velocity (0 = off) */
export type Pattern = number[][];

export const emptyPattern = (): Pattern => Array.from({ length: TRACKS }, () => Array(STEPS).fill(0));

export function basicBeat(): Pattern {
  const p = emptyPattern();
  for (const s of [0, 4, 8, 12]) p[0][s] = 110;
  for (const s of [4, 12]) p[1][s] = 100;
  for (let s = 0; s < STEPS; s += 2) p[3][s] = s % 4 === 0 ? 90 : 60;
  p[4][14] = 70;
  return p;
}

const LOOKAHEAD = 0.1;
const TICK_MS = 25;
/**
 * A step found already this far in the past is skipped rather than played late, so the loop stays on
 * the beat after the page froze for a moment. Anything less late still plays (a few ms are inaudible).
 */
export const LATE_TOLERANCE = 0.02;

/** What the sequencer needs from the engine. */
export interface SequencerHost {
  ctx: { readonly currentTime: number };
  bpm: number;
  drums: { trigger(track: number, velocity: number, time: number): void };
}

/** How well the sequencer kept time since it last started. */
export interface SequencerTiming {
  /** Steps skipped because the page woke up too late to play them on time. */
  lateSteps: number;
  /**
   * The smallest margin a step was planned with, in seconds ahead of the audio clock (null before the
   * second step; the first always starts 50 ms after Play).
   */
  closest: number | null;
}

/**
 * 16-step drum sequencer with lookahead scheduling: a clock wakes every 25 ms and schedules any
 * steps falling in the next 100 ms at exact audio times.
 */
export class Sequencer {
  pattern: Pattern = basicBeat();
  /** The 8-step note sequencer, played on the same clock. */
  notes: NoteSequencer | null = null;
  /** The arpeggiator, played on the same clock; it also plays while the transport is stopped (see `setFree`). */
  arp: Arpeggiator | null = null;
  /** The song's clips, played on the same clock while the transport plays. */
  clips: BeatPlanner | null = null;
  playing = false;
  recording = false;
  /** When off, the clock keeps running (for the note sequencer) but the drum loop is silent. */
  drumsOn = true;
  onTrigger: (track: number, velocity: number, time: number) => void = () => {};
  /** Called when each step is scheduled, with the audio time it will sound at. */
  onStep: (step: number, time: number) => void = () => {};

  private nextStep = 0;
  private nextTime = 0;
  /** Beats since start at nextTime (a drum step is a quarter beat). */
  private nextBeat = 0;
  /** Audio time each step is scheduled at, for quantised recording and UI playhead. */
  private stepTimes: number[] = Array(STEPS).fill(0);

  private stats: SequencerTiming = { lateSteps: 0, closest: null };
  /** Whether the clock is ticking: while playing, or while stopped with the arpeggiator playing. */
  private running = false;
  private free = false;

  constructor(
    private engine: SequencerHost,
    private clock: Ticker,
  ) {}

  get timing(): SequencerTiming {
    return { ...this.stats };
  }

  get stepDuration() {
    return 60 / this.engine.bpm / 4;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextStep = 0;
    this.nextBeat = 0;
    this.notes?.reset();
    this.clips?.reset();
    this.stats = { lateSteps: 0, closest: null };
    // Already ticking for the arpeggiator: the loop starts where that has planned up to, so no note plays twice.
    if (this.running) this.arp?.restart();
    this.run(0.05);
  }

  stop() {
    this.playing = false;
    this.recording = false;
    this.notes?.release(this.engine.ctx.currentTime);
    this.clips?.stop(this.engine.ctx.currentTime);
    if (!this.free) this.halt();
  }

  /**
   * Keep the clock running while the transport is stopped, for the arpeggiator alone (the drums and the
   * note sequencer stay silent). Started from stopped, its first step is now, so the first note isn't late.
   */
  setFree(on: boolean) {
    this.free = on;
    if (on && !this.running) {
      this.nextBeat = 0;
      this.arp?.restart();
      this.run(0);
    } else if (!on && !this.playing) this.halt();
  }

  private run(delay: number) {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.engine.ctx.currentTime + delay;
    this.clock.start(TICK_MS, () => this.schedule());
    this.schedule();
  }

  private halt() {
    if (!this.running) return;
    this.running = false;
    this.clock.stop();
  }

  /** Beats since Play at the audio clock's time now (as heard), or -1 when stopped. */
  get beatNow(): number {
    if (!this.playing) return -1;
    return Math.max(0, this.nextBeat - (this.nextTime - this.engine.ctx.currentTime) / (60 / this.engine.bpm));
  }

  /** Step under the playhead right now, or -1 when stopped. */
  get currentStep(): number {
    if (!this.playing) return -1;
    const now = this.engine.ctx.currentTime;
    let best = -1;
    let bestTime = -Infinity;
    this.stepTimes.forEach((t, i) => {
      if (t <= now && t > bestTime) {
        best = i;
        bestTime = t;
      }
    });
    return best;
  }

  /** Record a live pad hit into the nearest step. */
  record(track: number, velocity: number) {
    if (!this.playing || !this.recording) return;
    const now = this.engine.ctx.currentTime;
    const cur = this.currentStep;
    if (cur < 0) return;
    const late = now - this.stepTimes[cur];
    const step = late > this.stepDuration / 2 ? (cur + 1) % STEPS : cur;
    this.pattern[track][step] = velocity;
    // If quantised forward onto a step that's already scheduled, the hit was heard live anyway.
  }

  /** Plan every step that starts within the lookahead. Exposed for tests; the clock calls it. */
  schedule() {
    const now = this.engine.ctx.currentTime;
    while (this.nextTime < now + LOOKAHEAD) {
      const step = this.nextStep;
      const lead = this.nextTime - now;
      // Late: the page was busy (or asleep) when this step should have been planned.
      const late = lead < -LATE_TOLERANCE;
      const secPerBeat = 60 / this.engine.bpm;
      const stepStart = this.nextTime;
      const timeAt = (b: number) => stepStart + (b - this.nextBeat) * secPerBeat;
      if (this.playing) {
        if (late) this.stats.lateSteps++;
        else if (this.nextBeat > 0) this.stats.closest = Math.min(this.stats.closest ?? Infinity, lead);
        this.stepTimes[step] = this.nextTime;
        this.onStep(step, this.nextTime);
        for (let track = 0; track < TRACKS && !late; track++) {
          const vel = this.pattern[track][step];
          if (vel > 0 && this.drumsOn) {
            this.engine.drums.trigger(track, vel, this.nextTime);
            this.onTrigger(track, vel, this.nextTime);
          }
        }
        this.notes?.schedule(this.nextBeat, this.nextBeat + 0.25, timeAt, secPerBeat, late);
        this.clips?.schedule(this.nextBeat, this.nextBeat + 0.25, timeAt, secPerBeat, late);
      }
      this.arp?.schedule(this.nextBeat, this.nextBeat + 0.25, timeAt, secPerBeat, late);
      this.nextTime += this.stepDuration;
      this.nextBeat += 0.25;
      this.nextStep = (step + 1) % STEPS;
    }
  }
}
