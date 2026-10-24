import { Drums } from "./drums";
import { Fx } from "./fx";
import { Lfo } from "./lfo";
import { envelopeAt } from "./envelope";
import { DELAY_DIV_BEATS, LFO_SYNC_BEATS, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, defaultValues, slotIds, type ModSource, type ParamId, type ParamValues } from "./params";
import oscWorkletUrl from "./osc.worklet.ts?worker&url";
import { buildMips, FRAMES, tableFrames, WAVETABLES } from "./wavetables";
import { keySource, MOD_RANGE, Voice, type VoiceContext, type VoiceTaps } from "./voice";

const MAX_VOICES = 10;
export const BEND_RANGE_CENTS = 200;
/** LFO depth 1.0 means: ±60 cents of pitch, ±3 octaves of cutoff, ±50% volume, ±45% pulse width or ±50% wavetable position. */
export const LFO_PITCH_CENTS = 60;
export const LFO_FILTER_CENTS = 3600;
export const LFO_AMP = 0.5;
export const LFO_WIDTH = 0.45;
export const LFO_POSITION = 0.5;
const LFO_SCALE = [LFO_PITCH_CENTS, LFO_FILTER_CENTS, LFO_AMP, LFO_WIDTH, LFO_POSITION];

type PerTarget<T> = [T, T, T, T, T];

export type TapId = keyof VoiceTaps | "amp" | "chorus" | "delay" | "reverb" | "out";

/** Taps you can listen to on their own ("out" is the normal full sound). */
export type ListenTap = Exclude<TapId, "out">;
const LISTEN_GAIN = 0.3;

export interface VoiceState {
  note: number;
  velocity: number;
  triggeredAt: number;
  releasedAt: number | null;
  random: number;
}

export class Engine {
  readonly ctx = new AudioContext({ latencyHint: "interactive" });
  readonly fx: Fx;
  readonly drums: Drums;
  readonly analyser: AnalyserNode;
  /** Resolves when the oscillator worklet has loaded; notes before that are ignored. */
  readonly ready: Promise<void>;
  private loaded = false;
  /** Receives prepared wavetables for the oscillators (see osc.worklet.ts). */
  private tableLoader: AudioWorkletNode | null = null;
  private tablesSent = new Set<number>();

  params: ParamValues = defaultValues();
  bpm = 120;

  private vc: VoiceContext;
  private voices: Voice[] = [];
  /** Mono mode: the single voice and the stack of held keys (last = sounding). */
  private monoVoice: Voice | null = null;
  private held: number[] = [];

  private bend: ConstantSourceNode;
  /** The mod strip as a mod matrix source (0..1). */
  private modStrip: ConstantSourceNode;
  /** Two LFOs, each with a gain per target: [pitch, filter, amp, width]. */
  readonly lfos: [Lfo, Lfo];
  private lfoGains: PerTarget<GainNode>[];
  private tremolo: GainNode;
  private listenGain: GainNode;
  private listening: ListenTap | null = null;
  private mod = 0;
  readonly taps: Record<TapId, AnalyserNode>;
  private driveCache = new Map<number, Float32Array<ArrayBuffer>>();

