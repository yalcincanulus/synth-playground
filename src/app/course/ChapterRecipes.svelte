<script lang="ts">
  // The recipes a chapter offers at its end: each leaves the course for the Synth view and builds a whole
  // sound with what the chapter taught.
  import type { Chapter } from "../../course/lesson";
  import { RECIPES } from "../../recipes/library";
  import type { Playground } from "../playground.svelte";

  let { pg, chapter, compact = false }: { pg: Playground; chapter: Chapter; compact?: boolean } = $props();

  let recipes = $derived(chapter.recipes.map((id) => RECIPES.find((r) => r.id === id)!));

  /** The recipe's colour (the MiniLab's 0-127 LED range) as CSS. */
  const rgb = (c: [number, number, number]) => `rgb(${c.map((x) => Math.round((x / 127) * 255)).join(" ")})`;
</script>

<div class="recipes" class:compact>
  <div class="head">Put it to use</div>
  {#if !compact}<p class="note">A recipe builds a whole sound step by step, in the Synth view. Learn keeps your place for when you come back.</p>{/if}
  <div class="list">
    {#each recipes as r (r.id)}
      {@const built = pg.recipesDone.includes(r.id)}
      <button onclick={() => pg.courseRecipe(r.id)} title={compact ? r.summary : undefined}>
        <span class="name"><span class="dot" style:background={rgb(r.color)}></span>{r.name}{#if built}<span class="built" title="You have built this one">✓</span>{/if}</span>
        {#if !compact}<span class="summary">{r.summary}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .head { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; }
  .note { margin: 2px 0 0; font-size: 12px; color: var(--dim); }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; margin-top: 6px; }
  .compact .list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  button { display: grid; gap: 2px; text-align: left; padding: 6px 10px; }
  .compact button { padding: 2px 8px; font-size: 12px; }
  .name { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); }
  .compact .name { font-size: 12px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .built { color: #7be08a; font-size: 11px; }
  .summary { font-size: 11.5px; color: var(--dim); line-height: 1.35; }
</style>
