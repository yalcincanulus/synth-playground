// The effects that run in our own code: distortion, phaser and flanger. Plain code (no Web Audio), so
// each runs in an "fx-slot" processor (synth.worklet.ts) and in tests. The EQ, compressor, chorus,
// delay and reverb are the browser's own nodes (fx.ts). All are stereo: two channels in, two out.

import type { ParamValues } from "../params";
import { Decimator2, Interpolator2, ROUND_TRIP_LATENCY } from "./halfband";

export type SlotKind = "distortion" | "phaser" | "flanger";

/** One effect: settings in, stereo sound through. */
export interface SlotEffect {
  set(p: ParamValues): void;
  process(left: Float32Array, right: Float32Array, n: number): void;
  /** The LFO's phase (cycles, 0..1), for the drawings; effects without an LFO return 0. */
  readonly phase: number;
}

export function makeEffect(kind: SlotKind, sampleRate: number, p: ParamValues): SlotEffect {
  const fx = kind === "distortion" ? new Distortion(sampleRate) : kind === "phaser" ? new Phaser(sampleRate) : new Flanger(sampleRate);
  fx.set(p);
  return fx;
}

/** Settings move towards their new value over about 10 ms, so a turned knob doesn't click. */
const SMOOTH_S = 0.01;
const smoothing = (sampleRate: number) => 1 - Math.exp(-1 / (SMOOTH_S * sampleRate));

// ---------------------------------------------------------------- distortion

/** Drive 0..1 is 0..36 dB of gain into the curve. */
const DRIVE_DB = 36;
/** The level the volume is kept at: a sine at this peak sounds about as loud with any Drive. */
const REFERENCE_PEAK = 0.3;

export const driveGain = (drive: number) => Math.pow(10, (drive * DRIVE_DB) / 20);

/** Crush: bits left (12 down to 2) and how many samples each one is held for (1 up to 16). */
export function crushSettings(drive: number) {
  return { bits: 12 - drive * 10, hold: Math.max(1, Math.round(Math.pow(2, drive * 4))) };
}

/** One curve: soft, hard or fold, for an input already multiplied by the drive gain. */
function curve(type: number, x: number): number {
  switch (type) {
    case 0: return Math.tanh(x);
    case 1: return x > 1 ? 1 : x < -1 ? -1 : x;
    default: return Math.sin((Math.PI / 2) * x);
  }
}

function quantise(x: number, bits: number) {
  const steps = Math.pow(2, bits - 1);
  return Math.round(x * steps) / steps;
}

/**
 * The output level that keeps a sine at REFERENCE_PEAK as loud (in RMS) as it went in, so Drive
 * changes the character and not the volume. Crush needs none: it doesn't change the level.
 */
export function makeUp(type: number, drive: number): number {
  if (type === 3) return 1;
  const g = driveGain(drive);
  let dry = 0;
  let wet = 0;
  for (let i = 0; i < 64; i++) {
    const x = REFERENCE_PEAK * Math.sin((2 * Math.PI * (i + 0.5)) / 64);
    const y = curve(type, g * x);
    dry += x * x;
    wet += y * y;
  }
  return Math.sqrt(dry / wet);
}

/** What the distortion does to one input level (-1..1), with the make-up level: for the drawing. Crush shows its steps. */
export function distortCurve(type: number, drive: number, x: number): number {
  if (type === 3) return quantise(x, crushSettings(drive).bits);
  return makeUp(type, drive) * curve(type, driveGain(drive) * x);
}

/** The dry sound is held back as long as the wet sound takes through the 2x path, so mixing them doesn't comb-filter. */
export const DIST_LATENCY = ROUND_TRIP_LATENCY;

class DistChannel {
  up = new Interpolator2();
  down = new Decimator2();
  dry = new Float32Array(DIST_LATENCY + 1);
  dryAt = 0;
  // The tone filter: two one-pole low-passes.
  t1 = 0;
  t2 = 0;
  /** Crush: the sample being held, and for how much longer. */
  held = 0;
  holdLeft = 0;
}

/**
 * Soft, hard and fold run at twice the sample rate (dsp/halfband.ts): bending a wave makes new high
 * harmonics, and above the Nyquist frequency they would fold back down as harsh, out-of-tune tones.
 * Crush runs at the normal rate, because those folded-back tones are its sound.
 */
export class Distortion implements SlotEffect {
  readonly phase = 0;
  private type = 0;
  private gain = 1;
  private makeUp = 1;
  private bits = 12;
  private hold = 1;
  private toneA = 0;
  private mix = 1;
  private mixNow = 1;
  private k: number;
  private ch = [new DistChannel(), new DistChannel()];
  private buf2 = new Float32Array(256);
  private wet = new Float32Array(128);

  constructor(private sampleRate: number) {
    this.k = smoothing(sampleRate);
  }

