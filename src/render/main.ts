// Render check page (render.html): renders every factory preset offline and checks the results.
// See analyse.ts for what is measured.

import { hasRoutes } from "../audio/dsp/voiceBank";
import { Engine, type EngineKind } from "../audio/engine";
import { FACTORY_PRESETS, presetValues, type Preset } from "../presets/presets";
import { analyse, compare, levelOutliers, PHRASE, RENDER_RATE, RENDER_SECONDS, type Analysis, type IssueKind } from "./analyse";

const SAMPLE_RATE = RENDER_RATE;
const REFERENCE_URL = "/__render-reference";
/** Above these differences from the reference, a cell is highlighted. */
const WARN_DB = 1.5;
const BAD_DB = 4;
const MINOR: IssueKind[] = ["loud", "quiet"];

interface Reference {
  engine: string;
  savedAt: string;
  sampleRate: number;
  results: Record<string, Analysis>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const runButton = $<HTMLButtonElement>("run");
const engineSelect = $<HTMLSelectElement>("engine");
const saveButton = $<HTMLButtonElement>("save");
const status = $("status");
const rows = $("rows");

const results = new Map<string, Analysis>();
const buffers = new Map<string, AudioBuffer>();
let reference: Reference | null = null;
let listenCtx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

/** A small seeded random generator (mulberry32), so every render of a preset is the same. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Render one preset. Math.random is seeded while the engine is built and the notes are scheduled
 * (noise, reverb, unison phases, the random source), so renders are repeatable and two engines can be
 * compared. Not covered: the random LFO wave, whose steps are scheduled by a timer during playback.
 */
async function renderPreset(preset: Preset): Promise<AudioBuffer> {
  const random = Math.random;
  Math.random = seeded(1);
  try {
    return await renderSeeded(preset);
  } finally {
    Math.random = random;
  }
}

async function renderSeeded(preset: Preset): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * RENDER_SECONDS, SAMPLE_RATE);
  // The engine is written for a live AudioContext; offline it only lacks resume(), which isn't called here.
  const engine = new Engine(ctx as unknown as AudioContext);
  await engine.ready;
  engine.setKind(engineSelect.value as EngineKind);
  engine.setParams(presetValues(preset));
  engine.fx.settle();
  engine.loadAllTables();
  // Let the wavetables reach the audio thread before rendering starts.
  await new Promise((r) => setTimeout(r, 20));
  await engine.flush();
  // Play the phrase as if live: the render pauses at each note time and the keys are pressed then
  // (scheduling everything ahead would build the classic engine's notes early, starting their waves at
  // random points). Calls come in time order: mono presets track which keys are held.
  const events = PHRASE.flatMap((p) => [
    { time: p.on, on: true, note: p.note },
    { time: p.off, on: false, note: p.note },
  ]).sort((a, b) => a.time - b.time || Number(a.on) - Number(b.on));
  for (const time of new Set(events.map((e) => e.time))) {
    ctx.suspend(time).then(async () => {
      for (const e of events.filter((x) => x.time === time)) {
        if (e.on) engine.noteOn(e.note, 100, time);
        else engine.noteOff(e.note, time);
      }
      // The new engine's notes are messages to the audio thread: let them arrive before going on.
      await engine.flush();
      ctx.resume();
    });
  }
  return ctx.startRendering();
}

async function loadReference() {
  const res = await fetch(REFERENCE_URL).catch(() => null);
  reference = res?.ok ? await res.json() : null;
  $("reference").textContent = reference
    ? `Reference: ${reference.engine} engine, saved ${new Date(reference.savedAt).toLocaleString()}, ${Object.keys(reference.results).length} presets.`
    : "No reference saved yet: render, then press Save as reference.";
}

async function runAll() {
  runButton.disabled = saveButton.disabled = true;
  results.clear();
  buffers.clear();
  const started = performance.now();
  for (const [i, preset] of FACTORY_PRESETS.entries()) {
    status.textContent = `Rendering ${i + 1}/${FACTORY_PRESETS.length}: ${preset.name}`;
    const buffer = await renderPreset(preset);
    buffers.set(preset.name, buffer);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    results.set(preset.name, analyse(channels, buffer.sampleRate));
    levelOutliers(results);
    draw();
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const withIssues = [...results.values()].filter((a) => a.issues.some((i) => !MINOR.includes(i.kind))).length;
  status.textContent = `Done in ${seconds} s: ${withIssues} of ${results.size} presets have issues.`;
  // Expose for automated checks from the browser console.
  Object.assign(window, { renderResults: Object.fromEntries(results) });
  runButton.disabled = false;
  saveButton.disabled = !import.meta.env.DEV;
}

async function saveReference() {
  const body: Reference = { engine: engineSelect.value, savedAt: new Date().toISOString(), sampleRate: SAMPLE_RATE, results: Object.fromEntries(results) };
  const res = await fetch(REFERENCE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  status.textContent = res.ok ? "Saved as reference." : `Saving failed: ${res.status}`;
  await loadReference();
  draw();
}

function play(name: string) {
  listenCtx ??= new AudioContext();
  playing?.stop();
  const buffer = buffers.get(name);
  if (!buffer) return;
  playing = new AudioBufferSourceNode(listenCtx, { buffer });
  playing.connect(listenCtx.destination);
  playing.start();
}

function cell(text: string, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function deltaCell(value: number | undefined) {
  if (value === undefined) return cell("–", "num");
  const size = Math.abs(value);
  return cell((value > 0 ? "+" : "") + value.toFixed(1), `num ${size > BAD_DB ? "bad" : size > WARN_DB ? "warn" : ""}`);
}

function draw() {
  rows.replaceChildren(
    ...FACTORY_PRESETS.map((preset, i) => {
      const tr = document.createElement("tr");
      const a = results.get(preset.name);
      const name = cell(preset.name);
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = preset.category;
      name.append(category);
      tr.append(cell(String(i + 1), "num"), name, cell(hasRoutes(presetValues(preset)) ? "yes" : "", "routes"));
      if (!a) {
        tr.append(cell(""), cell(""), cell(""), cell(""), cell(""), cell(""), cell(""));
        return tr;
      }
      tr.append(cell(a.peakDb.toFixed(1), "num"), cell(a.rmsDb.toFixed(1), "num"));
      const issues = cell("", a.issues.length ? "issues" : "ok");
      if (!a.issues.length) issues.textContent = "ok";
      for (const issue of a.issues) {
        const line = document.createElement("div");
        line.textContent = issue.detail;
        if (MINOR.includes(issue.kind)) line.className = "minor";
        issues.append(line);
      }
      tr.append(issues);
      const ref = reference?.results[preset.name];
      const c = ref ? compare(a, ref) : undefined;
      tr.append(deltaCell(c?.loudnessDb), deltaCell(c?.envelopeDb), deltaCell(c?.spectrumDb));
      const listen = document.createElement("td");
      const button = document.createElement("button");
      button.textContent = "▶";
      button.onclick = () => play(preset.name);
      listen.append(button);
      tr.append(listen);
      return tr;
    }),
  );
}

runButton.onclick = () => runAll();
saveButton.onclick = () => saveReference();
loadReference().then(draw);
