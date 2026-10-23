<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Playground } from "../playground.svelte";
  import { BLOCKS, KNOB_PAGES, type BlockId } from "./blocks";
  import ParamControl from "./ParamControl.svelte";

  interface Props {
    pg: Playground;
    id: BlockId;
    /** Greyed out when it currently has no effect (e.g. a source at level 0). */
    inactive?: string | null;
    children: Snippet;
  }
  let { pg, id, inactive = null, children }: Props = $props();

  let def = $derived(BLOCKS[id]);
  let focused = $derived(pg.focusBlock === id);
  let onPage = $derived(KNOB_PAGES[pg.focusPage].blocks.includes(id));
</script>

<!-- Clicking anywhere on a block points the MiniLab knobs at its page. -->
<!-- Keyboard users reach the block's own controls; the click is a shortcut for focusing the knobs. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section role="group" aria-label={def.title} class="block" class:focused class:on-page={onPage} class:inactive={!!inactive} data-block={id} onclick={() => pg.focus(id)}>
  <header>
    <h3>{def.title}</h3>
    {#if inactive}<span class="note">{inactive}</span>{/if}
  </header>
  {#if pg.explain}<p class="explain">{def.short}</p>{/if}
  {@render children()}
  {#if def.params.length}
    <div class="params">
      {#each def.params as param (param)}
        <ParamControl {pg} id={param} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .block {
    position: relative; z-index: 1; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .block:hover { border-color: #3a454b; }
  .block.on-page { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .block.focused { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 25%, transparent); }
  .block.inactive { opacity: 0.55; }
  header { display: flex; align-items: baseline; gap: 8px; }
  h3 { margin: 0; font-size: 13px; font-weight: 600; }
  .note { font-size: 10px; color: var(--dim); }
  .explain { margin: 0; font-size: 11.5px; line-height: 1.35; color: #a9b6ba; }
  .params { display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 6px 4px; align-items: start; justify-items: center; }
</style>
