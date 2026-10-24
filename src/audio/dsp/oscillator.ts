// The synth's oscillators as plain code: no Web Audio here, so it runs in the audio worklet
// (osc.worklet.ts wraps it) and in tests.
//
// One Oscillator per voice makes Osc 1, Osc 2 (each with its unison copies) and the
// sub, so Osc 2 can be hard-synced to Osc 1 and Osc 1 can be phase-modulated by Osc 2.
//
// Anti-aliasing: every jump in a wave (the saw's drop, the pulse's edges, a sync reset)
// is smoothed with a polyBLEP over the two samples around it. That needs the sample
// before the jump, so the output runs one sample late.

import { clampWidth, FM_INDEX, naive, TABLE_WAVE } from "../oscCore";
import { MIP_LEVELS, mipSize } from "../wavetables";

export interface Table {
  frames: number;
  /** Per mip level: all frames back to back. */
  levels: Float32Array[];
}

/**
 * The oscillator's inputs for one block. Each array holds one value (constant for the block)
 * or one value per sample, like AudioWorklet parameters.
 */
export type OscParams = Record<
  | "frequency"
  | "detune"
  | "pitchEnv"
  | "envTarget"
  | "osc2Detune"
  | "spread"
  | "width"
  | "fm"
  | "sync"
  | "wave1"
  | "wave2"
  | "table"
  | "position",
  Float32Array
>;

/** Reads a wavetable for one oscillator: the mip levels for its pitch are picked once per block. */
class TableReader {
  private table: Table | undefined;
  private level = 0;
  /** Weight of `level`; the rest is level + 1 (blended so moving pitch doesn't jump in brightness). */
  private weight = 1;

  constructor(
    private tables: Map<number, Table>,
    private sampleRate: number,
  ) {}

  setup(id: number, freq: number) {
    this.table = this.tables.get(id);
    // Level k keeps harmonics up to 1024 >> k: the lowest level whose top harmonic stays under Nyquist.
    const x = Math.max(0, Math.log2((2048 * Math.max(1, freq)) / this.sampleRate));
    this.level = Math.min(MIP_LEVELS - 1, Math.ceil(x));
    this.weight = this.level >= MIP_LEVELS - 1 ? 1 : Math.min(1, this.level - x);
    if (x === 0) this.weight = 1;
  }

  read(position: number, phase: number): number {
    const t = this.table;
    if (!t) return 0;
    const fp = Math.min(1, Math.max(0, position)) * (t.frames - 1);
    const f0 = Math.floor(fp);
    const f1 = Math.min(t.frames - 1, f0 + 1);
    const ff = fp - f0;
    const a = readLevel(t.levels[this.level], mipSize(this.level), f0, f1, ff, phase);
    if (this.weight >= 1) return a;
    const k = this.level + 1;
    return a * this.weight + readLevel(t.levels[k], mipSize(k), f0, f1, ff, phase) * (1 - this.weight);
  }
}

function readLevel(data: Float32Array, size: number, f0: number, f1: number, ff: number, phase: number) {
  const idx = phase * size;
  const i0 = Math.floor(idx) % size;
  const i1 = (i0 + 1) % size;
  const fr = idx - Math.floor(idx);
  const b0 = f0 * size;
  const b1 = f1 * size;
  const v0 = data[b0 + i0] + (data[b0 + i1] - data[b0 + i0]) * fr;
  const v1 = data[b1 + i0] + (data[b1 + i1] - data[b1 + i0]) * fr;
  return v0 + (v1 - v0) * ff;
}

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
  if ((wave !== 2 && wave !== 3) || delta <= 0 || delta >= 1) return; // only the saw and pulse jump
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

export class Oscillator {
  private copies: number;
  private p1: Float32Array;
  private p2: Float32Array;
  /** Osc 1's last read phase (after FM) and FM offset, per copy. */
  private read1: Float32Array;
  private pm1: Float32Array;
  private sub = 0;
  private blep = [new Blep(), new Blep(), new Blep()];
  private reader1: TableReader;
  private reader2: TableReader;

