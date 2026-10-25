<script lang="ts">
  import { CHORD_MODE_NAMES, CHORD_MODES, chordName, keyNotes, playable, ROOT_NAMES, SCALE_IDS, SCALES, type ChordMode, type ScaleId } from "../../audio/scale";
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  let s = $derived(pg.scale);
  let on = $derived(s.scale !== "off");
  /** The chord on each note of the scale, root first: what one finger can play. */
  let chords = $derived(
    on && s.chords !== "off"
      ? Array.from({ length: 12 }, (_, i) => 60 + s.root + i)
          .filter((n) => playable(n, s))
          .map((n) => chordName(keyNotes(n, s), s))
      : [],
  );
</script>

<div class="scale">
  <span class="title">Scale lock</span>
  <label>
    <span>Root</span>
    <select value={s.root} disabled={!on} onchange={(e) => {
      pg.setScale({ root: +e.currentTarget.value });
      e.currentTarget.blur(); // so the computer keyboard plays notes again
    }}>
      {#each ROOT_NAMES as name, i (i)}<option value={i}>{name}</option>{/each}
    </select>
  </label>
  <label>
    <span>Scale</span>
    <select value={s.scale} onchange={(e) => {
      pg.setScale({ scale: e.currentTarget.value as ScaleId });
      e.currentTarget.blur(); // so the computer keyboard plays notes again
    }}>
      {#each SCALE_IDS as id (id)}<option value={id}>{id === "off" ? "Off (every note)" : SCALES[id].name}</option>{/each}
    </select>
  </label>
  <label>
    <span>Chords</span>
    <select value={s.chords} disabled={!on} onchange={(e) => {
      pg.setScale({ chords: e.currentTarget.value as ChordMode });
      e.currentTarget.blur(); // so the computer keyboard plays notes again
    }}>
      {#each CHORD_MODES as mode (mode)}<option value={mode}>{CHORD_MODE_NAMES[mode]}</option>{/each}
    </select>
  </label>
  {#if chords.length}
    <ol class="chords" aria-label="The chords of the scale">
      {#each chords as name, i (i)}<li class:now={name === pg.chord?.name}>{name}</li>{/each}
    </ol>
  {/if}
  {#if pg.explain}
    <span class="note">
      {#if !on}
        Pick a scale and every key you press moves to the nearest note of it, so nothing sounds wrong.
      {:else if s.chords === "off"}
        {SCALES[s.scale as Exclude<ScaleId, "off">].explain} Grey keys move to the nearest scale note; the marked keys are the root.
      {:else}
        One key plays a whole chord made of scale notes. These are the scale's chords, one on each of its notes from {ROOT_NAMES[s.root]}.
      {/if}
    </span>
  {/if}
</div>

<style>
  .scale { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; flex: 1; min-width: 0; font-size: 11px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; }
  label { display: flex; align-items: center; gap: 6px; color: var(--dim); }
  select { font-size: 12px; }
  .chords { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; }
  .chords li { font: 11px var(--mono); padding: 2px 7px; border: 1px solid var(--line); border-radius: 4px; color: var(--text); }
  .chords li.now { border-color: var(--accent); color: var(--accent); }
  .note { color: #a9b6ba; flex: 1; min-width: 240px; line-height: 1.4; }
</style>
