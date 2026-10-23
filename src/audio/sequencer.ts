import type { Engine } from "./engine";

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
 * 16-step drum sequencer with lookahead scheduling: a timer wakes every 25 ms
 * and schedules any steps falling in the next 100 ms at exact audio times.
 */
export class Sequencer {
  pattern: Pattern = basicBeat();
  playing = false;
  recording = false;
  onTrigger: (track: number, velocity: number, time: number) => void = () => {};
  /** Called when each step is scheduled, with the audio time it will sound at. */
  onStep: (step: number, time: number) => void = () => {};

  private timer = 0;
  private nextStep = 0;
  private nextTime = 0;
  /** Audio time each step is scheduled at, for quantised recording and UI playhead. */
  private stepTimes: number[] = Array(STEPS).fill(0);

  constructor(private engine: Engine) {}

  get stepDuration() {
    return 60 / this.engine.bpm / 4;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextStep = 0;
    this.nextTime = this.engine.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    this.playing = false;
    this.recording = false;
    clearInterval(this.timer);
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

  private schedule() {
    const ctx = this.engine.ctx;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const step = this.nextStep;
      this.stepTimes[step] = this.nextTime;
      this.onStep(step, this.nextTime);
      for (let track = 0; track < TRACKS; track++) {
        const vel = this.pattern[track][step];
        if (vel > 0) {
          this.engine.drums.trigger(track, vel, this.nextTime);
          this.onTrigger(track, vel, this.nextTime);
        }
      }
      this.nextTime += this.stepDuration;
      this.nextStep = (step + 1) % STEPS;
    }
  }
}