  constructor(
    unison: number,
    private sampleRate: number,
    tables: Map<number, Table> = new Map(),
    random: () => number = Math.random,
  ) {
    this.copies = Math.max(1, Math.min(3, unison));
    const n = this.copies;
    this.p1 = new Float32Array(n);
    this.p2 = new Float32Array(n);
    this.read1 = new Float32Array(n);
    this.pm1 = new Float32Array(n);
    // Extra unison copies start at random points, so they don't all hit at once.
    for (let u = 1; u < n; u++) {
      this.p1[u] = this.read1[u] = random();
      this.p2[u] = random();
    }
    this.reader1 = new TableReader(tables, sampleRate);
    this.reader2 = new TableReader(tables, sampleRate);
  }

  /** Fill one block: Osc 1, Osc 2 and the sub (each the sum of its copies). */
  render(params: OscParams, out1: Float32Array, out2: Float32Array, outSub: Float32Array) {
    const n = this.copies;
    const wave1 = Math.round(params.wave1[0]);
    const wave2 = Math.round(params.wave2[0]);
    const sync = params.sync[0] >= 0.5;
    const envOnBoth = params.envTarget[0] < 0.5;
    const FM_K = FM_INDEX / (2 * Math.PI);
    // Osc 2's offset and the FM amount can move during the block (mod matrix), so they are read per sample.
    const osc2Cents = params.osc2Detune;
    let osc2Mul = Math.pow(2, osc2Cents[0] / 1200);
    const spread = params.spread[0];
    const spreadMul = new Float32Array(n);
    for (let u = 0; u < n; u++) spreadMul[u] = Math.pow(2, (n === 1 ? 0 : (u / (n - 1) - 0.5) * 2 * spread) / 1200);
    const [b1, b2, bs] = this.blep;
    const inv = 1 / this.sampleRate;
    const table = Math.round(params.table[0]);
    const freq0 = params.frequency[0] * Math.pow(2, (params.detune[0] + params.pitchEnv[0]) / 1200);
    if (wave1 === TABLE_WAVE) this.reader1.setup(table, freq0 * (envOnBoth ? 1 : Math.pow(2, -params.pitchEnv[0] / 1200)));
    if (wave2 === TABLE_WAVE) this.reader2.setup(table, freq0 * osc2Mul);
    let position = 0;
    // A wave's value at a phase: the built-in shapes, or the wavetable at the current position.
    const v1 = (p: number, w: number) => (wave1 === TABLE_WAVE ? this.reader1.read(position, p) : naive(wave1, p, w));
    const v2 = (p: number, w: number) => (wave2 === TABLE_WAVE ? this.reader2.read(position, p) : naive(wave2, p, w));

    for (let i = 0; i < out1.length; i++) {
      const base = at(params.frequency, i);
      const cents = at(params.detune, i);
      const env = at(params.pitchEnv, i);
      const f1 = base * Math.pow(2, (cents + (envOnBoth ? env : 0)) / 1200);
      if (osc2Cents.length > 1) osc2Mul = Math.pow(2, osc2Cents[i] / 1200);
      const fmK = Math.min(2, Math.max(0, at(params.fm, i))) * FM_K;
      const f2 = base * Math.pow(2, (cents + env) / 1200) * osc2Mul;
      const width = clampWidth(at(params.width, i));
      position = at(params.position, i);
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
          b2.add(v2(0, width) - v2(p2, width), 1 - te);
          jumps(wave2, width, 0, dt2 * (1 - te), te, 1 - te, b2);
          p2 = (dt2 * (1 - te)) % 1;
        } else {
          jumps(wave2, width, p2, dt2, 0, 1, b2);
          p2 = (p2 + dt2) % 1;
        }
        this.p2[u] = p2;
        const o2 = v2(p2, width);
        s2 += o2;

        // Osc 1, read at a phase pushed back and forth by Osc 2 (FM; offset 0 when off).
        this.p1[u] = wrapped ? t1 - 1 : t1;
        const pm = fmK * o2;
        const read = (((this.p1[u] + pm) % 1) + 1) % 1;
        jumps(wave1, width, this.read1[u], dt1 + pm - this.pm1[u], 0, 1, b1);
        this.read1[u] = read;
        this.pm1[u] = pm;
        s1 += v1(read, width);
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
  }
}
