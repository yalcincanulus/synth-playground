<script lang="ts">
  // Every word the course introduces, A–Z, each with the page that explains it.
  import { PAGES } from "../../course/course";
  import { GLOSSARY_AZ, introducedOn } from "../../course/glossary";
  import type { Course } from "./course.svelte";
  import { SONG_GLOSSARY, songTermLesson } from "../../course/song/glossary";

  let { course, openLesson }: { course: Course; openLesson: (course: "song" | "loop", i: number) => void } = $props();

  /** The words of "Make a song" and "Live looping", A–Z. */
  const songWords = [...SONG_GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));

  /** The terms grouped by first letter. */
  const letters = [...new Set(GLOSSARY_AZ.map((t) => t.term[0].toUpperCase()))].map((letter) => ({
    letter,
    terms: GLOSSARY_AZ.filter((t) => t.term[0].toUpperCase() === letter),
  }));
</script>

<section class="glossary" aria-label="Glossary">
  <p class="intro">The words the course introduces. On a page, point at a highlighted word to see what it means.</p>
  <div class="letters">
    {#each letters as { letter, terms } (letter)}
      <div class="group">
        <div class="letter">{letter}</div>
        <dl>
          {#each terms as t (t.term)}
            {@const at = introducedOn(t)}
            <dt>{t.term}</dt>
            <dd>{t.text} <button class="link" onclick={() => course.show(at)}>Page {at + 1}: {PAGES[at].lesson.title}</button></dd>
          {/each}
        </dl>
      </div>
    {/each}
  </div>
  <h3>Making songs</h3>
  <p class="intro">The words of the "Make a song" and "Live looping" lessons.</p>
  <dl class="letters">
    {#each songWords as t (t.term)}
      {@const at = songTermLesson(t)}
      <div class="group">
        <dt>{t.term}</dt>
        <dd>{t.text}{#if at} <button class="link" onclick={() => openLesson(at.course.id, at.index)}>{at.course.lessons[at.index].title}</button>{/if}</dd>
      </div>
    {/each}
  </dl>
</section>

<style>
  .glossary { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; }
  h3 { margin: 16px 0 2px; font-size: 15px; color: var(--accent); }
  .intro { margin: 0 0 10px; font-size: 13px; color: var(--dim); }
  .letters { column-width: 300px; column-gap: 28px; }
  .group { break-inside: avoid; margin-bottom: 10px; }
  .letter { font: 600 13px var(--mono); color: var(--accent); border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  dl { margin: 0; }
  dt { font-size: 14px; font-weight: 600; color: var(--text); margin-top: 6px; }
  dd { margin: 1px 0 0; font-size: 13px; line-height: 1.45; color: #b9c5c8; }
  .link { background: none; border: none; padding: 0; color: var(--dim); text-decoration: underline; font-size: 11.5px; white-space: nowrap; }
  .link:hover { color: var(--accent); }
</style>
