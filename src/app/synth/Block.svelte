<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Playground } from "../playground.svelte";
  import { BLOCK_TAPS, blockDest, blockSource, BLOCKS, KNOB_PAGES, SHOWN_WHEN, type BlockId } from "./blocks";
  import ParamControl from "./ParamControl.svelte";

  interface Props {
    pg: Playground;
    id: BlockId;
    /** Greyed out when it currently has no effect (e.g. a source at level 0). */
    inactive?: string | null;
    /** Folded away: just the title, so cables still have somewhere to land. */
    compact?: boolean;
    children: Snippet;
  }
  let { pg, id, inactive = null, compact = false, children }: Props = $props();

  /** The modulator row is narrow and has room below: its knobs keep their labels underneath. */
  const MODULATORS: BlockId[] = ["lfo", "lfo2", "filterEnv", "ampEnv", "pitchEnv", "modEnv", "perf"];
  let inline = $derived(!MODULATORS.includes(id));

  let def = $derived(BLOCKS[id]);
  let params = $derived(def.params.filter((p) => SHOWN_WHEN[id]?.[p]?.(pg.values) ?? true));
  let focused = $derived(pg.focusBlock === id);
  let onPage = $derived(KNOB_PAGES[pg.focusPage].blocks.includes(id));
  let tap = $derived(BLOCK_TAPS[id]);
  let listening = $derived(!!tap && pg.listening === tap);
  /** While patching: this block can be clicked as the source (or destination) being picked. */
  let pickable = $derived(pg.patch === "source" ? blockSource(id) > 0 : pg.patch !== null && blockDest(id, pg.values) >= 0);
</script>

<!-- Clicking anywhere on a block points the MiniLab knobs at its page. -->
<!-- Keyboard users reach the block's own controls; the click is a shortcut for focusing the knobs. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section role="group" aria-label={def.title} class="block" class:listening class:focused class:on-page={onPage} class:inactive={!!inactive} class:compact class:pickable class:patching={pg.patch !== null} class:target={pg.recipeBlock === id} data-block={id} onclick={() => pg.blockClick(id)}>
  <header title={def.short}>
    <h3>{def.title}</h3>
    {#if inactive}<span class="note">{inactive}</span>{/if}
    {#if tap}
      <button
        class="listen"
        class:on={listening}
        title={listening ? "Back to the full sound" : "Listen here: hear the sound at this point only"}
        onclick={(e) => {
          e.stopPropagation();
          pg.focus(id);
          pg.listenTo(tap);
        }}>🎧</button
      >
    {/if}
  </header>
  {#if !compact}
    {@render children()}
  {/if}
  {#if params.length && !compact}
    <div class="params" class:inline>
      {#each params as param (param)}
        <ParamControl {pg} id={param} {inline} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .block {
    position: relative; z-index: 1; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 6px 8px 8px; display: flex; flex-direction: column; gap: 5px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .block:hover { border-color: #3a454b; }
  .block.on-page { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .block.focused { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 25%, transparent); }
  /* Dim the contents, not the block: a see-through block would show the cables behind it. */
  .block.inactive > * { opacity: 0.55; }
  header { display: flex; align-items: baseline; gap: 8px; }
  .listen { margin-left: auto; padding: 0 5px; font-size: 12px; line-height: 18px; border-radius: 4px; opacity: 0.55; background: none; }
  .listen:hover { opacity: 1; }
  .listen.on { opacity: 1; background: #ffcc33; border-color: #ffcc33; }
  .block.patching:not(.pickable) > * { opacity: 0.4; }
  .block.pickable { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33, 0 0 16px #ffcc3344; cursor: crosshair; }
  /* The block a recipe step asks you to use. */
  .block.target { border-color: #ffcc33; animation: target 1.6s ease-in-out infinite; }
  @keyframes target { 0%, 100% { box-shadow: 0 0 0 1px #ffcc33, 0 0 6px #ffcc3333; } 50% { box-shadow: 0 0 0 2px #ffcc33, 0 0 22px #ffcc3388; } }
  .block.listening { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33, 0 0 22px #ffcc3355; }
  h3 { margin: 0; font-size: 12.5px; font-weight: 600; }
  .block.compact { padding: 5px 8px; }
  .note { font-size: 10px; color: var(--dim); }
  .params.inline { grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px 4px; justify-items: start; }
  .params { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 4px 2px; align-items: start; justify-items: center; }
</style>
