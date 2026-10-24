import { describe, expect, test } from "bun:test";
import { findClicks, findCuts } from "../../render/analyse";
import { defaultValues, LFO_WAVES, MOD_DESTS, MOD_SOURCES, slotIds, type ParamValues } from "../params";
import { TAPS, VoiceBank, type BankMessage } from "./voiceBank";

const SR = 48000;
const BLOCK = 128;

function bank(over: Partial<ParamValues> = {}) {
  return new VoiceBank(SR, { ...defaultValues(), ...over });
}

/** Render `seconds` in stereo; `messages` are posted up front (they carry their own times). */
function renderStereo(b: VoiceBank, messages: BankMessage[], seconds: number, taps?: Float32Array[]) {
  for (const m of messages) b.post(m);
  const n = Math.ceil((seconds * SR) / BLOCK) * BLOCK;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i += BLOCK) b.render(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK), i, taps?.map((t) => t.subarray(i, i + BLOCK)) ?? null);
  return { left, right, mid: left.map((l, i) => (l + right[i]) / 2), side: left.map((l, i) => (right[i] - l) / 2) };
}

/** The sound in mono, (left + right) / 2. */
const render = (b: VoiceBank, messages: BankMessage[], seconds: number, taps?: Float32Array[]) => renderStereo(b, messages, seconds, taps).mid;

/** Route n (1..8) as parameter values. */
const route = (n: number, source: (typeof MOD_SOURCES)[number], dest: (typeof MOD_DESTS)[number], amount: number): Partial<ParamValues> => {
  const ids = slotIds(n);
  return { [ids.src]: MOD_SOURCES.indexOf(source), [ids.dst]: MOD_DESTS.indexOf(dest), [ids.amt]: amount };
};

const rms = (x: Float32Array, from = 0, to = x.length) => Math.sqrt(x.subarray(from, to).reduce((a, b) => a + b * b, 0) / (to - from));

/** Rising zero crossings per second. */
function pitchOf(x: Float32Array, from: number, to: number) {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return crossings / ((to - from) / SR);
}

/** A plain sine through an open filter, for measuring pitch and level. */
const SINE: Partial<ParamValues> = { osc1Wave: 0, oscMix: 0, filterEnvAmt: 0, cutoff: 18000, sustain: 1, velocity: 0, attack: 0.001 };

const on = (id: number, t: number, note = 60, velocity = 100): Extract<BankMessage, { type: "on" }> => ({ type: "on", id, t, note, velocity, random: 0, unison: 1, phases: [], seed: id });
const peak = (x: Float32Array, from = 0, to = x.length) => x.subarray(from, to).reduce((a, b) => Math.max(a, Math.abs(b)), 0);
const frame = (t: number) => Math.round(t * SR);

