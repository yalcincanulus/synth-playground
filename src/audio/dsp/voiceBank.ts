// The voice engine: every note of a part, computed sample by sample in one place.
// Plain code (no Web Audio), so it runs in the audio worklet ("synth-voices" in synth.worklet.ts)
// and in tests.
//
// Signal path per voice:
//   oscillators + sub + noise -> mixer -> drive -> filter -> amp envelope -> volume route -> pan
// The filter is the clean state-variable filter or the ladder (Filter Model). With the ladder, Drive
// pushes the filter's own saturator instead of the drive stage. Filter 2 (clean) is optional, after
// the filter (series) or beside it on the same input (parallel).
// then all voices together -> LFO tremolo -> out (stereo).
//
// Stereo: a voice's unison copies spread left and right by Stereo Width, and the pan route moves the
// whole voice. Both keep (left + right) / 2 equal to the mono sound, so playing in mono sounds the same
// (exactly, without drive: drive is applied to each side). A voice without unison copies runs its
// drive and filter once; with copies, once per side. Each voice has four envelopes (amp, filter, pitch,
// mod), and the mod matrix's routes move its settings sample by sample. The two LFOs, pitch bend and
// the mod strip are shared by all voices and run here too.
//
// Oversampling: each voice's sound path (oscillators to filters) runs at twice the sample rate, so FM,
// sync, drive and the ladder's saturation make fewer harsh, out-of-tune tones above the audible range
// that fold back down (aliasing). The voices are summed at 2x and brought back down once per part
// (dsp/halfband.ts), which delays the sound by HALFBAND_LATENCY samples (about 0.3 ms). Envelopes,
// routes and LFOs run at the normal rate; the sound path holds their values for both 2x samples.
//
// Shared destinations (SHARED_DESTS: the effect amounts and the LFOs' rates and depths) belong to the
// whole part, so their routes run once, with the LFOs. Per-note sources reach them from the newest note.
// The effect amounts go out as a signal (see render's `fx`), which sets the part's effect levels.
//
// Besides the sound, the bank fills one output per stage (the "taps": raw oscillators, sub, noise,
// mixer, drive, filter), so the Synth view can show and play each stage on its own.
//
// The main thread (engine.ts, voice.ts) sends messages. Note events carry a time and happen on their
// exact sample; settings and controls apply from the next block.

import { FILTER2_MODES, FILTER_MODELS, LFO_WAVES, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, SHARED_DESTS, slotIds, type ParamValues } from "../params";
import { DRIVE_MIN, DriveAdaa, driveShape } from "./drive";
import { Decimator2 } from "./halfband";
import { Ladder, LADDER_MAX_K, ladderGain, ladderOutGain } from "./ladder";
import { LFO_AMP, LFO_AMP_TARGET, LFO_SCALE, LfoCore, lfoDepths } from "./lfo";
import { Oscillator, type OscParams, type SideOutputs, type Table } from "./oscillator";
import { coefFor, Ramp } from "./ramp";
import { Svf, svfG } from "./svf";
import { voiceWeight } from "../voiceLimit";
import { filter2Base, filterBase, filterK, filterQ, keySource, LADDER_K_PER_DB, ladderK, midiToHz, MOD_RANGE, unisonSpread, velocityFilterScale, velocityPeak } from "./voiceMath";

export type BankMessage =
  | { type: "params"; values: ParamValues }
  /** The LFOs' speeds in Hz: the Rate knobs, or the tempo when synced. */
  | { type: "lfoRates"; rates: number[] }
  /** Pitch bend in cents and the mod strip (0..1), as played. */
  | { type: "controls"; bend: number; mod: number }
  /** `random` is the note's "random" mod source (-1..1); `phases` and `seed` its unison phases and noise. */
  | { type: "on"; id: number; t: number; note: number; velocity: number; random: number; unison: number; phases: number[]; seed: number }
  /** Mono: move to a new note; `tc` is the glide's time constant in seconds. */
  | { type: "glide"; id: number; t: number; note: number; tc: number }
  /** Mono: restart the envelopes from where they are. */
  | { type: "retrigger"; id: number; t: number; velocity: number; random: number }
  | { type: "release"; id: number; t: number }
  /** Fast fade (voice stealing), then stop. */
  | { type: "kill"; id: number; t: number }
  | { type: "stop"; id: number; t: number };

type TimedMessage = Extract<BankMessage, { t: number }>;

/** The per-stage outputs, in output order after the main one. Raw sources are before their mixer level. */
export const TAPS = ["osc1", "osc2", "sub", "noise", "mix", "drive", "filter", "filter2"] as const;
export type TapName = (typeof TAPS)[number];
const T_OSC1 = 0, T_OSC2 = 1, T_SUB = 2, T_NOISE = 3, T_MIX = 4, T_DRIVE = 5, T_FILTER = 6, T_FILTER2 = 7;

