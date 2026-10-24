// The synth's oscillators, running on the audio thread (an AudioWorklet).
//
// One processor per voice makes Osc 1, Osc 2 (each with its unison copies) and the
// sub, so Osc 2 can be hard-synced to Osc 1 and Osc 1 can be phase-modulated by Osc 2.
// Outputs: 0 = Osc 1, 1 = Osc 2, 2 = Sub (each the sum of its copies).
//
// Anti-aliasing: every jump in a wave (the saw's drop, the pulse's edges, a sync reset)
// is smoothed with a polyBLEP over the two samples around it. That needs the sample
// before the jump, so the output runs one sample late.

import { clampWidth, FM_INDEX, naive } from "./oscCore";

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor): void;

/** Collects the polyBLEP corrections for one output: on the previous and the current sample. */
class Blep {
  prev = 0;
  cur = 0;
  /** A jump of `h` that happened `d` samples (0..1) before the current sample. */
  add(h: number, d: number) {
    this.prev += 0.5 * h * d * d;
    this.cur -= 0.5 * h * (1 - d) * (1 - d);
  }
}

/**
 * Record the jumps of `wave` while its phase moves from `a` (0..1) forward by `delta`,
 * over the part of the sample from time `t0` to `t0 + span`.
 */
function jumps(wave: number, width: number, a: number, delta: number, t0: number, span: number, blep: Blep) {
  if (wave < 2 || delta <= 0 || delta >= 1) return; // sine and triangle have no jumps
  const b = a + delta;
  const hit = (c: number, h: number) => {
    if (c > a && c <= b) blep.add(h, 1 - (t0 + ((c - a) / delta) * span));
  };
  if (wave === 2) hit(1, -2);
  else {
    hit(width, -2);
    hit(1, 2);
    hit(1 + width, -2);
  }
}

const at = (values: Float32Array, i: number) => (values.length === 1 ? values[0] : values[i]);

