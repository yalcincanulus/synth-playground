import { lfoShape } from "./dsp/lfo";
import { LFO_WAVES } from "./params";

/**
 * What one of the two LFOs is doing, for the Synth view's drawings. The LFOs themselves run in the
 * voice processor (dsp/lfo.ts); it reports their phase and rate a few dozen times a second, and each
 * new random (sample & hold) value. In between, the phase is worked out from the last report.
 */
export class Lfo {
  private wave = 0;
  private requested: number;
  /** The phase was `phase` at audio time `time`, moving at `rate` cycles per second. */
  private anchor = { time: 0, phase: 0, rate: 1 };
  /** Sample & hold steps: [time, value], oldest first. */
  private steps: [number, number][] = [[0, 0]];

  constructor(
    private ctx: BaseAudioContext,
    rate: number,
  ) {
    this.requested = this.anchor.rate = rate;
  }

  get shape() {
    return LFO_WAVES[this.wave];
  }

  /** The speed asked for, in Hz. */
  get rate() {
    return this.requested;
  }

  setRate(rate: number) {
    this.requested = rate;
  }

  setWave(wave: number) {
    this.wave = wave;
  }

  /** From the processor: the phase at audio time `time`. */
  report(time: number, phase: number, rate: number) {
    this.anchor = { time, phase, rate };
  }

  /** From the processor: a new random value from audio time `time`. */
  step(time: number, value: number) {
    this.steps.push([time, value]);
    // Keep a few seconds of history for the display.
    while (this.steps.length > 2 && this.steps[1][0] < time - 30) this.steps.shift();
  }

  /** Cycle position 0..1 at audio time t. */
  phase(t = this.ctx.currentTime) {
    const a = this.anchor;
    return (((a.phase + (t - a.time) * a.rate) % 1) + 1) % 1;
  }

  /** Output -1..1 at audio time t. */
  value(t = this.ctx.currentTime) {
    if (this.shape !== "random") return lfoShape(this.wave, this.phase(t));
    let v = 0;
    for (const [time, value] of this.steps) if (time <= t) v = value;
    return v;
  }

  /** Recent sample & hold values with their times, for drawing. */
  get history(): readonly [number, number][] {
    return this.steps;
  }
}