/** What the LFOs are doing, for the Synth view's drawings. */
export interface LfoState {
  phase: number[];
  rate: number[];
  /** New random (sample & hold) values since the last call: [lfo, frame, value]. */
  steps: [number, number, number][];
}

const MAX_BLOCK = 128;
/** The sound path's oversampling factor (see above). */
const OS = 2;
/** White noise at 2x keeps half its power below the final Nyquist frequency; this restores its level. */
const NOISE_GAIN = Math.SQRT2;
/** Parameter changes glide over this time constant. */
const SMOOTH_S = 0.01;
/** Pitch bend and the mod strip glide over this one; LFO depths and rates over LFO_SMOOTH_S. */
const CONTROL_SMOOTH_S = 0.005;
const LFO_SMOOTH_S = 0.02;
const KILL_TC_S = 0.005;
const KILL_STOP_S = 0.05;
/** Resonance modulated by a route stays below this (dB). */
const MAX_Q_DB = 40;

// Smoothed per-voice values, by index.
// K (1/Q) and Q (dB) are the clean filter's resonance, LK the ladder's feedback; K2 and MORPH2 are Filter 2's.
const G1 = 0, G2 = 1, SUB = 2, NOISE = 3, OSC2 = 4, SPREAD = 5, WIDTH = 6, FM = 7, POS = 8, K = 9, Q = 10, FENV = 11, PENV = 12, STEREO = 13, LK = 14;
const MORPH = 15, K2 = 16, MORPH2 = 17;
const SMOOTHED = 18;
const PASS1 = [OSC2, SPREAD, WIDTH, FM, POS, PENV];
const PASS2 = [G1, G2, SUB, NOISE, K, Q, FENV, STEREO, LK, MORPH, K2, MORPH2];

// Mod matrix sources and destinations, by their index in MOD_SOURCES / MOD_DESTS.
const S = (name: (typeof MOD_SOURCES)[number]) => MOD_SOURCES.indexOf(name);
const S_LFO1 = S("lfo 1"), S_LFO2 = S("lfo 2"), S_FENV = S("filter env"), S_AENV = S("amp env"), S_PENV = S("pitch env");
const S_MENV = S("mod env"), S_VEL = S("velocity"), S_KEY = S("key"), S_STRIP = S("mod strip"), S_RANDOM = S("random");
const D = (name: (typeof MOD_DESTS)[number]) => MOD_DESTS.indexOf(name);
const D_PITCH = D("pitch"), D_OSC2 = D("osc 2 pitch"), D_CUTOFF = D("cutoff"), D_RES = D("resonance"), D_VOLUME = D("volume");
const D_POS = D("wt pos"), D_WIDTH = D("width"), D_FM = D("fm"), D_MIX = D("osc mix"), D_SUB = D("sub"), D_NOISE = D("noise"), D_PAN = D("pan");
const D_MORPH = D("morph"), D_CUTOFF2 = D("cutoff 2");
// Shared destinations: their sums are kept in this order (SHARED_DESTS order).
const SHARED = SHARED_DESTS.map((d) => D(d));
const X_CHORUS = 0, X_DELAY = 1, X_REVERB = 2, X_RATE1 = 3, X_DEPTH1 = 4, X_RATE2 = 5, X_DEPTH2 = 6;
/** The effect amounts' signal: chorus, delay, reverb. */
export const FX_AMOUNTS = 3;

const CENTS_TO_LN = Math.LN2 / 1200;
const LADDER = FILTER_MODELS.indexOf("ladder");
const SERIES = FILTER2_MODES.indexOf("series");
const PARALLEL = FILTER2_MODES.indexOf("parallel");
const RANDOM_WAVE = LFO_WAVES.indexOf("random");

/** One active mod matrix route. `amount` is in the destination's units (see MOD_RANGE). */
interface Route {
  slot: number;
  source: number;
  dest: number;
  amount: number;
  key: string;
  /** For a shared destination: its place in SHARED_DESTS (else -1). */
  shared: number;
}

interface Event {
  frame: number;
  seq: number;
  msg: TimedMessage;
}

const block = () => new Float32Array(MAX_BLOCK);
/** A block at the sound path's rate. */
const block2 = () => new Float32Array(MAX_BLOCK * OS);

