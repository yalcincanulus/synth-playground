// Draw functions for the Synth view's live block visuals. Each returns a
// `(surface) => void` for the `surface` canvas action.

import { envelopeAt, type Adsr, type EnvPoint } from "../../audio/envelope";
import { Engine, LFO_FILTER_CENTS } from "../../audio/engine";
import { biquadMagnitude } from "../../audio/filterResponse";
import { naive, shapeAt as oscShapeAt } from "../../audio/oscCore";
import { frameAt, tableFrames } from "../../audio/wavetables";
import { DELAY_DIV_BEATS, DELAY_DIVS, LFO_SYNCS, toControl, type ParamValues } from "../../audio/params";
import { filterBase } from "../../audio/voice";
import { freqX, FREQ_GRID, grid, xFreq, type Surface } from "../components/canvas";

type Draw = (s: Surface) => void;
type Values = () => ParamValues;

const DIM = "#ffffff30";
const TEXT = "#dde5e7";
const LABEL_FONT = "10px ui-monospace, monospace";

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#ffffff90", align: CanvasTextAlign = "left") {
  g.font = LABEL_FONT;
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(text, x, y);
  g.textAlign = "left";
}

/** Two cycles of an ideal wave, x 0..1 -> -1..1. */
export function idealWave(wave: number, width = 0.5): (x: number) => number {
  return (x) => naive(wave, (x * 2) % 1, width);
}

/**
 * What Osc 1 or Osc 2 would produce, over two cycles of Osc 1: with pulse width,
 * sync (Osc 2 restarting with Osc 1) and FM (Osc 2 bending Osc 1) applied.
 */
export function oscIdeal(v: ParamValues, which: 0 | 1, engine: Engine): (x: number) => number {
  const frames = tableFrames(v.wtTable);
  const position = engine.livePosition();
  const shape = {
    wave1: v.osc1Wave, wave2: v.osc2Wave, width: v.pulseWidth, sync: v.oscSync === 1, fm: v.fmAmount,
    ratio: Math.pow(2, (v.osc2Semi * 100 + v.osc2Detune) / 1200),
    table: (p: number) => frameAt(frames, position, p),
  };
  return (x) => oscShapeAt(shape, x)[which];
}

// ---------------------------------------------------------------- live scope

const scopeBuf = new Float32Array(2048);

/**
 * Live waveform from an analyser tap. When nothing is playing, draws `ideal`
 * (if given) faintly instead, so a block always shows what it would produce.
 */
export function scope(analyser: () => AnalyserNode, color: () => string, ideal?: () => ((p: number) => number) | null, window = 768): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [], [h / 2]);
    const a = analyser();
    a.getFloatTimeDomainData(scopeBuf);
    let peak = 0;
    for (let i = 0; i < scopeBuf.length; i++) peak = Math.max(peak, Math.abs(scopeBuf[i]));

    if (peak < 0.0005) {
      const f = ideal?.();
      if (!f) return label(g, "silent", w / 2, h / 2 + 3, "#ffffff40", "center");
      g.strokeStyle = DIM;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = 0; x <= w; x++) {
        const y = h / 2 - f(x / w) * h * 0.38;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      return label(g, "play a note", w - 4, h - 4, "#ffffff40", "right");
    }

    let start = 0;
    for (let i = 1; i < scopeBuf.length - window; i++) {
      if (scopeBuf[i - 1] < 0 && scopeBuf[i] >= 0) {
        start = i;
        break;
      }
    }
    const gain = Math.min(8, 0.9 / peak);
    g.strokeStyle = color();
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < window; i++) {
      const x = (i / (window - 1)) * w;
      const y = h / 2 - scopeBuf[start + i] * gain * (h / 2) * 0.85;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
}

// ---------------------------------------------------------------- mixer

export function mixer(values: Values, color: () => string): Draw {
  return ({ g, w, h }) => {
    const v = values();
    const bars: [string, number][] = [["Osc 1", 1 - v.oscMix], ["Osc 2", v.oscMix], ["Sub", v.subLevel], ["Noise", v.noiseLevel]];
    const bw = w / bars.length;
    bars.forEach(([name, level], i) => {
      const x = i * bw + bw * 0.2;
      const top = 4;
      const bottom = h - 14;
      g.fillStyle = "#ffffff10";
      g.fillRect(x, top, bw * 0.6, bottom - top);
      g.fillStyle = color();
      const bh = (bottom - top) * level;
      g.fillRect(x, bottom - bh, bw * 0.6, bh);
      label(g, name, i * bw + bw / 2, h - 3, "#ffffff90", "center");
    });
  };
}

