<script lang="ts">
  // The guide beside the Song view: the lesson's steps, each ticking itself when done, with "tell me more"
  // for the idea behind it and a glow on the button or area it is about. Below 1100 px it sits under the view,
  // stuck to the bottom of the screen, and folds to its current step.
  import { LINGER_MS } from "../../recipes/recipe";
  import { lessonTerms } from "../../course/song/glossary";
  import { targetNames, type GuideStep } from "../../course/song/guide";
  import type { Playground } from "../playground.svelte";
  import Diagram from "./Diagram.svelte";
  import GuideText from "./GuideText.svelte";
  import SongLessons from "./SongLessons.svelte";

  let { pg }: { pg: Playground } = $props();

  let guide = $derived(pg.guide!);
  let lessons = $derived(guide.lessons);
  let lesson = $derived(guide.lesson!);
  let index = $derived(guide.index ?? 0);
  let current = $derived(guide.current);
  let terms = $derived(lessonTerms(lesson));
  /** The course ends with a project of your own (not counted among the lessons). */
  let project = $derived(lessons.at(-1)!.practice === null);
  let last = $derived(index === lessons.length - 1);

  /** Steps whose "tell me more" is open. */
  let more = $state<string[]>([]);
  const toggleMore = (id: string) => (more = more.includes(id) ? more.filter((m) => m !== id) : [...more, id]);
  /** The intro shows until the first step is done, then folds away (a click brings it back). */
  let introShown = $state(false);
  let introOpen = $derived(introShown || (guide.step === 0 && !guide.finished));
  $effect(() => {
    void guide.index;
    more = [];
    introShown = false;
  });

  /** Where step i stands: done, being done now, still to come, or passed over (it needs a MiniLab). */
  function stepState(i: number, s: GuideStep) {
    if (lesson.milestones) return guide.ticks.includes(s.id) ? "done" : "todo";
    if (guide.skipped(s)) return "skipped";
    if (guide.finished || i < guide.step) return "done";
    return i === guide.step ? "now" : "todo";
  }

  // The step's buttons or areas glow. A rule for the attribute, so it also lights things that appear later.
  let targets = $derived(lesson.milestones || !current ? [] : targetNames(current, () => pg.guideState()));
  let selector = $derived(targets.map((t) => `[data-guide~="${t}"]`).join(","));
  let glow = $derived(selector ? `<style>${selector}{animation:guide-glow 1.6s ease-in-out infinite}</style>` : "");

  // Bring the step's first target into view when it is off screen (once per step).
  let first = $derived(targets[0]);
  $effect(() => {
    const t = first;
    if (!t) return;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-guide~="${t}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head>{@html glow}</svelte:head>

<aside class="guide" class:folded={guide.folded} aria-label="Lesson: {lesson.title}">
  <header>
    <button class="fold" onclick={() => (guide.folded = !guide.folded)} aria-expanded={!guide.folded} title={guide.folded ? "Show the whole lesson" : "Fold to the current step"}>{guide.folded ? "▴" : "▾"}</button>
    <div class="head">
      <span class="kicker">{guide.course.title} · {last && project ? "Final project" : `Lesson ${index + 1} of ${lessons.length - (project ? 1 : 0)}`}</span>
      <h3>{lesson.title}</h3>
    </div>
    <button class:on={guide.listOpen} aria-pressed={guide.listOpen} onclick={() => (guide.listOpen = !guide.listOpen)} title="Every lesson">Lessons</button>
    <button class="close" onclick={() => pg.closeLesson()} aria-label="Close the lesson" title={pg.practiceSong ? "Close the lesson: the practice song goes, and your song comes back" : "Close the lesson"}>✕</button>
  </header>

  {#if guide.listOpen}
    <SongLessons {pg} {guide} compact />
  {:else}
    {#if pg.practiceSong}
      <p class="practice">A practice song: not among your songs unless you press <span class="ui">Save to my songs</span>.</p>
    {/if}
    <div class="intro">
      {#if introOpen}
        {#each lesson.intro as p, i (i)}<p><GuideText {pg} text={p} /></p>{/each}
        {#if introShown}<button class="link" onclick={() => (introShown = false)}>Less ▴</button>{/if}
      {:else}
        <button class="link" onclick={() => (introShown = true)}>About this lesson ▾</button>
      {/if}
    </div>

    <ol class="steps" class:milestones={lesson.milestones}>
      {#each lesson.steps as s, i (s.id)}
        {@const state = stepState(i, s)}
        <li class={state}>
          <span class="tick">{state === "done" ? "✓" : state === "skipped" ? "–" : i + 1}</span>
          <div>
            <p class="text"><GuideText {pg} text={s.text} /></p>
            {#if state === "skipped"}
              <p class="why">Needs a MiniLab's knobs: skipped.</p>
            {/if}
            {#if s.more && (state === "now" || lesson.milestones || more.includes(s.id))}
              <button class="link" onclick={() => toggleMore(s.id)} aria-expanded={more.includes(s.id)}>{more.includes(s.id) ? "Less ▴" : "Tell me more ▾"}</button>
            {/if}
            {#if more.includes(s.id)}
              <div class="more">
                {#each s.more ?? [] as p, k (k)}<p><GuideText {pg} text={p} /></p>{/each}
                {#if s.diagram}<Diagram kind={s.diagram} />{/if}
              </div>
            {:else if state === "now" && s.diagram && !s.more}
              <Diagram kind={s.diagram} />
            {/if}
            {#if state === "now" && guide.complete}
              <p class="complete">
                <span>✓ Done</span>
                <button onclick={() => guide.next()}>{i + 1 < lesson.steps.length ? "Next step →" : "Finish →"}</button>
                <i style:animation-duration="{LINGER_MS}ms"></i>
              </p>
            {/if}
          </div>
        </li>
      {/each}
    </ol>

    {#if guide.finished}
      <div class="finished">
        <p>✓ <GuideText {pg} text={lesson.outro} /></p>
        {#if !last}
          <button class="primary" onclick={() => pg.openLesson(guide, index + 1)}>Next: {lessons[index + 1].title} →</button>
        {/if}
        {#if pg.practiceSong}<p class="dim">Close the lesson to go back to your own song, or keep this one with <span class="ui">Save to my songs</span>.</p>{/if}
      </div>
    {:else if !lesson.milestones}
      <div class="nav">
        <button onclick={() => guide.back()} disabled={guide.step === 0}>← Back</button>
        <button onclick={() => guide.next()} title="Go on without doing this step">Skip step</button>
      </div>
    {/if}

    {#if terms.length}
      <details class="words">
        <summary>Words in this lesson ({terms.length})</summary>
        <dl>
          {#each terms as t (t.term)}<dt>{t.term}</dt><dd>{t.text}</dd>{/each}
        </dl>
      </details>
    {/if}
  {/if}
</aside>

<style>
  .guide { position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow-y: auto; display: grid; gap: 8px; align-content: start; padding: 10px 12px; background: var(--panel); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 8px; }
  header { display: flex; align-items: flex-start; gap: 6px; }
  .head { flex: 1; min-width: 0; }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  h3 { margin: 0; font-size: 15px; color: var(--accent); }
  header button { font-size: 12px; padding: 2px 8px; }
  header .on { border-color: var(--accent); color: var(--text); }
  .fold { display: none; }
  .close { color: var(--dim); }
  .practice { margin: 0; font-size: 11.5px; color: #ffb15c; }
  .ui { font-size: 0.92em; font-weight: 600; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; background: #1c2326; white-space: nowrap; }
  .intro p { margin: 0 0 6px; font-size: 13px; line-height: 1.45; color: #cfd8da; }
  .link { background: none; border: none; padding: 0; color: var(--dim); font-size: 12px; text-decoration: underline; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
  .steps > li { display: grid; grid-template-columns: 22px 1fr; gap: 7px; align-items: start; }
  .tick { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #222b2f; font: 600 10px var(--mono); color: var(--dim); }
  .text { margin: 0; font-size: 13px; line-height: 1.45; color: var(--dim); }
  li.now .text { color: var(--text); font-size: 14px; }
  li.now .tick { background: var(--accent); color: #0b1314; }
  li.done .tick { background: #7be08a30; color: #7be08a; }
  li.done .text { color: #9fb0b3; }
  .milestones li.todo .text { color: #cfd8da; }
  li.skipped { opacity: 0.6; }
  .why { margin: 2px 0 0; font-size: 12px; color: var(--dim); }
  .more { margin-top: 4px; padding: 6px 8px; border-left: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); background: #12181a; border-radius: 0 4px 4px 0; }
  .more p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.45; color: #b9c5c8; }
  .complete { position: relative; overflow: hidden; display: flex; align-items: center; gap: 10px; margin: 6px 0 0; padding: 4px 8px; border-radius: 4px; background: #7be08a18; color: #7be08a; font-size: 13px; }
  .complete button { font-size: 12px; padding: 2px 10px; border-color: #7be08a; color: #7be08a; }
  .complete i { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: #7be08a; transform-origin: left; animation: countdown linear forwards; }
  @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  .nav { display: flex; gap: 6px; }
  .nav button { font-size: 12px; padding: 3px 10px; color: var(--dim); }
  .nav button:disabled { opacity: 0.35; }
  .finished { display: grid; gap: 8px; padding: 8px 10px; border-radius: 6px; background: #7be08a14; }
  .finished p { margin: 0; font-size: 13px; color: #7be08a; }
  .finished .dim { color: var(--dim); font-size: 12px; }
  .words summary { font-size: 12px; color: var(--dim); cursor: pointer; }
  .words dl { margin: 6px 0 0; display: grid; gap: 2px; font-size: 12px; }
  .words dt { color: var(--accent); font-weight: 600; }
  .words dd { margin: 0 0 4px; color: #b9c5c8; }

  /* Under the view: stuck to the bottom of the screen, folding to the current step. */
  @media (max-width: 1100px) {
    .guide { top: auto; bottom: 0; max-height: 55vh; box-shadow: 0 -6px 20px #0008; }
    .fold { display: inline-block; }
    .folded { max-height: none; }
    .folded .intro, .folded .practice, .folded .words, .folded .nav, .folded .steps > li:not(.now), .folded .finished button + .dim { display: none; }
    .folded .steps { border-top: none; padding-top: 0; }
  }
  @media (pointer: coarse) {
    header button, .nav button { padding: 6px 12px; }
  }
</style>