class Voice {
  readonly id: number;
  note: number;
  readonly osc: Oscillator;
  /** The amp envelope as heard (its peak follows velocity), and as a 0..1 mod source. */
  readonly amp = new Ramp(0);
  readonly ampEnv = new Ramp(0);
  readonly filterEnv = new Ramp(0);
  readonly modEnv = new Ramp(0);
  readonly pitchEnv = new Ramp(0);
  readonly freq: Ramp;
  readonly key: Ramp;
  readonly cutoff: Ramp;
  readonly cutoff2: Ramp;
  readonly svf = new Svf();
  readonly ladder = new Ladder();
  private driver = new DriveAdaa();
  private driverR = new DriveAdaa();
  /** With unison copies the voice is stereo: these are the right side's (the ones above are the left's). */
  readonly stereo: boolean;
  private svfR = new Svf();
  private ladderR = new Ladder();
  private svf2 = new Svf();
  private svf2R = new Svf();
  private side: SideOutputs | null;
  readonly smooth: Float64Array;
  readonly gainScale: number;
  /** How much work this voice is (see voiceWeight). */
  readonly weight: number;
  stopAt = Infinity;
  velocity: number;
  random: number;
  private noise: number;
  /** Each route slot's amount as it glides, and which route it belongs to (a new route starts from 0). */
  private routeAmount = new Float64Array(MOD_SLOTS);
  private routeKey: string[];

  // Per-sample oscillator inputs and outputs, envelope values, and the routes' sum per destination.
  private p: OscParams;
  private freqB = block();
  private o1 = block2();
  private o2 = block2();
  private os = block2();
  private ampB = block();
  private aenvB = block();
  private fenvB = block();
  private menvB = block();
  private penvB = block();
  private keyB = block();
  private constB = block();
  private mods = MOD_DESTS.map(block);
  private modOn = MOD_DESTS.map(() => false);

  constructor(bank: VoiceBank, msg: Extract<BankMessage, { type: "on" }>) {
    const { phases } = msg;
    this.id = msg.id;
    let k = 0;
    this.osc = new Oscillator(msg.unison, bank.sampleRate * OS, bank.tables, () => (k < phases.length ? phases[k++] : 0));
    this.stereo = this.osc.unison > 1;
    this.side = this.stereo ? { osc1: block2(), osc2: block2() } : null;
    this.freq = new Ramp(midiToHz(msg.note));
    this.key = new Ramp(keySource(msg.note));
    this.cutoff = new Ramp(filterBase(bank.values, msg.note));
    this.cutoff2 = new Ramp(filter2Base(bank.values, msg.note));
    this.note = msg.note;
    this.velocity = msg.velocity;
    this.random = msg.random;
    this.gainScale = 1 / Math.sqrt(Math.max(1, Math.min(3, msg.unison)));
    this.weight = voiceWeight(msg.unison);
    // Notes start at their settings: nothing glides in at the start.
    this.smooth = Float64Array.from(bank.targets);
    this.routeKey = Array(MOD_SLOTS).fill("");
    for (const r of bank.routes) {
      this.routeKey[r.slot] = r.key;
      this.routeAmount[r.slot] = r.amount;
    }
    this.noise = msg.seed >>> 0 || 1;
    this.p = {
      frequency: block2(), detune: block2(), pitchEnv: block2(), osc2Detune: block2(), width: block2(), fm: block2(), position: block2(),
      envTarget: new Float32Array(1), spread: new Float32Array(1), sync: new Float32Array(1),
      wave1: new Float32Array(1), wave2: new Float32Array(1), table: new Float32Array(1),
    };
  }

  /** White noise, -1..1 (xorshift32). */
  private nextNoise() {
    let x = this.noise;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noise = x >>> 0;
    return (this.noise / 4294967296) * 2 - 1;
  }

