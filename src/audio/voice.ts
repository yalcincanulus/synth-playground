import { FILTER_TYPES, type ParamValues } from "./params";

/** Shared nodes a voice plugs into. Owned by the engine. */
export interface VoiceContext {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  /** Pitch modulation in cents (bend + LFO), added to every oscillator's detune. */
  pitchMod: AudioNode;
  /** Filter modulation in cents (LFO), added to every filter's detune. */
  filterMod: AudioNode;
  /** Pulse width modulation (LFO), added to every oscillator's width. */
  widthMod: AudioNode;
  driveCurve: (drive: number) => Float32Array<ArrayBuffer> | null;
  /** Shared analysers that every voice also feeds, so each stage can be visualised. */
  taps: VoiceTaps;
}

export interface VoiceTaps {
  /** Raw sources, before their mixer level. */
  osc1: AudioNode;
  osc2: AudioNode;
  sub: AudioNode;
  noise: AudioNode;
  /** After the mixer, after drive, after the filter. */
  mix: AudioNode;
  drive: AudioNode;
  filter: AudioNode;
}

export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Biquad lowpass/highpass Q is in dB; bandpass Q is a plain quality factor. */
export function filterQ(type: number, resonance: number) {
  return FILTER_TYPES[type] === "bandpass" ? resonance : Math.min(24, 20 * Math.log10(resonance));
}

