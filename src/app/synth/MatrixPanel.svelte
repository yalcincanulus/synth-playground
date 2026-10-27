<script lang="ts">
  import { formatValue, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, slotIds } from "../../audio/params";
  import type { Playground } from "../playground.svelte";
  import { DEST_NAMES, fixedRoutes, SOURCE_BLOCK, SOURCE_NAMES } from "./blocks";
  import LiveCanvas from "./LiveCanvas.svelte";
  import type { Surface } from "../components/canvas";

  interface Props {
    pg: Playground;
    colors: Record<string, string>;
    /** How to patch by dragging, in the view it is in. */
    hint?: string;
  }
  let { pg, colors, hint = "Drag from a modulator's ○ socket to a block to add a route; drag a cable's ● end away to remove it." }: Props = $props();

  let open = $state(true);

  // The fixed wiring folds away on its own; remembered per browser.
  const FIXED_OPEN_KEY = "minilab3.fixedRoutes";
  let fixedOpen = $state(localStorage.getItem(FIXED_OPEN_KEY) !== "closed");
  function toggleFixed(e: MouseEvent) {
    e.stopPropagation();
    fixedOpen = !fixedOpen;
    localStorage.setItem(FIXED_OPEN_KEY, fixedOpen ? "open" : "closed");
  }
  let fixed = $derived(fixedRoutes(pg.values, pg.bend, pg.mod));

  const sourceColor = (n: number) => {
    const src = MOD_SOURCES[pg.values[slotIds(n).src]];
    return src === "off" ? "#888" : colors[SOURCE_BLOCK[src]];
  };

  /** How far the route is pushing its destination right now, as a bar from the middle. */
  const meter = (n: number) => ({ g, w, h }: Surface) => {
    const ids = slotIds(n);
    const value = pg.engine.modSourceValue(MOD_SOURCES[pg.engine.params[ids.src]]);
    g.fillStyle = "#ffffff12";
    g.fillRect(0, h / 2 - 1, w, 2);
    g.fillRect(w / 2 - 0.5, 0, 1, h);
    if (value === null) return;
    const x = (pg.engine.params[ids.amt] * value * w) / 2;
    g.fillStyle = sourceColor(n);
    g.fillRect(Math.min(w / 2, w / 2 + x), 2, Math.abs(x), h - 4);
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section class="matrix" class:focused={pg.focusBlock === "matrix"} role="group" aria-label="Mod matrix" onclick={() => pg.focus("matrix")}>
  <header>
    <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>{open ? "▾" : "▸"} Mod Matrix</button>
    <span class="count">{pg.routes.length} of {MOD_SLOTS} routes</span>
    <button class="patch" class:on={pg.patch !== null} onclick={(e) => { e.stopPropagation(); pg.togglePatch(); }}>
      {pg.patch === null ? "＋ Patch" : "Cancel patch"}
    </button>
    {#if pg.patch === "source"}
      <span class="step">Click a <strong>source</strong>: an LFO, an envelope, or Playing (velocity).</span>
    {:else if typeof pg.patch === "number"}
      <span class="step">From <strong style:color={colors[SOURCE_BLOCK[MOD_SOURCES[pg.patch] as keyof typeof SOURCE_BLOCK]]}>{SOURCE_NAMES[MOD_SOURCES[pg.patch]]}</strong>: now click what it should move (an oscillator, the mixer, a filter, the amp, an effect or an LFO).</span>
    {:else if pg.explain}
      <span class="step dim">{hint}{pg.hw(" Knobs 1–8 (Matrix page) set the amounts.")}</span>
    {/if}
    {#if pg.routes.length < MOD_SLOTS}
      <button class="add" onclick={(e) => { e.stopPropagation(); pg.addRoute(); }}>Add route</button>
    {/if}
  </header>

  {#if open && pg.routes.length}
    <div class="rows">
      {#each pg.routes as n (n)}
        {@const ids = slotIds(n)}
        <div class="row" class:hot={pg.touched?.param === ids.amt}>
          <span class="n" style:background={sourceColor(n)}>{n}</span>
          <select value={pg.values[ids.src]} onchange={(e) => pg.setParam(ids.src, +e.currentTarget.value)} aria-label="Route {n} source">
            {#each MOD_SOURCES as s, i (s)}{#if i > 0}<option value={i}>{SOURCE_NAMES[s]}</option>{/if}{/each}
          </select>
          <span class="arrow">→</span>
          <select value={pg.values[ids.dst]} onchange={(e) => pg.setParam(ids.dst, +e.currentTarget.value)} aria-label="Route {n} destination">
            {#each MOD_DESTS as d, i (d)}<option value={i}>{DEST_NAMES[d]}</option>{/each}
          </select>
          <input
            type="range" min="-1" max="1" step="0.002" value={pg.values[ids.amt]} aria-label="Route {n} amount"
            style:accent-color={sourceColor(n)}
            oninput={(e) => pg.setParam(ids.amt, +e.currentTarget.value)}
            ondblclick={() => pg.setParam(ids.amt, 0)}
          />
          <span class="v">{formatValue(ids.amt, pg.values[ids.amt])}</span>
          <div class="meter" title="How much it moves the destination right now"><LiveCanvas height={14} draw={meter(n)} /></div>
          <button class="remove" title="Remove route" onclick={(e) => { e.stopPropagation(); pg.removeRoute(n); }}>✕</button>
        </div>
      {/each}
    </div>
  {/if}
  {#if open}
    <div class="fixed">
      <button class="fixed-toggle" onclick={toggleFixed} aria-expanded={fixedOpen} title="The connections the synth always makes, set on their own blocks">{fixedOpen ? "▾" : "▸"} Fixed wiring</button>
      {#if fixedOpen}
        {#each fixed as f (f.from + f.to)}
          <button
            class="fixed-route"
            class:idle={f.idle}
            title="Always connected. Set on {f.block === 'perf' ? 'Playing' : f.block === 'amp' ? 'Amp' : f.from}: click to put the knobs there."
            onclick={(e) => {
              e.stopPropagation();
              pg.focus(f.block);
            }}
          >
            <i style:background={colors[f.source]}></i>{f.from} → {f.to}<span class="v">{f.amount}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .matrix { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; display: grid; gap: 6px; }
  .matrix.focused { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  header { display: flex; align-items: center; gap: 10px; font-size: 12px; flex-wrap: wrap; }
  .toggle { background: none; border: none; padding: 0; font-weight: 600; font-size: 13px; color: var(--text); }
  .count { color: var(--dim); font-size: 11px; }
  .patch.on { background: #ffcc33; border-color: #ffcc33; color: #111; }
  .step { flex: 1; color: #ffe08a; }
  .step.dim { color: var(--dim); }
  .add { margin-left: auto; }
  .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
  .row { display: grid; grid-template-columns: 18px 1fr 12px 1fr 90px 40px 56px 20px; align-items: center; gap: 6px; font-size: 11px; }
  .row.hot .v { color: var(--accent); }
  .n { width: 16px; height: 16px; border-radius: 50%; color: #111; font: 600 10px var(--mono); display: grid; place-items: center; }
  .arrow { color: var(--dim); text-align: center; }
  select { font-size: 11px; padding: 1px 2px; min-width: 0; }
  input[type="range"] { width: 100%; }
  .v { font: 10px var(--mono); color: var(--dim); text-align: right; }
  .meter { min-width: 0; }
  .remove { padding: 0 4px; font-size: 10px; line-height: 16px; background: none; opacity: 0.6; }
  .remove:hover { opacity: 1; }
  /* The fixed wiring: greyed out, a click focuses the block that sets it. */
  .fixed { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 6px; font-size: 11px; }
  .fixed-toggle { background: none; border: none; padding: 0 4px 0 0; font-size: 11px; color: var(--dim); white-space: nowrap; }
  .fixed-route {
    display: flex; align-items: center; gap: 5px; padding: 0 7px; line-height: 18px; font-size: 11px; color: #8d999c;
    background: #ffffff06; border: 1px dashed #ffffff22; border-radius: 9px; white-space: nowrap;
  }
  .fixed-route:hover { color: var(--text); border-color: #ffffff44; }
  .fixed-route i { width: 7px; height: 7px; border-radius: 50%; opacity: 0.7; }
  .fixed-route .v { text-align: left; }
  .fixed-route.idle { opacity: 0.45; }
</style>
