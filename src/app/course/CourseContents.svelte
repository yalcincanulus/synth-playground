<script lang="ts">
  // The course at a glance: how far you are, every chapter with its pages (open any of them), and the
  // recipes each chapter offers.
  import { CHAPTERS, PAGES } from "../../course/course";
  import type { Playground } from "../playground.svelte";
  import ChapterRecipes from "./ChapterRecipes.svelte";

  let { pg }: { pg: Playground } = $props();

  let course = $derived(pg.course);
  let next = $derived(course.nextUndone);
  const pageNumber = (id: string) => PAGES.findIndex((p) => p.lesson.id === id);
  const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
</script>

<section class="contents" aria-label="Contents">
  <div class="summary">
    <div class="bar"><i style:width={pct(course.done.length, course.total)}></i></div>
    <span>{course.done.length} of {course.total} pages done</span>
    {#if next >= 0}
      <button class="primary" onclick={() => course.show(next)}>
        {course.done.length ? "Continue" : "Start"}: Chapter {CHAPTERS.indexOf(PAGES[next].chapter) + 1} · {PAGES[next].lesson.title} →
      </button>
    {:else}
      <span class="all">✓ Course done</span>
    {/if}
    {#if course.done.length}<button class="link" onclick={() => course.reset()}>reset</button>{/if}
  </div>

  <div class="chapters">
    {#each CHAPTERS as chapter, c (chapter.id)}
      {@const n = chapter.lessons.filter((l) => course.isDone(l.id)).length}
      <article class="card" class:current={course.chapter === chapter}>
        <div class="kicker">Chapter {c + 1}</div>
        <h3>{chapter.title}</h3>
        <div class="count" class:full={n === chapter.lessons.length}>
          <div class="bar"><i style:width={pct(n, chapter.lessons.length)}></i></div>
          {n} of {chapter.lessons.length}{n === chapter.lessons.length ? " ✓" : ""}
        </div>
        <ol>
          {#each chapter.lessons as l (l.id)}
            {@const i = pageNumber(l.id)}
            <li>
              <button class:now={i === course.index} class:done={course.isDone(l.id)} onclick={() => course.show(i)}>
                <span class="num">{course.isDone(l.id) ? "✓" : i + 1}</span>{l.title}
              </button>
            </li>
          {/each}
        </ol>
        <ChapterRecipes {pg} {chapter} compact />
      </article>
    {/each}
  </div>
</section>

<style>
  .contents { display: grid; gap: 12px; }
  .summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 14px; }
  .summary > .bar { width: 160px; }
  .bar { height: 4px; border-radius: 2px; background: #222b2f; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .all { color: #7be08a; }
  .link { background: none; border: none; padding: 0 4px; color: var(--dim); text-decoration: underline; font-size: 12px; }

  .chapters { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; align-items: start; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; }
  .card.current { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  h3 { margin: -4px 0 0; font-size: 15px; color: var(--accent); }
  .count { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); }
  .count.full { color: #7be08a; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  ol button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 3px 4px; border: 1px solid transparent; background: none; font-size: 13px; color: var(--dim); text-align: left; }
  ol button:hover { color: var(--text); }
  .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: 50%; background: #222b2f; font: 600 10px var(--mono); color: var(--dim); }
  .done .num { background: color-mix(in srgb, var(--accent) 35%, transparent); color: var(--text); }
  .done { color: #9fb0b3; }
  .now { border-color: var(--accent); color: var(--text); }
  .now .num { background: var(--accent); color: #0b1314; }
</style>
