<script lang="ts">
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  let chord = $derived(pg.chord);
</script>

<div class="chord" class:released={chord && !pg.chordHeld} aria-live="polite" title="The chord in the notes you play on the keys">
  {#if chord}
    <span class="name">{chord.name}</span>
    {#if chord.numeral}<span class="numeral" title="Its number in the key: which step of the scale it is built on">{chord.numeral}</span>{/if}
    <span class="detail">{chord.inKey === false ? "outside the key · " : ""}{chord.detail} · {chord.notes.join(" ")}</span>
  {:else}
    <span class="name empty">Chord</span>
    <span class="detail">play notes to name them</span>
  {/if}
</div>

<style>
  /* One line: the name, its number in the key, then what it is made of. */
  .chord { width: 250px; height: 30px; flex: none; display: flex; align-items: baseline; gap: 8px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: #0b0e10; overflow: hidden; }
  .name { font: 600 16px var(--mono); color: var(--accent); white-space: nowrap; }
  .name.empty { color: var(--dim); font-weight: 400; font-size: 14px; }
  .numeral { font: 12px var(--mono); color: var(--text); padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; }
  .detail { font-size: 11px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .released .name, .released .numeral { opacity: 0.45; }
</style>
