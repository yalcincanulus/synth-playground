<script lang="ts">
  import { formatValue, PARAMS } from "../../audio/params";
  import type { Widget } from "../../course/lesson";
  import { surface } from "../components/canvas";
  import Knob from "../components/Knob.svelte";
  import type { Playground } from "../playground.svelte";
  import { harmonicBars, liveWave, noteHz, pitchWave } from "./draw";
  import { envelope, filter, lfo, liveCutoff, stereoPicture } from "../synth/viz";
  import { DEST_NAMES, SOURCE_NAMES } from "../synth/blocks";
  import { MOD_DESTS, MOD_SOURCES, slotIds } from "../../audio/params";
  import { spectrogram } from "../components/spectrogram";

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
  /** The filter's cutoff right now (with the envelope and key tracking), marked on the spectrograms. */
  const cutoffMark = () => ({ hz: liveCutoff(pg.engine), label: "cutoff" });
  const TAP_TITLES = { mix: "Into the drive", drive: "Into the filter", filter: "Out of the filter" };
  const tap = (id: "mix" | "drive" | "filter") => () => pg.engine.taps[id];

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
{:else if widget.kind === "spectrogram"}
  <div class="pair">
    {#each [widget.before, widget.after] as id, i (i)}
      <figure>
        <figcaption>{i === 1 && widget.before === "mix" ? "Out of the drive and filter" : TAP_TITLES[id]}</figcaption>
        <div class="frame tall"><canvas use:surface={{ draw: spectrogram(tap(id), color, cutoffMark), animate: true }}></canvas></div>
      </figure>
    {/each}
  </div>
  <p class="caption"><span class="dim">Time runs right to left; higher pitches are higher up; brighter is louder. The dashed line is the filter's cutoff.</span></p>
{:else if widget.kind === "response"}
  <div class="frame tall"><canvas use:surface={{ draw: filter(pg.engine, color), animate: true }}></canvas></div>
  <p class="caption"><span class="dim">Low frequencies on the left, high on the right; the higher the line, the more gets through. Dashed: where the knob is; solid: where the filter is right now.</span></p>
{:else if widget.kind === "lfo"}
  <div class="frame tall"><canvas use:surface={{ draw: lfo(pg.engine, widget.index, color), animate: true }}></canvas></div>
  {#if widget.transport}
    <div class="transport">
      <button class="primary" class:on={pg.playing} onclick={() => pg.togglePlay()}>{pg.playing ? "■ Stop the drums" : "▶ Start the drums"}</button>
      <span class="dim">{pg.bpm} BPM: one beat lasts {(60 / pg.bpm).toFixed(2)} s</span>
    </div>
  {:else}
    <p class="caption"><span class="dim">One cycle of the LFO; the dot is where it is now. The line is flat grey while Depth is 0.</span></p>
  {/if}
{:else if widget.kind === "route"}
  {@const ids = slotIds(widget.n)}
  {@const src = MOD_SOURCES[pg.values[ids.src]]}
  {@const amt = pg.values[ids.amt]}
  <div class="route" class:off={src === "off" || amt === 0}>
    <span class="end"><span class="k">From</span>{SOURCE_NAMES[src]}</span>
    <span class="cable" style:--w="{2 + Math.abs(amt) * 8}px"><span class="amt">{formatValue(ids.amt, amt)}</span></span>
    <span class="end"><span class="k">To</span>{DEST_NAMES[MOD_DESTS[pg.values[ids.dst]]]}</span>
  </div>
  {#if widget.picture === "stereo"}
    <div class="frame"><canvas use:surface={{ draw: stereoPicture(() => pg.engine.fx.meters.left, () => pg.engine.fx.meters.right, color), animate: true }}></canvas></div>
    <p class="caption"><span class="dim">The stereo picture: a sound in the middle is a vertical line; leaning left or right, it comes from that side.</span></p>
  {:else}
    <div class="frame"><canvas use:surface={{ draw: spectrogram(tap("filter"), color, cutoffMark), animate: true }}></canvas></div>
    <p class="caption"><span class="dim">Out of the filter: brighter notes reach higher up.</span></p>
  {/if}
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
  {:else if widget.picture === "response"}
    <div class="frame"><canvas use:surface={{ draw: filter(pg.engine, color), animate: true }}></canvas></div>
  {:else}
    <div class="frame"><canvas use:surface={{ draw: liveWave(analyser, color, wave, null), animate: true }}></canvas></div>
  {/if}
  <p class="caption">
    {#if widget.picture === "response"}
      <span class="dim">The filter's response: how much of each frequency gets through.</span>
    {:else if widget.picture && widget.picture !== "wave"}
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
  .transport { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  .transport .on { background: var(--accent); color: #0b1314; }
  .route { display: flex; align-items: center; gap: 0; margin-bottom: 8px; }
  .route .end { display: grid; padding: 6px 12px; border: 1px solid var(--accent); border-radius: 6px; font-size: 15px; min-width: 120px; }
  .route .k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }
  .route .cable { flex: 1; position: relative; height: var(--w); background: var(--accent); border-radius: 4px; display: flex; justify-content: center; }
  .route .amt { position: absolute; bottom: calc(100% + 4px); font: 12px var(--mono); color: var(--accent); }
  .route.off .end { border-color: var(--line); }
  .route.off .cable { background: var(--line); }
  .route.off .amt { color: var(--dim); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  figure { margin: 0; }
  figcaption { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
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
