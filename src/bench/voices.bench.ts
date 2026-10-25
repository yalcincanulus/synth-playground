// Voice processor benchmark: how much of the audio thread's time each kind of sound takes.
//
//   bun run bench                 every scenario
//   bun run bench "Scan Pad"      only scenarios whose name contains the text
//
// Each scenario holds 8 notes of a factory preset for a few seconds of audio, rendered block by block
// exactly as the worklet does (with or without the Synth view's stage taps), and reports the time per
// block as a share of the real-time budget (128 samples at 48 kHz = 2.67 ms). The numbers are for this
// computer; compare runs, not absolute values. Run it before and after a speed change.

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

interface Scenario {
  name: string;
  values: ParamValues;
  taps: boolean;
}

function presetScenario(name: string, taps: boolean, over: Partial<ParamValues> = {}): Scenario {
  const p = FACTORY_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return { name: `${name}${taps ? " + taps" : ""}`, values: { ...presetValues(p), ...over }, taps };
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
];

function tablesFor(v: ParamValues): Map<number, Table> {
  const tables = new Map<number, Table>();
  const frames = tableFrames(v.wtTable);
  tables.set(v.wtTable, { frames: frames.length, levels: buildMips(frames) });
  return tables;
}

function run(s: Scenario) {
  const bank = new VoiceBank(SR, s.values, tablesFor(s.values));
  const unison = s.values.unison;
  NOTES.forEach((note, i) => {
    const msg: BankMessage = {
      type: "on", id: i + 1, t: 0, note, velocity: 100, random: 0, unison,
      phases: Array.from({ length: unison * 2 }, (_, k) => ((i * 7 + k * 3) % 10) / 10), seed: i + 1,
    };
    bank.post(msg);
  });
  const left = new Float32Array(BLOCK);
  const right = new Float32Array(BLOCK);
  const taps = s.taps ? TAPS.map(() => new Float32Array(BLOCK)) : null;
  const fx = [0, 1, 2].map(() => new Float32Array(BLOCK));
  const blocks = Math.round((SECONDS * SR) / BLOCK);
  // Warm up (the JIT), then measure.
  for (let b = 0; b < 200; b++) bank.render(left, right, b * BLOCK, taps, fx);
  const times: number[] = [];
  for (let b = 200; b < 200 + blocks; b++) {
    const t0 = performance.now();
    bank.render(left, right, b * BLOCK, taps, fx);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { mean, p99: times[Math.floor(times.length * 0.99)], units: bank.units };
}

const filter = process.argv[2]?.toLowerCase();
console.log(`8 notes, ${SECONDS} s each. Share of the real-time budget (${BUDGET_MS.toFixed(2)} ms per block):\n`);
console.log("scenario".padEnd(22), "mean".padStart(7), "p99".padStart(7), "  units");
for (const s of SCENARIOS) {
  if (filter && !s.name.toLowerCase().includes(filter)) continue;
  const r = run(s);
  const pct = (ms: number) => `${((ms / BUDGET_MS) * 100).toFixed(1)}%`.padStart(7);
  console.log(s.name.padEnd(22), pct(r.mean), pct(r.p99), `  ${r.units}`);
}
