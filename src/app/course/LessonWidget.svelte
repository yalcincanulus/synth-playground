<script lang="ts">
  import { formatValue, PARAMS } from "../../audio/params";
  import type { Widget } from "../../course/lesson";
  import { surface } from "../components/canvas";
  import Knob from "../components/Knob.svelte";
  import type { Playground } from "../playground.svelte";
  import { harmonicBars, liveWave, noteHz, pitchWave } from "./draw";
  import { envelope } from "../synth/viz";

  let { pg, widget, accent }: { pg: Playground; widget: Widget; accent: string } = $props();

  const color = () => accent;
  const analyser = () => pg.engine.analyser;
  const wave = () => Math.round(pg.values.osc1Wave);
  // The fixed scale: a sine at full Volume and the hardest key (0.7 at the output) fills the picture.
  const FIXED_GAIN = 1.4;

  let course = $derived(pg.course);
  let note = $derived(course.lastNote);
  let hz = $derived(note === null ? null : noteHz(note));
  const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);

  // Beating: two oscillators `detune` cents apart beat this many times a second, at the note played (A3 until one is).
  let beatNote = $derived(note ?? 57);
  let beats = $derived(noteHz(beatNote) * (Math.pow(2, pg.values.osc2Detune / 1200) - 1));
</script>

{#if widget.kind === "wave"}
  <div class="frame tall"><canvas use:surface={{ draw: liveWave(analyser, color, wave, widget.fixed ? FIXED_GAIN : null), animate: true }}></canvas></div>
{:else if widget.kind === "pitch"}
  <div class="readout" aria-live="polite">
    {#if note !== null && hz !== null}
      <span class="big">{pg.noteName(note)}</span>
      <span class="hz">{fmtHz(hz)}</span>
      <span class="dim">{Math.round(hz)} swings a second · {(hz * 0.01).toFixed(1)} in the picture</span>
    {:else}
      <span class="dim">Play a note: its name and frequency show here.</span>
    {/if}
  </div>
  <div class="frame"><canvas use:surface={{ draw: pitchWave(() => note, wave, color), animate: true }}></canvas></div>
{:else if widget.kind === "knob"}
  {@const id = widget.param}
  <div class="knob-row">
    <div class="big-knob">
      <Knob
        size={112}
        number={course.lesson.knobs.indexOf(id) + 1}
        label={PARAMS[id].label}
        display={formatValue(id, pg.values[id])}
        position={course.knobPosition(id, pg.values[id])}
        hot={pg.touched?.param === id}
        onchange={(t) => pg.setParam(id, course.fromKnob(id, t))}
      />
    </div>
    <div class="frame tall grow"><canvas use:surface={{ draw: liveWave(analyser, color, wave, FIXED_GAIN), animate: true }}></canvas></div>
  </div>
{:else if widget.kind === "envelope"}
  <div class="frame tall"><canvas use:surface={{ draw: envelope(pg.engine, widget.which, color), animate: true }}></canvas></div>
  <p class="caption"><span class="dim">Each dot is a note you are playing, travelling along the shape.</span></p>
{:else if widget.kind === "harmonics"}
  <div class="frame tall"><canvas use:surface={{ draw: harmonicBars(wave, color), key: wave() }}></canvas></div>
  <p class="caption">{formatValue("osc1Wave", wave())}: {["one sine, no harmonics", "odd harmonics, fading fast", "every harmonic, each weaker than the last", "odd harmonics only"][wave()] ?? ""}</p>
{:else if widget.kind === "compare"}
  <div class="ab" role="group" aria-label="Compare two sounds">
    {#each [["a", widget.a], ["b", widget.b]] as const as [key, side] (key)}
      <button class:active={course.side === key} onclick={() => course.pick(key)}>
        <span class="letter">{key.toUpperCase()}</span>
        <span class="side-label">{side.label}</span>
        <span class="side-text">{side.text}</span>
      </button>
    {/each}
  </div>
  {#if widget.picture === "amp" || widget.picture === "filter"}
    <div class="frame"><canvas use:surface={{ draw: envelope(pg.engine, widget.picture, color), animate: true }}></canvas></div>
  {:else}
    <div class="frame"><canvas use:surface={{ draw: liveWave(analyser, color, wave, null), animate: true }}></canvas></div>
  {/if}
  <p class="caption">
    {#if widget.picture && widget.picture !== "wave"}
      <span class="dim">Each dot is a note you are playing, travelling along the shape.</span>
    {:else if pg.values.oscMix < 0.05}
      Oscillator 2 is silent (Osc Mix at 0): nothing to beat against.
    {:else if pg.values.osc2Detune < 0.5}
      In tune: no beating.
    {:else}
      {formatValue("osc2Detune", pg.values.osc2Detune)} apart: at {pg.noteName(beatNote)} the sound pulses
      <strong>{beats < 10 ? beats.toFixed(1) : Math.round(beats)} times a second</strong>{beats > 12 ? ", too fast to hear as a pulse: it blurs into a thick chorus" : ""}.
    {/if}
    <span class="dim">Encoder click: switch A/B.</span>
  </p>
{/if}

<style>
  .frame { position: relative; height: 140px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; }
  .frame.tall { height: 170px; }
  .frame.grow { flex: 1; min-width: 0; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .readout { display: flex; align-items: baseline; gap: 14px; min-height: 40px; margin-bottom: 6px; flex-wrap: wrap; }
  .big { font-size: 32px; font-weight: 600; color: var(--accent); }
  .hz { font: 20px var(--mono); color: var(--text); }
  .dim { color: var(--dim); font-size: 12px; }
  .knob-row { display: flex; gap: 16px; align-items: center; }
  .big-knob { flex: none; width: 150px; display: flex; justify-content: center; }
  .caption { margin: 6px 0 0; font-size: 13px; color: #b9c5c8; }
  .caption strong { color: var(--accent); }
  .ab { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  .ab button { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; text-align: left; padding: 8px 12px; border-radius: 6px; }
  .ab .letter { grid-row: 1 / 3; align-self: center; font: 600 22px var(--mono); color: var(--dim); }
  .ab .side-label { font-size: 14px; color: var(--text); }
  .ab .side-text { font-size: 12px; color: var(--dim); }
  .ab .active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .ab .active .letter { color: var(--accent); }
</style>
