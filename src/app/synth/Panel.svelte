<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Playground } from "../playground.svelte";
  import type { KnobRing } from "../components/Knob.svelte";
  import { EFFECT_ON, effectOrder, type ParamId } from "../../audio/params";
  import { BLOCK_TAPS, blockSource, BLOCKS, isEffect, KNOB_PAGES, SHOWN_WHEN, type BlockId } from "./blocks";
  import { PARAM_DEST } from "./modRings";
  import ParamControl from "./ParamControl.svelte";

  interface Props {
    pg: Playground;
    id: BlockId;
    /** Greyed out when it currently has no effect (e.g. a source at level 0). */
    inactive?: string | null;
    /** Just the header (an effect that is off). */
    compact?: boolean;
    /** The picture beside the knobs instead of above them (the modulators, which have room across). */
    wide?: boolean;
    /** The modulations around each knob. */
    rings: (id: ParamId) => KnobRing[] | undefined;
    /** Extra things in the header, after the title (tags for destinations without a knob). */
    tags?: Snippet;
    children?: Snippet;
  }
  let { pg, id, inactive = null, compact = false, wide = false, rings, tags, children }: Props = $props();

  let def = $derived(BLOCKS[id]);
  let params = $derived(def.params.filter((p) => SHOWN_WHEN[id]?.[p]?.(pg.values) ?? true));
  let focused = $derived(pg.focusBlock === id);
  let onPage = $derived(KNOB_PAGES[pg.focusPage].blocks.includes(id));
  let effect = $derived(isEffect(id) ? id : null);
  let effectOn = $derived(effect ? pg.values[EFFECT_ON[effect]] === 1 : true);
  let tap = $derived(effectOn ? BLOCK_TAPS[id] : undefined);
  let listening = $derived(!!tap && pg.listening === tap);
  /** Click patching is picking a source, and this panel gives one. */
  let pickable = $derived(pg.patch === "source" && blockSource(id) > 0);

  function moveKey(e: KeyboardEvent) {
    if (!effect || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const at = effectOrder(pg.values).indexOf(effect);
    pg.moveEffect(effect, at + (e.key === "ArrowLeft" ? -1 : 1));
  }
</script>

<!-- Clicking anywhere on a panel points the MiniLab knobs at its page. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section
  role="group"
  aria-label={def.title}
  class="panel"
  class:focused
  class:on-page={onPage}
  class:inactive={!!inactive}
  class:compact
  class:wide
  class:listening
  class:pickable
  class:target={pg.recipeBlock === id}
  data-block={id}
  onclick={() => pg.blockClick(id)}
>
  <header title={def.short}>
    {#if effect}
      <button
        class="grip"
        draggable="true"
        title="Drag to move {def.title} along the chain (or focus and press ← →)"
        aria-label="Move {def.title}"
        onclick={(e) => e.stopPropagation()}
        onkeydown={moveKey}
        ondragstart={(e) => {
          e.dataTransfer?.setData("application/x-effect", id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        }}>⠿</button
      >
    {/if}
    <h3>{def.title}</h3>
    {#if effect}
      <button
        class="switch"
        class:on={effectOn}
        aria-pressed={effectOn}
        title={effectOn ? `Switch ${def.title} off (it is taken out of the chain)` : `Switch ${def.title} on`}
        onclick={(e) => {
          e.stopPropagation();
          pg.toggleEffect(effect!);
        }}>{effectOn ? "On" : "Off"}</button
      >
    {/if}
    {#if inactive && !effect}<span class="note">{inactive}</span>{/if}
    {@render tags?.()}
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
    <div class="body">
      {#if children}<div class="viz">{@render children()}</div>{/if}
      {#if params.length}
        <div class="params">
          {#each params as param (param)}
            <ParamControl {pg} id={param} size={44} rings={rings(param)} dest={PARAM_DEST[param]} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel {
    position: relative; display: flex; flex-direction: column; min-width: 0; cursor: pointer;
    background: linear-gradient(#1a2124, #141a1c); border: 1px solid #262f33; border-radius: 6px;
    box-shadow: inset 0 1px 0 #ffffff0a; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .panel:hover { border-color: #34414a; }
  .panel.on-page { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .panel.focused { border-color: var(--accent); box-shadow: inset 0 1px 0 #ffffff0a, 0 0 0 1px var(--accent), 0 0 16px color-mix(in srgb, var(--accent) 20%, transparent); }
  .panel.inactive .body { opacity: 0.5; }
  .panel.listening { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33, 0 0 18px #ffcc3355; }
  .panel.pickable { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33; cursor: crosshair; }
  .panel.target { border-color: #ffcc33; animation: target 1.6s ease-in-out infinite; }
  @keyframes target { 0%, 100% { box-shadow: 0 0 0 1px #ffcc33, 0 0 6px #ffcc3333; } 50% { box-shadow: 0 0 0 2px #ffcc33, 0 0 22px #ffcc3388; } }

  /* A header strip, like a plugin section's title bar. */
  header {
    display: flex; align-items: center; gap: 8px; min-height: 24px; padding: 2px 8px; flex-wrap: wrap;
    background: #0f1416; border-bottom: 1px solid #222a2e; border-radius: 6px 6px 0 0;
  }
  .compact header { border-bottom: none; border-radius: 6px; }
  h3 { margin: 0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #c9d4d6; white-space: nowrap; }
  .focused h3 { color: var(--accent); }
  .note { font-size: 10px; color: var(--dim); }
  .listen { margin-left: auto; padding: 0 5px; font-size: 11px; line-height: 17px; border-radius: 4px; opacity: 0.55; background: none; }
  .listen:hover { opacity: 1; }
  .listen.on { opacity: 1; background: #ffcc33; border-color: #ffcc33; }
  .grip { padding: 0 2px; margin: 0 -4px 0 -3px; font-size: 12px; line-height: 16px; background: none; border: none; color: var(--dim); cursor: grab; }
  .grip:hover, .grip:focus-visible { color: var(--text); }
  .switch { padding: 0 6px; font-size: 9.5px; line-height: 14px; border-radius: 7px; color: var(--dim); }
  .switch.on { background: var(--accent); border-color: var(--accent); color: #0b1314; }

  .body { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px 10px; flex: 1; }
  .wide .body { flex-direction: row; align-items: flex-start; gap: 16px; }
  .wide .viz { flex: 1 1 45%; min-width: 0; }
  .wide .params { flex: 1 1 55%; }
  .viz { display: flex; flex-direction: column; gap: 4px; }
  .params { display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 10px 2px; align-items: start; justify-items: center; padding-top: 4px; }
</style>