  constructor() {
    const ctx = this.ctx;
    this.ready = ctx.audioWorklet.addModule(oscWorkletUrl).then(() => {
      this.tableLoader = new AudioWorkletNode(ctx, "table-loader", { numberOfInputs: 0, numberOfOutputs: 1 });
      this.loadTable(this.params.wtTable);
      this.loaded = true;
      // The rest in the background (about 15 ms each), so switching tables later is instant.
      WAVETABLES.forEach((_, i) => setTimeout(() => this.loadTable(i), 300 + i * 80));
    });
    this.fx = new Fx(ctx);
    this.analyser = this.fx.analyser;

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Global modulation: pitch bend + the LFOs, fanned out to every voice.
    const pitchMod = new GainNode(ctx);
    const filterMod = new GainNode(ctx);
    const widthMod = new GainNode(ctx);
    const positionMod = new GainNode(ctx);
    this.bend = new ConstantSourceNode(ctx, { offset: 0 });
    this.bend.connect(pitchMod);
    this.bend.start();
    this.modStrip = new ConstantSourceNode(ctx, { offset: 0 });
    this.modStrip.start();
    this.tremolo = new GainNode(ctx);
    this.lfos = [new Lfo(ctx, 5), new Lfo(ctx, 0.5)];
    this.lfoGains = this.lfos.map((lfo) => {
      const gains = LFO_SCALE.map(() => new GainNode(ctx, { gain: 0 })) as PerTarget<GainNode>;
      lfo.out.connect(gains[0]).connect(pitchMod);
      lfo.out.connect(gains[1]).connect(filterMod);
      lfo.out.connect(gains[2]).connect(this.tremolo.gain);
      lfo.out.connect(gains[3]).connect(widthMod);
      lfo.out.connect(gains[4]).connect(positionMod);
      return gains;
    });
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

    // "Listen here": a tap is routed to its own quiet, limited output while the main output is muted.
    this.listenGain = new GainNode(ctx, { gain: LISTEN_GAIN });
    const listenLimiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.15 });
    this.listenGain.connect(listenLimiter).connect(ctx.destination);

    this.vc = {
      ctx,
      out: voiceBus,
      noise,
      pitchMod,
      filterMod,
      widthMod,
      positionMod,
      globalSources: { "lfo 1": this.lfos[0].out, "lfo 2": this.lfos[1].out, "mod strip": this.modStrip },
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
    this.modStrip.offset.setTargetAtTime(value, this.ctx.currentTime, 0.005);
    this.applyLfo();
  }

  private applyGlobal() {
    const p = this.params;
    this.loadTable(p.wtTable);
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
    const waves = [p.lfoWave, p.lfo2Wave];
    let tremoloDepth = 0;
    this.lfos.forEach((lfo, i) => {
      lfo.setWave(waves[i]);
      lfo.setRate(this.lfoRate(i));
      const depths = this.lfoDepths(i);
      this.lfoGains[i].forEach((g, target) => g.gain.setTargetAtTime(depths[target] * LFO_SCALE[target], t, 0.02));
      tremoloDepth += depths[2] * LFO_AMP;
    });
    // Tremolo swings the volume around a lowered centre, so it never goes above full.
    this.tremolo.gain.setTargetAtTime(Math.max(0, 1 - tremoloDepth), t, 0.02);
  }

  /** Effective LFO speed in Hz: the Rate knob, or the tempo when synced. */
  lfoRate(i: number) {
    const p = this.params;
    const [rate, sync] = i === 0 ? [p.lfoRate, p.lfoSync] : [p.lfo2Rate, p.lfo2Sync];
    return sync ? this.bpm / 60 / LFO_SYNC_BEATS[sync] : rate;
  }

  // --- live state, for visualisation

  /**
   * Effective depth (0..1) of LFO `i` per target [pitch, filter, amp, width, position]. Each LFO's depth
   * goes to its target; the mod strip adds depth to LFO 1's mod target.
   */
  lfoDepths(i: number): PerTarget<number> {
    const p = this.params;
    const [target, depth] = i === 0 ? [p.lfoTarget, p.lfoDepth] : [p.lfo2Target, p.lfo2Depth];
    const extra = (t: number) => (i === 0 && p.modTarget === t ? this.mod : 0);
    return LFO_SCALE.map((_, t) => Math.min(1, (target === t ? depth : 0) + extra(t))) as PerTarget<number>;
  }

  /**
   * A mod matrix source's value right now, for the meters: per-note sources follow the newest
   * sounding note (null when none is playing).
   */
  modSourceValue(source: ModSource): number | null {
    const p = this.params;
    if (source === "off") return null;
    if (source === "lfo 1") return this.lfos[0].value();
    if (source === "lfo 2") return this.lfos[1].value();
    if (source === "mod strip") return this.mod;
    const v = this.voices[this.voices.length - 1];
    if (!v) return null;
    const now = this.ctx.currentTime;
    const env = (attack: number, decay: number, sustain: number, release: number) => envelopeAt({ attack, decay, sustain, release }, now, v.triggeredAt, v.releasedAt).level;
    switch (source) {
      case "filter env": return env(p.filterAttack, p.filterDecay, p.filterSustain, p.filterRelease);
      case "amp env": return env(p.attack, p.decay, p.sustain, p.release);
      case "mod env": return env(p.modEnvAttack, p.modEnvDecay, p.modEnvSustain, p.modEnvRelease);
      case "pitch env": return Math.exp(-(now - v.triggeredAt) / (p.pitchEnvDecay / 4));
      case "velocity": return v.velocity / 127;
      case "key": return keySource(v.note);
      case "random": return v.random;
    }
  }

  /** Wavetable position 0..1 right now, with the LFOs' and mod matrix's position modulation. */
  livePosition() {
    const p = this.params;
    let pos = p.wtPos;
    this.lfos.forEach((lfo, i) => (pos += this.lfoDepths(i)[4] * LFO_POSITION * lfo.value()));
    // Mod matrix routes to WT Pos, as heard on the newest note.
    for (let n = 1; n <= MOD_SLOTS; n++) {
      const ids = slotIds(n);
      if (MOD_DESTS[p[ids.dst]] !== "wt pos") continue;
      pos += p[ids.amt] * MOD_RANGE["wt pos"] * (this.modSourceValue(MOD_SOURCES[p[ids.src]]) ?? 0);
    }
    return Math.min(1, Math.max(0, pos));
  }

  /** Prepare a wavetable's mipmaps and hand them to the audio thread, once per table. */
  private loadTable(id: number) {
    if (!this.tableLoader || this.tablesSent.has(id)) return;
    this.tablesSent.add(id);
    const levels = buildMips(tableFrames(id));
    this.tableLoader.port.postMessage({ id, frames: FRAMES, levels }, levels.map((l) => l.buffer));
  }

  /** Where audio is going: null is the normal output, otherwise one tap on its own. */
  get listeningTo() {
    return this.listening;
  }

  listen(tap: ListenTap | null) {
    if (this.listening) this.taps[this.listening].disconnect(this.listenGain);
    this.listening = tap;
    if (tap) this.taps[tap].connect(this.listenGain);
    this.fx.setMuted(tap !== null);
  }

  get modAmount() {
    return this.mod;
  }

  /** Every voice still making sound, oldest first. */
  voiceStates(): VoiceState[] {
    return this.voices.map((v) => ({ note: v.note, velocity: v.velocity, triggeredAt: v.triggeredAt, releasedAt: v.releasedAt, random: v.random }));
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
    if (!this.loaded) return;
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
