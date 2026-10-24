<script lang="ts">
  import { formatValue, PARAMS } from "../../audio/params";
  import { WAVETABLES } from "../../audio/wavetables";
  import { surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";
  import { usesTable, WAVETABLE_KNOBS } from "../synth/blocks";
  import LiveCanvas from "../synth/LiveCanvas.svelte";
  import ParamControl from "../synth/ParamControl.svelte";
  import * as draw from "./draw";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  const color = () => accent;
  let engine = $derived(pg.engine);
  let table = $derived(WAVETABLES[pg.values.wtTable]);
  let active = $derived(usesTable(pg.values));
  let lfoOnPosition = $derived(pg.values.lfoTarget === 4 || pg.values.lfo2Target === 4 || pg.values.modTarget === 4);
</script>

<section class="wt">
  <aside class="detail">
    <div>
      <h3>Wavetable</h3>
      {#if pg.explain}
        <p>
          A wavetable is a stack of single waves ("frames"). <strong>Position</strong> picks a place in the stack and blends the
          frames next to it, so turning it morphs the sound smoothly from one wave to another. The magic is moving it while a note
          plays: send an LFO (or the mod strip) to <em>WT Pos</em>.
        </p>
      {/if}
    </div>
    <div>
      <h3>{table.name}</h3>
      <p>{table.explain}</p>
    </div>
    <div class="knobmap">
      <div class="title">MiniLab knobs · encoder picks the table</div>
      <ol>
        {#each WAVETABLE_KNOBS as id, i (i)}
          <li class:hot={pg.touched?.param === id}>
            <span class="n">{i + 1}</span>{PARAMS[id].label}<span class="v">{formatValue(id, pg.values[id])}</span>
          </li>
        {/each}
      </ol>
    </div>
  </aside>

  {#if !active}
    <div class="notice">
      Neither oscillator is playing the wavetable right now.
      <button onclick={() => pg.setParam("osc1Wave", 4)}>Play it on Osc 1</button>
    </div>
  {/if}

  <div class="main">
    <nav class="tables" aria-label="Wavetables">
      {#each WAVETABLES as def, i (i)}
        <button class:active={pg.values.wtTable === i} onclick={() => pg.selectTable(i)}>
          <canvas use:surface={{ draw: draw.thumbnail(i, pg.values.wtTable === i ? accent : "#9aa7ab"), key: pg.values.wtTable === i }}></canvas>
          <span>{def.name}</span>
        </button>
      {/each}
    </nav>

    <div class="view">
      <LiveCanvas height={330} draw={draw.stack(engine, color)} />
      <label class="scrub">
        <span>Position</span>
        <input type="range" min="0" max="1" step="0.001" value={pg.values.wtPos} oninput={(e) => pg.setParam("wtPos", +e.currentTarget.value)} />
        <span class="v">{formatValue("wtPos", pg.values.wtPos)}</span>
      </label>
    </div>

    <div class="side">
      <div class="panel">
        <div class="title">The wave right now</div>
        <LiveCanvas height={110} draw={draw.current(engine, color)} />
      </div>
      <div class="panel">
        <div class="title">Its harmonics</div>
        <LiveCanvas height={90} draw={draw.harmonics(engine, color)} />
        {#if pg.explain}<p class="note">Bar 1 is the note itself; the others are its overtones. Each wave is a different mix of them.</p>{/if}
      </div>
    </div>
  </div>

  <div class="controls">
    <div class="group">
      <div class="title">Oscillators</div>
      <div class="params">
        <ParamControl {pg} id="osc1Wave" />
        <ParamControl {pg} id="osc2Wave" />
        <ParamControl {pg} id="wtPos" />
        <ParamControl {pg} id="oscMix" />
      </div>
    </div>
    <div class="group">
      <div class="title">Move the position {#if lfoOnPosition}<span class="on">● moving</span>{/if}</div>
      {#if pg.explain}<p class="note">Set LFO 2 "To" to <em>WT Pos</em>, pick a shape and speed, then raise Depth. Or set the mod strip's target to <em>WT Pos</em> and scan with your finger.</p>{/if}
      <div class="params">
        <ParamControl {pg} id="lfo2Target" />
        <ParamControl {pg} id="lfo2Wave" />
        <ParamControl {pg} id="lfo2Rate" />
        <ParamControl {pg} id="lfo2Depth" />
        <ParamControl {pg} id="modTarget" />
      </div>
    </div>
    <div class="group">
      <div class="title">Then shape it</div>
      <div class="params">
        <ParamControl {pg} id="cutoff" />
        <ParamControl {pg} id="resonance" />
        <ParamControl {pg} id="unison" />
        <ParamControl {pg} id="chorus" />
      </div>
    </div>
  </div>
</section>

<style>
  .wt { display: grid; gap: 10px; }
  .detail {
    display: grid; grid-template-columns: 1.4fr 1.2fr 1.3fr; gap: 20px; align-items: start;
    background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; font-size: 12px; line-height: 1.4;
  }
  .detail h3 { margin: 0 0 2px; font-size: 14px; color: var(--accent); }
  .detail p { margin: 0; color: #b9c5c8; }
  .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(4, auto); gap: 2px 14px; }
  li { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  li.hot { color: var(--accent); }
  .n { font: 600 10px var(--mono); color: var(--dim); }
  .v { margin-left: auto; font: 10px var(--mono); color: var(--dim); }

  .notice { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border: 1px solid #ffcc33; border-radius: 8px; background: #ffcc3318; color: #ffe08a; font-size: 12px; }

  .main { display: grid; grid-template-columns: 170px 1fr 280px; gap: 12px; align-items: start; }
  .tables { display: flex; flex-direction: column; gap: 6px; }
  .tables button { display: grid; grid-template-columns: 48px 1fr; align-items: center; gap: 8px; padding: 4px 8px; text-align: left; font-size: 12px; }
  .tables button.active { border-color: var(--accent); color: var(--accent); }
  .tables canvas { width: 48px; height: 26px; display: block; }
  .view { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: grid; gap: 8px; }
  .scrub { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .scrub input { flex: 1; accent-color: var(--accent); }
  .scrub .v { margin: 0; min-width: 34px; text-align: right; }
  .side { display: grid; gap: 12px; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px 10px; }
  .note { margin: 6px 0 0; font-size: 11px; line-height: 1.35; color: #a9b6ba; }

  .controls { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 12px; }
  .group { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px 10px; }
  .group .note { margin: 0 0 6px; }
  .on { color: #ffcc33; text-transform: none; letter-spacing: 0; margin-left: 6px; }
  .params { display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 8px 6px; align-items: start; justify-items: center; }
</style>