describe("VoiceBank", () => {
  test("a note starts on its exact sample", () => {
    const x = render(bank(), [on(1, 0.0101)], 0.05);
    const start = frame(0.0101);
    expect(peak(x, 0, start)).toBe(0);
    expect(peak(x, start, start + frame(0.01))).toBeGreaterThan(0.01);
  });

  test("released and stopped, a note falls silent and the voice is gone", () => {
    const b = bank({ release: 0.1 });
    const x = render(b, [on(1, 0), { type: "release", id: 1, t: 0.2 }, { type: "stop", id: 1, t: 0.2 + 0.1 * 1.8 + 0.05 }], 0.6);
    expect(peak(x, 0, frame(0.2))).toBeGreaterThan(0.05);
    expect(peak(x, frame(0.45))).toBe(0);
    expect(b.voiceCount).toBe(0);
    expect(findCuts(x, SR)).toEqual([]);
  });

  test("the amp envelope's attack takes its time", () => {
    const x = render(bank({ attack: 0.1, decay: 1, sustain: 1, filterEnvAmt: 0, osc1Wave: 0, oscMix: 0 }), [on(1, 0)], 0.3);
    const early = peak(x, frame(0.01), frame(0.02));
    const full = peak(x, frame(0.15), frame(0.25));
    expect(early).toBeLessThan(full * 0.3);
    expect(full).toBeGreaterThan(0.05);
  });

  test("a stolen voice fades out quickly without a cut", () => {
    const b = bank({ release: 4, reverbMix: 0 });
    const x = render(b, [on(1, 0), { type: "kill", id: 1, t: 0.2 }], 0.4);
    expect(peak(x, frame(0.26))).toBeLessThan(0.001);
    expect(b.voiceCount).toBe(0);
    expect(findCuts(x, SR)).toEqual([]);
  });

  test("mono: gliding and retriggering a voice doesn't click", () => {
    const b = bank({ glide: 0.1, attack: 0.002, release: 0.05 });
    const msgs: BankMessage[] = [
      on(1, 0.1, 48),
      { type: "glide", id: 1, t: 0.4, note: 55, tc: 0.1 / 3 },
      { type: "release", id: 1, t: 0.7 },
      { type: "glide", id: 1, t: 0.72, note: 60, tc: 0.001 },
      { type: "retrigger", id: 1, t: 0.72, velocity: 100, random: 0 },
    ];
    const x = render(b, msgs, 1);
    const phrase = [
      { note: 48, on: 0.1, off: 0.4 },
      { note: 55, on: 0.4, off: 0.7 },
      { note: 60, on: 0.72, off: 1 },
    ];
    expect(findClicks(x, SR, phrase)).toEqual([]);
  });

  test("a glide moves the pitch to the new note", () => {
    const b = bank({ osc1Wave: 0, oscMix: 0, filterEnvAmt: 0, cutoff: 18000, sustain: 1 });
    const x = render(b, [on(1, 0, 57), { type: "glide", id: 1, t: 0.1, note: 69, tc: 0.01 }], 0.6);
    // Rising zero crossings per second, well after the glide: 440 Hz.
    const tail = x.subarray(frame(0.3), frame(0.6));
    let crossings = 0;
    for (let i = 1; i < tail.length; i++) if (tail[i - 1] < 0 && tail[i] >= 0) crossings++;
    expect(Math.abs(crossings / 0.3 - 440)).toBeLessThan(5);
  });

  test("every preset-style extreme stays finite", () => {
    const b = bank({ drive: 1, resonance: 20, cutoff: 30, filterEnvAmt: 6, noiseLevel: 1, subLevel: 1, fmAmount: 1, pitchEnvAmt: 48, unison: 3 });
    const x = render(b, [{ ...on(1, 0), unison: 3, phases: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] }, on(2, 0.05, 96)], 0.5);
    expect(x.every(Number.isFinite)).toBe(true);
    // Two notes through a filter whose resonant peak is up to x16 (Q capped at 24 dB, as in the old Web Audio engine).
    expect(peak(x)).toBeLessThan(2 * 16);
  });
});