  /**
   * Add samples `from` to `to` (at the normal rate) of this voice to `outL` and `outR`, and each stage to
   * `taps` (TAPS order) when given. The outputs are at the sound path's rate: OS samples per sample.
   */
  render(bank: VoiceBank, outL: Float32Array, outR: Float32Array, taps: Float32Array[] | null, from: number, to: number) {
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

    // The envelopes and glides, which the sound and the routes both read.
    for (let i = from; i < to; i++) {
      this.ampB[i] = this.amp.tick();
      this.aenvB[i] = this.ampEnv.tick();
      this.fenvB[i] = this.filterEnv.tick();
      this.menvB[i] = this.modEnv.tick();
      this.penvB[i] = this.pitchEnv.tick();
      this.keyB[i] = this.key.tick();
      this.freqB[i] = this.freq.tick();
    }
    this.applyRoutes(bank, from, to);
    const on = this.modOn;
    const m = this.mods;
    const mod = (dest: number) => (on[dest] ? m[dest] : null);

    // Pass 1: the oscillators' inputs, each held for the OS samples of the sound path.
    const { pitch, width, position } = bank.globals;
    const mPitch = mod(D_PITCH), mOsc2 = mod(D_OSC2), mWidth = mod(D_WIDTH), mFm = mod(D_FM), mPos = mod(D_POS);
    for (let i = from; i < to; i++) {
      for (const j of PASS1) s[j] = t[j] + (s[j] - t[j]) * c;
      const frequency = this.freqB[i];
      const detune = pitch[i] + (mPitch ? mPitch[i] : 0);
      const pitchEnv = this.penvB[i] * s[PENV];
      const osc2Detune = s[OSC2] + (mOsc2 ? mOsc2[i] : 0);
      const w = s[WIDTH] + width[i] + (mWidth ? mWidth[i] : 0);
      const fm = s[FM] + (mFm ? mFm[i] : 0);
      const pos = s[POS] + position[i] + (mPos ? mPos[i] : 0);
      for (let o = i * OS; o < (i + 1) * OS; o++) {
        p.frequency[o] = frequency;
        p.detune[o] = detune;
        p.pitchEnv[o] = pitchEnv;
        p.osc2Detune[o] = osc2Detune;
        p.width[o] = w;
        p.fm[o] = fm;
        p.position[o] = pos;
      }
    }
    this.osc.render(p, this.o1, this.o2, this.os, from * OS, to * OS, this.side);

    // Pass 2: mixer, drive, filter, amp. Settings per sample, the sound per 2x sample.
    const g = this.gainScale;
    const drive = v.drive;
    const sr = bank.sampleRate * OS;
    const velScale = velocityFilterScale(v, this.velocity);
    const filterLfo = bank.globals.filter;
    const mMix = mod(D_MIX), mSub = mod(D_SUB), mNoise = mod(D_NOISE), mCutoff = mod(D_CUTOFF), mRes = mod(D_RES), mVol = mod(D_VOLUME), mPan = mod(D_PAN);
    const mMorph = mod(D_MORPH), mCutoff2 = mod(D_CUTOFF2);
    const f2 = v.filter2Mode;
    const series = f2 === SERIES;
    const parallel = f2 === PARALLEL;
    const driveOn = drive >= DRIVE_MIN;
    const ladder = v.filterModel === LADDER;
    // The ladder takes the drive into its own saturator, so the drive stage only runs before the clean filter.
    const shapeOn = driveOn && !ladder;
    const inGain = ladderGain(drive);
    const outGain = ladderOutGain(drive);
    const side = this.side;
    const { o1, o2, os } = this;
    for (let i = from; i < to; i++) {
      for (const j of PASS2) s[j] = t[j] + (s[j] - t[j]) * c;
      const mix = mMix ? mMix[i] : 0;
      const g1 = (s[G1] - mix) * g;
      const g2 = (s[G2] + mix) * g;
      const subLevel = s[SUB] + (mSub ? mSub[i] : 0);
      const noiseLevel = (s[NOISE] + (mNoise ? mNoise[i] : 0)) * NOISE_GAIN;
      const cents = this.fenvB[i] * s[FENV] * velScale + filterLfo[i] + (mCutoff ? mCutoff[i] : 0);
      const fg = svfG(this.cutoff.tick() * Math.exp(cents * CENTS_TO_LN), sr);
      const morph = s[MORPH] + (mMorph ? mMorph[i] : 0);
      const cutoff2 = this.cutoff2.tick();
      const fg2 = series || parallel ? svfG(mCutoff2 ? cutoff2 * Math.exp(mCutoff2[i] * CENTS_TO_LN) : cutoff2, sr) : 0;
      const k = ladder
        ? mRes ? Math.max(0, Math.min(LADDER_MAX_K, s[LK] + mRes[i] * LADDER_K_PER_DB)) : s[LK]
        : mRes ? resonanceK(s[Q] + mRes[i]) : s[K];
      const level = this.ampB[i] * (mVol ? 1 + mVol[i] : 1);
      // Pan keeps left + right: hard right is the right side twice as loud and the left silent.
      const pan = mPan ? Math.max(-1, Math.min(1, mPan[i])) : 0;
      const levelL = level * (1 - pan);
      const levelR = level * (1 + pan);
      const stereo = s[STEREO];

      for (let o = i * OS; o < (i + 1) * OS; o++) {
        const noise = this.nextNoise();
        const x = 0.5 * (o1[o] * g1 + o2[o] * g2 + os[o] * subLevel + noise * noiseLevel);
        // The signal into the filter(s), per side; Filter 2 in parallel takes the same.
        let inL = x;
        let inR = x;
        if (side) {
          // The copies' spread: half the mixer's sum of the side signals, times the width.
          const d = 0.5 * (side.osc1[o] * g1 + side.osc2[o] * g2) * stereo;
          inL = x - d;
          inR = x + d;
        }
        let left: number, right: number, driven: number;
        if (ladder) {
          left = this.ladder.process(inL, fg, k, morph, inGain) * outGain;
          right = side ? this.ladderR.process(inR, fg, k, morph, inGain) * outGain : left;
          // The drive happens inside the filter; the Drive tap shows its curve on the mixer's signal.
          driven = taps && driveOn ? driveShape(x, drive) : x;
        } else {
          if (shapeOn) {
            inL = this.driver.process(inL, drive);
            inR = side ? this.driverR.process(inR, drive) : inL;
          }
          driven = 0.5 * (inL + inR);
          left = this.svf.process(inL, fg, k, morph);
          right = side ? this.svfR.process(inR, fg, k, morph) : left;
        }
        const filtered1 = 0.5 * (left + right);
        let filtered2 = 0;
        if (series || parallel) {
          const yl = this.svf2.process(series ? left : inL, fg2, s[K2], s[MORPH2]);
          const yr = side ? this.svf2R.process(series ? right : inR, fg2, s[K2], s[MORPH2]) : yl;
          filtered2 = 0.5 * (yl + yr);
          if (series) {
            left = yl;
            right = yr;
          } else {
            left += yl;
            right += yr;
          }
        }
        outL[o] += left * levelL;
        outR[o] += right * levelR;
        if (taps) {
          taps[T_OSC1][o] += o1[o];
          taps[T_OSC2][o] += o2[o];
          taps[T_SUB][o] += os[o];
          taps[T_NOISE][o] += noise * NOISE_GAIN;
          taps[T_MIX][o] += x;
          taps[T_DRIVE][o] += driven;
          taps[T_FILTER][o] += filtered1;
          taps[T_FILTER2][o] += filtered2;
        }
      }
    }
  }

