<script lang="ts">
  import { formatValue, PARAMS, type ParamId } from "../../audio/params";
  import { aimOf, describe, hardwareFor, isPlay, LINGER_MS } from "../../recipes/recipe";
  import type { Playground } from "../playground.svelte";
  import { KNOB_PAGES, paramLabel } from "../synth/blocks";
  import StepText from "./StepText.svelte";

  let { pg }: { pg: Playground } = $props();

  let run = $derived(pg.recipe!);
  let step = $derived(run.step);
  let hw = $derived(pg.recipeHardware);
  /** Every control the step asks for, and where each is on the MiniLab. */
  let controls = $derived(pg.recipeParams.map((id) => ({ id, hw: hardwareFor(id) })));
  let page = $derived(KNOB_PAGES[pg.focusPage]);
  /** Where a control is on the MiniLab in the Synth view: its fader, or its knob on its block's page. */
  const where = (id: ParamId) => {
    const at = hardwareFor(id);
    return at && `${at.kind} ${at.index + 1}`;
  };

  function save() {
    const name = prompt("Preset name", `My ${run.recipe.name}`);
    if (name) pg.saveAsUserPreset(name);
  }
</script>

<section class="recipe" aria-label="Recipe: {run.recipe.name}">
  <header>
    <span class="kicker">Recipe</span>
    <h3>{run.recipe.name}</h3>
    <div class="dots" aria-label="Step {run.index + 1} of {run.total}">
      {#each run.recipe.steps as _, i (i)}
        <i class:done={run.done || i < run.index} class:now={!run.done && i === run.index}></i>
      {/each}
    </div>
    <span class="count">{run.done ? "Done" : `Step ${run.index + 1} of ${run.total}`}</span>
    <span class="grow"></span>
    <button onclick={() => run.back()} disabled={!run.done && run.index === 0}>← Back</button>
    {#if !run.done && !run.complete}<button onclick={() => run.next()} title="Go on without doing this step">Skip →</button>{/if}
    <button onclick={() => pg.restartRecipe()} title="Back to Init and step 1">Start again</button>
    <button onclick={() => pg.stopRecipe()} title="Leave the recipe (the sound stays)">Close</button>
  </header>

  {#if pg.part !== "keys"}
    <p class="part">This recipe builds the <strong>Keys</strong> part's sound, and you are editing the Sequencer part.
      <button onclick={() => pg.selectPart("keys")}>Back to Keys</button></p>
  {/if}
  {#if step}
    <div class="body" class:solo={!pg.hasDevice}>
      <div class="what">
        <p class="text"><StepText {pg} text={step.text} {where} /></p>
        <p class="why"><StepText {pg} text={step.why} {where} /></p>
        <ul class="checks">
          {#each step.checks as c, i (i)}
            <li class:ok={run.holds(i)}>
              <span class="tick">{run.holds(i) ? "✓" : "○"}</span>
              {describe(c)}
              {#if !isPlay(c)}<span class="now">now {formatValue(c.param, pg.parts.keys.values[c.param])}</span>{/if}
            </li>
          {/each}
        </ul>
        {#if run.complete}
          <p class="complete">
            <span>✓ Done. Listen to what changed…</span>
            <button onclick={() => run.next()}>{run.index + 1 < run.total ? "Next step →" : "Finish →"}</button>
            <i style:animation-duration="{LINGER_MS}ms"></i>
          </p>
        {:else if run.hint}
          <p class="hint">
            {#each step.checks as c, i (i)}
              {#if isPlay(c)}Play {pg.hw("on the MiniLab keys, ")}on the on-screen keyboard{pg.hasDevice ? "," : ""} or your computer keyboard (A to ').{:else}Set {PARAMS[c.param].label} to about {formatValue(c.param, aimOf(c))}.{/if}
              {#if i < step.checks.length - 1}{" "}{/if}
            {/each}
            The highlighted block in the diagram has the control.
          </p>
        {:else}
          <button class="hint-btn" onclick={() => (run.hint = true)}>Hint</button>
        {/if}
      </div>

      {#if pg.hasDevice}
      <div class="where">
        <div class="title">On the MiniLab</div>
        {#if hw}
          <p class="pointer">
            {#each controls as c, i (c.id)}
              {#if i > 0}<span class="dim"> and </span>{/if}
              {#if c.hw}<strong>{c.hw.kind === "fader" ? "Fader" : "Knob"} {c.hw.index + 1}</strong>{:else}<strong>{PARAMS[c.id].label}</strong> on screen{/if}
            {/each}
            {#if hw.kind === "knob"}<span class="dim">(page {page.name})</span>{/if}
          </p>
          {#if hw.kind === "knob"}
            <ol>
              {#each page.knobs as id, i (i)}
                <li class:target={!!id && pg.recipeParams.includes(id)}>
                  <span class="n">{i + 1}</span>
                  {#if id}{paramLabel(id, pg.values, PARAMS[id].label)}{:else}—{/if}
                </li>
              {/each}
            </ol>
          {/if}
        {:else if controls.length}
          <p class="pointer"><strong>On screen</strong></p>
          <p class="dim">No knob reaches it here: use the {PARAMS[controls[0].id].label} menu on the highlighted block.</p>
        {:else}
          <p class="pointer"><strong>The keys</strong></p>
        {/if}
      </div>
      {/if}
    </div>
  {:else}
    <div class="body">
      <div class="what">
        <p class="text">🎉 You built a {run.recipe.name}!</p>
        <p class="why">{run.recipe.outro}</p>
        <div class="end">
          <button class="primary" onclick={save}>Save as preset…</button>
          <button onclick={() => (pg.recipeList = true)}>Another recipe</button>
          <button onclick={() => pg.stopRecipe()}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .recipe {
    position: sticky; top: 0; z-index: 5;
    background: #10171a; border: 1px solid var(--accent); border-radius: 8px; padding: 10px 14px;
    box-shadow: 0 6px 18px #0008; display: grid; gap: 8px; font-size: 12px;
  }
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  h3 { margin: 0; font-size: 15px; color: var(--accent); }
  .dots { display: flex; gap: 4px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: #2a3338; }
  .dots i.done { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .dots i.now { background: var(--accent); box-shadow: 0 0 0 2px #10171a, 0 0 0 3px var(--accent); }
  .count { font: 11px var(--mono); color: var(--dim); }
  /* A done step: ticked, with a bar running down until the next step. */
  .complete { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; margin: 8px 0 0; padding: 6px 8px; border-radius: 4px; background: #7be08a18; color: #7be08a; font-size: 13px; }
  .complete button { font-size: 12px; padding: 2px 10px; border-color: #7be08a; color: #7be08a; }
  .complete i { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: #7be08a; transform-origin: left; animation: countdown linear forwards; }
  @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  .grow { flex: 1; }
  .part { margin: 0; padding: 6px 8px; background: #ff8a8015; border-left: 2px solid #ff8a80; color: #ffc1bb; }
  .part button { margin-left: 8px; font-size: 11px; padding: 2px 8px; }
  header button { font-size: 12px; padding: 3px 10px; }

  .body { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
  .body.solo { grid-template-columns: 1fr; }
  .text { margin: 0; font-size: 16px; line-height: 1.35; color: var(--text); }
  .why { margin: 4px 0 0; color: #b9c5c8; line-height: 1.45; }
  .checks { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 3px; }
  .checks li { display: flex; gap: 8px; align-items: baseline; color: var(--dim); }
  .checks li.ok { color: #7be08a; }
  .tick { width: 12px; }
  .now { font: 11px var(--mono); color: var(--dim); }
  .hint { margin: 8px 0 0; padding: 6px 8px; border-left: 2px solid #ffcc33; background: #ffcc3312; color: #ffe08a; line-height: 1.45; }
  .hint-btn { margin-top: 8px; font-size: 11px; padding: 2px 10px; }
  .end { display: flex; gap: 8px; margin-top: 10px; }

  .where .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .pointer { margin: 0 0 4px; font-size: 14px; }
  .pointer strong { color: var(--accent); }
  .dim { color: var(--dim); font-size: 11px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(4, auto); gap: 2px 14px; }
  li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dim); }
  ol li.target { color: var(--accent); font-weight: 600; }
  .n { font: 600 10px var(--mono); margin-right: 6px; }
  /* Phones: one column and a little smaller, since it stays at the top of the screen while you scroll to the control. */
  @media (max-width: 700px) {
    .recipe { padding: 8px 10px; gap: 6px; }
    .body { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .text { font-size: 14.5px; }
  }
</style>
