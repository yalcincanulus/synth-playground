// The new voice engine: every note of a part, computed sample by sample in one place.
// Plain code (no Web Audio), so it runs in the audio worklet ("synth-voices" in osc.worklet.ts)
// and in tests.
//
// Signal path per voice, as in the classic engine (voice.ts):
//   oscillators + sub + noise -> mixer -> drive -> filter -> amp envelope -> out
// with a filter envelope and a pitch envelope. The mod matrix, the per-stage outputs for
// "Listen here" and the amp/mod envelopes as mod sources come in roadmap slice 3.
//
// The main thread (engine.ts, WorkletVoice) sends timestamped messages; each event happens on
// its exact sample.

import { MOD_DESTS, MOD_SLOTS, MOD_SOURCES, slotIds, type ParamValues } from "../params";
import { DRIVE_MIN, Oversampled2x } from "./drive";
import { Oscillator, type OscParams, type Table } from "./oscillator";
import { coefFor, Ramp } from "./ramp";
import { Svf, svfG } from "./svf";
import { filterBase, filterK, midiToHz, unisonSpread, velocityFilterScale, velocityPeak } from "./voiceMath";

export type BankMessage =
  | { type: "params"; values: ParamValues }
  | { type: "on"; id: number; t: number; note: number; velocity: number; unison: number; phases: number[]; seed: number }
  /** Mono: move to a new note; `tc` is the glide's time constant in seconds. */
  | { type: "glide"; id: number; t: number; note: number; tc: number }
  /** Mono: restart the envelopes from where they are. */
  | { type: "retrigger"; id: number; t: number; velocity: number }
  | { type: "release"; id: number; t: number }
  /** Fast fade (voice stealing), then stop. */
  | { type: "kill"; id: number; t: number }
  | { type: "stop"; id: number; t: number };

export interface BankInputs {
  /** Cents, added to every oscillator (pitch bend and LFO). */
  pitch?: Float32Array;
  /** Cents, added to every filter's cutoff (LFO). */
  filter?: Float32Array;
  /** Added to the pulse width (LFO). */
  width?: Float32Array;
  /** Added to the wavetable position (LFO). */
  position?: Float32Array;
}

const MAX_BLOCK = 128;
/** Parameter changes glide over this time constant, like the classic engine's setTargetAtTime(…, 0.01). */
const SMOOTH_S = 0.01;
const KILL_TC_S = 0.005;
const KILL_STOP_S = 0.05;

// Smoothed per-voice values, by index.
const G1 = 0, G2 = 1, SUB = 2, NOISE = 3, OSC2 = 4, SPREAD = 5, WIDTH = 6, FM = 7, POS = 8, K = 9, FENV = 10, PENV = 11;
const SMOOTHED = 12;

/**
 * Where each smoothed value starts on a new voice: the classic engine's AudioParam defaults, which its
 * voices glide away from over ~10 ms at note start (gains 1, width 0.5, filter Q 1 dB, envelope amounts 0).
 * Kept so the two engines can be compared; a later slice can start at the targets instead.
 */
function startValues(filterType: number): Float64Array {
  const v = new Float64Array(SMOOTHED);
  v[G1] = v[G2] = v[SUB] = v[NOISE] = 1;
  v[WIDTH] = 0.5;
  v[K] = filterType === 2 ? 1 : Math.pow(10, -1 / 20);
  return v;
}
/** The classic filter's default frequency, which each new voice's cutoff glides away from. */
const START_CUTOFF = 350;

interface Event {
  frame: number;
  seq: number;
  msg: Exclude<BankMessage, { type: "params" }>;
}

class Voice {
  readonly osc: Oscillator;
  readonly amp = new Ramp(0);
  readonly filterEnv = new Ramp(0);
  readonly pitchEnv = new Ramp(0);
  readonly freq: Ramp;
  readonly cutoff = new Ramp(START_CUTOFF);
  readonly svf = new Svf();
  readonly driver = new Oversampled2x();
  readonly smooth: Float64Array;
  readonly gainScale: number;
  stopAt = Infinity;
  velocity: number;
  private noise: number;

  // Per-sample oscillator inputs, and the oscillator outputs.
  private p: OscParams;
  private o1 = new Float32Array(MAX_BLOCK);
  private o2 = new Float32Array(MAX_BLOCK);
  private os = new Float32Array(MAX_BLOCK);

