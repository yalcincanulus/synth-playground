import { Drums } from "./drums";
import { Fx } from "./fx";
import { DELAY_DIV_BEATS, LFO_TARGETS, defaultValues, type ParamId, type ParamValues } from "./params";
import { Voice, type VoiceContext } from "./voice";

const MAX_VOICES = 10;
const BEND_RANGE_CENTS = 200;

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

    this.vc = {
      ctx,
      out: voiceBus,
      noise,
      pitchMod,
      filterMod,
      driveCurve: (d) => this.driveCurve(d),
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
    // The LFO's own depth goes to its target; the mod strip adds depth to the mod target.
    const depth = (target: number) =>
      Math.min(1, (p.lfoTarget === target ? p.lfoDepth : 0) + (p.modTarget === target ? this.mod : 0));
    const [pitch, filter, amp] = LFO_TARGETS.map((_, i) => depth(i));
    this.lfo.frequency.setTargetAtTime(p.lfoRate, t, 0.02);
    this.lfo.type = p.lfoTarget === 2 ? "sine" : "triangle";
    this.lfoPitch.gain.setTargetAtTime(pitch * 60, t, 0.02);
    this.lfoFilter.gain.setTargetAtTime(filter * 3600, t, 0.02);
    this.lfoAmp.gain.setTargetAtTime(amp * 0.5, t, 0.02);
    this.tremolo.gain.setTargetAtTime(1 - amp * 0.5, t, 0.02);
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
