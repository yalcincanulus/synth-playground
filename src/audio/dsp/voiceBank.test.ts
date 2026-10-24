import { describe, expect, test } from "bun:test";
import { findClicks, findCuts } from "../../render/analyse";
import { defaultValues, type ParamValues } from "../params";
import { VoiceBank, type BankMessage } from "./voiceBank";

const SR = 48000;
const BLOCK = 128;

function bank(over: Partial<ParamValues> = {}) {
  return new VoiceBank(SR, { ...defaultValues(), ...over });
}

/** Render `seconds`; `messages` are posted up front (they carry their own times). */
function render(b: VoiceBank, messages: BankMessage[], seconds: number) {
  for (const m of messages) b.post(m);
  const n = Math.ceil((seconds * SR) / BLOCK) * BLOCK;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += BLOCK) b.render(out.subarray(i, i + BLOCK), i);
  return out;
}

const on = (id: number, t: number, note = 60, velocity = 100): Extract<BankMessage, { type: "on" }> => ({ type: "on", id, t, note, velocity, unison: 1, phases: [], seed: id });
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
      { type: "retrigger", id: 1, t: 0.72, velocity: 100 },
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
    // Two notes through a filter whose resonant peak is up to x16 (Q capped at 24 dB, as in the classic engine).
    expect(peak(x)).toBeLessThan(2 * 16);
  });
});
