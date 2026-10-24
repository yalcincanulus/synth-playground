<script lang="ts">
  import { formatValue, LFO_SYNC_BEATS, PARAMS } from "../../audio/params";
  import type { Playground } from "../playground.svelte";
  import Block from "./Block.svelte";
  import { BLOCKS, KNOB_PAGES, TAP_NAMES } from "./blocks";
  import Cables, { type Cable } from "./Cables.svelte";
  import LiveCanvas from "./LiveCanvas.svelte";
  import * as viz from "./viz";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  let engine = $derived(pg.engine);
  let taps = $derived(engine.taps);
  const color = () => accent;
  const values = () => pg.values;
  const noise = () => () => Math.random() * 2 - 1;

  // Modulation colours, shared by cables, legend and block visuals.
  const LFO = "#ffcc33";
  const LFO2 = "#ff9f43";
  const FENV = "#ff7ab6";
  const AENV = "#7ab8ff";
  const PLAY = "#b388ff";
  const PENV = "#5ee0a0";
  const OSC = "#ff6b6b";

  let container = $state<HTMLElement>();

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
      audio("filter", "amp", "r", "l"),
      audio("amp", "chorus", "b", "t"),
      // Delay and reverb are sends: copies go out to the right and come back into the output.
      audio("chorus", "output", "b", "t", "Dry signal"),
      audio("chorus", "delay", "r", "l", "Delay send"),
      audio("chorus", "reverb", "r", "l", "Reverb send"),
      audio("delay", "output", "l", "r", "Echoes"),
      audio("reverb", "output", "l", "r", "Reverb tail"),
    ];

    // LFOs: depth per target (the mod strip adds to LFO 1's mod target); dash speed follows the LFO.
    const lfoTargets: [number, string, Cable["toSide"], string][] = [
      [0, "osc2", "r", "pitch"], [1, "filter", "b", "filter cutoff"], [2, "amp", "l", "volume"], [3, "osc1", "r", "pulse width"],
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
    list.push({ from: "perf", to: "osc2", fromSide: "t", toSide: "b", kind: "mod", color: PLAY, width: 1.5 + Math.abs(pg.bend) * 4, idle: pg.bend === 0, label: "Pitch strip → oscillator pitch" });
    list.push({ from: "perf", to: "lfo", fromSide: "r", toSide: "l", kind: "mod", color: PLAY, width: 1.5 + pg.mod * 5, idle: pg.mod === 0, label: "Mod strip → LFO depth" });
    return list;
  });

  let page = $derived(KNOB_PAGES[pg.focusPage]);
  let focusDef = $derived(BLOCKS[pg.focusBlock]);
</script>

