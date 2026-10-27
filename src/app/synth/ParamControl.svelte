<script lang="ts">
  import { formatValue, fromControl, MOD_DESTS, PARAMS, toControl, type ParamDef, type ParamId } from "../../audio/params";
  import Knob, { type KnobRing } from "../components/Knob.svelte";
  import { FADERS } from "../../presets/presets";
  import type { Playground } from "../playground.svelte";
  import { DEST_NAMES } from "./blocks";
  import { usePatchDrag } from "./patchDrag.svelte";

  interface Props {
    pg: Playground;
    id: ParamId;
    inline?: boolean;
    /** The knob's size; by default it follows `inline`. */
    size?: number;
    /** The modulations moving it (Panel view). */
    rings?: KnobRing[];
    /** Panel view: the mod destination this knob is, by MOD_DESTS index, so a cable can be dropped (or clicked) on it. */
    dest?: number;
    /** Panel view: why it does nothing right now; it stays in place, dimmed. */
    idle?: string | null;
  }
  let { pg, id, inline = false, size, rings, dest, idle = null }: Props = $props();

  const drag = usePatchDrag();
  /** A cable is being dragged, or a source was clicked, and this knob can take it. */
  let droppable = $derived(dest !== undefined && (!!drag?.state || typeof pg.patch === "number"));
  /** Click patching: a click on the knob makes the route. */
  function pick(e: MouseEvent) {
    if (dest === undefined || typeof pg.patch !== "number") return;
    e.stopPropagation();
    pg.addRoute(pg.patch, dest);
    pg.patch = null;
  }

  const SHORT: Record<string, string> = {
    sine: "Sine", triangle: "Tri", sawtooth: "Saw", square: "Sqr",
    lowpass: "LP", highpass: "HP", bandpass: "BP",
    pitch: "Pitch", filter: "Filter", amp: "Amp", width: "Width", poly: "Poly", mono: "Mono",
    off: "Off", on: "On", both: "Both", "osc 2": "Osc 2", table: "Table", position: "WT Pos", saw: "Saw", random: "Random",
  };

  /** Choices always shown as buttons, even when there are more than four. */
  const BUTTONS = new Set<ParamId>(["osc1Wave", "osc2Wave"]);

  let def: ParamDef = $derived(PARAMS[id]);
  /** The choices; the wavetable list grows and shrinks with imports, so it is read from the playground. A course page may offer only the first few. */
  let options = $derived((id === "wtTable" ? pg.tables.map((t) => t.short) : def.options)?.slice(0, (pg.view === "course" && pg.course.choicesOf(id)) || undefined));
  /** Which hardware knob (1-8) controls this right now, if any (only while a MiniLab is connected). */
  let knob = $derived(pg.hasDevice ? pg.knobParams.indexOf(id) + 1 : 0);
  /** A course page's amp envelope control: the MiniLab fader (1-4) it is on. */
  let fader = $derived(pg.hasDevice && pg.view === "course" && pg.course.lesson.faders?.includes(id) ? FADERS.indexOf(id) + 1 : 0);
  /** A recipe step (or a course step) asks for this control. */
  let target = $derived(pg.targetParams.includes(id));
</script>

{#if options && options.length > 4 && !BUTTONS.has(id)}
  <!-- Long choice lists as a compact dropdown, so blocks stay short. -->
  <label class="select" class:hot={pg.touched?.param === id} class:target class:idle={!!idle} title={idle}>
    <span class="label">{#if knob}<span class="k" title="MiniLab knob {knob}">{knob}</span>{/if}{def.label}</span>
    <select value={Math.round(pg.values[id])} onchange={(e) => pg.setParam(id, +e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
      {#each options as option, i}<option value={i}>{SHORT[option] ?? option}</option>{/each}
    </select>
  </label>
{:else if options}
  <!-- Two-way switches fit in one cell, next to a knob; longer lists take the whole row. -->
  <div class="enum" class:short={options.length <= 2} class:hot={pg.touched?.param === id} class:target class:idle={!!idle} title={idle}>
    <div class="label">{#if knob}<span class="k" title="MiniLab knob {knob}">{knob}</span>{/if}{def.label}</div>
    <div class="options">
      {#each options as option, i}
        <button class:active={Math.round(pg.values[id]) === i} onclick={() => pg.setParam(id, i)}>{SHORT[option] ?? option}</button>
      {/each}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="knob-wrap"
    class:idle={!!idle && !droppable}
    class:target
    class:inline
    class:droppable
    class:over={dest !== undefined && drag?.state?.over === dest}
    data-dest={dest}
    title={droppable ? `Patch to ${DEST_NAMES[MOD_DESTS[dest!]]}` : (idle ?? undefined)}
    onclickcapture={pick}
  >
    {#if knob}<span class="k knob-k" title="MiniLab knob {knob}">{knob}</span>{:else if fader}<span class="k knob-k fader-k" title="MiniLab fader {fader}">F{fader}</span>{/if}
    <Knob
      size={size ?? (inline ? 30 : 38)}
      {rings}
      {inline}
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
  .enum.short { grid-column: auto; align-items: center; padding-top: 4px; }
  .select { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; }
  .select select { font-size: 11px; padding: 1px 4px; max-width: 60%; }
  .label { font-size: 11px; color: var(--text); }
  .options { display: flex; flex-wrap: wrap; gap: 2px; }
  .options button { font-size: 11px; padding: 1px 6px; border-radius: 3px; }
  .options .active { background: var(--accent); color: #0b1314; border-color: var(--accent); }
  .hot .label { color: var(--accent); }
  .knob-wrap { position: relative; }
  .knob-wrap.inline { width: 100%; }
  /* The control a recipe step asks for. */
  .target { outline: 2px solid #ffcc33; outline-offset: 2px; border-radius: 6px; }
  .target .label { color: #ffe08a; }
  .k {
    display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 4px;
    border-radius: 50%; background: var(--accent); color: #0b1314; font: 600 9px var(--mono); vertical-align: 1px;
  }
  .knob-k { position: absolute; top: 0; right: 2px; margin: 0; }
  .fader-k { width: auto; padding: 0 4px; border-radius: 7px; }
  /* Panel view: does nothing right now (the title says why), but stays in place and can be set ahead. */
  .idle { opacity: 0.35; transition: opacity 0.15s; }
  .idle:hover { opacity: 0.6; }
  /* Panel view patching: the knobs a cable can go to. */
  .droppable { outline: 1px dashed #ffcc3388; outline-offset: 3px; border-radius: 8px; cursor: crosshair; }
  .over { outline: 2px solid #ffcc33; background: #ffcc3322; }
  .inline .knob-k { top: -3px; left: -3px; right: auto; }
  /* Touch screens: fingers need bigger targets than a mouse. */
  @media (pointer: coarse) {
    .options button { font-size: 12px; padding: 6px 9px; }
    .select select { font-size: 13px; padding: 6px; }
  }
</style>
