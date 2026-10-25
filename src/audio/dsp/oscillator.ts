// The synth's oscillators as plain code: no Web Audio here, so it runs in the audio worklet
// (the voice engine, dsp/voiceBank.ts, runs it in synth.worklet.ts) and in tests.
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

/**
 * Reads a wavetable for one oscillator. The mip levels for its pitch are picked once per block, and the
 * frames to blend for the position once per sample (`moveTo`), shared by every unison copy: only the
 * phase is read per copy. Mip sizes are powers of two, so wrapping an index is a bit mask.
 */
class TableReader {
  private table: Table | undefined;
  /** Weight of the first level; the rest is the next one (blended so moving pitch doesn't jump in brightness). */
  private weight = 1;
  // The two levels read: their samples, size and size - 1.
  private dataA: Float32Array = new Float32Array(0);
  private dataB: Float32Array = new Float32Array(0);
  private sizeA = 0;
  private sizeB = 0;
  private maskA = 0;
  private maskB = 0;
  // The position's two frames, as offsets into each level, and the blend between them.
  private a0 = 0;
  private a1 = 0;
  private b0 = 0;
  private b1 = 0;
  private ff = 0;
  private position = NaN;

  constructor(
    private tables: Map<number, Table>,
    private sampleRate: number,
  ) {}

  setup(id: number, freq: number) {
    const t = (this.table = this.tables.get(id));
    this.position = NaN;
    if (!t) return;
    // Level k keeps harmonics up to 1024 >> k: the lowest level whose top harmonic stays under Nyquist.
    const x = Math.max(0, Math.log2((2048 * Math.max(1, freq)) / this.sampleRate));
    const level = Math.min(MIP_LEVELS - 1, Math.ceil(x));
    this.weight = level >= MIP_LEVELS - 1 ? 1 : Math.min(1, level - x);
    if (x === 0) this.weight = 1;
    const next = Math.min(MIP_LEVELS - 1, level + 1);
    this.dataA = t.levels[level];
    this.dataB = t.levels[next];
    this.sizeA = mipSize(level);
    this.sizeB = mipSize(next);
    this.maskA = this.sizeA - 1;
    this.maskB = this.sizeB - 1;
  }

  /** The table position (0..1) for this sample. */
  moveTo(position: number) {
    const t = this.table;
    if (!t || position === this.position) return;
    this.position = position;
    const fp = Math.min(1, Math.max(0, position)) * (t.frames - 1);
    const f0 = Math.floor(fp);
    const f1 = Math.min(t.frames - 1, f0 + 1);
    this.ff = fp - f0;
    this.a0 = f0 * this.sizeA;
    this.a1 = f1 * this.sizeA;
    this.b0 = f0 * this.sizeB;
    this.b1 = f1 * this.sizeB;
  }

  /** Read `phases[i]` at `positions[i]` into `out[i]`, for i from `from` to `to`. */
  readBlock(phases: Float64Array, positions: Float64Array, out: Float64Array, from: number, to: number) {
    for (let i = from; i < to; i++) {
      this.moveTo(positions[i]);
      out[i] = this.read(phases[i]);
    }
  }

