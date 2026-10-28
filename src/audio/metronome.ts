// The recording metronome: a click on each beat (a higher one on the bar's first) while it is on and the
// transport plays, planned on the drum sequencer's clock, and a bar of clicks for a count-in. It plays
// straight to the speakers, past the parts and effects, so it is never in what the song sounds like.

import type { BeatPlanner } from "./sequencer";

/** What makes the clicks. */
export interface Clicks {
  click(time: number, accent: boolean): void;
  /** Silence every click planned after `time`. */
  cancel(time: number): void;
}

const BEATS_PER_BAR = 4;

export class Metronome implements BeatPlanner {
  /** Clicks while the transport plays (the count-in clicks whatever this says). */
  on = false;

  constructor(private out: Clicks) {}

  reset() {}

  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, _secPerBeat: number, skip: boolean) {
    if (!this.on || skip) return;
    for (let b = Math.ceil(fromBeat - 1e-9); b < toBeat - 1e-9; b++) this.out.click(timeAt(b), b % BEATS_PER_BAR === 0);
  }

  stop(time: number) {
    this.out.cancel(time);
  }

  /** A bar of clicks ending at `start` (the beat the transport starts on). */
  countIn(start: number, secPerBeat: number) {
    for (let b = 0; b < BEATS_PER_BAR; b++) this.out.click(start - (BEATS_PER_BAR - b) * secPerBeat, b === 0);
  }
}

/** Short sine blips into their own gain, then the speakers. */
export class ClickSound implements Clicks {
  private gain: GainNode;
  private planned: { osc: OscillatorNode; time: number }[] = [];

  constructor(private ctx: BaseAudioContext) {
    this.gain = new GainNode(ctx, { gain: 0.5 });
    this.gain.connect(ctx.destination);
  }

  /** 0..1, heard on a curve (half way is about -12 dB). */
  set volume(v: number) {
    this.gain.gain.value = Math.max(0, Math.min(1, v)) ** 2;
  }

  click(time: number, accent: boolean) {
    const t = Math.max(time, this.ctx.currentTime);
    const osc = new OscillatorNode(this.ctx, { frequency: accent ? 1760 : 1320 });
    const env = new GainNode(this.ctx, { gain: 0 });
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(env).connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.06);
    const entry = { osc, time: t };
    this.planned.push(entry);
    osc.onended = () => {
      this.planned = this.planned.filter((p) => p !== entry);
      env.disconnect();
    };
  }

  cancel(time: number) {
    for (const p of this.planned) if (p.time > time) p.osc.stop();
  }
}