describe("VoiceBank mod matrix", () => {
  test("mod envelope -> pitch bends each note and settles", () => {
    const b = bank({ ...SINE, ...route(1, "mod env", "pitch", 0.5), modEnvAttack: 0.001, modEnvDecay: 0.2, modEnvSustain: 0 });
    const x = render(b, [on(1, 0, 57)], 1);
    // +50% of ±2 octaves: one octave up at the start, back to 220 Hz once the envelope has decayed.
    expect(pitchOf(x, frame(0.005), frame(0.02))).toBeGreaterThan(330);
    expect(Math.abs(pitchOf(x, frame(0.6), frame(1)) - 220)).toBeLessThan(5);
  });

  test("velocity -> cutoff: harder notes are brighter", () => {
    const p = { osc1Wave: 2, oscMix: 0, cutoff: 150, filterEnvAmt: 0, keyTrack: 0, velocity: 0, sustain: 1, ...route(1, "velocity", "cutoff", 0.75) };
    const soft = render(bank(p), [on(1, 0, 48, 10)], 0.3);
    const hard = render(bank(p), [on(1, 0, 48, 127)], 0.3);
    // Brightness: the level of the sample-to-sample change, which the high harmonics dominate.
    const bright = (x: Float32Array) => rms(x.subarray(frame(0.1)).map((v, i, a) => (i ? v - a[i - 1] : 0)));
    expect(bright(hard)).toBeGreaterThan(bright(soft) * 2);
  });

  test("a new note starts at its route amounts, not gliding in from 0", () => {
    // Velocity -> volume -100% at full velocity silences the note from its first sample.
    const x = render(bank({ ...SINE, ...route(1, "velocity", "volume", -1) }), [on(1, 0, 60, 127)], 0.05);
    expect(peak(x)).toBeLessThan(1e-6);
  });

  test("random -> osc 2 pitch and key -> cutoff stay finite in every destination", () => {
    const routes = MOD_DESTS.map((dest, i) => route((i % 8) + 1, MOD_SOURCES[1 + (i % 10)], dest, 1));
    for (const r of routes) {
      const x = render(bank({ resonance: 20, ...r }), [{ ...on(1, 0, 30), random: 1 }, on(2, 0, 100)], 0.3);
      expect(x.every(Number.isFinite)).toBe(true);
    }
  });

  test("a route added while a note sounds glides in", () => {
    const b = bank({ ...SINE });
    b.post(on(1, 0));
    const out = new Float32Array(BLOCK);
    const right = new Float32Array(BLOCK);
    for (let i = 0; i < 0.1 * SR; i += BLOCK) b.render(out, right, i);
    b.post({ type: "params", values: { ...defaultValues(), ...SINE, ...route(1, "velocity", "volume", -1) } });
    b.render(out, right, frame(0.1));
    // About 128 samples into a 10 ms glide toward silence: quieter, but not silent yet.
    expect(peak(out)).toBeGreaterThan(0.05);
  });
});

describe("VoiceBank LFOs and controls", () => {
  test("LFO -> pitch vibrato moves the pitch up and down", () => {
    const b = bank({ ...SINE, lfoTarget: 0, lfoWave: 0, lfoRate: 2, lfoDepth: 1 });
    const x = render(b, [on(1, 0, 69)], 0.5);
    // ±60 cents at 2 Hz: a quarter cycle in (0.1-0.15 s) sharp, three quarters in (0.35-0.4 s) flat.
    expect(pitchOf(x, frame(0.1), frame(0.15))).toBeGreaterThan(450);
    expect(pitchOf(x, frame(0.35), frame(0.4))).toBeLessThan(430);
  });

  test("LFO -> amp is a tremolo that never goes above full volume", () => {
    const plain = render(bank(SINE), [on(1, 0)], 1);
    const trem = render(bank({ ...SINE, lfoTarget: 2, lfoWave: 0, lfoRate: 4, lfoDepth: 1 }), [on(1, 0)], 1);
    const levels = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => rms(trem, frame(0.5 + k * 0.03), frame(0.5 + k * 0.03 + 0.01)));
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(5);
    expect(peak(trem)).toBeLessThanOrEqual(peak(plain) * 1.001);
  });

  test("pitch bend moves every note", () => {
    const b = bank(SINE);
    b.post({ type: "controls", bend: 1200, mod: 0 });
    const x = render(b, [on(1, 0, 57)], 0.5);
    expect(Math.abs(pitchOf(x, frame(0.2), frame(0.5)) - 440)).toBeLessThan(5);
  });

  test("the mod strip adds LFO 1 depth to its mod target", () => {
    const p = { ...SINE, lfoTarget: 1, lfoDepth: 0, lfoWave: 0, lfoRate: 4, modTarget: 2 };
    const still = render(bank(p), [on(1, 0)], 1);
    const b = bank(p);
    b.post({ type: "controls", bend: 0, mod: 1 });
    const moving = render(b, [on(1, 0)], 1);
    const swing = (x: Float32Array) => {
      const levels = [0, 1, 2, 3, 4, 5].map((k) => rms(x, frame(0.5 + k * 0.04), frame(0.5 + k * 0.04 + 0.01)));
      return Math.max(...levels) / Math.min(...levels);
    };
    expect(swing(still)).toBeLessThan(1.05);
    expect(swing(moving)).toBeGreaterThan(5);
  });

  test("the random LFO repeats with the same seed and reports its steps", () => {
    const p = { ...SINE, lfoTarget: 0, lfoWave: LFO_WAVES.indexOf("random"), lfoRate: 10, lfoDepth: 1 };
    const a = new VoiceBank(SR, { ...defaultValues(), ...p }, new Map(), 7);
    const b = new VoiceBank(SR, { ...defaultValues(), ...p }, new Map(), 7);
    const c = new VoiceBank(SR, { ...defaultValues(), ...p }, new Map(), 8);
    const [xa, xb, xc] = [a, b, c].map((k) => render(k, [on(1, 0)], 0.45));
    expect(xa).toEqual(xb);
    expect(xa).not.toEqual(xc);
    const { steps, phase, rate } = a.lfoState();
    expect(steps.length).toBe(4); // a new value at 0.1, 0.2, 0.3 and 0.4 s
    expect(steps[0][0]).toBe(0);
    expect(Math.abs(steps[0][1] - frame(0.1))).toBeLessThan(2);
    expect(rate[0]).toBeCloseTo(10);
    expect(phase[0]).toBeGreaterThanOrEqual(0);
    expect(a.lfoState().steps).toEqual([]);
  });
});