  /** Sum each route's source times its (gliding) amount into its destination's buffer. */
  private applyRoutes(bank: VoiceBank, from: number, to: number) {
    this.modOn.fill(false);
    const c = bank.smoothCoef;
    for (let slot = 0; slot < MOD_SLOTS; slot++) {
      const r = bank.routeBySlot[slot];
      if (!r || r.shared >= 0) {
        this.routeKey[slot] = "";
        continue;
      }
      if (this.routeKey[slot] !== r.key) {
        this.routeKey[slot] = r.key;
        this.routeAmount[slot] = 0;
      }
      const src = this.source(bank, r.source, from, to);
      const buf = this.mods[r.dest];
      if (!this.modOn[r.dest]) {
        buf.fill(0, from, to);
        this.modOn[r.dest] = true;
      }
      let a = this.routeAmount[slot];
      const target = r.amount;
      for (let i = from; i < to; i++) {
        a = target + (a - target) * c;
        buf[i] += a * src[i];
      }
      this.routeAmount[slot] = a;
    }
  }

  /** This note's per-note sources right now, by MOD_SOURCES index (for the shared destinations). */
  noteSources(out: Float64Array) {
    out[S_FENV] = this.filterEnv.value;
    out[S_AENV] = this.ampEnv.value;
    out[S_PENV] = this.pitchEnv.value;
    out[S_MENV] = this.modEnv.value;
    out[S_KEY] = this.key.value;
    out[S_VEL] = this.velocity / 127;
    out[S_RANDOM] = this.random;
  }

  private source(bank: VoiceBank, source: number, from: number, to: number): Float32Array {
    switch (source) {
      case S_LFO1: return bank.globals.lfo1;
      case S_LFO2: return bank.globals.lfo2;
      case S_STRIP: return bank.globals.strip;
      case S_FENV: return this.fenvB;
      case S_AENV: return this.aenvB;
      case S_PENV: return this.penvB;
      case S_MENV: return this.menvB;
      case S_KEY: return this.keyB;
      case S_VEL: return this.constB.fill(this.velocity / 127, from, to);
      case S_RANDOM: return this.constB.fill(this.random, from, to);
    }
    return this.constB.fill(0, from, to);
  }
}

/** The clean filter's 1/Q for a resonance in dB moved by a route. */
const resonanceK = (q: number) => filterK(Math.min(q, MAX_Q_DB));

/** What is shared by all voices: the LFOs, pitch bend and the mod strip, per sample. */
class Globals {
  readonly lfo1 = block();
  readonly lfo2 = block();
  readonly strip = block();
  /** Cents for every oscillator (bend and the LFOs) and every filter (the LFOs). */
  readonly pitch = block();
  readonly filter = block();
  readonly width = block();
  readonly position = block();
  /** The tremolo's gain on all voices. */
  readonly tremolo = block();
  /** The effect amounts as heard, 0..1 (chorus, delay, reverb): the settings plus their routes. */
  readonly fx = [block(), block(), block()];

  readonly lfos: [LfoCore, LfoCore];
  bend = 0;
  bendTarget = 0;
  strip0 = 0;
  stripTarget = 0;
  /** Per LFO, per target: depth x scale, gliding toward `gainTargets`. */
  private gains = [new Float64Array(5), new Float64Array(5)];
  private gainTargets = [new Float64Array(5), new Float64Array(5)];
  private tremBase = 1;
  private tremTarget = 1;
  private controlCoef: number;
  private lfoCoef: number;
  /** The effect amounts' settings, gliding toward `fxTargets`. */
  private fxBase = new Float64Array(FX_AMOUNTS);
  private fxTargets = new Float64Array(FX_AMOUNTS);
  /** Which target each LFO's Depth knob drives (a depth route adds there). */
  private depthTarget = [0, 0];
  /** Shared routes: each slot's amount as it glides, and which route it belongs to (a new one starts from 0). */
  private routeAmount = new Float64Array(MOD_SLOTS);
  private routeKey: string[] = Array(MOD_SLOTS).fill("");
  /** Per shared destination, the routes' sum this sample. */
  private sums = new Float64Array(SHARED.length);
  private lastLfo = [0, 0];