  constructor(
    readonly id: number,
    public note: number,
    velocity: number,
    unison: number,
    phases: number[],
    seed: number,
    sampleRate: number,
    tables: Map<number, Table>,
    filterType: number,
  ) {
    let k = 0;
    this.osc = new Oscillator(unison, sampleRate, tables, () => (k < phases.length ? phases[k++] : 0));
    this.freq = new Ramp(midiToHz(note));
    this.velocity = velocity;
    this.gainScale = 1 / Math.sqrt(Math.max(1, Math.min(3, unison)));
    this.smooth = startValues(filterType);
    this.noise = seed >>> 0 || 1;
    const block = () => new Float32Array(MAX_BLOCK);
    this.p = {
      frequency: block(), detune: block(), pitchEnv: block(), osc2Detune: block(), width: block(), fm: block(), position: block(),
      envTarget: new Float32Array(1), spread: new Float32Array(1), sync: new Float32Array(1),
      wave1: new Float32Array(1), wave2: new Float32Array(1), table: new Float32Array(1),
    };
  }

  /** White noise, -1..1 (xorshift32). */
  nextNoise() {
    let x = this.noise;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noise = x >>> 0;
    return (this.noise / 4294967296) * 2 - 1;
  }

  render(bank: VoiceBank, out: Float32Array, from: number, to: number, inputs: BankInputs) {
    const s = this.smooth;
    const t = bank.targets;
    const c = bank.smoothCoef;
    const p = this.p;
    const v = bank.values;
    p.envTarget[0] = v.pitchEnvTarget;
    p.sync[0] = v.oscSync;
    p.wave1[0] = v.osc1Wave;
    p.wave2[0] = v.osc2Wave;
    p.table[0] = v.wtTable;
    p.spread[0] = s[SPREAD];
    const { pitch, width, position } = inputs;

    // Pass 1: the oscillators' per-sample inputs.
    for (let i = from; i < to; i++) {
      for (const j of PASS1) s[j] = t[j] + (s[j] - t[j]) * c;
      p.frequency[i] = this.freq.tick();
      p.detune[i] = pitch ? pitch[i] : 0;
      p.pitchEnv[i] = this.pitchEnv.tick() * s[PENV];
      p.osc2Detune[i] = s[OSC2];
      p.width[i] = s[WIDTH] + (width ? width[i] : 0);
      p.fm[i] = s[FM];
      p.position[i] = s[POS] + (position ? position[i] : 0);
    }
    this.osc.render(p, this.o1, this.o2, this.os, from, to);

    // Pass 2: mixer, drive, filter, amp.
    const g = this.gainScale;
    const drive = v.drive;
    const mode = v.filterType;
    const sr = bank.sampleRate;
    const velScale = velocityFilterScale(v, this.velocity);
    const filterIn = inputs.filter;
    for (let i = from; i < to; i++) {
      for (const j of PASS2) s[j] = t[j] + (s[j] - t[j]) * c;
      let x = 0.5 * (this.o1[i] * s[G1] * g + this.o2[i] * s[G2] * g + this.os[i] * s[SUB] + this.nextNoise() * s[NOISE]);
      if (drive >= DRIVE_MIN) x = this.driver.process(x, drive);
      const cents = this.filterEnv.tick() * s[FENV] * velScale + (filterIn ? filterIn[i] : 0);
      const fc = this.cutoff.tick() * Math.exp(cents * CENTS_TO_LN);
      out[i] += this.svf.process(x, svfG(fc, sr), s[K], mode) * this.amp.tick();
    }
  }
}

const PASS1 = [OSC2, SPREAD, WIDTH, FM, POS, PENV];
const PASS2 = [G1, G2, SUB, NOISE, K, FENV];
const CENTS_TO_LN = Math.LN2 / 1200;

export class VoiceBank {
  values: ParamValues;
  /** What each smoothed value is heading for (see the index constants). */
  readonly targets = new Float64Array(SMOOTHED);
  readonly smoothCoef: number;
  private voices: Voice[] = [];
  private events: Event[] = [];
  private seq = 0;

  constructor(
    readonly sampleRate: number,
    values: ParamValues,
    private tables: Map<number, Table> = new Map(),
  ) {
    this.smoothCoef = coefFor(SMOOTH_S * sampleRate);
    this.values = values;
    this.setParams(values);
  }

  get voiceCount() {
    return this.voices.length;
  }

  post(msg: BankMessage) {
    if (msg.type === "params") return this.setParams(msg.values);
    this.events.push({ frame: Math.round(msg.t * this.sampleRate), seq: this.seq++, msg });
  }

