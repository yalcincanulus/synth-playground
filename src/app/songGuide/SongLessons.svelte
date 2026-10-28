<script lang="ts">
  // "Make a song": every lesson with its tick, in the suggested order; any can be opened.
  import { SONG_LESSONS } from "../../course/song/lessons";
  import type { Playground } from "../playground.svelte";

  let { pg, compact = false }: { pg: Playground; compact?: boolean } = $props();

  let guide = $derived(pg.songGuide);
  let next = $derived(guide.nextUndone);
  const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
</script>

<section class="lessons" class:compact aria-label="Make a song">
  <div class="summary">
    <div class="bar"><i style:width={pct(guide.done.length, SONG_LESSONS.length)}></i></div>
    <span>{guide.done.length} of {SONG_LESSONS.length} lessons done</span>
    {#if next >= 0}
      <button class="primary" onclick={() => pg.openSongLesson(next)}>{guide.done.length ? "Continue" : "Start"}: {SONG_LESSONS[next].title} →</button>
    {:else}
      <span class="all">✓ All done</span>
    {/if}
    {#if guide.done.length}<button class="link" onclick={() => confirm("Forget which lessons are done?") && guide.reset()}>reset</button>{/if}
  </div>
  <p class="about">No music software needed before: each lesson opens a practice song of its own, so nothing touches your songs. Do them in order, or pick any.</p>
  <ol>
    {#each SONG_LESSONS as l, i (l.id)}
      <li>
        <button class:now={guide.index === i} class:done={guide.isDone(l.id)} onclick={() => pg.openSongLesson(i)}>
          <span class="num">{guide.isDone(l.id) ? "✓" : i + 1}</span>
          <span class="txt"><span class="ttl">{l.title}</span>{#if !compact}<span class="sum">{l.summary}</span>{/if}</span>
        </button>
      </li>
    {/each}
  </ol>
</section>

<style>
  .lessons { display: grid; gap: 8px; }
  .summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
  .summary > .bar { width: 120px; }
  .bar { height: 4px; border-radius: 2px; background: #222b2f; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .all { color: #7be08a; }
  .link { background: none; border: none; padding: 0 4px; color: var(--dim); text-decoration: underline; font-size: 12px; }
  .about { margin: 0; font-size: 12px; color: var(--dim); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 4px; }
  .compact ol { grid-template-columns: 1fr; gap: 1px; }
  ol button { width: 100%; display: flex; align-items: flex-start; gap: 8px; padding: 5px 6px; border: 1px solid transparent; background: none; text-align: left; color: var(--dim); }
  ol button:hover { color: var(--text); border-color: var(--line); }
  .txt { display: grid; gap: 1px; }
  .ttl { font-size: 13px; }
  .sum { font-size: 11.5px; color: var(--dim); }
  .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: 50%; background: #222b2f; font: 600 10px var(--mono); color: var(--dim); margin-top: 1px; }
  .done .num { background: color-mix(in srgb, var(--accent) 35%, transparent); color: var(--text); }
  .done .ttl { color: #9fb0b3; }
  .now { border-color: var(--accent); color: var(--text); }
  .now .num { background: var(--accent); color: #0b1314; }
</style>
