import { FILTER_TYPES, WAVES, type ParamValues } from "./params";

/** Shared nodes a voice plugs into. Owned by the engine. */
export interface VoiceContext {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  /** Pitch modulation in cents (bend + LFO), added to every oscillator's detune. */
  pitchMod: AudioNode;
  /** Filter modulation in cents (LFO), added to every filter's detune. */
  filterMod: AudioNode;
  driveCurve: (drive: number) => Float32Array<ArrayBuffer> | null;
}

export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Biquad lowpass/highpass Q is in dB; bandpass Q is a plain quality factor. */
export function filterQ(type: number, resonance: number) {
  return FILTER_TYPES[type] === "bandpass" ? resonance : Math.min(24, 20 * Math.log10(resonance));
}

export function filterBase(p: ParamValues, note: number) {
  return Math.min(20000, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
}

/** Freeze an automated param at its current value (cancelAndHoldAtTime is missing in Firefox). */
function hold(param: AudioParam, t: number) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

/** One sounding note: oscillators -> drive -> filter -> amp. */
export class Voice {
  note: number;
  releasedAt: number | null = null;
  readonly startedAt: number;

  private osc1: OscillatorNode[] = [];
  private osc2: OscillatorNode[] = [];
  private sub: OscillatorNode;
  private noise: AudioBufferSourceNode;
  private osc1Gain: GainNode;
  private osc2Gain: GainNode;
  private subGain: GainNode;
  private noiseGain: GainNode;
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private amp: GainNode;
  private peak = 1;

  constructor(
    private vc: VoiceContext,
    p: ParamValues,
    note: number,
    velocity: number,
    t: number,
  ) {
    const { ctx } = vc;
    this.note = note;
    this.startedAt = t;
    const freq = midiToHz(note);

    this.osc1Gain = new GainNode(ctx);
    this.osc2Gain = new GainNode(ctx);
    this.subGain = new GainNode(ctx);
    this.noiseGain = new GainNode(ctx);
    this.shaper = new WaveShaperNode(ctx, { oversample: "2x" });
    this.filter = new BiquadFilterNode(ctx);
    this.amp = new GainNode(ctx, { gain: 0 });

    const unison = Math.round(p.unison);
    const unisonGain = 1 / Math.sqrt(unison);
    for (let i = 0; i < unison; i++) {
      this.osc1.push(this.makeOsc(freq, this.osc1Gain));
      this.osc2.push(this.makeOsc(freq, this.osc2Gain));
    }
    this.osc1Gain.gain.value = unisonGain;
    this.osc2Gain.gain.value = unisonGain;
    this.sub = this.makeOsc(freq / 2, this.subGain);
    this.sub.type = "square";

    this.noise = new AudioBufferSourceNode(ctx, { buffer: vc.noise, loop: true });
    this.noise.connect(this.noiseGain);
    // Random start so stacked voices don't phase.
    this.noise.start(t, Math.random() * vc.noise.duration);

    const mix = new GainNode(ctx, { gain: 0.5 });
    for (const g of [this.osc1Gain, this.osc2Gain, this.subGain, this.noiseGain]) g.connect(mix);
    mix.connect(this.shaper).connect(this.filter).connect(this.amp).connect(vc.out);
    vc.filterMod.connect(this.filter.detune);

    this.apply(p, t);
    for (const o of [...this.osc1, ...this.osc2, this.sub]) o.start(t);

    // Amp envelope
    const vel = velocity / 127;
    this.peak = 1 - p.velocity + p.velocity * vel;
    const a = this.amp.gain;
    a.setValueAtTime(0, t);
    a.linearRampToValueAtTime(this.peak, t + p.attack);
    a.setTargetAtTime(this.peak * p.sustain, t + p.attack, p.decay / 4);

    // Filter envelope, in cents on filter.detune so the LFO and cutoff knob stay independent.
    const amount = p.filterEnvAmt * 1200 * (0.5 + 0.5 * (p.velocity > 0 ? vel : 1));
    const d = this.filter.detune;
    d.setValueAtTime(0, t);
    d.linearRampToValueAtTime(amount, t + p.filterAttack);
    d.setTargetAtTime(amount * p.filterSustain, t + p.filterAttack, p.filterDecay / 4);
  }

  private makeOsc(freq: number, dest: AudioNode) {
    const o = new OscillatorNode(this.vc.ctx, { frequency: freq });
    this.vc.pitchMod.connect(o.detune);
    o.connect(dest);
    return o;
  }

  /** Update sound parameters on a sounding voice. Envelopes keep their current shape. */
  apply(p: ParamValues, t = this.vc.ctx.currentTime) {
    const unison = this.osc1.length;
    const spread = (i: number) => (unison === 1 ? 0 : (i / (unison - 1) - 0.5) * 2 * Math.max(p.osc2Detune, 8));
    this.osc1.forEach((o, i) => {
      o.type = WAVES[p.osc1Wave];
      o.detune.setTargetAtTime(spread(i), t, 0.01);
    });
    this.osc2.forEach((o, i) => {
      o.type = WAVES[p.osc2Wave];
      o.detune.setTargetAtTime(p.osc2Semi * 100 + p.osc2Detune + spread(i), t, 0.01);
    });
    this.osc1Gain.gain.setTargetAtTime((1 - p.oscMix) / Math.sqrt(unison), t, 0.01);
    this.osc2Gain.gain.setTargetAtTime(p.oscMix / Math.sqrt(unison), t, 0.01);
    this.subGain.gain.setTargetAtTime(p.subLevel * 0.8, t, 0.01);
    this.noiseGain.gain.setTargetAtTime(p.noiseLevel * 0.6, t, 0.01);
    this.shaper.curve = this.vc.driveCurve(p.drive);
    this.filter.type = FILTER_TYPES[p.filterType];
    this.filter.Q.setTargetAtTime(filterQ(p.filterType, p.resonance), t, 0.01);
    this.filter.frequency.setTargetAtTime(filterBase(p, this.note), t, 0.01);
  }

  /** Mono mode: move to a new note without retriggering envelopes. */
  glideTo(note: number, p: ParamValues, t: number) {
    this.note = note;
    const freq = midiToHz(note);
    const glide = Math.max(0.001, p.glide / 3);
    for (const o of [...this.osc1, ...this.osc2]) {
      hold(o.frequency, t);
      o.frequency.setTargetAtTime(freq, t, glide);
    }
    hold(this.sub.frequency, t);
    this.sub.frequency.setTargetAtTime(freq / 2, t, glide);
    this.filter.frequency.setTargetAtTime(filterBase(p, note), t, glide);
  }

  /** Mono mode: a new note after all keys were released retriggers the envelopes. */
  retrigger(p: ParamValues, velocity: number, t: number) {
    this.releasedAt = null;
    const vel = velocity / 127;
    this.peak = 1 - p.velocity + p.velocity * vel;
    const a = this.amp.gain;
    hold(a, t);
    a.linearRampToValueAtTime(this.peak, t + p.attack);
    a.setTargetAtTime(this.peak * p.sustain, t + p.attack, p.decay / 4);
    const amount = p.filterEnvAmt * 1200 * (0.5 + 0.5 * (p.velocity > 0 ? vel : 1));
    const d = this.filter.detune;
    hold(d, t);
    d.linearRampToValueAtTime(amount, t + p.filterAttack);
    d.setTargetAtTime(amount * p.filterSustain, t + p.filterAttack, p.filterDecay / 4);
  }

  /** Start the release stage. Returns the time the voice falls silent. */
  release(p: ParamValues, t: number): number {
    this.releasedAt = t;
    hold(this.amp.gain, t);
    this.amp.gain.setTargetAtTime(0, t, p.release / 4);
    hold(this.filter.detune, t);
    this.filter.detune.setTargetAtTime(0, t, p.release / 4);
    return t + p.release * 1.8 + 0.05;
  }

  /** Fast fade for voice stealing. */
  kill(t: number) {
    hold(this.amp.gain, t);
    this.amp.gain.setTargetAtTime(0, t, 0.005);
    this.stop(t + 0.05);
  }

  stop(at: number) {
    for (const o of [...this.osc1, ...this.osc2, this.sub, this.noise]) {
      try {
        o.stop(at);
      } catch {
        // already stopped
      }
    }
    // The shared modulation sources hold references to every voice they feed: unplug them.
    this.noise.onended = () => {
      for (const o of [...this.osc1, ...this.osc2, this.sub]) this.vc.pitchMod.disconnect(o.detune);
      this.vc.filterMod.disconnect(this.filter.detune);
      this.amp.disconnect();
    };
  }
}
