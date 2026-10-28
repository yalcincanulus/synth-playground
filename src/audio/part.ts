// One part: a sound with its own preset, its own voice processor ("synth-voices", dsp/voiceBank.ts),
// its own voices and LFOs, and its own way into the effects. The engine always has two: Keys (what you
// play) and Sequencer (what the step sequencer plays); each of the Song view's synth tracks is one more.

import { LFO_POSITION, LFO_WIDTH, lfoDepths, type PerTarget } from "./dsp/lfo";
import { clampWidth } from "./oscCore";
import { FX_AMOUNTS, TAPS, type LfoState, type TapName } from "./dsp/voiceBank";
import { keySource, MOD_RANGE } from "./dsp/voiceMath";
import { envelopeAt } from "./envelope";
import type { PartFx } from "./fx";
import { Lfo } from "./lfo";
import { LFO_SYNC_BEATS, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, defaultValues, slotIds, type Effect, type ModDest, type ModSource, type ParamId, type ParamValues } from "./params";
import { Voice, type NoteOwner } from "./voice";
import { voiceWeight } from "./voiceLimit";

/** Shortest glide used for a sequencer slide on a mono preset, in Glide units (seconds). */
const SLIDE_GLIDE = 0.12;

/** A part's own stages, for the Synth view: the voice stages, all its voices together ("amp"), and after each effect. */
export type PartTapId = TapName | "amp" | Effect;

export interface VoiceState {
  note: number;
  velocity: number;
  triggeredAt: number;
  releasedAt: number | null;
  random: number;
}

/** What a part needs from the engine. */
export interface PartHost {
  readonly ctx: AudioContext;
  readonly bpm: number;
  /** Make room for a voice of `weight` in this part (Max Voices, CPU), cutting voices if needed. */
  makeRoom(part: Part, weight: number, t: number): void;
  /** The part's sound settings changed: the shared effects may follow them. */
  changed(part: Part): void;
}

export class Part {
  params: ParamValues = defaultValues();
  voices: Voice[] = [];
  /** Mono mode: the single voice and the stack of held keys (last = sounding). */
  private monoVoice: Voice | null = null;
  private held: number[] = [];
  /** The voice processor; null until the worklet module has loaded. */
  private node: AudioWorkletNode | null = null;
  private pings = new Map<number, () => void>();
  private pingCount = 0;
  private tapsOn = false;
  private bend = 0;
  private mod = 0;
  /** Most voices at once, below the preset's Max Voices (a song track's limit, to spare the CPU). */
  voiceCap = Infinity;

  /** What the three LFOs (running in the voice processor) are doing, for the drawings. */
  readonly lfos: [Lfo, Lfo, Lfo];
  readonly taps: Record<PartTapId, AnalyserNode>;

