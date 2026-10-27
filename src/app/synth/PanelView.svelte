<script lang="ts">
  // The Synth view as a plugin-style panel: the sound engine on top, one modulator (or the matrix, or the
  // effects) at a time below. No cables: each modulation is a ring around the knob it moves, in its
  // source's colour, with a dot where it has the knob right now. Drag a modulator's ○ onto a knob to patch.
  import { EFFECT_ON, effectOrder, formatValue, MOD_DESTS, MOD_SOURCES, PARAMS, type ModDest, type ModSource, type ParamId } from "../../audio/params";
  import type { KnobRing } from "../components/Knob.svelte";
  import type { Playground } from "../playground.svelte";
  import { spectrogram } from "../components/spectrogram";
  import { blockSources, BLOCKS, DEST_NAMES, isEffect, KNOB_PAGES, MOD_SHORT, paramLabel, SOURCE_BLOCK, SOURCE_NAMES, type BlockId } from "./blocks";
  import { AENV, COLORS, FENV, LFO, LFO2, LFO3, MENV, PENV, PLAY, sourceColor } from "./colors";
  import { EffectRow } from "./effectRow.svelte";
  import LiveCanvas from "./LiveCanvas.svelte";
  import MatrixPanel from "./MatrixPanel.svelte";
  import { activeMods, DEST_PARAM, reach } from "./modRings";
  import Panel from "./Panel.svelte";
  import { PatchDrag, providePatchDrag } from "./patchDrag.svelte";
  import * as viz from "./viz";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  let engine = $derived(pg.engine);
  // The selected part's stages: follows the part switch.
  let taps = $derived((pg.part, engine.taps));
  const color = () => accent;
  const values = () => pg.values;
  const noise = () => () => Math.random() * 2 - 1;

  let container = $state<HTMLElement>();
  const drag = new PatchDrag(() => pg, () => container, "a knob");
  providePatchDrag(drag);

  // ------------------------------------------------------------------ modulation rings

  /** Each source's value now, about 30 times a second, for the dots on the rings. */
  let live = $state<Partial<Record<ModSource, number | null>>>({});
  $effect(() => {
    let frame = 0;
    let skip = false;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if ((skip = !skip)) return;
      const next: Partial<Record<ModSource, number | null>> = {};
      let changed = false;
      for (const s of MOD_SOURCES) {
        if (s === "off") continue;
        next[s] = engine.modSourceValue(s);
        changed ||= next[s] !== live[s];
      }
      if (changed) live = next;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  let mods = $derived(activeMods(pg.values, pg.mod));
  /** The modulator tab under the pointer: its rings stay bright, the others fade. */
  let hover = $state<BlockId | null>(null);

  const title = (m: (typeof mods)[number]) => `${SOURCE_NAMES[m.source]} → ${DEST_NAMES[m.dest]}: ${m.text}${m.route ? ` (route ${m.route})` : " (fixed)"}`;
  const faded = (m: (typeof mods)[number]) => m.amount === 0 || (hover !== null && SOURCE_BLOCK[m.source] !== hover);

  let rings = $derived.by(() => {
    const out: Partial<Record<ParamId, KnobRing[]>> = {};
    for (const m of mods) {
      const id = DEST_PARAM[m.dest];
      if (!id) continue;
      const r = reach(m, id, pg.values[id], live[m.source] ?? null);
      (out[id] ??= []).push({ ...r, color: sourceColor(m.source), dim: faded(m), title: title(m) });
    }
    return out;
  });
  const ringsOf = (id: ParamId) => rings[id];

  /** Click patching: a click on a destination tag makes the route. */
  function pickDest(e: MouseEvent, dest: number) {
    if (typeof pg.patch !== "number") return;
    e.stopPropagation();
    pg.addRoute(pg.patch, dest);
    pg.patch = null;
  }

  // ------------------------------------------------------------------ the bottom tabs

  const MOD_TABS: BlockId[] = ["ampEnv", "filterEnv", "pitchEnv", "modEnv", "lfo", "lfo2", "lfo3", "perf"];
  type Tab = BlockId | "fx";
  const tabOf = (b: BlockId | null | undefined): Tab | null => (!b ? null : MOD_TABS.includes(b) || b === "matrix" ? b : isEffect(b) ? "fx" : null);
  let tab = $state<Tab>("ampEnv");
  // The tab follows the knobs (a click elsewhere, the encoder) and a recipe step's block.
  $effect(() => {
    const t = tabOf(pg.focusBlock);
    if (t) tab = t;
  });
  $effect(() => {
    const t = tabOf(pg.recipeBlock);
    if (t) tab = t;
  });
  function openTab(t: Tab) {
    tab = t;
    if (t !== "fx") pg.blockClick(t);
  }
  /** What the shown modulator moves, listed under its picture. */
  let moves = $derived(mods.filter((m) => SOURCE_BLOCK[m.source] === tab));

  let order = $derived(effectOrder(pg.values));
  const fxRow = new EffectRow(() => pg);
  const amountOff = (amount: number) => (amount < 0.01 ? "at 0" : null);

  // ------------------------------------------------------------------ the status bar

  let focusDef = $derived(BLOCKS[pg.focusBlock]);
  let page = $derived(KNOB_PAGES[pg.focusPage]);
</script>

{#snippet destTag(dest: ModDest, label: string)}
  {@const d = MOD_DESTS.indexOf(dest)}
  <!-- A destination without a knob: its modulations as dots; a cable can be dropped (or clicked) here. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <span
    class="tag"
    class:droppable={!!drag.state || typeof pg.patch === "number"}
    class:over={drag.state?.over === d}
    data-dest={d}
    title="{DEST_NAMES[dest]}: no knob, so what moves it shows here"
    onclickcapture={(e) => pickDest(e, d)}
  >
    {label}
    {#each mods.filter((m) => m.dest === dest) as m, i (i)}
      <i style:background={sourceColor(m.source)} class:dim={faded(m)} title={title(m)}></i>
    {/each}
  </span>
{/snippet}

{#snippet jacks(block: BlockId)}
  {@const sources = blockSources(block)}
  {#each sources as src (src)}
    <button
      class="jack"
      class:armed={pg.patch === src}
      data-jack={src}
      style:--c={COLORS[block]}
      title="{SOURCE_NAMES[MOD_SOURCES[src]]}: drag onto a knob to make it move it (or click, then click the knob)"
      aria-label="Patch from {SOURCE_NAMES[MOD_SOURCES[src]]}"
      onpointerdown={(e) => drag.press(e, src, null)}
      onclick={(e) => drag.click(e, src, null)}
    >{#if sources.length > 1}<span>{MOD_SHORT[MOD_SOURCES[src]]}</span>{/if}</button>
  {/each}
{/snippet}

<div class="plugin" bind:this={container}>
  <div class="engine top">
    <!-- Mixed out (Osc Mix at 0/100), Osc 1 is silent, but with Sync on it still restarts Osc 2's wave. -->
    <Panel {pg} id="osc1" power={pg.values.oscMix <= 0.99 || pg.values.oscSync === 1} rings={ringsOf} inactive={pg.values.oscMix > 0.99 ? (pg.values.oscSync ? "sync only" : "mixed out") : null}>
      {#snippet tags()}{@render destTag("pitch", "Pitch (both)")}{/snippet}
      <LiveCanvas height={56} draw={viz.scope(() => taps.osc1, color, () => viz.oscIdeal(pg.values, 0, engine))} />
    </Panel>
    <Panel {pg} id="osc2" power={pg.values.oscMix >= 0.01 || pg.values.fmAmount >= 0.01} rings={ringsOf} inactive={pg.values.oscMix < 0.01 ? (pg.values.fmAmount >= 0.01 ? "FM only" : "mixed out") : null}>
      <LiveCanvas height={56} draw={viz.scope(() => taps.osc2, color, () => viz.oscIdeal(pg.values, 1, engine))} />
    </Panel>
    <Panel {pg} id="mixer" rings={ringsOf}>
      <LiveCanvas height={30} draw={viz.mixer(values, color)} />
      <div class="pair">
        {#each [["sub", "Sub"], ["noise", "Noise"]] as const as [t, name] (t)}
          <div class:off={(t === "sub" ? pg.values.subLevel : pg.values.noiseLevel) < 0.01}>
            <span>{name}</span>
            <button
              class="listen-mini"
              class:on={pg.listening === t}
              title="Listen to {name} on its own"
              onclick={(e) => {
                e.stopPropagation();
                pg.listenTo(t);
              }}>🎧</button
            >
            <LiveCanvas height={22} draw={viz.scope(() => taps[t], color, t === "sub" ? () => viz.idealWave(3) : noise)} />
          </div>
        {/each}
      </div>
    </Panel>
  </div>

  <div class="engine bottom">
    <Panel {pg} id="drive" power={pg.values.drive >= 0.01} rings={ringsOf} inactive={pg.values.drive < 0.01 ? "off" : null}>
      <LiveCanvas height={56} draw={viz.drive(values, color)} />
    </Panel>
    <Panel {pg} id="filter" rings={ringsOf}>
      <LiveCanvas height={70} draw={viz.filter(engine, color)} />
      <LiveCanvas height={34} draw={spectrogram(() => taps.filter, color, () => ({ hz: viz.liveCutoff(engine), label: "cutoff" }))} />
    </Panel>
    <Panel {pg} id="filter2" power={pg.values.filter2Mode > 0} rings={ringsOf} inactive={pg.values.filter2Mode === 0 ? "off" : null}>
      <LiveCanvas height={56} draw={viz.filter2(engine, color)} />
    </Panel>
    <Panel {pg} id="amp" rings={ringsOf}>
      {#snippet tags()}{@render destTag("volume", "Volume")}{/snippet}
      <LiveCanvas height={56} draw={viz.scope(() => taps.amp, color)} />
    </Panel>
    <Panel {pg} id="output" rings={ringsOf}>
      {#snippet tags()}{@render destTag("pan", "Pan")}{/snippet}
      <LiveCanvas height={20} draw={viz.stereoMeter(() => engine.fx.meters.left, () => engine.fx.meters.right, color)} />
      <LiveCanvas height={52} draw={viz.stereoPicture(() => engine.fx.meters.left, () => engine.fx.meters.right, color)} />
    </Panel>
  </div>

  <div class="lower">
    <div class="tabs" role="tablist">
      {#each MOD_TABS as m (m)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="tab"
          class:on={tab === m}
          style:--c={COLORS[m]}
          onpointerenter={() => {
            hover = m;
            // Dragging a cable over a tab opens it, so its knobs (LFO rate, depth) can be dropped on.
            if (drag.state) tab = m;
          }}
          onpointerleave={() => (hover = null)}
        >
          <button role="tab" aria-selected={tab === m} onclick={() => openTab(m)}>{BLOCKS[m].title}</button>
          {@render jacks(m)}
        </div>
      {/each}
      <span class="gap"></span>
      {#each [["matrix", "Matrix"], ["fx", "Effects"]] as const as [t, name] (t)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="tab plain" class:on={tab === t} onpointerenter={() => drag.state && (tab = t)}>
          <button role="tab" aria-selected={tab === t} onclick={() => openTab(t)}>
            {name}{#if t === "matrix"}<small>{pg.routes.length}</small>{:else}<small>{order.filter((fx) => pg.values[EFFECT_ON[fx]] === 1).length} on</small>{/if}
          </button>
        </div>
      {/each}
    </div>

    <div class="tabpage">
      {#if tab === "matrix"}
        <MatrixPanel {pg} colors={COLORS} hint="Drag a modulator's ○ (in the tabs) onto a knob to add a route; ✕ removes one. Knobs 1–8 (Matrix page) set the amounts." />
      {:else if tab === "fx"}
        <div class="fxrack" bind:this={fxRow.row} ondragover={fxRow.over} ondragleave={fxRow.leave} ondrop={fxRow.drop} role="list">
          {#each order as fx, i (fx)}
            {@const on = pg.values[EFFECT_ON[fx]] === 1}
            <div class="slot" role="listitem" class:off={!on} class:drop-before={fxRow.dropAt === i} class:drop-after={fxRow.dropAt === order.length && i === order.length - 1}>
              <Panel {pg} id={fx} compact={!on} rings={ringsOf} inactive={fx === "chorus" ? amountOff(pg.values.chorus) : fx === "delay" ? amountOff(pg.values.delayMix) : fx === "reverb" ? amountOff(pg.values.reverbMix) : null}>
                {#if fx === "distortion"}<LiveCanvas height={44} draw={viz.distortion(values, color)} />
                {:else if fx === "compressor"}<LiveCanvas height={44} draw={viz.compressor(engine, color)} />
                {:else if fx === "eq"}<LiveCanvas height={44} draw={viz.eq(engine, color)} />
                {:else if fx === "phaser"}<LiveCanvas height={44} draw={viz.phaser(engine, color)} />
                {:else if fx === "flanger"}<LiveCanvas height={44} draw={viz.flanger(engine, color)} />
                {:else if fx === "chorus"}<LiveCanvas height={44} draw={viz.chorus(engine, color)} />
                {:else if fx === "delay"}<LiveCanvas height={44} draw={viz.delay(values, () => pg.bpm, color)} />
                {:else}<LiveCanvas height={44} draw={viz.reverb(values, color)} />{/if}
              </Panel>
            </div>
          {/each}
        </div>
      {:else}
        {#key tab}
          <Panel {pg} id={tab} wide power={moves.some((m) => m.amount !== 0)} rings={ringsOf}>
            {#if tab === "ampEnv"}<LiveCanvas height={100} draw={viz.envelope(engine, "amp", () => AENV)} />
            {:else if tab === "filterEnv"}<LiveCanvas height={100} draw={viz.envelope(engine, "filter", () => FENV)} />
            {:else if tab === "modEnv"}<LiveCanvas height={100} draw={viz.envelope(engine, "mod", () => MENV)} />
            {:else if tab === "pitchEnv"}<LiveCanvas height={100} draw={viz.pitchEnvelope(engine, () => PENV)} />
            {:else if tab === "lfo"}<LiveCanvas height={100} draw={viz.lfo(engine, 0, () => LFO)} />
            {:else if tab === "lfo2"}<LiveCanvas height={100} draw={viz.lfo(engine, 1, () => LFO2)} />
            {:else if tab === "lfo3"}<LiveCanvas height={100} draw={viz.lfo(engine, 2, () => LFO3)} />
            {:else}<LiveCanvas height={100} draw={viz.playing(engine, () => pg.bend, () => pg.mod, () => PLAY)} />{/if}
            <div class="moves">
              <span class="dim">Moves</span>
              {#each moves as m, i (i)}
                <span class="move" class:dim={m.amount === 0} style:--c={sourceColor(m.source)} title={title(m)}>
                  {#if tab === "perf"}{SOURCE_NAMES[m.source]} {/if}→ {DEST_NAMES[m.dest]} <b>{m.text}</b>{#if m.route}<small>route {m.route}</small>{/if}
                </span>
              {:else}
                <span class="dim">nothing yet: drag its ○ onto a knob</span>
              {/each}
            </div>
          </Panel>
        {/key}
      {/if}
    </div>
  </div>

  <footer class="status">
    {#if pg.patch === "source"}
      <span class="patching">Pick a source: click a modulator's ○ in the tabs.</span>
      <button onclick={() => (pg.patch = null)}>Cancel</button>
    {:else if typeof pg.patch === "number"}
      <span class="patching">From <b style:color={sourceColor(MOD_SOURCES[pg.patch] as Exclude<ModSource, "off">)}>{SOURCE_NAMES[MOD_SOURCES[pg.patch]]}</b>: click the knob it should move.</span>
      <button onclick={() => (pg.patch = null)}>Cancel</button>
    {:else}
      <span class="about"><b>{focusDef.title}</b> {focusDef.short}</span>
    {/if}
    <span class="knobmap" title="Click a panel to put the MiniLab knobs on it · the encoder switches knob pages">
      <span class="dim">Knobs → {page.name}</span>
      {#each page.knobs as id, i (i)}
        <span class="k" class:hot={id && pg.touched?.param === id}><i>{i + 1}</i>{#if id}{paramLabel(id, pg.values, PARAMS[id].label)} <small>{formatValue(id, pg.values[id])}</small>{:else}—{/if}</span>
      {/each}
    </span>
  </footer>

  {#if drag.state}
    {@const d = drag.state}
    {@const c = sourceColor(MOD_SOURCES[d.src] as Exclude<ModSource, "off">)}
    {@const k = Math.max(28, Math.hypot(d.x - d.x0, d.y - d.y0) * 0.35)}
    <!-- The cable being dragged: the only cable this view draws, gone when it is dropped. -->
    <svg class="dragging">
      <path d="M {d.x0} {d.y0} C {d.x0} {d.y0 - k}, {d.x} {d.y + (d.y > d.y0 ? -k : k) * 0.3}, {d.x} {d.y}" stroke={c} />
      <circle cx={d.x} cy={d.y} r="5" fill={c} />
    </svg>
    <div class="drag-hint" class:remove={d.route !== null && d.over === null} style:left="{d.x + 12}px" style:top="{d.y + 10}px">{drag.hint}</div>
  {/if}
</div>

<style>
  /* The chassis: one dark frame around everything, like a plugin window. */
  .plugin {
    position: relative; display: grid; gap: 8px; padding: 10px;
    background: #0c1012; border: 1px solid #222a2e; border-radius: 10px; box-shadow: inset 0 1px 0 #ffffff08, 0 6px 24px #0006;
  }
  .engine { display: grid; gap: 8px; align-items: stretch; }
  .engine.top { grid-template-columns: 1fr 1fr 1fr; }
  .engine.bottom { grid-template-columns: 0.7fr 1.8fr 1.1fr 0.7fr 0.8fr; }

  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .pair > div { position: relative; }
  .pair span { font-size: 10px; color: var(--dim); }
  .pair .off { opacity: 0.45; }
  .listen-mini { position: absolute; top: -2px; right: 0; padding: 0 3px; font-size: 10px; line-height: 14px; background: none; opacity: 0.55; }
  .listen-mini.on { opacity: 1; background: #ffcc33; border-color: #ffcc33; }

  .tag {
    display: inline-flex; align-items: center; gap: 3px; padding: 0 6px; font-size: 10px; line-height: 16px; color: var(--dim);
    border: 1px solid #2b3539; border-radius: 8px;
  }
  .tag i { width: 7px; height: 7px; border-radius: 50%; }
  .tag i.dim { opacity: 0.3; }
  .tag.droppable { border: 1px dashed #ffcc33aa; color: #ffe08a; cursor: crosshair; }
  .tag.over { background: #ffcc33; color: #111; }

  /* The lower half: a tab per modulator (with its socket), then the matrix and the effects. */
  .lower { display: grid; }
  .tabs { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 2px; }
  .tabs .gap { flex: 1; }
  /* Flat tabs: only the open one has a frame, joined to the page under it. A modulator's colour is its socket. */
  .tab {
    position: relative; display: flex; align-items: center; gap: 4px; padding: 0 6px 0 0; margin-bottom: -1px;
    border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0;
  }
  .tab:hover { background: #ffffff06; }
  .tab button[role="tab"] { background: none; border: none; padding: 4px 4px 4px 10px; font-size: 11.5px; color: var(--dim); white-space: nowrap; }
  .tab.plain button[role="tab"] { padding-right: 10px; }
  .tab:hover button[role="tab"] { color: var(--text); }
  .tab.on { z-index: 1; background: #12181a; border-color: #222a2e; }
  /* Not bold: a wider label would push the other tabs along. The frame marks the open tab. */
  .tab.on button[role="tab"] { color: var(--text); }
  .tab small { margin-left: 5px; font: 10px var(--mono); color: var(--dim); }
  .tabpage { border: 1px solid #222a2e; border-radius: 0 6px 6px 6px; background: #12181a; padding: 8px; min-height: 172px; }

  /* A modulator's socket: drag from it onto a knob. */
  .jack {
    display: inline-flex; align-items: center; gap: 3px; padding: 0; background: none; border: none; cursor: grab; touch-action: none;
    font: 9px var(--mono); color: var(--dim);
  }
  .jack::before { content: ""; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--c); background: #0b0e10; }
  .jack:hover::before, .jack:focus-visible::before { background: color-mix(in srgb, var(--c) 50%, transparent); }
  .jack.armed::before { background: var(--c); }

  .moves { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 11px; margin-top: 4px; }
  .move { display: inline-flex; gap: 4px; align-items: baseline; padding: 0 7px; line-height: 18px; border-radius: 9px; border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); }
  .move b { font: 10px var(--mono); color: var(--c); }
  .move small { font-size: 9.5px; color: var(--dim); }
  .move.dim { opacity: 0.45; }
  .dim { color: var(--dim); }

  .fxrack { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: start; }
  .slot { flex: 1 1 170px; min-width: 0; position: relative; }
  .slot.off { flex: 0 1 auto; }
  .slot.drop-before::before, .slot.drop-after::after { content: ""; position: absolute; top: 0; bottom: 0; width: 3px; border-radius: 2px; background: #ffcc33; z-index: 2; }
  .slot.drop-before::before { left: -10px; }
  .slot.drop-after::after { right: -10px; }

  /* The status bar: what the knobs are on, like a plugin's footer. */
  .status {
    display: flex; align-items: center; gap: 16px; min-height: 26px; padding: 3px 10px; font-size: 11px;
    background: #0a0e0f; border: 1px solid #1d2427; border-radius: 6px;
  }
  .about { flex: 1; min-width: 0; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .about b { color: var(--accent); margin-right: 4px; }
  .patching { flex: 1; color: #ffe08a; }
  .status button { font-size: 11px; padding: 0 8px; }
  .knobmap { display: flex; gap: 10px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  .knobmap .k { color: var(--text); }
  .knobmap .k i { font: normal 600 9px var(--mono); color: #0b1314; background: var(--accent); border-radius: 50%; display: inline-grid; place-items: center; width: 13px; height: 13px; margin-right: 3px; }
  .knobmap .k small { font: 10px var(--mono); color: var(--dim); }
  .knobmap .k.hot, .knobmap .k.hot small { color: var(--accent); }

  .dragging { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; overflow: visible; }
  .dragging path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 6 5; }
  .drag-hint {
    position: absolute; z-index: 5; pointer-events: none; white-space: nowrap; font-size: 11px; padding: 1px 6px; border-radius: 4px;
    background: #0b1314; border: 1px solid #ffcc33; color: #ffe08a;
  }
  .drag-hint.remove { border-color: #ff6b6b; color: #ff9b9b; }

  @media (max-width: 1100px) {
    .engine.top { grid-template-columns: 1fr 1fr; }
    .engine.bottom { grid-template-columns: 1fr 1fr; }
    .knobmap { display: none; }
  }
</style>