// ---------------------------------------------------------------- drive

export function drive(values: Values, color: () => string): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [w / 2], [h / 2]);
    const d = values().drive;
    // Same curve as the engine's waveshaper: tanh(kx) / tanh(k).
    const k = 1 + d * 12;
    g.setLineDash([3, 3]);
    g.strokeStyle = DIM;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(w, 0);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = color();
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * 2 - 1;
      const y = d < 0.01 ? x : Math.tanh(k * x) / Math.tanh(k);
      const px = ((x + 1) / 2) * w;
      const py = h - ((y + 1) / 2) * h;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    label(g, "in →", w - 4, h - 4, "#ffffff60", "right");
    label(g, "out", 4, 11, "#ffffff60");
  };
}

// ---------------------------------------------------------------- filter

/** Most recent voice that's still sounding, if any. */
function latestVoice(engine: Engine) {
  const now = engine.ctx.currentTime;
  const p = engine.params;
  const env = filterEnvShape(p);
  const voices = engine.voiceStates();
  for (let i = voices.length - 1; i >= 0; i--) {
    const v = voices[i];
    const point = envelopeAt(env, now, v.triggeredAt, v.releasedAt);
    if (point.stage !== "off") return { voice: v, point };
  }
  return null;
}

const filterEnvShape = (p: ParamValues): Adsr => ({
  attack: p.filterAttack,
  decay: p.filterDecay,
  sustain: p.filterSustain,
  release: p.filterRelease,
});

/** The cutoff the filter is actually at right now: knob + key tracking + envelope + LFO. */
export function liveCutoff(engine: Engine): number {
  const p = engine.params;
  const latest = latestVoice(engine);
  const note = latest?.voice.note ?? 60;
  let octaves = 0;
  if (latest) {
    const vel = latest.voice.velocity / 127;
    octaves += p.filterEnvAmt * (0.5 + 0.5 * (p.velocity > 0 ? vel : 1)) * latest.point.level;
  }
  engine.lfos.forEach((lfo, i) => (octaves += ((engine.lfoDepths(i)[1] * LFO_FILTER_CENTS) / 1200) * lfo.value()));
  return Math.min(20000, filterBase(p, note) * Math.pow(2, octaves));
}

const POINTS = 160;
const freqs = new Float32Array(POINTS);
const mag = new Float32Array(POINTS);