  constructor(sampleRate: number, p: ParamValues, seed: number) {
    this.controlCoef = coefFor(CONTROL_SMOOTH_S * sampleRate);
    this.lfoCoef = coefFor(LFO_SMOOTH_S * sampleRate);
    this.lfos = [new LfoCore(p.lfoRate, seed, this.lfoCoef, sampleRate), new LfoCore(p.lfo2Rate, seed ^ 0x9e3779b9, this.lfoCoef, sampleRate)];
    this.aim(p);
    for (let l = 0; l < 2; l++) this.gains[l].set(this.gainTargets[l]);
    this.tremBase = this.tremTarget;
    this.fxBase.set(this.fxTargets);
  }

  /** New settings or mod strip position: where the LFO depths and shapes head. */
  aim(p: ParamValues) {
    this.lfos[0].wave = p.lfoWave;
    this.lfos[1].wave = p.lfo2Wave;
    let tremolo = 0;
    for (let l = 0; l < 2; l++) {
      const depths = lfoDepths(p, l, this.stripTarget);
      for (let t = 0; t < 5; t++) this.gainTargets[l][t] = depths[t] * LFO_SCALE[t];
      tremolo += depths[LFO_AMP_TARGET] * LFO_AMP;
    }
    // Tremolo swings the volume around a lowered centre, so it never goes above full.
    this.tremTarget = Math.max(0, 1 - tremolo);
    this.depthTarget = [p.lfoTarget, p.lfo2Target];
    this.fxTargets[X_CHORUS] = p.chorus;
    this.fxTargets[X_DELAY] = p.delayMix;
    this.fxTargets[X_REVERB] = p.reverbMix;
  }

  /**
   * Samples `from` to `to`: the LFOs, controls and effect amounts, with the shared routes (`routes`, the
   * active routes to shared destinations). `notes` holds the newest note's per-note sources by
   * MOD_SOURCES index.
   */
  render(from: number, to: number, startFrame: number, steps: [number, number, number][], routes: Route[], notes: Float64Array) {
    const cc = this.controlCoef;
    const lc = this.lfoCoef;
    const [g1, g2] = this.gains;
    const [t1, t2] = this.gainTargets;
    const [l1, l2] = this.lfos;
    const [d1, d2] = this.depthTarget;
    const sums = this.sums;
    for (const r of routes) {
      if (this.routeKey[r.slot] === r.key) continue;
      this.routeKey[r.slot] = r.key;
      this.routeAmount[r.slot] = 0;
    }
    for (let i = from; i < to; i++) {
      this.bend = this.bendTarget + (this.bend - this.bendTarget) * cc;
      this.strip0 = this.stripTarget + (this.strip0 - this.stripTarget) * cc;
      this.tremBase = this.tremTarget + (this.tremBase - this.tremTarget) * lc;
      for (let t = 0; t < 5; t++) {
        g1[t] = t1[t] + (g1[t] - t1[t]) * lc;
        g2[t] = t2[t] + (g2[t] - t2[t]) * lc;
      }
      // Shared routes, from the LFOs' last values (one sample back), the mod strip and the newest note.
      sums.fill(0);
      for (const r of routes) {
        const a = (this.routeAmount[r.slot] = r.amount + (this.routeAmount[r.slot] - r.amount) * cc);
        const src = r.source === S_LFO1 ? this.lastLfo[0] : r.source === S_LFO2 ? this.lastLfo[1] : r.source === S_STRIP ? this.strip0 : notes[r.source];
        sums[r.shared] += a * src;
      }
      const a = l1.tick(sums[X_RATE1] ? Math.pow(2, sums[X_RATE1]) : 1);
      const b = l2.tick(sums[X_RATE2] ? Math.pow(2, sums[X_RATE2]) : 1);
      this.lastLfo[0] = a;
      this.lastLfo[1] = b;
      // A depth route adds to the depth on the LFO's own target (never below none).
      const e1 = sums[X_DEPTH1] ? Math.max(-g1[d1], sums[X_DEPTH1] * LFO_SCALE[d1]) : 0;
      const e2 = sums[X_DEPTH2] ? Math.max(-g2[d2], sums[X_DEPTH2] * LFO_SCALE[d2]) : 0;
      const at = (t: number) => a * (g1[t] + (d1 === t ? e1 : 0)) + b * (g2[t] + (d2 === t ? e2 : 0));
      this.lfo1[i] = a;
      this.lfo2[i] = b;
      this.strip[i] = this.strip0;
      this.pitch[i] = this.bend + at(0);
      this.filter[i] = at(1);
      // More tremolo depth lowers the centre too, so it still never goes above full.
      this.tremolo[i] = this.tremBase - (d1 === 2 ? e1 : 0) - (d2 === 2 ? e2 : 0) + at(2);
      this.width[i] = at(3);
      this.position[i] = at(4);
      for (let x = 0; x < FX_AMOUNTS; x++) {
        this.fxBase[x] = this.fxTargets[x] + (this.fxBase[x] - this.fxTargets[x]) * cc;
        this.fx[x][i] = Math.max(0, Math.min(1, this.fxBase[x] + sums[x]));
      }
      for (let l = 0; l < 2; l++) {
        const lfo = this.lfos[l];
        if (!lfo.wrapped) continue;
        lfo.wrapped = false;
        if (lfo.wave === RANDOM_WAVE && steps.length < 64) steps.push([l, startFrame + i + 1, lfo.held]);
      }
    }
  }
}