  /** Render one block starting at absolute frame `startFrame` (the worklet's currentFrame). */
  render(out: Float32Array, startFrame: number, inputs: BankInputs = {}) {
    out.fill(0);
    const n = out.length;
    const end = startFrame + n;
    const due = this.events.filter((e) => e.frame < end).sort((a, b) => a.frame - b.frame || a.seq - b.seq);
    if (due.length) this.events = this.events.filter((e) => e.frame >= end);
    let pos = 0;
    for (const e of due) {
      const at = Math.max(0, e.frame - startFrame);
      if (at > pos) this.renderVoices(out, pos, at, inputs);
      pos = Math.max(pos, at);
      this.apply(e.msg, startFrame + pos);
    }
    if (pos < n) this.renderVoices(out, pos, n, inputs);
  }

  private renderVoices(out: Float32Array, from: number, to: number, inputs: BankInputs) {
    for (const v of this.voices) v.render(this, out, from, to, inputs);
  }

  private setParams(p: ParamValues) {
    this.values = { ...p };
    const t = this.targets;
    t[G1] = 1 - p.oscMix;
    t[G2] = p.oscMix;
    t[SUB] = p.subLevel * 0.8;
    t[NOISE] = p.noiseLevel;
    t[OSC2] = p.osc2Semi * 100 + p.osc2Detune;
    t[SPREAD] = unisonSpread(p);
    t[WIDTH] = p.pulseWidth;
    t[FM] = p.fmAmount;
    t[POS] = p.wtPos;
    t[K] = filterK(p.filterType, p.resonance);
    t[FENV] = p.filterEnvAmt * 1200;
    t[PENV] = p.pitchEnvAmt * 100;
    // As in the classic engine, any change re-aims each voice's cutoff (key tracking follows its note).
    for (const v of this.voices) v.cutoff.approach(filterBase(p, v.note), SMOOTH_S * this.sampleRate);
  }

  private apply(msg: Event["msg"], frame: number) {
    const p = this.values;
    const sr = this.sampleRate;
    if (msg.type === "on") {
      const v = new Voice(msg.id, msg.note, msg.velocity, msg.unison, msg.phases, msg.seed, sr, this.tables, p.filterType);
      v.cutoff.approach(filterBase(p, msg.note), SMOOTH_S * sr);
      this.startEnvelopes(v, false);
      this.voices.push(v);
      return;
    }
    const v = this.voices.find((x) => x.id === msg.id);
    if (!v) return;
    switch (msg.type) {
      case "glide":
        v.note = msg.note;
        v.freq.approach(midiToHz(msg.note), Math.max(0.001, msg.tc) * sr);
        v.cutoff.approach(filterBase(p, msg.note), Math.max(0.001, msg.tc) * sr);
        return;
      case "retrigger":
        v.velocity = msg.velocity;
        v.cutoff.approach(filterBase(p, v.note), SMOOTH_S * sr);
        this.startEnvelopes(v, true);
        return;
      case "release":
        v.amp.approach(0, (p.release / 4) * sr);
        v.filterEnv.approach(0, (p.filterRelease / 4) * sr);
        return;
      case "kill":
        v.amp.approach(0, KILL_TC_S * sr);
        v.stopAt = Math.min(v.stopAt, frame + Math.round(KILL_STOP_S * sr));
        this.events.push({ frame: v.stopAt, seq: this.seq++, msg: { type: "stop", id: v.id, t: v.stopAt / sr } });
        return;
      case "stop":
        this.voices = this.voices.filter((x) => x !== v);
        return;
    }
  }

  /** Attack, then decay to sustain; a retrigger starts from where the envelopes are. Pitch envelope: jump, then fall back. */
  private startEnvelopes(v: Voice, retrigger: boolean) {
    const p = this.values;
    const sr = this.sampleRate;
    if (!retrigger) {
      v.amp.set(0);
      v.filterEnv.set(0);
    }
    const peak = velocityPeak(p, v.velocity);
    v.amp.ramp(peak, p.attack * sr, peak * p.sustain, (p.decay / 4) * sr);
    v.filterEnv.ramp(1, p.filterAttack * sr, p.filterSustain, (p.filterDecay / 4) * sr);
    v.pitchEnv.set(1);
    v.pitchEnv.approach(0, (p.pitchEnvDecay / 4) * sr);
  }
}

/** Whether a preset uses the mod matrix (not yet in the new engine; roadmap slice 3). */
export function hasRoutes(p: ParamValues) {
  for (let n = 1; n <= MOD_SLOTS; n++) {
    const ids = slotIds(n);
    if (MOD_SOURCES[p[ids.src]] !== "off" && MOD_DESTS[p[ids.dst]] !== undefined && p[ids.amt] !== 0) return true;
  }
  return false;
}