export function filter(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    const p = engine.params;
    const MIN_DB = -36;
    const MAX_DB = 30;
    for (let i = 0; i < POINTS; i++) freqs[i] = xFreq((i / (POINTS - 1)) * w, w);
    const zeroY = h - ((0 - MIN_DB) / (MAX_DB - MIN_DB)) * h;
    grid(g, w, h, FREQ_GRID.map((f) => freqX(f, w)), [zeroY]);

    const curve = (cutoff: number) => {
      biquadMagnitude(p.filterType, cutoff, p.resonance, engine.ctx.sampleRate, freqs, mag);
      g.beginPath();
      for (let i = 0; i < POINTS; i++) {
        const db = 20 * Math.log10(Math.max(mag[i], 1e-6));
        const y = h - ((Math.max(MIN_DB, Math.min(MAX_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * h;
        const x = (i / (POINTS - 1)) * w;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };

    // Where the knob sets it (dashed), and where it actually is right now (solid).
    const knob = filterBase(p, 60);
    curve(knob);
    g.setLineDash([4, 4]);
    g.strokeStyle = "#ffffff50";
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);

    const live = liveCutoff(engine);
    curve(live);
    g.strokeStyle = color();
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.globalAlpha = 0.15;
    g.fillStyle = color();
    g.fill();
    g.globalAlpha = 1;

    const x = freqX(live, w);
    g.strokeStyle = color();
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    const hz = live >= 1000 ? `${(live / 1000).toFixed(1)}k` : `${Math.round(live)}`;
    label(g, `now ${hz} Hz`, Math.min(x + 4, w - 70), 12, TEXT);
    label(g, "- - knob", 4, h - 4, "#ffffff60");
  };
}

// ---------------------------------------------------------------- envelopes

const seg = (id: "attack" | "decay" | "release" | "filterAttack" | "filterDecay" | "filterRelease", v: number) => 0.05 + 0.24 * toControl(id, v);
const SUSTAIN_W = 0.18;

/** Envelope shape plus a dot for every sounding note, showing where it is right now. */
export function envelope(engine: Engine, kind: "amp" | "filter", color: () => string): Draw {
  return ({ g, w, h }) => {
    const p = engine.params;
    const env: Adsr = kind === "amp"
      ? { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }
      : filterEnvShape(p);
    const aW = seg(kind === "amp" ? "attack" : "filterAttack", env.attack);
    const dW = seg(kind === "amp" ? "decay" : "filterDecay", env.decay);
    const rW = seg(kind === "amp" ? "release" : "filterRelease", env.release);
    const pad = 6;
    const W = w - pad * 2;
    const top = 14;
    const bottom = h - 6;
    const X = (f: number) => pad + f * W;
    const Y = (level: number) => bottom - level * (bottom - top);

    // Stage boundaries and names
    g.strokeStyle = "#ffffff12";
    g.beginPath();
    for (const f of [aW, aW + dW, aW + dW + SUSTAIN_W]) {
      g.moveTo(X(f), top);
      g.lineTo(X(f), bottom);
    }
    g.stroke();
    const names: [string, number, number][] = [["A", 0, aW], ["D", aW, dW], ["S", aW + dW, SUSTAIN_W], ["R", aW + dW + SUSTAIN_W, rW]];
    for (const [n, from, width] of names) label(g, n, X(from + width / 2), 10, "#ffffff60", "center");

    // The shape
    g.beginPath();
    g.moveTo(X(0), Y(0));
    g.lineTo(X(aW), Y(1));
    for (let i = 1; i <= 24; i++) g.lineTo(X(aW + (dW * i) / 24), Y(env.sustain + (1 - env.sustain) * Math.exp((-4 * i) / 24)));
    g.lineTo(X(aW + dW + SUSTAIN_W), Y(env.sustain));
    for (let i = 1; i <= 24; i++) g.lineTo(X(aW + dW + SUSTAIN_W + (rW * i) / 24), Y(env.sustain * Math.exp((-4 * i) / 24)));
    g.strokeStyle = color();
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.stroke();

    // Dots: one per sounding note
    const now = engine.ctx.currentTime;
    const xOf = (pt: EnvPoint) => {
      switch (pt.stage) {
        case "attack": return aW * Math.min(1, pt.elapsed / env.attack);
        case "decay": return aW + dW * Math.min(1, pt.elapsed / env.decay);
        case "sustain": return aW + dW + SUSTAIN_W * Math.min(1, pt.elapsed / 3);
        default: return aW + dW + SUSTAIN_W + rW * Math.min(1, pt.elapsed / env.release);
      }
    };
    for (const v of engine.voiceStates()) {
      const pt = envelopeAt(env, now, v.triggeredAt, v.releasedAt);
      if (pt.stage === "off") continue;
      g.fillStyle = "#fff";
      g.shadowColor = color();
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(X(xOf(pt)), Y(pt.level), 4, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
    if (kind === "filter" && Math.abs(p.filterEnvAmt) < 0.05) label(g, "Amount is 0: no effect", w / 2, h / 2, "#ffffff70", "center");
  };
}

// ---------------------------------------------------------------- pitch envelope

/** Pitch offset over time (starts at Amount, slides to 0), with a dot per sounding note. */
export function pitchEnvelope(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    const p = engine.params;
    const amt = p.pitchEnvAmt;
    const pad = 6;
    const mid = amt >= 0 ? h - 10 : 14;
    const far = amt >= 0 ? 14 : h - 10;
    // Show 1.5 decay times; the curve is close to 0 by one decay time.
    const span = p.pitchEnvDecay * 1.5;
    const X = (t: number) => pad + (t / span) * (w - pad * 2);
    const Y = (st: number) => (amt === 0 ? mid : mid + (st / amt) * (far - mid));
    const at = (t: number) => amt * Math.exp(-t / (p.pitchEnvDecay / 4));
    grid(g, w, h, [], [mid]);
    label(g, "note's pitch", w - 4, mid + (amt >= 0 ? -3 : 10), "#ffffff50", "right");
    if (Math.abs(amt) < 0.05) return label(g, "Amount is 0: no effect", w / 2, h / 2, "#ffffff70", "center");
    label(g, `${amt > 0 ? "+" : ""}${amt.toFixed(1)} st`, pad + 4, far + (amt >= 0 ? 8 : -2), "#ffffff90");

    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (span * i) / 48;
      if (i === 0) g.moveTo(X(t), Y(at(t)));
      else g.lineTo(X(t), Y(at(t)));
    }
    g.strokeStyle = color();
    g.lineWidth = 2;
    g.stroke();

    const now = engine.ctx.currentTime;
    for (const v of engine.voiceStates()) {
      const t = now - v.triggeredAt;
      if (t > span || v.releasedAt !== null) continue;
      g.fillStyle = "#fff";
      g.shadowColor = color();
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(X(t), Y(at(t)), 4, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
  };
}

// ---------------------------------------------------------------- LFO

export function lfo(engine: Engine, index: number, color: () => string): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [], [h / 2]);
    const unit = engine.lfos[index];
    const depth = Math.max(...engine.lfoDepths(index));
    const amp = (h / 2 - 10) * Math.max(0.15, depth);
    const Y = (v: number) => h / 2 - v * amp;
    g.strokeStyle = depth > 0 ? color() : DIM;
    g.lineWidth = 2;
    g.beginPath();
    let dotX: number;
    let dotY: number;
    if (unit.shape === "random") {
      // The last few held values as a staircase, scrolling left; the newest step is on the right.
      const now = engine.ctx.currentTime;
      const span = Math.min(30, 4 / unit.rate);
      const X = (t: number) => ((t - (now - span)) / span) * w;
      const steps = unit.history;
      let started = false;
      steps.forEach(([time, value], i) => {
        const next = steps[i + 1]?.[0] ?? now;
        if (next < now - span || time > now) return;
        const x0 = Math.max(0, X(time));
        const x1 = Math.min(w, X(Math.min(next, now)));
        if (!started) g.moveTo(x0, Y(value));
        else g.lineTo(x0, Y(value));
        g.lineTo(x1, Y(value));
        started = true;
      });
      dotX = w;
      dotY = Y(unit.value());
    } else {
      for (let x = 0; x <= w; x++) {
        // One cycle of the shape, drawn with a tiny offset so square/saw jumps are vertical lines.
        const phase = Math.min(0.9999, x / w);
        const y = Y(shapeAt(unit.shape, phase));
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      dotX = unit.phase() * w;
      dotY = Y(unit.value());
    }
    g.stroke();
    g.fillStyle = "#fff";
    g.shadowColor = color();
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    const p = engine.params;
    const sync = index === 0 ? p.lfoSync : p.lfo2Sync;
    const rate = unit.rate;
    label(g, `${rate.toFixed(rate < 1 ? 2 : 1)} Hz${sync ? ` · synced ${LFO_SYNCS[sync]}` : ""}`, 4, 11);
    if (depth === 0) label(g, "Depth is 0: no effect", w / 2, h - 5, "#ffffff70", "center");
  };
}

function shapeAt(shape: string, p: number) {
  switch (shape) {
    case "sine": return Math.sin(2 * Math.PI * p);
    case "triangle": return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    case "saw": return p < 0.5 ? 2 * p : 2 * p - 2;
    default: return p < 0.5 ? 1 : -1;
  }
}

// ---------------------------------------------------------------- effects

export function chorus(engine: Engine, color: () => string): Draw {
  return ({ g, w, h }) => {
    grid(g, w, h, [], [h / 2]);
    const amount = engine.params.chorus;
    const t = engine.ctx.currentTime;
    // The two delay lines' sweeps (0.31 Hz and 0.43 Hz), over the last 6 seconds.
    for (const [rate, alpha] of [[0.31, 1], [0.43, 0.6]] as const) {
      g.strokeStyle = amount > 0 ? color() : DIM;
      g.globalAlpha = alpha;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = 0; x <= w; x++) {
        const time = t - 6 + (x / w) * 6;
        const y = h / 2 - Math.sin(2 * Math.PI * rate * time) * (h / 2 - 6) * Math.max(0.1, amount);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  };
}

export function delay(values: Values, bpm: () => number, color: () => string): Draw {
  return ({ g, w, h }) => {
    const v = values();
    const seconds = (60 / bpm()) * DELAY_DIV_BEATS[v.delayDiv];
    const span = 3;
    const X = (t: number) => 4 + (t / span) * (w - 8);
    const bottom = h - 12;
    const bar = (t: number, level: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(X(t) - 1.5, bottom - level * (bottom - 6), 3, level * (bottom - 6));
    };
    bar(0, 1, "#ffffff50"); // the original note
    let level = v.delayMix * 0.7;
    for (let k = 1; X(k * seconds) < w && level > 0.01; k++) {
      bar(k * seconds, level, color());
      level *= v.delayFeedback;
    }
    label(g, `${DELAY_DIVS[v.delayDiv]} = ${Math.round(seconds * 1000)} ms`, 4, h - 2);
  };
}

export function reverb(values: Values, color: () => string): Draw {
  return ({ g, w, h }) => {
    const v = values();
    const span = 8;
    const len = (v.reverbSize / span) * (w - 8);
    const bottom = h - 12;
    g.beginPath();
    g.moveTo(4, bottom);
    for (let i = 0; i <= 50; i++) {
      const f = i / 50;
      g.lineTo(4 + f * len, bottom - Math.pow(1 - f, 3) * (bottom - 6) * Math.max(0.08, v.reverbMix));
    }
    g.lineTo(4 + len, bottom);
    g.closePath();
    g.globalAlpha = 0.35;
    g.fillStyle = color();
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color();
    g.stroke();
    label(g, `tail ≈ ${v.reverbSize.toFixed(1)} s`, 4, h - 2);
  };
}

const meterBuf = new Float32Array(2048);
let meterPeak = 0;

export function output(analyser: () => AnalyserNode, color: () => string): Draw {
  return ({ g, w, h }) => {
    analyser().getFloatTimeDomainData(meterBuf);
    let sum = 0;
    let peak = 0;
    for (const x of meterBuf) {
      sum += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
    const rmsDb = 20 * Math.log10(Math.sqrt(sum / meterBuf.length) + 1e-9);
    meterPeak = Math.max(peak, meterPeak * 0.97);
    const peakDb = 20 * Math.log10(meterPeak + 1e-9);
    const X = (db: number) => Math.max(0, Math.min(1, (db + 60) / 60)) * w;
    g.fillStyle = "#ffffff10";
    g.fillRect(0, h / 2 - 8, w, 16);
    g.fillStyle = color();
    g.fillRect(0, h / 2 - 8, X(rmsDb), 16);
    g.fillStyle = peakDb > -1 ? "#ff6b6b" : "#fff";
    g.fillRect(X(peakDb) - 1, h / 2 - 10, 2, 20);
    for (const db of [-48, -24, -12, -6, 0]) label(g, `${db}`, X(db), h - 2, "#ffffff50", "center");
    label(g, `${rmsDb < -90 ? "-∞" : rmsDb.toFixed(0)} dB`, 2, 10, TEXT);
  };
}

// ---------------------------------------------------------------- playing

export function playing(engine: Engine, bend: () => number, mod: () => number, color: () => string): Draw {
  return ({ g, w, h }) => {
    const voices = engine.voiceStates().filter((v) => v.releasedAt === null);
    const lastVel = voices.length ? voices[voices.length - 1].velocity / 127 : 0;
    const rows: [string, number, boolean][] = [["Bend", bend(), true], ["Mod", mod(), false], ["Velocity", lastVel, false]];
    const rh = h / rows.length;
    rows.forEach(([name, value, centered], i) => {
      const y = i * rh + rh / 2;
      const x0 = 62;
      const bw = w - x0 - 4;
      label(g, name, 2, y + 3, "#ffffff90");
      g.fillStyle = "#ffffff10";
      g.fillRect(x0, y - 4, bw, 8);
      g.fillStyle = color();
      if (centered) {
        const mid = x0 + bw / 2;
        g.fillRect(Math.min(mid, mid + value * (bw / 2)), y - 4, Math.abs(value) * (bw / 2), 8);
        g.fillStyle = "#ffffff40";
        g.fillRect(mid - 0.5, y - 6, 1, 12);
      } else g.fillRect(x0, y - 4, value * bw, 8);
    });
    label(g, `${voices.length} note${voices.length === 1 ? "" : "s"} held`, w - 2, 9, "#ffffff70", "right");
  };
}