describe("VoiceBank taps", () => {
  test("each stage has its own output", () => {
    const n = Math.ceil((0.2 * SR) / BLOCK) * BLOCK;
    const taps = TAPS.map(() => new Float32Array(n));
    const x = render(bank({ osc1Wave: 2, osc2Wave: 3, subLevel: 0, noiseLevel: 0 }), [on(1, 0)], 0.2, taps);
    const tap = Object.fromEntries(TAPS.map((name, i) => [name, taps[i]]));
    for (const name of ["osc1", "osc2", "sub", "noise", "mix", "filter"]) expect(peak(tap[name])).toBeGreaterThan(0.1);
    // Raw sources are before their level: the sub and noise are there even when mixed out.
    expect(peak(tap.sub)).toBeGreaterThan(0.9);
    // No drive: the drive stage passes the mix through.
    expect(tap.drive).toEqual(tap.mix);
    expect(peak(x)).toBeGreaterThan(0.05);
  });
});

describe("VoiceBank stereo", () => {
  const PAD: Partial<ParamValues> = { osc1Wave: 2, osc2Wave: 2, unison: 3, sustain: 1, cutoff: 3000, filterEnvAmt: 0 };
  const unisonOn = () => [{ ...on(1, 0, 48), unison: 3, phases: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] }] as BankMessage[];

  test("unison copies spread left and right with Stereo Width", () => {
    const wide = renderStereo(bank({ ...PAD, stereoWidth: 1 }), unisonOn(), 0.5);
    const narrow = renderStereo(bank({ ...PAD, stereoWidth: 0 }), unisonOn(), 0.5);
    expect(rms(wide.side, frame(0.1))).toBeGreaterThan(rms(wide.mid, frame(0.1)) * 0.2);
    expect(peak(narrow.side)).toBe(0);
  });

  test("in mono it sounds the same at any width", () => {
    const wide = renderStereo(bank({ ...PAD, stereoWidth: 1 }), unisonOn(), 0.5).mid;
    const narrow = renderStereo(bank({ ...PAD, stereoWidth: 0 }), unisonOn(), 0.5).mid;
    for (let i = 0; i < wide.length; i++) expect(Math.abs(wide[i] - narrow[i])).toBeLessThan(1e-5);
  });

  test("a voice without unison copies stays in the middle", () => {
    const x = renderStereo(bank({ stereoWidth: 1 }), [on(1, 0)], 0.2);
    expect(peak(x.side)).toBe(0);
  });

  test("random -> pan places each note, and keeps the mono sound", () => {
    const p = { ...SINE, ...route(1, "random", "pan", 1) };
    const right = renderStereo(bank(p), [{ ...on(1, 0), random: 1 }], 0.2);
    const centre = renderStereo(bank(p), [{ ...on(1, 0), random: 0 }], 0.2);
    expect(peak(right.left)).toBeLessThan(1e-6);
    expect(peak(right.right)).toBeGreaterThan(0.1);
    for (let i = 0; i < right.mid.length; i++) expect(Math.abs(right.mid[i] - centre.mid[i])).toBeLessThan(1e-6);
  });
});
