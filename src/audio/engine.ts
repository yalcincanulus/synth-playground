import { Drums } from "./drums";
import { Fx } from "./fx";
import { DELAY_DIV_BEATS, defaultValues, type ParamId, type ParamValues } from "./params";
import { Voice, type VoiceContext, type VoiceTaps } from "./voice";

const MAX_VOICES = 10;
export const BEND_RANGE_CENTS = 200;
/** LFO depth 1.0 means: ±60 cents of pitch, ±3 octaves of cutoff, or ±50% volume. */
export const LFO_PITCH_CENTS = 60;
export const LFO_FILTER_CENTS = 3600;
export const LFO_AMP = 0.5;

export type TapId = keyof VoiceTaps | "amp" | "chorus" | "delay" | "reverb" | "out";

export interface VoiceState {
  note: number;
  velocity: number;
  triggeredAt: number;
  releasedAt: number | null;
}

export class Engine {
  readonly ctx = new AudioContext({ latencyHint: "interactive" });
  readonly fx: Fx;
  readonly drums: Drums;
  readonly analyser: AnalyserNode;

  params: ParamValues = defaultValues();
  bpm = 120;

  private vc: VoiceContext;
  private voices: Voice[] = [];
  /** Mono mode: the single voice and the stack of held keys (last = sounding). */
  private monoVoice: Voice | null = null;
  private held: number[] = [];

  private bend: ConstantSourceNode;
  private lfo: OscillatorNode;
  private lfoPitch: GainNode;
  private lfoFilter: GainNode;
  private lfoAmp: GainNode;
  private tremolo: GainNode;
  private mod = 0;
  /** The LFO's phase can't be read from the audio graph, so track it: phase at `time`, moving at `rate`. */
  private lfoAnchor = { time: 0, phase: 0, rate: 5 };
  readonly taps: Record<TapId, AnalyserNode>;
  private driveCache = new Map<number, Float32Array<ArrayBuffer>>();