  set(p: ParamValues) {
    this.type = Math.round(p.distType);
    this.gain = driveGain(p.distDrive);
    this.makeUp = makeUp(this.type, p.distDrive);
    const crush = crushSettings(p.distDrive);
    this.bits = crush.bits;
    this.hold = crush.hold;
    this.toneA = Math.exp((-2 * Math.PI * Math.min(p.distTone, this.sampleRate * 0.45)) / this.sampleRate);
    this.mix = p.distMix;
  }

  process(left: Float32Array, right: Float32Array, n: number) {
    if (this.buf2.length < 2 * n) {
      this.buf2 = new Float32Array(2 * n);
      this.wet = new Float32Array(n);
    }
    const mixFrom = this.mixNow;
    for (let c = 0; c < 2; c++) {
      const x = c ? right : left;
      this.mixNow = mixFrom;
      this.shape(this.ch[c], x, n);
      this.tone(this.ch[c], n);
      this.mixIn(this.ch[c], x, n);
    }
  }

  private shape(ch: DistChannel, x: Float32Array, n: number) {
    const wet = this.wet;
    if (this.type === 3) {
      for (let i = 0; i < n; i++) {
        if (ch.holdLeft <= 0) {
          ch.held = quantise(x[i], this.bits);
          ch.holdLeft = this.hold;
        }
        ch.holdLeft--;
        wet[i] = ch.held;
      }
      return;
    }
    const b = this.buf2;
    ch.up.process(x, b, n);
    const g = this.gain;
    const m = this.makeUp;
    const type = this.type;
    for (let i = 0; i < 2 * n; i++) b[i] = m * curve(type, g * b[i]);
    ch.down.process(b, wet, n);
  }

  private tone(ch: DistChannel, n: number) {
    const wet = this.wet;
    const a = this.toneA;
    let t1 = ch.t1;
    let t2 = ch.t2;
    for (let i = 0; i < n; i++) {
      t1 = (1 - a) * wet[i] + a * t1;
      t2 = (1 - a) * t1 + a * t2;
      wet[i] = t2;
    }
    ch.t1 = t1;
    ch.t2 = t2;
  }

  private mixIn(ch: DistChannel, x: Float32Array, n: number) {
    const wet = this.wet;
    // Crush has no 2x path, so no delay to match.
    const latency = this.type === 3 ? 0 : DIST_LATENCY;
    const dry = ch.dry;
    const len = dry.length;
    const k = this.k;
    let mix = this.mixNow;
    for (let i = 0; i < n; i++) {
      dry[ch.dryAt] = x[i];
      const d = dry[(ch.dryAt - latency + len) % len];
      ch.dryAt = (ch.dryAt + 1) % len;
      mix += (this.mix - mix) * k;
      x[i] = d + (wet[i] - d) * mix;
    }
    this.mixNow = mix;
  }
}

// ---------------------------------------------------------------- phaser and flanger

/**
 * The level that keeps a sound with every frequency in it (spread evenly over the octaves, 100 Hz to
 * 10 kHz) as loud as without the effect, averaged over the LFO's sweep: notches take level away.
 */
function sweptMakeUp(magnitude: (lfo: number, hz: number) => number): number {
  let sum = 0;
  let count = 0;
  for (const lfo of [-1, -0.5, 0, 0.5, 1]) {
    for (let i = 0; i < 48; i++) {
      const m = magnitude(lfo, 100 * Math.pow(100, (i + 0.5) / 48));
      sum += m * m;
      count++;
    }
  }
  return Math.sqrt(count / sum);
}

export const PHASER_STAGES = 6;
/** The sweep's lowest point, and how far up it goes at full Depth. */
export const PHASER_LOW_HZ = 150;
export const PHASER_OCTAVES = 6;
/** The right side's LFO runs this far (cycles) ahead of the left's, so the sweep moves across. */
export const STEREO_OFFSET = 0.25;
/** The sweep's coefficients are worked out every this many samples (they move slowly). */
const CONTROL_EVERY = 16;

/** Where the phaser's stages sit for an LFO value (-1..1): the frequency where each turns the phase by 90 degrees. */
export function phaserHz(depth: number, lfo: number) {
  return PHASER_LOW_HZ * Math.pow(2, PHASER_OCTAVES * depth * (0.5 + 0.5 * lfo));
}

