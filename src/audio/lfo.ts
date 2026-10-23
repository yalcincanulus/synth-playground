import { LFO_WAVES } from "./params";

const OSC_TYPES: Record<string, OscillatorType> = { sine: "sine", triangle: "triangle", saw: "sawtooth", square: "square" };
const LOOKAHEAD = 0.1;
const TICK_MS = 25;

/**
 * A low-frequency oscillator with an output of -1..1 on `out`.
 *
 * Smooth shapes come from an OscillatorNode. "random" (sample & hold) is a
 * ConstantSourceNode stepped to a new random value at the start of each cycle,
 * scheduled ahead of time like the drum sequencer.
 *
 * The audio graph can't report its phase, so the phase is tracked here: it was
 * `anchor.phase` at `anchor.time` and moves at `anchor.rate` cycles per second.
 */
export class Lfo {
  readonly out: GainNode;
  private osc: OscillatorNode;
  private oscGain: GainNode;
  private sh: ConstantSourceNode;
  private shGain: GainNode;
  private wave = 1;
  private anchor = { time: 0, phase: 0, rate: 1 };
  /** Sample & hold steps already scheduled: [time, value], oldest first. */
  private steps: [number, number][] = [[0, 0]];
  private timer = 0;

  constructor(private ctx: BaseAudioContext, rate: number) {
    this.out = new GainNode(ctx);
    this.osc = new OscillatorNode(ctx, { frequency: rate });
    this.oscGain = new GainNode(ctx);
    this.sh = new ConstantSourceNode(ctx, { offset: 0 });
    this.shGain = new GainNode(ctx, { gain: 0 });
    this.osc.connect(this.oscGain).connect(this.out);
    this.sh.connect(this.shGain).connect(this.out);
    this.osc.start();
    this.sh.start();
    this.anchor.rate = rate;
  }

  get shape() {
    return LFO_WAVES[this.wave];
  }

  get rate() {
    return this.anchor.rate;
  }

  setRate(rate: number) {
    if (rate === this.anchor.rate) return;
    const t = this.ctx.currentTime;
    this.anchor = { time: t, phase: this.phase(t), rate };
    this.osc.frequency.setTargetAtTime(rate, t, 0.02);
    if (this.shape === "random") this.rescheduleSteps();
  }

  setWave(wave: number) {
    if (wave === this.wave) return;
    this.wave = wave;
    const t = this.ctx.currentTime;
    const random = this.shape === "random";
    if (!random) this.osc.type = OSC_TYPES[this.shape];
    this.oscGain.gain.setTargetAtTime(random ? 0 : 1, t, 0.01);
    this.shGain.gain.setTargetAtTime(random ? 1 : 0, t, 0.01);
    clearInterval(this.timer);
    if (random) {
      this.rescheduleSteps();
      this.timer = window.setInterval(() => this.scheduleSteps(), TICK_MS);
    }
  }

  /** Cycle position 0..1 at audio time t. */
  phase(t = this.ctx.currentTime) {
    const a = this.anchor;
    return (((a.phase + (t - a.time) * a.rate) % 1) + 1) % 1;
  }

  /** Output -1..1 at audio time t (all Web Audio shapes start at 0, rising). */
  value(t = this.ctx.currentTime) {
    const p = this.phase(t);
    switch (this.shape) {
      case "sine": return Math.sin(2 * Math.PI * p);
      case "triangle": return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      case "saw": return p < 0.5 ? 2 * p : 2 * p - 2;
      case "square": return p < 0.5 ? 1 : -1;
      default: {
        let v = 0;
        for (const [time, value] of this.steps) if (time <= t) v = value;
        return v;
      }
    }
  }

  /** Recent sample & hold values with their times, for drawing. */
  get history(): readonly [number, number][] {
    return this.steps;
  }

  /** Audio time of the next cycle start strictly after t. */
  private nextCycle(t: number) {
    const a = this.anchor;
    const cycles = a.phase + (t - a.time) * a.rate;
    // The epsilon matters: at a boundary, rounding can put `cycles` just below the integer,
    // and without it this would return t itself (and the scheduling loop would never advance).
    const next = a.time + (Math.floor(cycles + 1e-6) + 1 - a.phase) / a.rate;
    return next > t ? next : t + 1 / a.rate;
  }

  private rescheduleSteps() {
    const t = this.ctx.currentTime;
    this.sh.offset.cancelScheduledValues(t);
    this.steps = this.steps.filter(([time]) => time <= t);
    this.scheduleSteps();
  }

  private scheduleSteps() {
    const now = this.ctx.currentTime;
    let last = this.steps[this.steps.length - 1][0];
    for (let t = this.nextCycle(Math.max(last, now - 1 / this.anchor.rate)); t < now + LOOKAHEAD; t = this.nextCycle(t)) {
      if (t <= last) continue;
      const value = Math.random() * 2 - 1;
      this.sh.offset.setValueAtTime(value, Math.max(t, now));
      this.steps.push([t, value]);
      last = t;
    }
    // Keep a few seconds of history for the display.
    while (this.steps.length > 2 && this.steps[1][0] < now - 30) this.steps.shift();
  }
}
