<script lang="ts">
  import { controlsOf, lessonBlockOf } from "../../course/lesson";
  import type { Playground } from "../playground.svelte";
  import { BLOCKS } from "../synth/blocks";
  import ParamControl from "../synth/ParamControl.svelte";

  /** The page's controls, grouped by the block they belong to. Docked: one short row along the bottom of a phone screen. */
  let { pg, docked = false }: { pg: Playground; docked?: boolean } = $props();

  let lesson = $derived(pg.course.lesson);
  let targetBlock = $derived(pg.targetParams[0] ? lessonBlockOf(pg.targetParams[0]) : null);
  // The signal path's blocks first, then the modulators that shape them; only the blocks with controls on this page.
  let groups = $derived.by(() => {
    const controls = controlsOf(lesson);
    return [...lesson.blocks, ...(lesson.modulators ?? [])]
      .map((b) => ({ b, own: controls.filter((id) => lessonBlockOf(id) === b), mod: !lesson.blocks.includes(b) }))
      .filter((g) => g.own.length);
  });

  // Docked, the row may be wider than the screen: bring the control the step asks for into view.
  let row = $state<HTMLElement>();
  $effect(() => {
    void pg.targetParams;
    if (!docked) return;
    requestAnimationFrame(() => {
      const target = row?.querySelector<HTMLElement>(".controls .target") ?? row?.querySelector<HTMLElement>(".target");
      if (!row || !target) return;
      // Sideways only, within the row: scrollIntoView would also scroll the page.
      const r = row.getBoundingClientRect(), t = target.getBoundingClientRect();
      if (t.left < r.left) row.scrollBy({ left: t.left - r.left - 8, behavior: "smooth" });
      else if (t.right > r.right) row.scrollBy({ left: t.right - r.right + 8, behavior: "smooth" });
    });
  });
</script>

{#if groups.length}
  <div class="controls-list" class:docked bind:this={row}>
    {#each groups as { b, own, mod } (b)}
      <div class="block" class:mod class:target={b === targetBlock}>
        <h4>{BLOCKS[b].title}</h4>
        {#if !docked}<p>{BLOCKS[b].short}</p>{/if}
        <div class="controls" class:four={own.length > 2}>
          {#each own as id (id)}<ParamControl {pg} {id} />{/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .controls-list { display: grid; gap: 8px; }
  .block { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; transition: border-color 0.2s, box-shadow 0.2s; }
  .block.mod { border-style: dashed; }
  .block.target { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33, 0 0 14px #ffcc3340; }
  h4 { margin: 0; font-size: 13px; }
  .block p { margin: 2px 0 0; font-size: 11.5px; color: var(--dim); line-height: 1.35; }
  .controls { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; align-items: start; }
  .controls.four { grid-template-columns: repeat(4, 1fr); }
  /* A knob's box is only as wide as the knob, so its number badge sits at the knob, not at the edge of a wide cell. */
  .controls :global(.knob-wrap) { justify-self: center; }

  /* Docked: the blocks side by side in one row that scrolls sideways, each as short as its controls. */
  .docked { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .docked .block { flex: none; padding: 4px 8px 6px; }
  .docked h4 { font-size: 11px; color: var(--dim); font-weight: 600; }
  .docked .controls { display: flex; gap: 10px; margin-top: 2px; align-items: flex-end; }
  .docked .controls > :global(*) { flex: none; }
</style>