  constructor() {
    const ctx = this.ctx;
    this.fx = new Fx(ctx);
    this.analyser = this.fx.analyser;

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Global modulation: pitch bend + one LFO, fanned out to every voice.
    const pitchMod = new GainNode(ctx);
    const filterMod = new GainNode(ctx);
    this.bend = new ConstantSourceNode(ctx, { offset: 0 });
    this.bend.connect(pitchMod);
    this.bend.start();
    this.lfo = new OscillatorNode(ctx, { frequency: 5 });
    this.lfoPitch = new GainNode(ctx, { gain: 0 });
    this.lfoFilter = new GainNode(ctx, { gain: 0 });
    this.lfoAmp = new GainNode(ctx, { gain: 0 });
    this.lfo.connect(this.lfoPitch).connect(pitchMod);
    this.lfo.connect(this.lfoFilter).connect(filterMod);
    this.lfo.start();

    this.tremolo = new GainNode(ctx);
    this.lfo.connect(this.lfoAmp).connect(this.tremolo.gain);
    const voiceBus = new GainNode(ctx, { gain: 1 });
    voiceBus.connect(this.tremolo).connect(this.fx.synthIn);

    const tap = () => new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.6 });
    this.taps = {
      osc1: tap(), osc2: tap(), sub: tap(), noise: tap(), mix: tap(), drive: tap(), filter: tap(),
      amp: tap(), chorus: tap(), delay: tap(), reverb: tap(), out: this.fx.analyser,
    };
    this.tremolo.connect(this.taps.amp);
    this.fx.chorusOut.connect(this.taps.chorus);
    this.fx.delayOut.connect(this.taps.delay);
    this.fx.reverbOut.connect(this.taps.reverb);

    this.vc = {
      ctx,
      out: voiceBus,
      noise,
      pitchMod,
      filterMod,
      driveCurve: (d) => this.driveCurve(d),
      taps: this.taps,
    };
    this.drums = new Drums(ctx, this.fx.drumIn, noise);
    this.applyGlobal();
  }

  resume() {
    return this.ctx.resume();
  }

  // --- parameters

  setParams(values: ParamValues) {
    const wasMono = this.params.mono;
    this.params = { ...values };
    if (wasMono !== values.mono) this.allNotesOff();
    else if (this.monoVoice && this.monoVoice.releasedAt !== null) {
      // A released mono voice is kept for retriggering; rebuild it so the new preset's unison applies.
      this.monoVoice.stop(this.ctx.currentTime + 0.5);
      this.voices = this.voices.filter((v) => v !== this.monoVoice);
      this.monoVoice = null;
    }
    this.applyGlobal();
    this.applyVoices();
  }

  setParam(id: ParamId, value: number) {
    if (this.params[id] === value) return;
    if (id === "mono") this.allNotesOff();
    this.params[id] = value;
    this.applyGlobal();
    if (id !== "unison") this.applyVoices();
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    this.applyGlobal();
  }

  /** -1..1 */
  setBend(value: number) {
    this.bend.offset.setTargetAtTime(value * BEND_RANGE_CENTS, this.ctx.currentTime, 0.005);
  }

  /** 0..1 */
  setMod(value: number) {
    this.mod = value;
    this.applyLfo();
  }

  private applyGlobal() {
    const p = this.params;
    this.fx.set({
      chorus: p.chorus,
      delayMix: p.delayMix,
      delaySeconds: (60 / this.bpm) * DELAY_DIV_BEATS[p.delayDiv],
      delayFeedback: p.delayFeedback,
      reverbMix: p.reverbMix,
      reverbSize: p.reverbSize,
      volume: p.volume,
    });
    this.applyLfo();
  }

  private applyLfo() {
    const p = this.params;
    const t = this.ctx.currentTime;
    const [pitch, filter, amp] = this.lfoDepths();
    if (p.lfoRate !== this.lfoAnchor.rate) this.lfoAnchor = { time: t, phase: this.lfoPhase(t), rate: p.lfoRate };
    this.lfo.frequency.setTargetAtTime(p.lfoRate, t, 0.02);
    this.lfo.type = this.lfoShape;
    this.lfoPitch.gain.setTargetAtTime(pitch * LFO_PITCH_CENTS, t, 0.02);
    this.lfoFilter.gain.setTargetAtTime(filter * LFO_FILTER_CENTS, t, 0.02);
    this.lfoAmp.gain.setTargetAtTime(amp * LFO_AMP, t, 0.02);
    this.tremolo.gain.setTargetAtTime(1 - amp * LFO_AMP, t, 0.02);
  }

  // --- live state, for visualisation

  /** Sine for tremolo (smoother on volume), triangle for pitch and filter. */
  get lfoShape(): "sine" | "triangle" {
    return this.params.lfoTarget === 2 ? "sine" : "triangle";
  }

  /** LFO cycle position, 0..1. */
  lfoPhase(t = this.ctx.currentTime) {
    const a = this.lfoAnchor;
    return (((a.phase + (t - a.time) * a.rate) % 1) + 1) % 1;
  }

  /** LFO output -1..1 at a phase (both Web Audio shapes start at 0, rising). */
  lfoValue(phase = this.lfoPhase()) {
    if (this.lfoShape === "sine") return Math.sin(2 * Math.PI * phase);
    if (phase < 0.25) return 4 * phase;
    if (phase < 0.75) return 2 - 4 * phase;
    return 4 * phase - 4;
  }

  /**
   * Effective LFO depth (0..1) per target [pitch, filter, amp]. The LFO's own depth goes
   * to its target; the mod strip adds depth to the mod target.
   */
  lfoDepths(): [number, number, number] {
    const p = this.params;
    const depth = (target: number) =>
      Math.min(1, (p.lfoTarget === target ? p.lfoDepth : 0) + (p.modTarget === target ? this.mod : 0));
    return [depth(0), depth(1), depth(2)];
  }

  get modAmount() {
    return this.mod;
  }

  /** Every voice still making sound, oldest first. */
  voiceStates(): VoiceState[] {
    return this.voices.map((v) => ({ note: v.note, velocity: v.velocity, triggeredAt: v.triggeredAt, releasedAt: v.releasedAt }));
  }

  private applyVoices() {
    for (const v of this.voices) v.apply(this.params);
  }

  private driveCurve(drive: number): Float32Array<ArrayBuffer> | null {
    if (drive < 0.01) return null;
    const key = Math.round(drive * 50);
    let curve = this.driveCache.get(key);
    if (!curve) {
      const k = 1 + (key / 50) * 12;
      curve = new Float32Array(1025);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / Math.tanh(k);
      }
      this.driveCache.set(key, curve);
    }
    return curve;
  }

  // --- notes

  noteOn(note: number, velocity: number) {
    const t = this.ctx.currentTime;
    if (this.params.mono) return this.monoNoteOn(note, velocity, t);

    // Retriggering a held note: release the old voice first.
    for (const v of this.voices) if (v.note === note && v.releasedAt === null) this.releaseVoice(v, t);
    // Steal the oldest voice, preferring released ones.
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => v.releasedAt !== null) ?? this.voices[0];
      victim.kill(t);
      this.voices.splice(this.voices.indexOf(victim), 1);
    }
    this.voices.push(new Voice(this.vc, this.params, note, velocity, t));
  }

  noteOff(note: number) {
    const t = this.ctx.currentTime;
    if (this.params.mono) return this.monoNoteOff(note, t);
    for (const v of this.voices) if (v.note === note && v.releasedAt === null) this.releaseVoice(v, t);
  }

  private releaseVoice(v: Voice, t: number) {
    const end = v.release(this.params, t);
    v.stop(end);
    setTimeout(() => {
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    }, (end - t) * 1000 + 50);
  }

  private monoNoteOn(note: number, velocity: number, t: number) {
    this.held = this.held.filter((n) => n !== note);
    this.held.push(note);
    const v = this.monoVoice;
    if (v && v.releasedAt === null) {
      v.glideTo(note, this.params, t); // legato
    } else if (v) {
      v.glideTo(note, { ...this.params, glide: 0 }, t);
      v.retrigger(this.params, velocity, t);
    } else {
      this.monoVoice = new Voice(this.vc, this.params, note, velocity, t);
      this.voices = [this.monoVoice];
    }
  }

  private monoNoteOff(note: number, t: number) {
    this.held = this.held.filter((n) => n !== note);
    const v = this.monoVoice;
    if (!v) return;
    if (this.held.length) {
      if (v.note === note) v.glideTo(this.held[this.held.length - 1], this.params, t);
    } else {
      // Release but keep the voice alive, so a quick next note can retrigger it.
      v.release(this.params, t);
    }
  }

  allNotesOff() {
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.kill(t);
    this.voices = [];
    this.monoVoice = null;
    this.held = [];
  }

  get activeVoices() {
    return this.voices.filter((v) => v.releasedAt === null).length;
  }
}