  constructor(
    private host: PartHost,
    readonly owner: NoteOwner,
    readonly fx: PartFx,
  ) {
    const ctx = host.ctx;
    this.lfos = [new Lfo(ctx, this.params.lfoRate), new Lfo(ctx, this.params.lfo2Rate), new Lfo(ctx, this.params.lfo3Rate)];
    const tap = () => new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.6 });
    this.taps = { osc1: tap(), osc2: tap(), sub: tap(), noise: tap(), mix: tap(), drive: tap(), filter: tap(), filter2: tap(), amp: tap(), ...fx.taps };
  }

  /** Create the voice processor (once the worklet module has loaded). `seed` seeds its random LFO. */
  start(seed: number) {
    const node = new AudioWorkletNode(this.host.ctx, "synth-voices", {
      numberOfInputs: 0,
      numberOfOutputs: 1 + TAPS.length + 1,
      outputChannelCount: [2, ...TAPS.map(() => 1), FX_AMOUNTS],
      processorOptions: { values: this.params, seed },
    });
    node.connect(this.fx.input);
    node.connect(this.taps.amp);
    TAPS.forEach((tap, i) => node.connect(this.taps[tap], 1 + i));
    node.connect(this.fx.amounts, 1 + TAPS.length);
    node.port.onmessage = (e) => {
      if (e.data.type === "lfo") return this.lfoReport(e.data);
      if (e.data.type !== "pong") return;
      this.pings.get(e.data.n)?.();
      this.pings.delete(e.data.n);
    };
    this.node = node;
    this.fx.start();
    this.apply();
    this.sendControls();
    node.port.postMessage({ type: "taps", on: this.tapsOn });
  }

  /** Render the stage taps (they cost every voice extra work, so only while something uses them). */
  setTaps(on: boolean) {
    if (on === this.tapsOn) return;
    this.tapsOn = on;
    this.node?.port.postMessage({ type: "taps", on });
  }

  get started() {
    return this.node !== null;
  }

  /** The part was removed: silence it, and stop its processor for good. */
  close() {
    this.allNotesOff();
    this.node?.port.postMessage({ type: "close" });
    this.node?.disconnect();
    this.node = null;
  }

  /** Most voices this part may sound at once: its Max Voices, within its cap. */
  get maxVoices() {
    return Math.min(Math.round(this.params.maxVoices), this.voiceCap);
  }

  private lfoReport(r: LfoState & { time: number }) {
    this.lfos.forEach((lfo, i) => lfo.report(r.time, r.phase[i], r.rate[i]));
    for (const [i, frame, value] of r.steps) this.lfos[i].step(frame / this.host.ctx.sampleRate, value);
  }

  /** Resolves once the processor has every message sent so far (or after `timeoutMs`). */
  flush(timeoutMs: number): Promise<void> {
    if (!this.node) return Promise.resolve();
    const n = ++this.pingCount;
    return new Promise((resolve) => {
      this.pings.set(n, resolve);
      this.node!.port.postMessage({ type: "ping", n });
      setTimeout(resolve, timeoutMs);
    });
  }

  // --- parameters

  setParams(values: ParamValues) {
    const wasMono = this.params.mono;
    this.params = { ...values };
    if (wasMono !== values.mono) this.allNotesOff();
    else if (this.monoVoice && this.monoVoice.releasedAt !== null) {
      // A released mono voice is kept for retriggering; rebuild it so the new preset's unison applies.
      this.monoVoice.stop(this.host.ctx.currentTime + 0.5);
      this.remove(this.monoVoice);
    }
    this.apply();
  }

  setParam(id: ParamId, value: number) {
    if (this.params[id] === value) return;
    if (id === "mono") this.allNotesOff();
    this.params[id] = value;
    this.apply();
  }

  /** Send the settings to the processor and the effects. */
  apply() {
    const p = this.params;
    this.applyFx();
    this.applyLfo();
    this.node?.port.postMessage({ type: "params", values: p });
    this.host.changed(this);
  }

  /** The effects' settings (the delay time follows the tempo). */
  applyFx() {
    this.fx.set(this.params, this.host.bpm);
  }

  /** The LFOs' speeds follow the tempo when synced (their depths and shapes come with the parameters). */
  applyLfo() {
    const p = this.params;
    const waves = [p.lfoWave, p.lfo2Wave, p.lfo3Wave];
    const rates = this.lfos.map((lfo, i) => {
      lfo.setWave(waves[i]);
      lfo.setRate(this.lfoRate(i));
      return lfo.rate;
    });
    this.node?.port.postMessage({ type: "lfoRates", rates });
  }

  /** Effective LFO speed in Hz: the Rate knob, or the tempo when synced. */
  lfoRate(i: number) {
    const p = this.params;
    const [rate, sync] = [[p.lfoRate, p.lfoSync], [p.lfo2Rate, p.lfo2Sync], [p.lfo3Rate, p.lfo3Sync]][i];
    return sync ? this.host.bpm / 60 / LFO_SYNC_BEATS[sync] : rate;
  }

  /** Pitch bend in cents and the mod strip 0..1. */
  setControls(bend: number, mod: number) {
    this.bend = bend;
    this.mod = mod;
    this.sendControls();
  }

  private sendControls() {
    this.node?.port.postMessage({ type: "controls", bend: this.bend, mod: this.mod });
  }

  get modAmount() {
    return this.mod;
  }

  // --- live state, for visualisation

  /**
   * Effective depth (0..1) of LFO `i` per target [pitch, filter, amp, width, position]. Each LFO's depth
   * goes to its target; the mod strip adds depth to LFO 1's mod target.
   */
  lfoDepths(i: number): PerTarget<number> {
    return lfoDepths(this.params, i, this.mod);
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
    if (source === "lfo 3") return this.lfos[2].value();
    if (source === "mod strip") return this.mod;
    const v = this.voices[this.voices.length - 1];
    if (!v) return null;
    const now = this.host.ctx.currentTime;
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
    return Math.min(1, Math.max(0, this.liveValue(this.params.wtPos, 4, LFO_POSITION, "wt pos")));
  }

  /** The pulse width right now, with the LFOs and the routes to it (as livePosition). */
  liveWidth() {
    return clampWidth(this.liveValue(this.params.pulseWidth, 3, LFO_WIDTH, "width"));
  }

  /** A setting moved by the LFOs (their target `lfoTarget`, scaled by `lfoScale`) and the matrix routes to `dest`, as heard on the newest note. */
  private liveValue(base: number, lfoTarget: number, lfoScale: number, dest: ModDest) {
    const p = this.params;
    let x = base;
    this.lfos.forEach((lfo, i) => (x += this.lfoDepths(i)[lfoTarget] * lfoScale * lfo.value()));
    for (let n = 1; n <= MOD_SLOTS; n++) {
      const ids = slotIds(n);
      if (MOD_DESTS[p[ids.dst]] !== dest) continue;
      x += p[ids.amt] * MOD_RANGE[dest] * (this.modSourceValue(MOD_SOURCES[p[ids.src]]) ?? 0);
    }
    return x;
  }

  /** Every voice still making sound, oldest first. */
  voiceStates(): VoiceState[] {
    return this.voices.map((v) => ({ note: v.note, velocity: v.velocity, triggeredAt: v.triggeredAt, releasedAt: v.releasedAt, random: v.random }));
  }

  /** The amp envelope's level of a voice at time t (0..1, with velocity), for picking which to cut. */
  level(v: Voice, t: number) {
    const p = this.params;
    return envelopeAt({ attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }, t, v.triggeredAt, v.releasedAt).level * (v.velocity / 127);
  }

  get mono() {
    return this.params.mono === 1;
  }

  // --- notes

  /**
   * `t` may be ahead (the step sequencer plans notes). `slide` glides into the note on mono presets
   * even when the preset's Glide is 0.
   */
  noteOn(note: number, velocity: number, t: number, slide = false) {
    if (!this.node) return;
    if (this.mono) return this.monoNoteOn(note, velocity, t, slide);
    // Retriggering a held note: release the old voice first.
    for (const v of this.voices) if (v.note === note && v.releasedAt === null) this.releaseVoice(v, t);
    // Voices silent by now are forgotten by the audio clock too, not only by the timer: an offline render
    // (the song export) runs far ahead of the wall clock, and they would crowd out new notes.
    this.voices = this.voices.filter((v) => v.endsAt === null || v.endsAt > t);
    this.host.makeRoom(this, voiceWeight(this.params.unison), t);
    this.voices.push(this.newVoice(note, velocity, t));
  }

  noteOff(note: number, t: number) {
    if (this.mono) return this.monoNoteOff(note, t);
    for (const v of this.voices) if (v.note === note && v.releasedAt === null) this.releaseVoice(v, t);
  }

  /**
   * Move sounding note `from` to pitch `to` at once, keeping its envelopes (the step sequencer at legato
   * speed: one held note whose pitch steps). Works on mono and poly presets alike.
   */
  pitchTo(from: number, to: number, t: number) {
    if (!this.node) return;
    const v = this.mono ? this.monoVoice : this.voices.find((x) => x.note === from && x.releasedAt === null);
    if (!v || v.releasedAt !== null || v.note !== from) return;
    if (this.mono) this.held = this.held.map((n) => (n === from ? to : n));
    v.stepTo(to, t);
  }

  private newVoice(note: number, velocity: number, t: number) {
    const v = new Voice(this.node!.port, this.params, note, velocity, t);
    v.owner = this.owner;
    return v;
  }

  /** Fade a voice out quickly and forget it (voice stealing). */
  cut(v: Voice, t: number) {
    v.kill(t);
    this.remove(v);
  }

  private remove(v: Voice) {
    this.voices = this.voices.filter((x) => x !== v);
    if (v === this.monoVoice) {
      this.monoVoice = null;
      this.held = [];
    }
  }

  private releaseVoice(v: Voice, t: number) {
    const end = v.release(this.params, t);
    v.endsAt = end;
    v.stop(end);
    setTimeout(() => this.voices.includes(v) && this.remove(v), (end - this.host.ctx.currentTime) * 1000 + 50);
  }

  private monoNoteOn(note: number, velocity: number, t: number, slide: boolean) {
    this.held = this.held.filter((n) => n !== note);
    this.held.push(note);
    const v = this.monoVoice;
    if (v && v.releasedAt === null) {
      // Legato
      v.glideTo(note, slide ? { ...this.params, glide: Math.max(this.params.glide, SLIDE_GLIDE) } : this.params, t);
    } else if (v) {
      v.glideTo(note, { ...this.params, glide: 0 }, t);
      v.retrigger(velocity, t);
    } else {
      this.monoVoice = this.newVoice(note, velocity, t);
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
    const t = this.host.ctx.currentTime;
    for (const v of this.voices) v.kill(t);
    this.voices = [];
    this.monoVoice = null;
    this.held = [];
  }

  get activeVoices() {
    return this.voices.filter((v) => v.releasedAt === null).length;
  }
}