/** A first-order all-pass's coefficient for a frequency. */
const allpassCoef = (hz: number, sampleRate: number) => {
  const t = Math.tan((Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate);
  return (t - 1) / (t + 1);
};

/**
 * The phaser's level (0..1+) at `hz`, for an LFO value: for the drawing. The stages pass every frequency
 * at full level but turn its phase, the more the higher it is; mixed with the dry sound, frequencies
 * that come out turned by half a cycle cancel: notches. Feedback deepens them and makes peaks between.
 */
export function phaserMagnitude(p: Pick<ParamValues, "phaserDepth" | "phaserFeedback" | "phaserMix">, lfo: number, hz: number, sampleRate: number): number {
  const a = allpassCoef(phaserHz(p.phaserDepth, lfo), sampleRate);
  const w = (2 * Math.PI * hz) / sampleRate;
  // One stage: (a + e^-jw) / (1 + a e^-jw), a pure phase turn.
  const [cr, ci] = [Math.cos(w), -Math.sin(w)];
  const [nr, ni] = [a + cr, ci];
  const [dr, di] = [1 + a * cr, a * ci];
  const den = dr * dr + di * di;
  const sr = (nr * dr + ni * di) / den;
  const si = (ni * dr - nr * di) / den;
  // All the stages: that turn, PHASER_STAGES times.
  let [ar, ai] = [1, 0];
  for (let s = 0; s < PHASER_STAGES; s++) [ar, ai] = [ar * sr - ai * si, ar * si + ai * sr];
  // With feedback: H = A / (1 - fb A).
  const fb = p.phaserFeedback;
  const [qr, qi] = [1 - fb * ar, -fb * ai];
  const q = qr * qr + qi * qi;
  const hr = (ar * qr + ai * qi) / q;
  const hi = (ai * qr - ar * qi) / q;
  const m = p.phaserMix;
  return Math.hypot(1 - m + m * hr, m * hi);
}

/** The phaser's make-up level (see sweptMakeUp). */
export const phaserMakeUp = (p: Pick<ParamValues, "phaserDepth" | "phaserFeedback" | "phaserMix">, sampleRate: number) =>
  sweptMakeUp((lfo, hz) => phaserMagnitude(p, lfo, hz, sampleRate));

/** Six first-order all-pass stages per side, swept by a sine LFO, with feedback, mixed with the dry sound. */
export class Phaser implements SlotEffect {
  phase = 0;
  private rate = 0.3;
  private depth = 0.7;
  private fb = 0;
  private mix = 0.5;
  private level = 1;
  /** Each side's feedback, mix and level as they move towards the settings. */
  private now = [Float64Array.of(0, 0.5, 1), Float64Array.of(0, 0.5, 1)];
  /** This block's LFO start and step per sample: fields, not arguments, so V8 needn't box them. */
  private blockPhase = 0;
  private step = 0;
  private k: number;
  private x1 = [new Float64Array(PHASER_STAGES), new Float64Array(PHASER_STAGES)];
  private y1 = [new Float64Array(PHASER_STAGES), new Float64Array(PHASER_STAGES)];
  private last = [0, 0];

  constructor(private sampleRate: number) {
    this.k = smoothing(sampleRate);
  }

  set(p: ParamValues) {
    this.rate = p.phaserRate;
    this.depth = p.phaserDepth;
    this.fb = p.phaserFeedback;
    this.mix = p.phaserMix;
    this.level = phaserMakeUp(p, this.sampleRate);
  }

  process(left: Float32Array, right: Float32Array, n: number) {
    this.step = this.rate / this.sampleRate;
    this.blockPhase = this.phase;
    this.channel(0, left, n);
    this.blockPhase = this.phase + STEREO_OFFSET;
    this.channel(1, right, n);
    this.phase += this.step * n;
    this.phase -= Math.floor(this.phase);
  }

  private channel(c: number, x: Float32Array, n: number) {
    const x1 = this.x1[c];
    const y1 = this.y1[c];
    const now = this.now[c];
    const k = this.k;
    const phase = this.blockPhase;
    const step = this.step;
    let last = this.last[c];
    let fb = now[0];
    let mix = now[1];
    let level = now[2];
    let a = 0;
    for (let i = 0; i < n; i++) {
      if (i % CONTROL_EVERY === 0) a = allpassCoef(phaserHz(this.depth, Math.sin(2 * Math.PI * (phase + i * step))), this.sampleRate);
      fb += (this.fb - fb) * k;
      mix += (this.mix - mix) * k;
      level += (this.level - level) * k;
      let v = x[i] + fb * last;
      for (let s = 0; s < PHASER_STAGES; s++) {
        const y = a * v + x1[s] - a * y1[s];
        x1[s] = v;
        y1[s] = y;
        v = y;
      }
      last = v;
      x[i] = (x[i] * (1 - mix) + v * mix) * level;
    }
    this.last[c] = last;
    now[0] = fb;
    now[1] = mix;
    now[2] = level;
  }
}

// ---------------------------------------------------------------- flanger

/** The flanger's shortest delay, and how much longer it sweeps at full Depth (seconds). */
export const FLANGER_MIN_S = 0.0005;
export const FLANGER_SWEEP_S = 0.007;

/** The flanger's delay (seconds) for an LFO value (-1..1). */
export const flangerDelay = (depth: number, lfo: number) => FLANGER_MIN_S + depth * FLANGER_SWEEP_S * (0.5 + 0.5 * lfo);

/**
 * The flanger's level at `hz` for an LFO value: for the drawing. A copy delayed by a few milliseconds,
 * mixed back in, cancels the frequencies whose half-cycle fits the delay: a comb of evenly spaced notches,
 * which the sweep moves up and down. Feedback turns the gaps between them into ringing peaks.
 */
export function flangerMagnitude(p: Pick<ParamValues, "flangerDepth" | "flangerFeedback" | "flangerMix">, lfo: number, hz: number): number {
  const wd = 2 * Math.PI * hz * flangerDelay(p.flangerDepth, lfo);
  // The delayed copy, fed back: D = e^-jwd / (1 - fb e^-jwd).
  const [er, ei] = [Math.cos(wd), -Math.sin(wd)];
  const fb = p.flangerFeedback;
  const [qr, qi] = [1 - fb * er, -fb * ei];
  const q = qr * qr + qi * qi;
  const dr = (er * qr + ei * qi) / q;
  const di = (ei * qr - er * qi) / q;
  const m = p.flangerMix;
  return Math.hypot(1 - m + m * dr, m * di);
}

/** The flanger's make-up level (see sweptMakeUp). */
export const flangerMakeUp = (p: Pick<ParamValues, "flangerDepth" | "flangerFeedback" | "flangerMix">) => sweptMakeUp((lfo, hz) => flangerMagnitude(p, lfo, hz));

/** One swept delay line per side, with feedback, mixed with the dry sound. */
export class Flanger implements SlotEffect {
  phase = 0;
  private rate = 0.2;
  private depth = 0.7;
  private fb = 0;
  private mix = 0.5;
  private level = 1;
  /** Each side's feedback, mix and level as they move towards the settings. */
  private now = [Float64Array.of(0, 0.5, 1), Float64Array.of(0, 0.5, 1)];
  /** This block's LFO start and step per sample: fields, not arguments, so V8 needn't box them. */
  private blockPhase = 0;
  private step = 0;
  private k: number;
  private lines: [Float32Array, Float32Array];
  private writeAt = 0;

  constructor(private sampleRate: number) {
    this.k = smoothing(sampleRate);
    // A power of two longer than the longest delay, so the read position wraps with a mask.
    let len = 1;
    while (len < (FLANGER_MIN_S + FLANGER_SWEEP_S) * sampleRate + 4) len *= 2;
    this.lines = [new Float32Array(len), new Float32Array(len)];
  }

  set(p: ParamValues) {
    this.rate = p.flangerRate;
    this.depth = p.flangerDepth;
    this.fb = p.flangerFeedback;
    this.mix = p.flangerMix;
    this.level = flangerMakeUp(p);
  }

  process(left: Float32Array, right: Float32Array, n: number) {
    this.step = this.rate / this.sampleRate;
    this.blockPhase = this.phase;
    this.channel(0, left, n);
    this.blockPhase = this.phase + STEREO_OFFSET;
    this.channel(1, right, n);
    this.writeAt = (this.writeAt + n) & (this.lines[0].length - 1);
    this.phase += this.step * n;
    this.phase -= Math.floor(this.phase);
  }

  private channel(c: number, x: Float32Array, n: number) {
    const line = this.lines[c];
    const now = this.now[c];
    const mask = line.length - 1;
    const k = this.k;
    const sr = this.sampleRate;
    const phase = this.blockPhase;
    const step = this.step;
    let fb = now[0];
    let mix = now[1];
    let level = now[2];
    let w = this.writeAt;
    // The delay is worked out every CONTROL_EVERY samples and moved in a straight line between.
    let d = flangerDelay(this.depth, Math.sin(2 * Math.PI * phase)) * sr;
    let dStep = 0;
    for (let i = 0; i < n; i++) {
      if (i % CONTROL_EVERY === 0) {
        const next = flangerDelay(this.depth, Math.sin(2 * Math.PI * (phase + (i + CONTROL_EVERY) * step))) * sr;
        dStep = (next - d) / CONTROL_EVERY;
      }
      fb += (this.fb - fb) * k;
      mix += (this.mix - mix) * k;
      level += (this.level - level) * k;
      // Read between two samples (linear interpolation).
      const pos = w - d;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = line[i0 & mask];
      const delayed = a + (line[(i0 + 1) & mask] - a) * f;
      line[w] = x[i] + fb * delayed;
      w = (w + 1) & mask;
      x[i] = (x[i] * (1 - mix) + delayed * mix) * level;
      d += dStep;
    }
    now[0] = fb;
    now[1] = mix;
    now[2] = level;
  }
}