class SynthOsc extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 440, minValue: 0, automationRate: "a-rate" },
      /** Cents, for all oscillators: bend and LFO pitch modulation are connected here. */
      { name: "detune", defaultValue: 0, automationRate: "a-rate" },
      /** Cents, the pitch envelope: on all oscillators or on Osc 2 only (envTarget). */
      { name: "pitchEnv", defaultValue: 0, automationRate: "a-rate" },
      { name: "envTarget", defaultValue: 0, automationRate: "k-rate" },
      /** Cents, Osc 2's offset from Osc 1 (its pitch and detune). */
      { name: "osc2Detune", defaultValue: 0, automationRate: "k-rate" },
      /** Cents between the outer unison copies and the middle. */
      { name: "spread", defaultValue: 0, automationRate: "k-rate" },
      /** Pulse width for square waves; the LFO's width modulation is connected here. */
      { name: "width", defaultValue: 0.5, automationRate: "a-rate" },
      { name: "fm", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "sync", defaultValue: 0, automationRate: "k-rate" },
      { name: "wave1", defaultValue: 2, automationRate: "k-rate" },
      { name: "wave2", defaultValue: 2, automationRate: "k-rate" },
    ];
  }

  private copies: number;
  private p1: Float32Array;
  private p2: Float32Array;
  /** Osc 1's last read phase (after FM) and FM offset, per copy. */
  private read1: Float32Array;
  private pm1: Float32Array;
  private sub = 0;
  private blep = [new Blep(), new Blep(), new Blep()];
  private stopAt = Infinity;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.copies = Math.max(1, Math.min(3, options.processorOptions?.unison ?? 1));
    const n = this.copies;
    this.p1 = new Float32Array(n);
    this.p2 = new Float32Array(n);
    this.read1 = new Float32Array(n);
    this.pm1 = new Float32Array(n);
    // Extra unison copies start at random points, so they don't all hit at once.
    for (let u = 1; u < n; u++) {
      this.p1[u] = this.read1[u] = Math.random();
      this.p2[u] = Math.random();
    }
    this.port.onmessage = (e) => (this.stopAt = e.data.stopAt);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    if (currentTime >= this.stopAt) return false;
    const out1 = outputs[0][0];
    const out2 = outputs[1][0];
    const outSub = outputs[2][0];
    const n = this.copies;
    const wave1 = Math.round(params.wave1[0]);
    const wave2 = Math.round(params.wave2[0]);
    const sync = params.sync[0] >= 0.5;
    const envOnBoth = params.envTarget[0] < 0.5;
    const fmK = (Math.max(0, params.fm[0]) * FM_INDEX) / (2 * Math.PI);
    const osc2Mul = Math.pow(2, params.osc2Detune[0] / 1200);
    const spread = params.spread[0];
    const spreadMul = new Float32Array(n);
    for (let u = 0; u < n; u++) spreadMul[u] = Math.pow(2, (n === 1 ? 0 : (u / (n - 1) - 0.5) * 2 * spread) / 1200);
    const [b1, b2, bs] = this.blep;
    const inv = 1 / sampleRate;

    for (let i = 0; i < out1.length; i++) {
      const base = at(params.frequency, i);
      const cents = at(params.detune, i);
      const env = at(params.pitchEnv, i);
      const f1 = base * Math.pow(2, (cents + (envOnBoth ? env : 0)) / 1200);
      const f2 = base * Math.pow(2, (cents + env) / 1200) * osc2Mul;
      const width = clampWidth(at(params.width, i));
      let s1 = 0;
      let s2 = 0;

      for (let u = 0; u < n; u++) {
        const dt1 = f1 * spreadMul[u] * inv;
        const dt2 = f2 * spreadMul[u] * inv;
        const t1 = this.p1[u] + dt1;
        const wrapped = t1 >= 1;

        // Osc 2: with sync, it restarts from 0 at the moment Osc 1 starts a new cycle.
        let p2 = this.p2[u];
        if (sync && wrapped && dt1 > 0) {
          const te = (1 - this.p1[u]) / dt1;
          jumps(wave2, width, p2, dt2 * te, 0, te, b2);
          p2 = (p2 + dt2 * te) % 1;
          b2.add(naive(wave2, 0, width) - naive(wave2, p2, width), 1 - te);
          jumps(wave2, width, 0, dt2 * (1 - te), te, 1 - te, b2);
          p2 = (dt2 * (1 - te)) % 1;
        } else {
          jumps(wave2, width, p2, dt2, 0, 1, b2);
          p2 = (p2 + dt2) % 1;
        }
        this.p2[u] = p2;
        const o2 = naive(wave2, p2, width);
        s2 += o2;

        // Osc 1, read at a phase pushed back and forth by Osc 2 (FM; offset 0 when off).
        this.p1[u] = wrapped ? t1 - 1 : t1;
        const pm = fmK * o2;
        const read = (((this.p1[u] + pm) % 1) + 1) % 1;
        jumps(wave1, width, this.read1[u], dt1 + pm - this.pm1[u], 0, 1, b1);
        this.read1[u] = read;
        this.pm1[u] = pm;
        s1 += naive(wave1, read, width);
      }

      // Sub: a square one octave below Osc 1.
      const dts = (f1 * inv) / 2;
      jumps(3, 0.5, this.sub, dts, 0, 1, bs);
      this.sub = (this.sub + dts) % 1;
      const ss = naive(3, this.sub, 0.5);

      // Output the previous sample, now that all its corrections are in.
      out1[i] = b1.prev;
      out2[i] = b2.prev;
      outSub[i] = bs.prev;
      b1.prev = b1.cur + s1;
      b2.prev = b2.cur + s2;
      bs.prev = bs.cur + ss;
      b1.cur = b2.cur = bs.cur = 0;
    }
    return true;
  }
}

registerProcessor("synth-osc", SynthOsc);