  /** The table at a phase (0..1), at the position set by moveTo. */
  read(phase: number): number {
    if (!this.table) return 0;
    const ff = this.ff;
    let idx = phase * this.sizeA;
    let i = Math.floor(idx);
    let fr = idx - i;
    let i0 = i & this.maskA;
    let i1 = (i0 + 1) & this.maskA;
    let d = this.dataA;
    let v0 = d[this.a0 + i0] + (d[this.a0 + i1] - d[this.a0 + i0]) * fr;
    let v1 = d[this.a1 + i0] + (d[this.a1 + i1] - d[this.a1 + i0]) * fr;
    const a = v0 + (v1 - v0) * ff;
    if (this.weight >= 1) return a;
    idx = phase * this.sizeB;
    i = Math.floor(idx);
    fr = idx - i;
    i0 = i & this.maskB;
    i1 = (i0 + 1) & this.maskB;
    d = this.dataB;
    v0 = d[this.b0 + i0] + (d[this.b0 + i1] - d[this.b0 + i0]) * fr;
    v1 = d[this.b1 + i0] + (d[this.b1 + i1] - d[this.b1 + i0]) * fr;
    return a * this.weight + (v0 + (v1 - v0) * ff) * (1 - this.weight);
  }
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
 * Record the jumps of `wave` while its phase moves from `a` (0..1) by `delta`, over the part of the
 * sample from time `t0` to `t0 + span`. (A copy's stereo part needs no jumps of its own: it is the
 * copy's output times its stereo position.) The phase can move backward (strong FM pushes it back for part of each
 * cycle): an edge crossed backward is the same jump the other way.
 */
function jumps(wave: number, width: number, a: number, delta: number, t0: number, span: number, blep: Blep) {
  if (crossesEdge(wave, width, a, delta)) edges(wave, width, a, delta, t0, span, blep);
}

/**
 * Whether the phase moving from `a` by `delta` crosses one of `wave`'s jumps. Most samples cross none:
 * the phase stays inside one cycle, clear of the pulse's width. This check is tiny so V8 inlines it
 * wherever it is called, and the rare crossing calls edges(): a call that isn't inlined allocates
 * memory for every number it passes, which at every sample added up to megabytes a second.
 */
function crossesEdge(wave: number, width: number, a: number, delta: number): boolean {
  if ((wave !== 2 && wave !== 3) || delta === 0 || delta >= 1 || delta <= -1) return false; // only the saw and pulse jump
  const b = a + delta;
  const lo = delta > 0 ? a : b;
  const hi = delta > 0 ? b : a;
  return !(lo >= 0 && hi < 1 && (wave === 2 || hi < width || lo >= width));
}

/**
 * The edges near the phase's range, as met going forward: the saw drops at each cycle's end; the
 * pulse falls at the width and rises at the cycle's end.
 */
function edges(wave: number, width: number, a: number, delta: number, t0: number, span: number, blep: Blep) {
  if (wave === 2) {
    edge(0, -2, a, delta, t0, span, blep);
    edge(1, -2, a, delta, t0, span, blep);
  } else {
    edge(width - 1, -2, a, delta, t0, span, blep);
    edge(0, 2, a, delta, t0, span, blep);
    edge(width, -2, a, delta, t0, span, blep);
    edge(1, 2, a, delta, t0, span, blep);
    edge(1 + width, -2, a, delta, t0, span, blep);
  }
}

/** If the phase moving from `a` by `delta` crosses `c`, record its jump `h` (reversed when moving backward). */
function edge(c: number, h: number, a: number, delta: number, t0: number, span: number, blep: Blep) {
  const b = a + delta;
  if (delta > 0 ? c <= a || c > b : c >= a || c < b) return;
  const d = 1 - (t0 + ((c - a) / delta) * span);
  const jump = delta > 0 ? h : -h;
  blep.add(jump, d);
}

const at = (values: Float32Array, i: number) => (values.length === 1 ? values[0] : values[i]);

// Phase wrapping without `%`: on floating-point numbers it is a slow library call in V8 (it was a fifth
// of a plain saw's time). Both give exactly the same numbers as the `%` forms they replace.
/** x % 1, for x >= 0. */
const frac = (x: number) => x - Math.floor(x);
/** ((x % 1) + 1) % 1, for any x: a phase pushed backward wraps to the top of the cycle. */
function wrapPhase(x: number) {
  const r = x - Math.trunc(x) + 1;
  return r >= 1 ? r - 1 : r;
}

/**
 * Where unison copy `u` of `n` sits, -1 (left) .. 1 (right): the flattest copy on the left, the sharpest
 * on the right. Osc 2's copies sit the other way round, so each side has a flat and a sharp copy.
 */
export const copyPosition = (u: number, n: number) => (n === 1 ? 0 : (u / (n - 1)) * 2 - 1);

/**
 * The stereo part of Osc 1 and Osc 2: each copy times its position (see copyPosition). With the sum
 * S and this D, a stereo width w gives left = S - w·D and right = S + w·D, so (left + right) / 2 is
 * always S: the sound in mono doesn't change with the width.
 */
export interface SideOutputs {
  osc1: Float32Array;
  osc2: Float32Array;
}

/** Scratch buffers for one block, per sample (the oscillator runs at the sound path's rate: 2 x 128). */
const SCRATCH = 256;

export class Oscillator {
  private copies: number;
  private p1: Float32Array;
  private p2: Float32Array;
  /** Osc 1's last read phase (after FM) and FM offset, per copy. */
  private read1: Float32Array;
  private pm1: Float32Array;
  /**
   * Each copy's output still waiting for the polyBLEP corrections of the next sample: the output runs one
   * sample late (see the top of this file). Osc 1's and Osc 2's, per copy.
   */
  private pending1: Float64Array;
  private pending2: Float64Array;
  private sub = 0;
  private subBlep = new Blep();
  /** Collects one sample's corrections for one copy (copied out into the c… buffers below). */
  private blep = new Blep();
  private reader1: TableReader;
  private reader2: TableReader;
  /** Each copy's detune factor for this block (kept, so a block allocates nothing). */
  private spreadMul: Float32Array;
  /** Each copy's stereo position (see copyPosition). */
  private positions: number[];

