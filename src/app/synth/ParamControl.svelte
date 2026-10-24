<script lang="ts">
  import { formatValue, fromControl, PARAMS, toControl, type ParamDef, type ParamId } from "../../audio/params";
  import Knob from "../components/Knob.svelte";
  import type { Playground } from "../playground.svelte";

  let { pg, id }: { pg: Playground; id: ParamId } = $props();

  const SHORT: Record<string, string> = {
    sine: "Sine", triangle: "Tri", sawtooth: "Saw", square: "Sqr",
    lowpass: "LP", highpass: "HP", bandpass: "BP",
    pitch: "Pitch", filter: "Filter", amp: "Amp", width: "Width", poly: "Poly", mono: "Mono",
    off: "Off", on: "On", both: "Both", "osc 2": "Osc 2", table: "Table", position: "WT Pos", saw: "Saw", random: "Random",
  };

  /** Choices always shown as buttons, even when there are more than four. */
  const BUTTONS = new Set<ParamId>(["osc1Wave", "osc2Wave"]);

  let def: ParamDef = $derived(PARAMS[id]);
  /** Which hardware knob (1-8) controls this right now, if any. */
  let knob = $derived(pg.knobParams.indexOf(id) + 1);
</script>

{#if def.options && def.options.length > 4 && !BUTTONS.has(id)}
  <!-- Long choice lists as a compact dropdown, so blocks stay short. -->
  <label class="select" class:hot={pg.touched?.param === id}>
    <span class="label">{#if knob}<span class="k" title="MiniLab knob {knob}">{knob}</span>{/if}{def.label}</span>
    <select value={Math.round(pg.values[id])} onchange={(e) => pg.setParam(id, +e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
      {#each def.options as option, i}<option value={i}>{SHORT[option] ?? option}</option>{/each}
    </select>
  </label>
{:else if def.options}
  <!-- Two-way switches fit in one cell, next to a knob; longer lists take the whole row. -->
  <div class="enum" class:short={def.options.length <= 2} class:hot={pg.touched?.param === id}>
    <div class="label">{#if knob}<span class="k" title="MiniLab knob {knob}">{knob}</span>{/if}{def.label}</div>
    <div class="options">
      {#each def.options as option, i}
        <button class:active={Math.round(pg.values[id]) === i} onclick={() => pg.setParam(id, i)}>{SHORT[option] ?? option}</button>
      {/each}
    </div>
  </div>
{:else}
  <div class="knob-wrap">
    {#if knob}<span class="k knob-k" title="MiniLab knob {knob}">{knob}</span>{/if}
    <Knob
      size={44}
      label={def.label}
      display={formatValue(id, pg.values[id])}
      position={toControl(id, pg.values[id])}
      hot={pg.touched?.param === id}
      onchange={(t) => pg.setParam(id, fromControl(id, t))}
      onreset={() => pg.setParam(id, pg.preset.values[id] ?? def.default)}
    />
  </div>
{/if}

<style>
  .enum { display: flex; flex-direction: column; gap: 3px; grid-column: 1 / -1; }
  .enum.short { grid-column: auto; align-items: center; padding-top: 6px; }
  .select { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; }
  .select select { font-size: 11px; padding: 1px 4px; max-width: 60%; }
  .label { font-size: 11px; color: var(--text); }
  .options { display: flex; flex-wrap: wrap; gap: 2px; }
  .options button { font-size: 11px; padding: 1px 6px; border-radius: 3px; }
  .options .active { background: var(--accent); color: #0b1314; border-color: var(--accent); }
  .hot .label { color: var(--accent); }
  .knob-wrap { position: relative; }
  .k {
    display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 4px;
    border-radius: 50%; background: var(--accent); color: #0b1314; font: 600 9px var(--mono); vertical-align: 1px;
  }
  .knob-k { position: absolute; top: 0; right: 2px; margin: 0; }
</style>
