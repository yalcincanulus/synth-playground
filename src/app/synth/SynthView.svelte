<script lang="ts">
  import { EFFECT_ON, effectChain, effectOrder, formatValue, LFO_SYNC_BEATS, MOD_DESTS, MOD_SOURCES, PARAMS, slotIds } from "../../audio/params";
  import type { Playground } from "../playground.svelte";
  import Block from "./Block.svelte";
  import { BLOCKS, DEST_BLOCK, jackAt, KNOB_PAGES, paramLabel, SOURCE_BLOCK, TAP_NAMES } from "./blocks";
  import MatrixPanel from "./MatrixPanel.svelte";
  import RecipeList from "../recipes/RecipeList.svelte";
  import RecipePanel from "../recipes/RecipePanel.svelte";
  import Cables, { type Cable } from "./Cables.svelte";
  import LiveCanvas from "./LiveCanvas.svelte";
  import { PatchDrag, providePatchDrag } from "./patchDrag.svelte";
  import * as viz from "./viz";
  import { AENV, COLORS, FENV, LFO, LFO2, LFO3, MENV, OSC, PENV, PLAY } from "./colors";
  import { EffectRow } from "./effectRow.svelte";
  import PanelView from "./PanelView.svelte";
  import { spectrogram } from "../components/spectrogram";
  import { noCables } from "../media.svelte";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  let engine = $derived(pg.engine);
  // The selected part's stages: follows the part switch.
  let taps = $derived((pg.part, engine.taps));
  const color = () => accent;
  const values = () => pg.values;
  const noise = () => () => Math.random() * 2 - 1;

  /** Where matrix route cables land on each destination block. */
  const DEST_SIDE: Partial<Record<string, Cable["toSide"]>> = { osc1: "r", osc2: "r", filter: "b", filter2: "r", amp: "l", mixer: "r", lfo: "t", lfo2: "t", lfo3: "t" };

  // Two looks: the cables, drawn between the blocks, or a plugin-style panel. Remembered per browser.
  const LAYOUT_KEY = "minilab3.synthLayout";
  let chosen = $state<"cables" | "panel">(localStorage.getItem(LAYOUT_KEY) === "panel" ? "panel" : "cables");
  function setLayout(to: "cables" | "panel") {
    chosen = to;
    localStorage.setItem(LAYOUT_KEY, to);
  }
  // The cables need a wide screen: narrower than that, the panel, and the choice comes back when there is room.
  let layout = $derived(noCables.current ? "panel" : chosen);

  let container = $state<HTMLElement>();
  const drag = new PatchDrag(() => pg, () => container);
  providePatchDrag(drag);

  let cables = $derived.by((): Cable[] => {
    const v = pg.values;
    const audio = (from: string, to: string, fromSide: Cable["fromSide"], toSide: Cable["toSide"], label?: string): Cable => ({
      from, to, fromSide, toSide, kind: "audio", color: accent, width: 3, label,
    });
    const list: Cable[] = [
      audio("osc1", "mixer", "r", "l"),
      audio("osc2", "mixer", "r", "l"),
      audio("subNoise", "mixer", "b", "t"),
      audio("mixer", "drive", "b", "t"),
      audio("drive", "filter", "r", "l"),
      // Filter 2: after Filter 1 (series), or beside it on the same input, added at the amp (parallel).
      ...(v.filter2Mode === 1
        ? [audio("filter", "filter2", "b", "t"), audio("filter2", "amp", "r", "l")]
        : v.filter2Mode === 2
          ? [audio("filter", "amp", "r", "l"), audio("drive", "filter2", "r", "l"), audio("filter2", "amp", "r", "l")]
          : [audio("filter", "amp", "r", "l")]),
    ];
    // The effects that are on, one after another along the effect row (the ones that are off are passed by).
    const chain = ["amp", ...effectChain(v), "output"];
    for (let i = 0; i + 1 < chain.length; i++) {
      const [from, to] = [chain[i], chain[i + 1]];
      const sides: [Cable["fromSide"], Cable["toSide"]] = from === "amp" ? ["b", "t"] : to === "output" ? ["t", "b"] : ["r", "l"];
      list.push(audio(from, to, ...sides));
    }

    // LFOs: depth per target (the mod strip adds to LFO 1's mod target); dash speed follows the LFO.
    const lfoTargets: [number, string, Cable["toSide"], string][] = [
      [0, "osc2", "r", "pitch"], [1, "filter", "b", "filter cutoff"], [2, "amp", "l", "volume"], [3, "osc1", "r", "pulse width"], [4, "osc1", "r", "wavetable position"],
    ];
    const lfoSetups = [
      { from: "lfo", color: LFO, target: v.lfoTarget, depth: v.lfoDepth, rate: v.lfoRate, sync: v.lfoSync, mod: true },
      { from: "lfo2", color: LFO2, target: v.lfo2Target, depth: v.lfo2Depth, rate: v.lfo2Rate, sync: v.lfo2Sync, mod: false },
    ];
    for (const lfo of lfoSetups) {
      const hz = lfo.sync ? pg.bpm / 60 / LFO_SYNC_BEATS[lfo.sync] : lfo.rate;
      const period = Math.min(8, Math.max(0.15, 1 / hz));
      for (const [target, to, toSide, what] of lfoTargets) {
        const d = Math.min(1, (lfo.target === target ? lfo.depth : 0) + (lfo.mod && v.modTarget === target ? pg.mod : 0));
        if (d > 0 || lfo.target === target)
          list.push({ from: lfo.from, to, fromSide: "t", toSide, kind: "mod", color: lfo.color, width: 1.5 + d * 5, period, idle: d === 0, label: `${lfo.from === "lfo" ? "LFO 1" : "LFO 2"} → ${what}` });
      }
    }
    const envAmt = Math.abs(v.filterEnvAmt);
    list.push({ from: "filterEnv", to: "filter", fromSide: "t", toSide: "b", kind: "mod", color: FENV, width: 1.5 + Math.min(1, envAmt / 4) * 5, idle: envAmt < 0.05, label: "Filter envelope → cutoff" });
    list.push({ from: "ampEnv", to: "amp", fromSide: "t", toSide: "l", kind: "mod", color: AENV, width: 4, label: "Amp envelope → volume" });
    // Pitch envelope: up the left edge into the oscillators it moves.
    const penv = Math.abs(v.pitchEnvAmt);
    list.push({
      from: "pitchEnv", to: v.pitchEnvTarget ? "osc2" : "osc1", fromSide: "l", toSide: "l", reach: 26, kind: "mod", color: PENV,
      width: 1.5 + Math.min(1, penv / 24) * 5, period: 0.8, idle: penv < 0.05, label: `Pitch envelope → ${v.pitchEnvTarget ? "Osc 2" : "both oscillators'"} pitch`,
    });
    // Oscillator to oscillator, at audio speed: two short cables in the gap between Osc 1 and Osc 2.
    list.push({ from: "osc1", to: "osc2", fromSide: "b", toSide: "t", fromAt: 0.3, toAt: 0.3, kind: "mod", color: OSC, width: 3, period: 0.15, idle: !v.oscSync, label: "Sync: Osc 1 restarts Osc 2" });
    list.push({ from: "osc2", to: "osc1", fromSide: "t", toSide: "b", fromAt: 0.7, toAt: 0.7, kind: "mod", color: OSC, width: 1.5 + v.fmAmount * 5, period: 0.15, idle: v.fmAmount < 0.01, label: "FM: Osc 2 bends Osc 1's pitch" });
    // Mod matrix routes: from the source's block to the destination's, in the source's colour.
    for (const n of pg.routes) {
      const ids = slotIds(n);
      const src = MOD_SOURCES[v[ids.src]];
      if (src === "off") continue;
      const dest = MOD_DESTS[v[ids.dst]];
      const from = SOURCE_BLOCK[src];
      const to = DEST_BLOCK[dest];
      const amt = Math.abs(v[ids.amt]);
      const lfoIndex = ["lfo 1", "lfo 2", "lfo 3"].indexOf(src);
      const period = lfoIndex >= 0 ? Math.min(8, Math.max(0.15, 1 / engine.lfoRate(lfoIndex))) : 1.2;
      list.push({
        from, to, fromSide: "t", toSide: DEST_SIDE[to] ?? "b", fromAt: jackAt(v[ids.src]), toAt: 0.2 + 0.08 * n, kind: "mod", color: COLORS[from],
        width: 1.5 + amt * 5, period, idle: amt === 0, label: `Route ${n}: ${src} → ${dest} (${formatValue(ids.amt, v[ids.amt])})`,
        route: { n, src: v[ids.src] },
      });
    }
    list.push({ from: "perf", to: "osc2", fromSide: "t", toSide: "b", kind: "mod", color: PLAY, width: 1.5 + Math.abs(pg.bend) * 4, idle: pg.bend === 0, label: "Pitch strip → oscillator pitch" });
    list.push({ from: "perf", to: "lfo", fromSide: "r", toSide: "l", kind: "mod", color: PLAY, width: 1.5 + pg.mod * 5, idle: pg.mod === 0, label: "Mod strip → LFO depth" });
    return list;
  });

  let page = $derived(KNOB_PAGES[pg.focusPage]);
  /** The detail panel shows the full explanation only when asked: it would push the diagram down. */
  let more = $state(false);

  // The modulator row folds to a strip of titles (cables still reach them); remembered per browser.
  const MODS_OPEN_KEY = "minilab3.modulators";
  let modsOpen = $state(localStorage.getItem(MODS_OPEN_KEY) !== "closed");
  function toggleMods() {
    modsOpen = !modsOpen;
    localStorage.setItem(MODS_OPEN_KEY, modsOpen ? "open" : "closed");
  }
  let focusDef = $derived(BLOCKS[pg.focusBlock]);

  // The effect row, in the order they run; drag a block's handle to move it.
  let order = $derived(effectOrder(pg.values));
  const fxRow = new EffectRow(() => pg);

  const amountOff = (amount: number) => (amount < 0.01 ? "at 0" : null);