export class VoiceBank {
  values: ParamValues;
  /** What each smoothed value is heading for (see the index constants). */
  readonly targets = new Float64Array(SMOOTHED);
  readonly smoothCoef: number;
  routes: Route[] = [];
  /** The routes to shared destinations (they run in Globals). */
  private sharedRoutes: Route[] = [];
  /** The newest note's per-note sources, by MOD_SOURCES index. */
  private noteSources = new Float64Array(MOD_SOURCES.length);
  routeBySlot: (Route | null)[] = Array(MOD_SLOTS).fill(null);
  readonly globals: Globals;
  private voices: Voice[] = [];
  private events: Event[] = [];
  private seq = 0;
  private steps: [number, number, number][] = [];
  // The voices' sum at the sound path's rate, and the decimators that bring it back down.
  private wideL = block2();
  private wideR = block2();
  private wideTaps = TAPS.map(block2);
  private downL = new Decimator2();
  private downR = new Decimator2();
  private downTaps = TAPS.map(() => new Decimator2());

  constructor(
    readonly sampleRate: number,
    values: ParamValues,
    readonly tables: Map<number, Table> = new Map(),
    /** Seeds the random LFO shape. */
    seed = 1,
  ) {
    this.smoothCoef = coefFor(SMOOTH_S * sampleRate);
    this.values = values;
    this.globals = new Globals(sampleRate, values, seed);
    this.setParams(values);
  }

  get voiceCount() {
    return this.voices.length;
  }

  /** The total weight of the sounding voices, for the CPU meter. */
  get units() {
    let u = 0;
    for (const v of this.voices) u += v.weight;
    return u;
  }

  post(msg: BankMessage) {
    switch (msg.type) {
      case "params":
        return this.setParams(msg.values);
      case "lfoRates":
        return msg.rates.forEach((r, i) => this.globals.lfos[i]?.setRate(r));
      case "controls":
        this.globals.bendTarget = msg.bend;
        this.globals.stripTarget = msg.mod;
        return this.globals.aim(this.values);
    }
    this.events.push({ frame: Math.round(msg.t * this.sampleRate), seq: this.seq++, msg });
  }

  /**
   * Render one block starting at absolute frame `startFrame` (the worklet's currentFrame) into `left`
   * and `right`, each stage (mono) into `taps` (TAPS order) when given, and the effect amounts (chorus,
   * delay, reverb; 0..1) into `fx` when given.
   */
  render(left: Float32Array, right: Float32Array, startFrame: number, taps: Float32Array[] | null = null, fx: Float32Array[] | null = null) {
    const n = left.length;
    this.wideL.fill(0, 0, n * OS);
    this.wideR.fill(0, 0, n * OS);
    const wideTaps = taps ? this.wideTaps : null;
    if (wideTaps) for (const tap of wideTaps) tap.fill(0, 0, n * OS);
    const end = startFrame + n;
    const due = this.events.filter((e) => e.frame < end).sort((a, b) => a.frame - b.frame || a.seq - b.seq);
    if (due.length) this.events = this.events.filter((e) => e.frame >= end);
    let pos = 0;
    for (const e of due) {
      const at = Math.max(0, e.frame - startFrame);
      if (at > pos) this.renderSegment(wideTaps, pos, at, startFrame);
      pos = Math.max(pos, at);
      this.apply(e.msg, startFrame + pos);
    }
    if (pos < n) this.renderSegment(wideTaps, pos, n, startFrame);
    this.downL.process(this.wideL, left, n);
    this.downR.process(this.wideR, right, n);
    if (taps && wideTaps) taps.forEach((tap, i) => this.downTaps[i].process(wideTaps[i], tap, n));
    if (fx) fx.forEach((out, x) => out.set(this.globals.fx[x].subarray(0, n)));
  }

  /** The LFOs' phases and rates now, and their random steps since the last call. */
  lfoState(): LfoState {
    const { lfos } = this.globals;
    const steps = this.steps;
    this.steps = [];
    return { phase: lfos.map((l) => l.phase), rate: lfos.map((l) => l.hz), steps };
  }