  // Per-sample values for the block. Shared by the copies: the pitches, FM, width and table position.
  private f1 = new Float64Array(SCRATCH);
  private f2 = new Float64Array(SCRATCH);
  private fmK = new Float64Array(SCRATCH);
  private width = new Float64Array(SCRATCH);
  private position = new Float64Array(SCRATCH);
  // For one copy at a time: phases, the waves' values, and the polyBLEP corrections on the previous and
  // the current sample.
  private dt1 = new Float64Array(SCRATCH);
  private ph1 = new Float64Array(SCRATCH);
  private ph2 = new Float64Array(SCRATCH);
  private rd1 = new Float64Array(SCRATCH);
  private val1 = new Float64Array(SCRATCH);
  private val2 = new Float64Array(SCRATCH);
  private c1Prev = new Float64Array(SCRATCH);
  private c1Cur = new Float64Array(SCRATCH);
  private c2Prev = new Float64Array(SCRATCH);
  private c2Cur = new Float64Array(SCRATCH);

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
    this.pending1 = new Float64Array(n);
    this.pending2 = new Float64Array(n);
    this.spreadMul = new Float32Array(n);
    this.positions = Array.from({ length: n }, (_, u) => copyPosition(u, n));
    // Extra unison copies start at random points, so they don't all hit at once.
    for (let u = 1; u < n; u++) {
      this.p1[u] = this.read1[u] = random();
      this.p2[u] = random();
    }
    this.reader1 = new TableReader(tables, sampleRate);
    this.reader2 = new TableReader(tables, sampleRate);
  }

  /** How many unison copies each oscillator has. */
  get unison() {
    return this.copies;
  }

