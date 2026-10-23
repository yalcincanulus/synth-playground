<script lang="ts">
  import { formatValue, PARAMS } from "../../audio/params";
  import type { Playground } from "../playground.svelte";
  import Block from "./Block.svelte";
  import { BLOCKS, KNOB_PAGES } from "./blocks";
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
  const FENV = "#ff7ab6";
  const AENV = "#7ab8ff";
  const PLAY = "#b388ff";

  let container = $state<HTMLElement>();

  let cables = $derived.by((): Cable[] => {
    const v = pg.values;
    const audio = (from: string, to: string, fromSide: Cable["fromSide"], toSide: Cable["toSide"], label?: string): Cable => ({
      from, to, fromSide, toSide, kind: "audio", color: accent, width: 3, label,
    });
    const list: Cable[] = [
      audio("osc1", "mixer", "r", "l"),
      audio("osc2", "mixer", "r", "l"),
      audio("subNoise", "mixer", "r", "l"),
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

    // LFO: depth per target, including what the mod strip adds.
    const depth = (target: number) => Math.min(1, (v.lfoTarget === target ? v.lfoDepth : 0) + (v.modTarget === target ? pg.mod : 0));
    const period = Math.min(8, Math.max(0.15, 1 / v.lfoRate));
    const lfoTargets: [number, string, Cable["toSide"], string][] = [[0, "osc2", "r", "pitch"], [1, "filter", "b", "filter cutoff"], [2, "amp", "l", "volume"]];
    for (const [target, to, toSide, what] of lfoTargets) {
      const d = depth(target);
      if (d > 0 || v.lfoTarget === target)
        list.push({ from: "lfo", to, fromSide: "t", toSide, kind: "mod", color: LFO, width: 1.5 + d * 5, period, idle: d === 0, label: `LFO → ${what}` });
    }
    const envAmt = Math.abs(v.filterEnvAmt);
    list.push({ from: "filterEnv", to: "filter", fromSide: "t", toSide: "b", kind: "mod", color: FENV, width: 1.5 + Math.min(1, envAmt / 4) * 5, idle: envAmt < 0.05, label: "Filter envelope → cutoff" });
    list.push({ from: "ampEnv", to: "amp", fromSide: "t", toSide: "l", kind: "mod", color: AENV, width: 4, label: "Amp envelope → volume" });
    list.push({ from: "perf", to: "subNoise", fromSide: "t", toSide: "b", kind: "mod", color: PLAY, width: 1.5 + Math.abs(pg.bend) * 4, idle: pg.bend === 0, label: "Pitch strip → oscillator pitch" });
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
      <span><i class="dash" style:color={LFO}></i>LFO</span>
      <span><i class="dash" style:color={FENV}></i>filter envelope</span>
      <span><i class="dash" style:color={AENV}></i>amp envelope</span>
      <span><i class="dash" style:color={PLAY}></i>your playing</span>
    </div>
    <span class="hint">Click a block to put the MiniLab knobs on it · encoder switches knob pages</span>
    <label class="explain-toggle"><input type="checkbox" checked={pg.explain} onchange={(e) => pg.setExplain(e.currentTarget.checked)} /> Explanations</label>
  </div>

  <div class="diagram" bind:this={container}>
    <div class="col">
      <Block {pg} id="osc1"><LiveCanvas height={40} draw={viz.scope(() => taps.osc1, color, () => viz.idealWave(pg.values.osc1Wave))} /></Block>
      <Block {pg} id="osc2" inactive={pg.values.oscMix < 0.01 ? "mixed out" : null}>
        <LiveCanvas height={40} draw={viz.scope(() => taps.osc2, color, () => viz.idealWave(pg.values.osc2Wave))} />
      </Block>
      <Block {pg} id="subNoise" inactive={pg.values.subLevel < 0.01 && pg.values.noiseLevel < 0.01 ? "both at 0" : null}>
        <div class="pair">
          <div class:off={pg.values.subLevel < 0.01}><span>Sub</span><LiveCanvas height={34} draw={viz.scope(() => taps.sub, color, () => viz.idealWave(3))} /></div>
          <div class:off={pg.values.noiseLevel < 0.01}><span>Noise</span><LiveCanvas height={34} draw={viz.scope(() => taps.noise, color, noise)} /></div>
        </div>
      </Block>
    </div>

    <div class="col">
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

    <div class="col mods">
      <Block {pg} id="perf"><LiveCanvas height={60} draw={viz.playing(engine, () => pg.bend, () => pg.mod, () => PLAY)} /></Block>
    </div>
    <div class="col mods">
      <Block {pg} id="lfo"><LiveCanvas height={70} draw={viz.lfo(engine, () => LFO)} /></Block>
    </div>
    <div class="col mods">
      <Block {pg} id="filterEnv"><LiveCanvas height={80} draw={viz.envelope(engine, "filter", () => FENV)} /></Block>
    </div>
    <div class="col mods">
      <Block {pg} id="ampEnv"><LiveCanvas height={80} draw={viz.envelope(engine, "amp", () => AENV)} /></Block>
    </div>

    <aside class="detail">
      <h3>{focusDef.title}</h3>
      <p>{focusDef.explain}</p>
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
  .mods { grid-row: 2; }
  .detail {
    grid-row: 2; position: relative; z-index: 1; background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px;
    font-size: 12px; line-height: 1.4;
  }
  .detail h3 { margin: 0 0 4px; font-size: 14px; color: var(--accent); }
  .detail p { margin: 0 0 8px; color: #b9c5c8; }
  .try strong { color: var(--text); }
  .knobmap .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; }
  li { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  li.hot { color: var(--accent); }
  .n { font: 600 10px var(--mono); color: var(--dim); }
  .v { margin-left: auto; font: 10px var(--mono); color: var(--dim); }
</style>