</script>

<section class="synth">
  {#if !noCables.current}
  <div class="layout" role="group" aria-label="Synth view mode">
    <span class="label">View</span>
    <div class="modes">
      <button data-label="Cables" class:active={layout === "cables"} aria-pressed={layout === "cables"} title="The blocks with cables between them: what moves what, drawn" onclick={() => setLayout("cables")}>Cables</button>
      <button data-label="Panel" class:active={layout === "panel"} aria-pressed={layout === "panel"} title="A plugin-style panel: modulation shows as rings around the knobs it moves" onclick={() => setLayout("panel")}>Panel</button>
    </div>
  </div>
  {/if}
  {#if pg.recipeList}<RecipeList {pg} />{/if}
  {#if pg.listening}
    <button class="listening" onclick={() => pg.listenTo(null)}>
      🎧 Listening to <strong>{TAP_NAMES[pg.listening]}</strong> only · click{pg.hw(" (or the encoder)")} for the full sound
    </button>
  {/if}

  {#if layout === "panel"}
    {#if pg.recipe}<RecipePanel {pg} />{/if}
    <PanelView {pg} {accent} />
  {:else}
  {#if pg.recipe}
    <RecipePanel {pg} />
  {:else}
    <aside class="detail" class:explained={pg.explain} class:solo={!pg.hasDevice}>
      <div class="about">
        <h3>{focusDef.title}</h3>
        {#if pg.explain}
          <p class:clamped={!more}>{focusDef.explain}</p>
          <p class="try" class:clamped={!more}><strong>Try this:</strong> {focusDef.tryThis}</p>
          <button class="more" onclick={() => (more = !more)}>{more ? "Less" : "More"}</button>
        {:else}
          {#if pg.hasDevice}
            <p class="hint">Click a block to put the MiniLab knobs on it. The encoder switches knob pages; 🎧 or an encoder click listens at that point.</p>
          {:else}
            <p class="hint">Click a block to select it; 🎧 listens at that point.</p>
          {/if}
        {/if}
      </div>
      {#if pg.hasDevice}
      <div class="knobmap">
        <div class="title" title="Click a block to put the MiniLab knobs on it · the encoder switches knob pages">MiniLab knobs → {page.name}</div>
        <ol>
          {#each page.knobs as id, i (i)}
            <li class:hot={id && pg.touched?.param === id}>
              <span class="n">{i + 1}</span>
              {#if id}{paramLabel(id, pg.values, PARAMS[id].label)}<span class="v">{formatValue(id, pg.values[id])}</span>{:else}<span class="v">—</span>{/if}
            </li>
          {/each}
        </ol>
      </div>
      {/if}
    </aside>
  {/if}

  <MatrixPanel {pg} colors={COLORS} />

  <div class="diagram" bind:this={container}>
    <div class="col">
      <Block {pg} id="osc1" inactive={pg.values.oscMix > 0.99 ? (pg.values.oscSync ? "sync only" : "mixed out") : null}><LiveCanvas height={32} draw={viz.scope(() => taps.osc1, color, () => viz.oscIdeal(pg.values, 0, engine))} /></Block>
      <Block {pg} id="osc2" inactive={pg.values.oscMix < 0.01 ? (pg.values.fmAmount >= 0.01 ? "FM only" : "mixed out") : null}>
        <LiveCanvas height={32} draw={viz.scope(() => taps.osc2, color, () => viz.oscIdeal(pg.values, 1, engine))} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="subNoise" inactive={pg.values.subLevel < 0.01 && pg.values.noiseLevel < 0.01 ? "both at 0" : null}>
        <div class="pair">
          {#each [["sub", "Sub"], ["noise", "Noise"]] as const as [tap, name] (tap)}
            <div class:off={(tap === "sub" ? pg.values.subLevel : pg.values.noiseLevel) < 0.01}>
              <span>{name}</span>
              <button
                class="listen-mini"
                class:on={pg.listening === tap}
                title="Listen to {name} on its own"
                onclick={(e) => {
                  e.stopPropagation();
                  pg.listenTo(tap);
                }}>🎧</button
              >
              <LiveCanvas height={22} draw={viz.scope(() => taps[tap], color, tap === "sub" ? () => viz.idealWave(3) : noise)} />
            </div>
          {/each}
        </div>
      </Block>
      <Block {pg} id="mixer">
        <LiveCanvas height={30} draw={viz.mixer(values, color)} />
        <LiveCanvas height={22} draw={viz.scope(() => taps.mix, color)} />
      </Block>
      <Block {pg} id="drive" inactive={pg.values.drive < 0.01 ? "off" : null}>
        <LiveCanvas height={40} draw={viz.drive(values, color)} />
        <LiveCanvas height={22} draw={viz.scope(() => taps.drive, color)} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="filter">
        <LiveCanvas height={76} draw={viz.filter(engine, color)} />
        <!-- What comes out, over time: the dark area above the dashed cutoff is what the filter takes away. -->
        <LiveCanvas height={40} draw={spectrogram(() => taps.filter, color, () => ({ hz: viz.liveCutoff(engine), label: "cutoff" }))} />
      </Block>
      <Block {pg} id="filter2" inactive={pg.values.filter2Mode === 0 ? "off" : null}>
        <LiveCanvas height={46} draw={viz.filter2(engine, color)} />
        <LiveCanvas height={22} draw={viz.scope(() => taps.filter2, color)} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="amp"><LiveCanvas height={40} draw={viz.scope(() => taps.amp, color)} /></Block>
    </div>

    <div class="col">
      <Block {pg} id="output">
        <LiveCanvas height={26} draw={viz.stereoMeter(() => engine.fx.meters.left, () => engine.fx.meters.right, color)} />
        <LiveCanvas height={48} draw={viz.stereoPicture(() => engine.fx.meters.left, () => engine.fx.meters.right, color)} />
      </Block>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fxrow" bind:this={fxRow.row} ondragover={fxRow.over} ondragleave={fxRow.leave} ondrop={fxRow.drop}>
      {#each order as fx, i (fx)}
        {@const on = pg.values[EFFECT_ON[fx]] === 1}
        <div class="slot" class:off={!on} class:drop-before={fxRow.dropAt === i} class:drop-after={fxRow.dropAt === order.length && i === order.length - 1}>
          <Block {pg} id={fx} compact={!on} inactive={fx === "chorus" ? amountOff(pg.values.chorus) : fx === "delay" ? amountOff(pg.values.delayMix) : fx === "reverb" ? amountOff(pg.values.reverbMix) : null}>
            {#if fx === "distortion"}<LiveCanvas height={40} draw={viz.distortion(values, color)} />
            {:else if fx === "compressor"}<LiveCanvas height={40} draw={viz.compressor(engine, color)} />
            {:else if fx === "eq"}<LiveCanvas height={40} draw={viz.eq(engine, color)} />
            {:else if fx === "phaser"}<LiveCanvas height={40} draw={viz.phaser(engine, color)} />
            {:else if fx === "flanger"}<LiveCanvas height={40} draw={viz.flanger(engine, color)} />
            {:else if fx === "chorus"}<LiveCanvas height={40} draw={viz.chorus(engine, color)} />
            {:else if fx === "delay"}<LiveCanvas height={40} draw={viz.delay(values, () => pg.bpm, color)} />
            {:else}<LiveCanvas height={40} draw={viz.reverb(values, color)} />{/if}
          </Block>
        </div>
      {/each}
    </div>

    <div class="modrow" class:folded={!modsOpen}>
      <div class="mods-head">
        <button class="fold" onclick={toggleMods} aria-expanded={modsOpen} title={modsOpen ? "Fold the modulators to a row of names" : "Show the modulators' pictures and controls"}>{modsOpen ? "▾" : "▸"} Modulators</button>
        {#if modsOpen}
          <div class="legend">
            <span><i style:background={accent}></i>sound</span>
            <span><i class="dash" style:color={LFO}></i>LFO 1</span>
            <span><i class="dash" style:color={LFO2}></i>LFO 2</span>
            <span><i class="dash" style:color={LFO3}></i>LFO 3</span>
            <span><i class="dash" style:color={FENV}></i>filter env</span>
            <span><i class="dash" style:color={AENV}></i>amp env</span>
            <span><i class="dash" style:color={PENV}></i>pitch env</span>
            <span><i class="dash" style:color={MENV}></i>mod env</span>
            <span><i class="dash" style:color={OSC}></i>sync / FM</span>
            <span><i class="dash" style:color={PLAY}></i>your playing</span>
          </div>
        {/if}
      </div>
      <div class="mods">
        <Block {pg} id="pitchEnv" compact={!modsOpen}><LiveCanvas height={44} draw={viz.pitchEnvelope(engine, () => PENV)} /></Block>
        <Block {pg} id="perf" compact={!modsOpen}><LiveCanvas height={48} draw={viz.playing(engine, () => pg.bend, () => pg.mod, () => PLAY)} /></Block>
        <Block {pg} id="lfo" compact={!modsOpen}><LiveCanvas height={44} draw={viz.lfo(engine, 0, () => LFO)} /></Block>
        <Block {pg} id="lfo2" compact={!modsOpen}><LiveCanvas height={44} draw={viz.lfo(engine, 1, () => LFO2)} /></Block>
        <Block {pg} id="lfo3" compact={!modsOpen}><LiveCanvas height={44} draw={viz.lfo(engine, 2, () => LFO3)} /></Block>
        <Block {pg} id="filterEnv" compact={!modsOpen}><LiveCanvas height={52} draw={viz.envelope(engine, "filter", () => FENV)} /></Block>
        <Block {pg} id="ampEnv" compact={!modsOpen}><LiveCanvas height={52} draw={viz.envelope(engine, "amp", () => AENV)} /></Block>
        <Block {pg} id="modEnv" compact={!modsOpen}><LiveCanvas height={52} draw={viz.envelope(engine, "mod", () => MENV)} /></Block>
      </div>
    </div>

    {#if container}<Cables {container} {cables} />{/if}
    {#if drag.state}
      {@const d = drag.state}
      {@const k = Math.max(28, Math.hypot(d.x - d.x0, d.y - d.y0) * 0.35)}
      <!-- The cable being dragged, above everything, from its source's socket to the pointer. -->
      <svg class="dragging">
        <path d="M {d.x0} {d.y0} C {d.x0} {d.y0 - k}, {d.x} {d.y + (d.y > d.y0 ? -k : k) * 0.3}, {d.x} {d.y}" stroke={COLORS[SOURCE_BLOCK[MOD_SOURCES[d.src] as keyof typeof SOURCE_BLOCK]]} />
        <circle cx={d.x} cy={d.y} r="5" fill={COLORS[SOURCE_BLOCK[MOD_SOURCES[d.src] as keyof typeof SOURCE_BLOCK]]} />
      </svg>
      <div class="drag-hint" class:remove={d.route !== null && d.over === null} style:left="{d.x + 12}px" style:top="{d.y + 10}px">{drag.hint}</div>
    {/if}
  </div>
  {/if}
</section>

<style>
  .synth { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  /* The look switch, top right; the view below starts level with it. */
  .layout { justify-self: end; display: flex; align-items: center; }
  .layout .label { margin-right: 8px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }
  /* Styled like the main view switch in the header. */
  .modes { display: flex; gap: 2px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .modes button { border: none; background: none; font-size: 13px; padding: 4px 16px; border-radius: 4px; color: var(--dim); }
  /* The bold label's width is kept, so the switch doesn't change size when clicked. */
  .modes button { display: inline-grid; justify-items: center; }
  .modes button::after { content: attr(data-label); font-weight: 600; height: 0; visibility: hidden; overflow: hidden; }
  .modes button:hover { color: var(--text); }
  .modes .active, .modes .active:hover { background: var(--accent); color: #0b1314; font-weight: 600; }
  .listening { text-align: left; background: #ffcc3322; border-color: #ffcc33; color: #ffe08a; font-size: 12px; }
  .detail {
    display: grid; grid-template-columns: 1fr 520px; gap: 20px; align-items: start;
    background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; font-size: 12px; line-height: 1.4;
  }
  .about { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; align-items: start; position: relative; }
  .about h3 { grid-column: 1 / -1; margin: 0; font-size: 14px; color: var(--accent); }
  .about p { margin: 0; color: #b9c5c8; }
  .about .hint { grid-column: 1 / -1; color: var(--dim); }
  /* Two lines each until "More" opens the whole text. */
  .clamped { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .more { position: absolute; top: 0; right: 0; font-size: 11px; padding: 0 8px; color: var(--dim); }
  .detail.solo { grid-template-columns: 1fr; }
  .try strong { color: var(--text); }
  .knobmap .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  /* Two rows of four, like the knobs on the MiniLab. */
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px 14px; }
  li { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  li.hot { color: var(--accent); }
  .n { font: 600 10px var(--mono); color: var(--dim); }
  .v { margin-left: auto; font: 10px var(--mono); color: var(--dim); }

  .diagram {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr 1.25fr 1fr 1fr;
    gap: 0 30px;
    align-items: start;
  }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .pair span { font-size: 10px; color: var(--dim); }
  .pair .off { opacity: 0.45; }
  .pair > div { position: relative; }
  .listen-mini { position: absolute; top: -2px; right: 0; padding: 0 3px; font-size: 10px; line-height: 14px; background: none; opacity: 0.55; }
  .listen-mini.on { opacity: 1; background: #ffcc33; border-color: #ffcc33; }
  /* The effects: one row, in the order they run; the ones that are off fold to their title. */
  .fxrow { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px 22px; padding-top: 22px; align-items: start; }
  .slot { flex: 1 1 150px; min-width: 0; position: relative; }
  .slot.off { flex: 0 1 auto; }
  .slot.drop-before::before, .slot.drop-after::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 3px; border-radius: 2px; background: #ffcc33; z-index: 2;
  }
  .slot.drop-before::before { left: -13px; }
  .slot.drop-after::after { right: -13px; }
  /* The modulators: one row of eight under the signal path, with the cable colours. */
  .modrow { grid-column: 1 / -1; display: grid; }
  .modrow.folded { display: flex; align-items: center; gap: 16px; padding-top: 14px; }
  .mods-head { display: flex; align-items: center; gap: 16px; padding: 12px 0 6px; position: relative; z-index: 1; }
  .folded .mods-head { padding: 0; }
  .fold { background: none; border: none; padding: 0; font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; }
  .legend { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 11px; color: var(--dim); }
  .legend i { display: inline-block; width: 16px; height: 3px; margin-right: 5px; vertical-align: middle; border-radius: 2px; }
  .legend i.dash { background: repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 9px); }
  .mods { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .dragging { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; overflow: visible; }
  .dragging path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 6 5; }
  .drag-hint {
    position: absolute; z-index: 5; pointer-events: none; white-space: nowrap; font-size: 11px; padding: 1px 6px; border-radius: 4px;
    background: #0b1314; border: 1px solid #ffcc33; color: #ffe08a;
  }
  .drag-hint.remove { border-color: #ff6b6b; color: #ff9b9b; }
  .folded .mods { flex: 1; gap: 12px; }
  @media (max-width: 1100px) {
    .detail { grid-template-columns: 1fr; }
  }
</style>