export function filterBase(p: ParamValues, note: number) {
  return Math.min(20000, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
}

/** Unison copies are spread this many cents either side (at least), so they never sound like one. */
export const unisonSpread = (p: ParamValues) => Math.max(p.osc2Detune, 8);

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
  /** When the envelopes last (re)started: differs from startedAt after a mono retrigger. */
  triggeredAt: number;
  velocity: number;

  /** Osc 1, Osc 2 and the sub, made together on the audio thread (see osc.worklet.ts). */
  private osc: AudioWorkletNode;
  private noise: AudioBufferSourceNode;
  private osc1Gain: GainNode;
  private osc2Gain: GainNode;
  private subGain: GainNode;
  private noiseGain: GainNode;
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private amp: GainNode;
  private mix: GainNode;
  private unison: number;
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
    this.triggeredAt = t;
    this.velocity = velocity;

    this.osc1Gain = new GainNode(ctx);
    this.osc2Gain = new GainNode(ctx);
    this.subGain = new GainNode(ctx);
    this.noiseGain = new GainNode(ctx);
    this.shaper = new WaveShaperNode(ctx, { oversample: "2x" });
    this.filter = new BiquadFilterNode(ctx);
    this.amp = new GainNode(ctx, { gain: 0 });

    const unison = (this.unison = Math.round(p.unison));
    this.osc = new AudioWorkletNode(ctx, "synth-osc", {
      numberOfInputs: 0,
      numberOfOutputs: 3,
      outputChannelCount: [1, 1, 1],
      processorOptions: { unison },
    });
    this.param("frequency").value = midiToHz(note);
    this.osc.connect(this.osc1Gain, 0);
    this.osc.connect(this.osc2Gain, 1);
    this.osc.connect(this.subGain, 2);
    vc.pitchMod.connect(this.param("detune"));
    vc.widthMod.connect(this.param("width"));

    this.noise = new AudioBufferSourceNode(ctx, { buffer: vc.noise, loop: true });
    this.noise.connect(this.noiseGain);
    // Random start so stacked voices don't phase.
    this.noise.start(t, Math.random() * vc.noise.duration);

    const mix = (this.mix = new GainNode(ctx, { gain: 0.5 }));
    for (const g of [this.osc1Gain, this.osc2Gain, this.subGain, this.noiseGain]) g.connect(mix);
    mix.connect(this.shaper).connect(this.filter).connect(this.amp).connect(vc.out);
    vc.filterMod.connect(this.filter.detune);

    const { taps } = vc;
    this.osc.connect(taps.osc1, 0);
    this.osc.connect(taps.osc2, 1);
    this.osc.connect(taps.sub, 2);
    this.noise.connect(taps.noise);
    mix.connect(taps.mix);
    this.shaper.connect(taps.drive);
    this.filter.connect(taps.filter);

    this.apply(p, t);
    this.startEnvelopes(p, velocity, t, false);
  }

  private param(name: string) {
    return this.osc.parameters.get(name)!;
  }

  /** Start (or, in mono, restart from where they are) the amp, filter and pitch envelopes. */
  private startEnvelopes(p: ParamValues, velocity: number, t: number, retrigger: boolean) {
    const start = (param: AudioParam) => (retrigger ? hold(param, t) : param.setValueAtTime(0, t));
    const vel = velocity / 127;
    this.peak = 1 - p.velocity + p.velocity * vel;
    const a = this.amp.gain;
    start(a);
    a.linearRampToValueAtTime(this.peak, t + p.attack);
    a.setTargetAtTime(this.peak * p.sustain, t + p.attack, p.decay / 4);

    // Filter envelope, in cents on filter.detune so the LFO and cutoff knob stay independent.
    const amount = p.filterEnvAmt * 1200 * (0.5 + 0.5 * (p.velocity > 0 ? vel : 1));
    const d = this.filter.detune;
    start(d);
    d.linearRampToValueAtTime(amount, t + p.filterAttack);
    d.setTargetAtTime(amount * p.filterSustain, t + p.filterAttack, p.filterDecay / 4);

    // Pitch envelope: jump to Amount, then slide back to the note's own pitch.
    const pe = this.param("pitchEnv");
    pe.cancelScheduledValues(t);
    pe.setValueAtTime(p.pitchEnvAmt * 100, t);
    pe.setTargetAtTime(0, t, p.pitchEnvDecay / 4);
  }

  /** Update sound parameters on a sounding voice. Envelopes keep their current shape. */
  apply(p: ParamValues, t = this.vc.ctx.currentTime) {
    const set = (name: string, v: number) => this.param(name).setValueAtTime(v, t);
    set("wave1", p.osc1Wave);
    set("wave2", p.osc2Wave);
    set("sync", p.oscSync);
    set("envTarget", p.pitchEnvTarget);
    this.param("osc2Detune").setTargetAtTime(p.osc2Semi * 100 + p.osc2Detune, t, 0.01);
    this.param("spread").setTargetAtTime(unisonSpread(p), t, 0.01);
    this.param("width").setTargetAtTime(p.pulseWidth, t, 0.01);
    this.param("fm").setTargetAtTime(p.fmAmount, t, 0.01);
    this.osc1Gain.gain.setTargetAtTime((1 - p.oscMix) / Math.sqrt(this.unison), t, 0.01);
    this.osc2Gain.gain.setTargetAtTime(p.oscMix / Math.sqrt(this.unison), t, 0.01);
    this.subGain.gain.setTargetAtTime(p.subLevel * 0.8, t, 0.01);
    this.noiseGain.gain.setTargetAtTime(p.noiseLevel, t, 0.01);
    this.shaper.curve = this.vc.driveCurve(p.drive);
    this.filter.type = FILTER_TYPES[p.filterType];
    this.filter.Q.setTargetAtTime(filterQ(p.filterType, p.resonance), t, 0.01);
    this.filter.frequency.setTargetAtTime(filterBase(p, this.note), t, 0.01);
  }

  /** Mono mode: move to a new note without retriggering envelopes. */
  glideTo(note: number, p: ParamValues, t: number) {
    this.note = note;
    const glide = Math.max(0.001, p.glide / 3);
    const f = this.param("frequency");
    hold(f, t);
    f.setTargetAtTime(midiToHz(note), t, glide);
    this.filter.frequency.setTargetAtTime(filterBase(p, note), t, glide);
  }

  /** Mono mode: a new note after all keys were released retriggers the envelopes. */
  retrigger(p: ParamValues, velocity: number, t: number) {
    this.releasedAt = null;
    this.triggeredAt = t;
    this.velocity = velocity;
    this.startEnvelopes(p, velocity, t, true);
  }

  /** Start the release stage. Returns the time the voice falls silent. */
  release(p: ParamValues, t: number): number {
    this.releasedAt = t;
    hold(this.amp.gain, t);
    this.amp.gain.setTargetAtTime(0, t, p.release / 4);
    hold(this.filter.detune, t);
    this.filter.detune.setTargetAtTime(0, t, p.filterRelease / 4);
    return t + p.release * 1.8 + 0.05;
  }

  /** Fast fade for voice stealing. */
  kill(t: number) {
    hold(this.amp.gain, t);
    this.amp.gain.setTargetAtTime(0, t, 0.005);
    this.stop(t + 0.05);
  }

  stop(at: number) {
    // The worklet has no stop(): it is told when to end, and then lets itself be removed.
    this.osc.port.postMessage({ stopAt: at });
    try {
      this.noise.stop(at);
    } catch {
      // already stopped
    }
    // The shared modulation sources hold references to every voice they feed: unplug them.
    this.noise.onended = () => {
      this.vc.pitchMod.disconnect(this.param("detune"));
      this.vc.widthMod.disconnect(this.param("width"));
      this.vc.filterMod.disconnect(this.filter.detune);
      for (const n of [this.osc, this.noise, this.mix, this.shaper, this.filter, this.amp]) n.disconnect();
    };
  }
}