  /**
   * Fill samples `from` to `to` (default: the whole block) of Osc 1, Osc 2 and the sub, each the sum of
   * its copies, and, when `side` is given, the oscillators' stereo parts (see SideOutputs). Per-sample
   * params are read at the same positions; one-value params apply throughout.
   *
   * The work is done in short loops over the block, one unison copy at a time (Osc 2's phases, Osc 2's
   * values, then Osc 1's, which FM reads Osc 2's values for), rather than one long loop doing everything
   * for each sample. In one long loop V8 could not inline all the calls it makes for every copy at every
   * sample, and each call that isn't inlined allocates memory for the numbers it passes: about 1 MB per
   * block, which the garbage collector then has to clear on the audio thread.
   */
  render(params: OscParams, out1: Float32Array, out2: Float32Array, outSub: Float32Array, from = 0, to = out1.length, side: SideOutputs | null = null) {
    const n = this.copies;
    const wave1 = Math.round(params.wave1[0]);
    const wave2 = Math.round(params.wave2[0]);
    const sync = params.sync[0] >= 0.5;
    const envOnBoth = params.envTarget[0] < 0.5;
    const FM_K = FM_INDEX / (2 * Math.PI);
    const inv = 1 / this.sampleRate;
    const table = Math.round(params.table[0]);
    const table1 = wave1 === TABLE_WAVE;
    const table2 = wave2 === TABLE_WAVE;
    // Only the saw and the pulse have jumps to smooth (jumps() would return straight away for the others).
    const edges1 = wave1 === 2 || wave1 === 3;
    const edges2 = wave2 === 2 || wave2 === 3;

    // The per-sample inputs, shared by every copy. Osc 2's offset and the FM amount can move during the
    // block (mod matrix). The pitches are only worked out again when their inputs change.
    const osc2Cents = params.osc2Detune;
    let osc2Mul = Math.pow(2, at(osc2Cents, from) / 1200);
    const env0 = at(params.pitchEnv, from);
    const freq0 = at(params.frequency, from) * Math.pow(2, (at(params.detune, from) + env0) / 1200);
    if (table1) this.reader1.setup(table, freq0 * (envOnBoth ? 1 : Math.pow(2, -env0 / 1200)));
    if (table2) this.reader2.setup(table, freq0 * osc2Mul);
    const { f1, f2, fmK, width, position } = this;
    let lastBase = NaN, lastCents = NaN, lastEnv = NaN, lastOsc2 = NaN;
    let pitch1 = 0, pitch2 = 0;
    for (let i = from; i < to; i++) {
      const base = at(params.frequency, i);
      const cents = at(params.detune, i);
      const env = at(params.pitchEnv, i);
      const osc2 = at(osc2Cents, i);
      if (base !== lastBase || cents !== lastCents || env !== lastEnv || osc2 !== lastOsc2) {
        if (osc2 !== lastOsc2) osc2Mul = Math.pow(2, osc2 / 1200);
        pitch1 = base * Math.pow(2, (cents + (envOnBoth ? env : 0)) / 1200);
        pitch2 = base * Math.pow(2, (cents + env) / 1200) * osc2Mul;
        lastBase = base;
        lastCents = cents;
        lastEnv = env;
        lastOsc2 = osc2;
      }
      f1[i] = pitch1;
      f2[i] = pitch2;
      fmK[i] = Math.min(2, Math.max(0, at(params.fm, i))) * FM_K;
      width[i] = clampWidth(at(params.width, i));
      position[i] = at(params.position, i);
    }

    const spread = params.spread[0];
    const spreadMul = this.spreadMul;
    for (let u = 0; u < n; u++) spreadMul[u] = Math.pow(2, (n === 1 ? 0 : (u / (n - 1) - 0.5) * 2 * spread) / 1200);
    out1.fill(0, from, to);
    out2.fill(0, from, to);
    if (side) {
      side.osc1.fill(0, from, to);
      side.osc2.fill(0, from, to);
    }
    const blep = this.blep;
    const { dt1, ph1, ph2, rd1, val1, val2, c1Prev, c1Cur, c2Prev, c2Cur } = this;

    for (let u = 0; u < n; u++) {
      const spreadU = spreadMul[u];

      // Osc 2's phases (with sync, it restarts from 0 at the moment Osc 1 starts a new cycle), and Osc 1's
      // phase before FM. The phases are kept as 32-bit floats between samples, as they always were.
      let p1 = this.p1[u];
      let p2 = this.p2[u];
      for (let i = from; i < to; i++) {
        const d1 = f1[i] * spreadU * inv;
        const d2 = f2[i] * spreadU * inv;
        const t1 = p1 + d1;
        const wrapped = t1 >= 1;
        blep.prev = blep.cur = 0;
        if (sync && wrapped && d1 > 0) {
          if (table2) this.reader2.moveTo(position[i]);
          p2 = this.syncReset(wave2, table2, width[i], p2, (1 - p1) / d1, d2, blep);
        } else {
          if (edges2 && crossesEdge(wave2, width[i], p2, d2)) edges(wave2, width[i], p2, d2, 0, 1, blep);
          p2 = frac(p2 + d2);
        }
        c2Prev[i] = blep.prev;
        c2Cur[i] = blep.cur;
        ph2[i] = p2;
        p2 = Math.fround(p2);
        p1 = Math.fround(wrapped ? t1 - 1 : t1);
        ph1[i] = p1;
        dt1[i] = d1;
      }
      this.p1[u] = p1;
      this.p2[u] = p2;

      // Osc 2's values.
      if (table2) this.reader2.readBlock(ph2, position, val2, from, to);
      else for (let i = from; i < to; i++) val2[i] = naive(wave2, ph2[i], width[i]);

      // Osc 1, read at a phase pushed back and forth by Osc 2 (FM; offset 0 when off).
      let r1 = this.read1[u];
      let q1 = this.pm1[u];
      for (let i = from; i < to; i++) {
        const pm = fmK[i] * val2[i];
        const read = wrapPhase(ph1[i] + pm);
        blep.prev = blep.cur = 0;
        const delta = dt1[i] + pm - q1;
        if (edges1 && crossesEdge(wave1, width[i], r1, delta)) edges(wave1, width[i], r1, delta, 0, 1, blep);
        c1Prev[i] = blep.prev;
        c1Cur[i] = blep.cur;
        rd1[i] = read;
        r1 = Math.fround(read);
        q1 = Math.fround(pm);
      }
      this.read1[u] = r1;
      this.pm1[u] = q1;
      if (table1) this.reader1.readBlock(rd1, position, val1, from, to);
      else for (let i = from; i < to; i++) val1[i] = naive(wave1, rd1[i], width[i]);

      // Add this copy, a sample late with its corrections; its stereo part is the same times its position.
      const k1 = this.positions[u];
      let pend1 = this.pending1[u];
      let pend2 = this.pending2[u];
      for (let i = from; i < to; i++) {
        pend1 += c1Prev[i];
        pend2 += c2Prev[i];
        out1[i] += pend1;
        out2[i] += pend2;
        if (side) {
          side.osc1[i] += pend1 * k1;
          side.osc2[i] -= pend2 * k1;
        }
        pend1 = c1Cur[i] + val1[i];
        pend2 = c2Cur[i] + val2[i];
      }
      this.pending1[u] = pend1;
      this.pending2[u] = pend2;
    }

    // Sub: a square one octave below Osc 1.
    const bs = this.subBlep;
    for (let i = from; i < to; i++) {
      const dts = (f1[i] * inv) / 2;
      if (crossesEdge(3, 0.5, this.sub, dts)) edges(3, 0.5, this.sub, dts, 0, 1, bs);
      this.sub = frac(this.sub + dts);
      outSub[i] = bs.prev;
      bs.prev = bs.cur + naive(3, this.sub, 0.5);
      bs.cur = 0;
    }
  }

  /**
   * Hard sync: Osc 1 wrapped `te` (0..1) of the way through this sample, so Osc 2 runs up to then,
   * jumps back to 0, and runs on from there. Returns Osc 2's new phase. Its corrections go into `b2`.
   */
  private syncReset(wave2: number, table2: boolean, width: number, p2: number, te: number, dt2: number, b2: Blep) {
    jumps(wave2, width, p2, dt2 * te, 0, te, b2);
    p2 = frac(p2 + dt2 * te);
    const reset = table2 ? this.reader2.read(0) - this.reader2.read(p2) : naive(wave2, 0, width) - naive(wave2, p2, width);
    b2.add(reset, 1 - te);
    jumps(wave2, width, 0, dt2 * (1 - te), te, 1 - te, b2);
    return frac(dt2 * (1 - te));
  }
}