<section class="synth">
  <div class="bar">
    <div class="legend">
      <span><i style:background={accent}></i>sound</span>
      <span><i class="dash" style:color={LFO}></i>LFO 1</span>
      <span><i class="dash" style:color={LFO2}></i>LFO 2</span>
      <span><i class="dash" style:color={FENV}></i>filter envelope</span>
      <span><i class="dash" style:color={AENV}></i>amp envelope</span>
      <span><i class="dash" style:color={PENV}></i>pitch envelope</span>
      <span><i class="dash" style:color={OSC}></i>sync / FM</span>
      <span><i class="dash" style:color={PLAY}></i>your playing</span>
    </div>
    {#if pg.listening}
      <button class="listening" onclick={() => pg.listenTo(null)}>
        🎧 Listening to <strong>{TAP_NAMES[pg.listening]}</strong> only · click (or the encoder) for the full sound
      </button>
    {:else}
      <span class="hint">Click a block to put the MiniLab knobs on it · encoder switches knob pages · 🎧 or encoder click: listen at that point</span>
    {/if}
    <label class="explain-toggle"><input type="checkbox" checked={pg.explain} onchange={(e) => pg.setExplain(e.currentTarget.checked)} /> Explanations</label>
  </div>

  <aside class="detail">
    <div class="about">
      <h3>{focusDef.title}</h3>
      <p>{focusDef.explain}</p>
    </div>
    <p class="try"><strong>Try this:</strong> {focusDef.tryThis}</p>
    <div class="knobmap">
      <div class="title">MiniLab knobs → {page.name}</div>
      <ol>
        {#each page.knobs as id, i (i)}
          <li class:hot={id && pg.touched?.param === id}>
            <span class="n">{i + 1}</span>
            {#if id}{PARAMS[id].label}<span class="v">{formatValue(id, pg.values[id])}</span>{:else}<span class="v">—</span>{/if}
          </li>
        {/each}
      </ol>
    </div>
  </aside>

  <div class="diagram" bind:this={container}>
    <div class="col">
      <Block {pg} id="osc1"><LiveCanvas height={40} draw={viz.scope(() => taps.osc1, color, () => viz.oscIdeal(pg.values, 0))} /></Block>
      <Block {pg} id="osc2" inactive={pg.values.oscMix < 0.01 ? (pg.values.fmAmount >= 0.01 ? "FM only" : "mixed out") : null}>
        <LiveCanvas height={40} draw={viz.scope(() => taps.osc2, color, () => viz.oscIdeal(pg.values, 1))} />
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
              <LiveCanvas height={34} draw={viz.scope(() => taps[tap], color, tap === "sub" ? () => viz.idealWave(3) : noise)} />
            </div>
          {/each}
        </div>
      </Block>
      <Block {pg} id="mixer">
        <LiveCanvas height={50} draw={viz.mixer(values, color)} />
        <LiveCanvas height={34} draw={viz.scope(() => taps.mix, color)} />
      </Block>
      <Block {pg} id="drive" inactive={pg.values.drive < 0.01 ? "off" : null}>
        <LiveCanvas height={56} draw={viz.drive(values, color)} />
        <LiveCanvas height={34} draw={viz.scope(() => taps.drive, color)} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="filter">
        <LiveCanvas height={110} draw={viz.filter(engine, color)} />
        <LiveCanvas height={40} draw={viz.scope(() => taps.filter, color)} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="amp"><LiveCanvas height={56} draw={viz.scope(() => taps.amp, color)} /></Block>
      <Block {pg} id="chorus" inactive={pg.values.chorus < 0.01 ? "off" : null}><LiveCanvas height={34} draw={viz.chorus(engine, color)} /></Block>
      <Block {pg} id="output">
        <LiveCanvas height={30} draw={viz.output(() => taps.out, color)} />
        <LiveCanvas height={34} draw={viz.scope(() => taps.out, color)} />
      </Block>
    </div>

    <div class="col">
      <Block {pg} id="delay" inactive={pg.values.delayMix < 0.01 ? "off" : null}><LiveCanvas height={40} draw={viz.delay(values, () => pg.bpm, color)} /></Block>
      <Block {pg} id="reverb" inactive={pg.values.reverbMix < 0.01 ? "off" : null}><LiveCanvas height={36} draw={viz.reverb(values, color)} /></Block>
    </div>

    <div class="mods">
      <Block {pg} id="pitchEnv"><LiveCanvas height={56} draw={viz.pitchEnvelope(engine, () => PENV)} /></Block>
      <Block {pg} id="perf"><LiveCanvas height={60} draw={viz.playing(engine, () => pg.bend, () => pg.mod, () => PLAY)} /></Block>
      <Block {pg} id="lfo"><LiveCanvas height={56} draw={viz.lfo(engine, 0, () => LFO)} /></Block>
      <Block {pg} id="lfo2"><LiveCanvas height={56} draw={viz.lfo(engine, 1, () => LFO2)} /></Block>
      <Block {pg} id="filterEnv"><LiveCanvas height={70} draw={viz.envelope(engine, "filter", () => FENV)} /></Block>
      <Block {pg} id="ampEnv"><LiveCanvas height={70} draw={viz.envelope(engine, "amp", () => AENV)} /></Block>
    </div>

    {#if container}<Cables {container} {cables} />{/if}
  </div>
</section>

<style>
  .synth { display: grid; gap: 10px; }
  .bar { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .legend { display: flex; gap: 14px; font-size: 12px; color: var(--dim); }
  .legend i { display: inline-block; width: 18px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
  .legend i.dash { background: repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 9px); }
  .hint { color: var(--dim); font-size: 12px; flex: 1; }
  .explain-toggle { font-size: 12px; display: flex; align-items: center; gap: 6px; }

  .diagram {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr 1.25fr 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 36px 34px;
    align-items: start;
  }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .pair span { font-size: 10px; color: var(--dim); }
  .pair .off { opacity: 0.45; }
  .pair > div { position: relative; }
  .listen-mini { position: absolute; top: -2px; right: 0; padding: 0 3px; font-size: 10px; line-height: 14px; background: none; opacity: 0.55; }
  .listen-mini.on { opacity: 1; background: #ffcc33; border-color: #ffcc33; }
  .listening { flex: 1; text-align: left; background: #ffcc3322; border-color: #ffcc33; color: #ffe08a; font-size: 12px; }
  /* The modulators: one row of six under the signal path. */
  .mods { grid-row: 2; grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, 1fr); gap: 34px; align-items: start; }
  .detail {
    display: grid; grid-template-columns: 1.6fr 1fr 1.3fr; gap: 20px; align-items: start;
    background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; font-size: 12px; line-height: 1.4;
  }
  .detail h3 { margin: 0 0 2px; font-size: 14px; color: var(--accent); }
  .detail p { margin: 0; color: #b9c5c8; }
  .try strong { color: var(--text); }
  .knobmap .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(4, auto); gap: 2px 14px; }
  li { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  li.hot { color: var(--accent); }
  .n { font: 600 10px var(--mono); color: var(--dim); }
  .v { margin-left: auto; font: 10px var(--mono); color: var(--dim); }
</style>
