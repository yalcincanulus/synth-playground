export const DRUM_NAMES = ["Kick", "Snare", "Clap", "Closed HH", "Open HH", "Low Tom", "High Tom", "Cowbell"] as const;

/** Synthesised drum kit: one voice per pad. */
export class Drums {
  private openHat: GainNode | null = null;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private noise: AudioBuffer,
  ) {}

  trigger(pad: number, velocity: number, t = this.ctx.currentTime) {
    const v = 0.25 + 0.75 * (velocity / 127);
    switch (pad) {
      case 0: return this.kick(t, v);
      case 1: return this.snare(t, v);
      case 2: return this.clap(t, v);
      case 3: return this.hat(t, v, 0.05);
      case 4: return this.hat(t, v, 0.45, true);
      case 5: return this.tom(t, v, 120, 75);
      case 6: return this.tom(t, v, 200, 130);
      case 7: return this.cowbell(t, v);
    }
  }

  private env(t: number, peak: number, decay: number, attack = 0.001) {
    const g = new GainNode(this.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out);
    return g;
  }

  private noiseSource(t: number, duration: number) {
    const n = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    n.start(t, Math.random() * (this.noise.duration - duration - 0.1));
    n.stop(t + duration);
    return n;
  }

  private kick(t: number, v: number) {
    const o = new OscillatorNode(this.ctx, { frequency: 160 });
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    o.connect(this.env(t, v * 1.1, 0.45));
    o.start(t);
    o.stop(t + 0.5);
    const click = new OscillatorNode(this.ctx, { type: "square", frequency: 900 });
    click.connect(this.env(t, v * 0.08, 0.008));
    click.start(t);
    click.stop(t + 0.02);
  }

  private snare(t: number, v: number) {
    const n = this.noiseSource(t, 0.25);
    n.connect(new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 1400 })).connect(this.env(t, v * 0.55, 0.2));
    const o = new OscillatorNode(this.ctx, { type: "triangle", frequency: 190 });
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(this.env(t, v * 0.5, 0.1));
    o.start(t);
    o.stop(t + 0.15);
  }

  private clap(t: number, v: number) {
    const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: 1200, Q: 1.2 });
    const g = new GainNode(this.ctx, { gain: 0 });
    // Three quick bursts, then a tail.
    for (const [i, dt] of [0, 0.011, 0.023].entries()) {
      g.gain.setValueAtTime(v * 0.9, t + dt);
      g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.01);
      if (i === 2) g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
    }
    this.noiseSource(t, 0.3).connect(bp).connect(g).connect(this.out);
  }

  private hat(t: number, v: number, decay: number, open = false) {
    // A closed hat chokes a ringing open hat.
    if (this.openHat) {
      this.openHat.gain.cancelScheduledValues(t);
      this.openHat.gain.setTargetAtTime(0, t, 0.01);
      this.openHat = null;
    }
    const g = this.env(t, v * 0.35, decay);
    this.noiseSource(t, decay + 0.05)
      .connect(new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 7000 }))
      .connect(g);
    if (open) this.openHat = g;
  }

  private tom(t: number, v: number, from: number, to: number) {
    const o = new OscillatorNode(this.ctx, { frequency: from });
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + 0.25);
    o.connect(this.env(t, v * 0.8, 0.35));
    o.start(t);
    o.stop(t + 0.4);
  }

  private cowbell(t: number, v: number) {
    const bp = new BiquadFilterNode(this.ctx, { type: "bandpass", frequency: 800, Q: 3 });
    bp.connect(this.env(t, v * 0.5, 0.25));
    for (const f of [540, 800]) {
      const o = new OscillatorNode(this.ctx, { type: "square", frequency: f });
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.3);
    }
  }
}