  private renderSegment(taps: Float32Array[] | null, from: number, to: number, startFrame: number) {
    const left = this.wideL;
    const right = this.wideR;
    const newest = this.voices[this.voices.length - 1];
    if (newest) newest.noteSources(this.noteSources);
    else this.noteSources.fill(0);
    this.globals.render(from, to, startFrame, this.steps, this.sharedRoutes, this.noteSources);
    for (const v of this.voices) v.render(this, left, right, taps, from, to);
    const tremolo = this.globals.tremolo;
    for (let o = from * OS; o < to * OS; o++) {
      const gain = tremolo[(o / OS) | 0];
      left[o] *= gain;
      right[o] *= gain;
    }
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
    t[Q] = filterQ(p.resonance);
    t[K] = filterK(t[Q]);
    t[MORPH] = p.filterMorph;
    t[K2] = filterK(filterQ(p.filter2Resonance));
    t[MORPH2] = p.filter2Morph;
    t[FENV] = p.filterEnvAmt * 1200;
    t[PENV] = p.pitchEnvAmt * 100;
    t[STEREO] = p.stereoWidth;
    t[LK] = ladderK(p.resonance);
    this.routes = activeRoutes(p);
    this.sharedRoutes = this.routes.filter((r) => r.shared >= 0);
    this.routeBySlot = Array(MOD_SLOTS).fill(null);
    for (const r of this.routes) this.routeBySlot[r.slot] = r;
    this.globals.aim(this.values);
    // Any change re-aims each voice's cutoff (key tracking follows its note).
    for (const v of this.voices) {
      v.cutoff.approach(filterBase(p, v.note), SMOOTH_S * this.sampleRate);
      v.cutoff2.approach(filter2Base(p, v.note), SMOOTH_S * this.sampleRate);
    }
  }

  private apply(msg: TimedMessage, frame: number) {
    const p = this.values;
    const sr = this.sampleRate;
    if (msg.type === "on") {
      const v = new Voice(this, msg);
      this.startEnvelopes(v, false);
      this.voices.push(v);
      return;
    }
    const v = this.voices.find((x) => x.id === msg.id);
    if (!v) return;
    switch (msg.type) {
      case "glide": {
        const tc = Math.max(0.001, msg.tc) * sr;
        v.note = msg.note;
        v.freq.approach(midiToHz(msg.note), tc);
        v.cutoff.approach(filterBase(p, msg.note), tc);
        v.cutoff2.approach(filter2Base(p, msg.note), tc);
        v.key.approach(keySource(msg.note), tc);
        return;
      }
      case "retrigger":
        v.velocity = msg.velocity;
        v.random = msg.random;
        v.cutoff.approach(filterBase(p, v.note), SMOOTH_S * sr);
        v.cutoff2.approach(filter2Base(p, v.note), SMOOTH_S * sr);
        this.startEnvelopes(v, true);
        return;
      case "release":
        v.amp.approach(0, (p.release / 4) * sr);
        v.ampEnv.approach(0, (p.release / 4) * sr);
        v.filterEnv.approach(0, (p.filterRelease / 4) * sr);
        v.modEnv.approach(0, (p.modEnvRelease / 4) * sr);
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
    if (!retrigger) for (const env of [v.amp, v.ampEnv, v.filterEnv, v.modEnv]) env.set(0);
    const peak = velocityPeak(p, v.velocity);
    v.amp.ramp(peak, p.attack * sr, peak * p.sustain, (p.decay / 4) * sr);
    v.ampEnv.ramp(1, p.attack * sr, p.sustain, (p.decay / 4) * sr);
    v.filterEnv.ramp(1, p.filterAttack * sr, p.filterSustain, (p.filterDecay / 4) * sr);
    v.modEnv.ramp(1, p.modEnvAttack * sr, p.modEnvSustain, (p.modEnvDecay / 4) * sr);
    v.pitchEnv.set(1);
    v.pitchEnv.approach(0, (p.pitchEnvDecay / 4) * sr);
  }
}

/** The routes that do something: a source, a destination and an amount. */
function activeRoutes(p: ParamValues): Route[] {
  const routes: Route[] = [];
  for (let n = 1; n <= MOD_SLOTS; n++) {
    const ids = slotIds(n);
    const source = p[ids.src];
    const dest = MOD_DESTS[p[ids.dst]];
    const amount = p[ids.amt];
    if (MOD_SOURCES[source] === "off" || MOD_SOURCES[source] === undefined || dest === undefined || amount === 0) continue;
    routes.push({ slot: n - 1, source, dest: p[ids.dst], amount: amount * MOD_RANGE[dest], key: `${source}>${p[ids.dst]}`, shared: SHARED.indexOf(p[ids.dst]) });
  }
  return routes;
}

/** Whether a preset uses the mod matrix. */
export function hasRoutes(p: ParamValues) {
  return activeRoutes(p).length > 0;
}
