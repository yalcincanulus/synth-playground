// Voice processor benchmark: how much of the audio thread's time each kind of sound takes.
//
//   bun run bench                 every scenario
//   bun run bench "Scan Pad"      only scenarios whose name contains the text
//
// Each scenario holds 8 notes of a factory preset for a few seconds of audio, rendered block by block
// exactly as the worklet does (with or without the Synth view's stage taps), and reports the time per
// block as a share of the real-time budget (128 samples at 48 kHz = 2.67 ms). The song scenarios hold
// notes on several parts at once (one voice processor each), as a song with its tracks and the Play
// view's toys does. The numbers are for this computer; compare runs, not absolute values. Run it before
// and after a speed change.

import { FACTORY_PRESETS, presetValues } from "../presets/presets";
import { buildMips, tableFrames } from "../audio/wavetables";
import { TAPS, VoiceBank, type BankMessage } from "../audio/dsp/voiceBank";
import type { Table } from "../audio/dsp/oscillator";
import type { ParamValues } from "../audio/params";

const SR = 48000;
const BLOCK = 128;
const BUDGET_MS = (BLOCK / SR) * 1000;
const SECONDS = 4;
const NOTES = [48, 52, 55, 59, 60, 64, 67, 71];

/** One part in a scenario: its sound and the notes it holds. */
interface Layer {
  values: ParamValues;
  notes: number[];
}

interface Scenario {
  name: string;
  layers: Layer[];
  taps: boolean;
}

function values(name: string, over: Partial<ParamValues> = {}): ParamValues {
  const p = FACTORY_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return { ...presetValues(p), ...over };
}

function presetScenario(name: string, taps: boolean, over: Partial<ParamValues> = {}): Scenario {
  return { name: `${name}${taps ? " + taps" : ""}`, layers: [{ values: values(name, over), notes: NOTES }], taps };
}

/** Several parts at once: `[preset, notes held]` each. A mono preset holds one note whatever it is given. */
function songScenario(name: string, parts: [string, number][]): Scenario {
  const layers = parts.map(([preset, n]) => {
    const v = values(preset);
    return { values: v, notes: NOTES.slice(0, v.mono ? 1 : n) };
  });
  return { name, layers, taps: false };
}

const SCENARIOS: Scenario[] = [
  presetScenario("First Saw", false),
  presetScenario("First Saw", true),
  presetScenario("PWM Strings", false),
  presetScenario("Acid Line", false, { mono: 0 }),
  presetScenario("FM Bell", false),
  presetScenario("Reese Bass", false, { mono: 0 }),
  presetScenario("Scan Pad", false),
  presetScenario("Scan Pad", true),
  // A song: 4 tracks (bass, pad, lead, keys) with the Play view's two parts playing over it.
  songScenario("Song, 6 parts", [["Round Bass", 1], ["Warm Pad", 4], ["Sync Lead", 1], ["E-Piano", 4], ["Juno Pad", 4], ["Acid 303", 1]]),
  // The same, heavy: wide pads and a supersaw everywhere they fit.
  songScenario("Song, 6 heavy parts", [["Reese Bass", 1], ["Scan Pad", 4], ["Trance Supersaw", 4], ["PWM Strings", 4], ["Scan Pad", 4], ["Hoover", 1]]),
];

function tablesFor(v: ParamValues): Map<number, Table> {
  const tables = new Map<number, Table>();
  const frames = tableFrames(v.wtTable);
  tables.set(v.wtTable, { frames: frames.length, levels: buildMips(frames) });
  return tables;
}

function bankFor(layer: Layer) {
  const bank = new VoiceBank(SR, layer.values, tablesFor(layer.values));
  const unison = layer.values.unison;
  layer.notes.forEach((note, i) => {
    const msg: BankMessage = {
      type: "on", id: i + 1, t: 0, note, velocity: 100, random: 0, unison,
      phases: Array.from({ length: unison * 2 }, (_, k) => ((i * 7 + k * 3) % 10) / 10), seed: i + 1,
    };
    bank.post(msg);
  });
  return bank;
}

function run(s: Scenario) {
  const banks = s.layers.map(bankFor);
  const left = new Float32Array(BLOCK);
  const right = new Float32Array(BLOCK);
  const taps = s.taps ? TAPS.map(() => new Float32Array(BLOCK)) : null;
  const fx = [0, 1, 2].map(() => new Float32Array(BLOCK));
  const blocks = Math.round((SECONDS * SR) / BLOCK);
  // Warm up (the JIT), then measure.
  for (let b = 0; b < 200; b++) for (const bank of banks) bank.render(left, right, b * BLOCK, taps, fx);
  const times: number[] = [];
  for (let b = 200; b < 200 + blocks; b++) {
    const t0 = performance.now();
    for (const bank of banks) bank.render(left, right, b * BLOCK, taps, fx);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { mean, p99: times[Math.floor(times.length * 0.99)], units: banks.reduce((sum, bank) => sum + bank.units, 0) };
}

const filter = process.argv[2]?.toLowerCase();
console.log(`8 notes (songs: the notes given per part), ${SECONDS} s each. Share of the real-time budget (${BUDGET_MS.toFixed(2)} ms per block):\n`);
console.log("scenario".padEnd(22), "mean".padStart(7), "p99".padStart(7), "  units");
for (const s of SCENARIOS) {
  if (filter && !s.name.toLowerCase().includes(filter)) continue;
  const r = run(s);
  const pct = (ms: number) => `${((ms / BUDGET_MS) * 100).toFixed(1)}%`.padStart(7);
  console.log(s.name.padEnd(22), pct(r.mean), pct(r.p99), `  ${r.units}`);
}
