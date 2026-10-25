<script lang="ts">
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  let chord = $derived(pg.chord);
</script>

<div class="chord" class:released={chord && !pg.chordHeld} aria-live="polite" title="The chord in the notes you play on the keys">
  {#if chord}
    <div class="top">
      <span class="name">{chord.name}</span>
      {#if chord.numeral}<span class="numeral" title="Its number in the key: which step of the scale it is built on">{chord.numeral}</span>{/if}
      {#if chord.inKey === false}<span class="outside">outside the key</span>{/if}
    </div>
    <div class="detail">{chord.detail} · {chord.notes.join(" ")}</div>
  {:else}
    <div class="top"><span class="name empty">Chord</span></div>
    <div class="detail">Play some notes: their chord is named here.</div>
  {/if}
</div>

<style>
  .chord { width: 230px; flex: none; display: grid; gap: 2px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: #0b0e10; }
  .top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .name { font: 600 20px var(--mono); color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name.empty { color: var(--dim); font-weight: 400; }
  .numeral { font: 13px var(--mono); color: var(--text); padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; }
  .outside { font-size: 10px; color: #ffb74d; }
  .detail { font-size: 11px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .released .name, .released .numeral { opacity: 0.45; }
</style>
