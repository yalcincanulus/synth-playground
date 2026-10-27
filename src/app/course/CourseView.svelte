<script lang="ts">
  import { formatValue, PARAMS, type ParamId } from "../../audio/params";
  import { introducedOn, markTerms, type Piece, type Term } from "../../course/glossary";
  import { controlsOf, lessonBlockOf } from "../../course/lesson";
  import { FADERS } from "../../presets/presets";
  import { CHAPTERS, PAGES } from "../../course/course";
  import { describe, isPlay, LINGER_MS } from "../../recipes/recipe";
  import type { Playground } from "../playground.svelte";
  import { BLOCKS } from "../synth/blocks";
  import StepText from "../recipes/StepText.svelte";
  import CourseControls from "./CourseControls.svelte";
  import { narrow } from "../media.svelte";
  import ChapterRecipes from "./ChapterRecipes.svelte";
  import CourseContents from "./CourseContents.svelte";
  import CourseGlossary from "./CourseGlossary.svelte";
  import LessonWidget from "./LessonWidget.svelte";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  let course = $derived(pg.course);
  let lesson = $derived(course.lesson);
  let run = $derived(course.run);
  let targetBlock = $derived(pg.targetParams[0] ? lessonBlockOf(pg.targetParams[0]) : null);
  let last = $derived(course.index === course.total - 1);
  let controls = $derived(controlsOf(lesson));
  let faders = $derived(lesson.faders ?? []);
  let paragraphs = $derived(markTerms(lesson.text, course.index));
  let chapterNumber = $derived(CHAPTERS.indexOf(course.chapter) + 1);
  /** The last page of its chapter: it offers the chapter's recipes once done. */
  let chapterEnd = $derived(course.chapter.lessons.at(-1) === lesson);
  /** Where a control is on the MiniLab on this page: knobs in the page's order, the amp envelope on its faders. */
  const where = (id: ParamId) => {
    const knob = lesson.knobs.indexOf(id);
    if (knob >= 0) return `knob ${knob + 1}`;
    return faders.includes(id) ? `fader ${FADERS.indexOf(id) + 1}` : null;
  };

  /** The glossary tooltip: the term pointed at, and where it shows (under the word, or over it near the bottom). */
  let tip = $state.raw<{ term: Term; left: number; top?: number; bottom?: number } | null>(null);
  const TIP_WIDTH = 300;

  function showTip(e: Event, term: Term) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, innerWidth - TIP_WIDTH - 8));
    tip = r.bottom + 140 > innerHeight ? { term, left, bottom: innerHeight - r.top + 6 } : { term, left, top: r.bottom + 6 };
  }
  const hideTip = () => (tip = null);

  // On a phone the page buttons scroll sideways: keep the open page's in view.
  let chips = $state<HTMLElement>();
  $effect(() => {
    void course.index;
    requestAnimationFrame(() => {
      const now = chips?.querySelector<HTMLElement>(".now");
      // Sideways only: scrollIntoView would also move the page up to the buttons.
      if (chips && now) chips.scrollLeft = now.offsetLeft - chips.offsetLeft - (chips.clientWidth - now.offsetWidth) / 2;
    });
  });

  const togglePanel = (panel: "contents" | "glossary") => (course.panel = course.panel === panel ? null : panel);
  const pageNumber = (id: string) => PAGES.findIndex((p) => p.lesson.id === id);
  /** Where step i stands: done, being done now, or still to come. */
  const stepState = (i: number) => (!run ? "todo" : run.done || i < run.index ? "done" : i === run.index ? "now" : "todo");
</script>

<section class="course" aria-label="Learn">
  <header class="pages">
    <div class="chapter">
      <span class="kicker">Learn · Chapter {chapterNumber}</span>
      <h2>{course.chapter.title}</h2>
    </div>
    <ol class="chips" bind:this={chips}>
      {#each course.chapter.lessons as l (l.id)}
        {@const n = pageNumber(l.id)}
        <li>
          <button class:now={n === course.index} class:done={course.isDone(l.id)} onclick={() => course.goTo(n)} title={course.isDone(l.id) ? `${l.title}: done` : l.title}>
            <span class="num">{course.isDone(l.id) ? "✓" : n + 1}</span>{l.title}
          </button>
        </li>
      {/each}
    </ol>
    <div class="nav">
      <button class:on={course.panel === "contents"} aria-pressed={course.panel === "contents"} onclick={() => togglePanel("contents")}>
        Contents <span class="count">{course.done.length}/{course.total}</span>
      </button>
      <button class:on={course.panel === "glossary"} aria-pressed={course.panel === "glossary"} onclick={() => togglePanel("glossary")}>Glossary</button>
      <span class="gap"></span>
      <button onclick={() => course.goTo(course.index - 1)} disabled={course.index === 0}>← Back</button>
      <button class="primary" onclick={() => course.goTo(course.index + 1)} disabled={last}>Next →</button>
    </div>
  </header>

  {#if course.panel === "contents"}
    <CourseContents {pg} />
  {:else if course.panel === "glossary"}
    <CourseGlossary {course} />
  {:else}
  <div class="layout">
    <article class="page">
      <h3><span class="pn">{course.index + 1}</span>{lesson.title}</h3>
      {#each paragraphs as p, i (i)}
        <p>{#each p as piece, j (j)}{@render word(piece)}{/each}</p>
      {/each}

      <div class="widget"><LessonWidget {pg} widget={lesson.widget} {accent} /></div>

      <section class="try" aria-label="Try this">
        <div class="try-title">Try this</div>
        <ol>
          {#each lesson.steps as step, i (i)}
            {@const state = stepState(i)}
            <li class={state}>
              <span class="tick">{state === "done" ? "✓" : i + 1}</span>
              <div>
                <p class="text"><StepText {pg} text={step.text} {where} /></p>
                {#if state === "now" && run}
                  <p class="why"><StepText {pg} text={step.why} {where} /></p>
                  {#if !run.complete}
                    <ul class="checks">
                      {#each step.checks as c, k (k)}
                        <li class:ok={run.holds(k)}>
                          {run.holds(k) ? "✓" : "○"} {describe(c)}
                          {#if !isPlay(c)}<span class="v">now {formatValue(c.param, pg.values[c.param])}</span>{/if}
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="complete">
                      <span>✓ Done. Listen…</span>
                      <button onclick={() => run.next()}>{i + 1 < lesson.steps.length ? "Next step →" : "Finish →"}</button>
                      <i style:animation-duration="{LINGER_MS}ms"></i>
                    </p>
                  {/if}
                {:else if state === "done"}
                  <p class="why done-why"><StepText {pg} text={step.why} {where} /></p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
        {#if run?.done}
          <p class="page-done">
            ✓ Page done.
            {#if last}That's the end of the course.
            {:else if chapterEnd}That's the end of Chapter {chapterNumber}.
              <button class="primary" onclick={() => course.goTo(course.index + 1)}>Next: Chapter {chapterNumber + 1}, {PAGES[course.index + 1].chapter.title} →</button>
            {:else}<button class="primary" onclick={() => course.goTo(course.index + 1)}>Next: {PAGES[course.index + 1].lesson.title} →</button>{/if}
          </p>
          {#if chapterEnd}<div class="chapter-recipes"><ChapterRecipes {pg} chapter={course.chapter} /></div>{/if}
        {:else if run}
          <button class="skip" onclick={() => run.next()}>Skip this step</button>
        {/if}
      </section>
    </article>

    <aside class="mini" aria-label="The synth on this page">
      <!-- The controls first: they are what the steps ask for. On a phone they sit in the dock along the bottom instead. -->
      {#if controls.length && !narrow.current}
        <div class="title">Controls</div>
        <CourseControls {pg} />
      {/if}
      <div class="title">The synth on this page</div>
      <ol class="chain">
        {#each lesson.blocks as b, i (b)}
          {#if i > 0}<li class="arrow" aria-hidden="true">→</li>{/if}
          <li class="link" class:target={b === targetBlock} title={BLOCKS[b].short}>{BLOCKS[b].title}</li>
        {/each}
        {#each lesson.modulators ?? [] as b (b)}
          <li class="link mod" class:target={b === targetBlock} title={BLOCKS[b].short}>{BLOCKS[b].title}</li>
        {/each}
      </ol>
      <p class="hidden-note">The rest of the synth is hidden and held still, so only what this page explains changes the sound.</p>

      {#if pg.hasDevice}
      <div class="title">On the MiniLab</div>
      {#if controls.length}
        <ul class="knobmap">
          {#each lesson.knobs as id, i (id)}
            <li class:target={pg.targetParams.includes(id)}><span class="n">Knob {i + 1}</span>{PARAMS[id].label}<span class="v">{formatValue(id, pg.values[id])}</span></li>
          {/each}
          {#each faders as id (id)}
            <li class:target={pg.targetParams.includes(id)}><span class="n">Fader {FADERS.indexOf(id) + 1}</span>{PARAMS[id].label}<span class="v">{formatValue(id, pg.values[id])}</span></li>
          {/each}
        </ul>
        <p class="dim">
          {lesson.knobs.length ? "The other knobs" : "The knobs"}{faders.length === 4 ? "" : faders.length ? " and the other faders" : " and the faders"} do nothing on this page.
          {#if faders.length}A fader whose setting changed (a new page, A/B) waits until you move it to that value.{/if}
        </p>
      {:else}
        <p class="dim">Only the keys on this page: the knobs and faders do nothing.</p>
      {/if}
      <p class="dim">Turn the encoder for the next or previous page{lesson.widget.kind === "compare" ? "; click it to switch A/B" : ""}.</p>
      {/if}
    </aside>
  </div>
  {/if}
</section>

<!-- A term: hover or focus shows its definition (a click too, for touch). -->
{#snippet word(piece: Piece)}{#if piece.term}{@const term = piece.term}<button class="term" class:bold={piece.bold} aria-describedby={tip?.term === term ? "term-tip" : undefined} onmouseenter={(e) => showTip(e, term)} onmouseleave={hideTip} onfocus={(e) => showTip(e, term)} onblur={hideTip} onclick={(e) => showTip(e, term)}>{piece.t}</button>{:else if piece.bold}<strong>{piece.t}</strong>{:else}{piece.t}{/if}{/snippet}

<svelte:window onscroll={hideTip} />

{#if tip}
  {@const at = introducedOn(tip.term)}
  <div id="term-tip" class="tip" role="tooltip" style:left="{tip.left}px" style:top={tip.top === undefined ? null : `${tip.top}px`} style:bottom={tip.bottom === undefined ? null : `${tip.bottom}px`} style:width="{TIP_WIDTH}px">
    <b>{tip.term.term}</b>
    <span>{tip.term.text}</span>
    {#if at !== course.index}<span class="from">Explained on page {at + 1}, {PAGES[at].lesson.title}</span>{/if}
  </div>
{/if}

<style>
  /* One column that may be narrower than its content, so the page buttons scroll instead of widening the page. */
  .course { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .pages { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .chapter { flex: none; }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  h2 { margin: 0; font-size: 16px; color: var(--accent); }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .chips button { font-size: 12px; padding: 3px 10px 3px 4px; display: flex; align-items: center; gap: 6px; color: var(--dim); }
  .chips .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #222b2f; font: 600 10px var(--mono); color: var(--dim); }
  .chips .done .num { background: color-mix(in srgb, var(--accent) 35%, transparent); color: var(--text); }
  .chips .now { border-color: var(--accent); color: var(--text); }
  .chips .now .num { background: var(--accent); color: #0b1314; }
  .nav { display: flex; gap: 6px; }
  .nav { align-items: center; }
  .nav .gap { width: 8px; }
  .nav .on { border-color: var(--accent); color: var(--text); }
  .count { font: 11px var(--mono); color: var(--dim); margin-left: 4px; }
  .nav button:disabled { opacity: 0.35; cursor: default; }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
  .page { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 18px; }
  h3 { margin: 0 0 8px; font-size: 20px; display: flex; align-items: center; gap: 10px; }
  .pn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #0b1314; font: 600 13px var(--mono); }
  .page > p { margin: 0 0 8px; font-size: 14.5px; line-height: 1.5; color: #cfd8da; max-width: 92ch; }
  .page > p strong { color: var(--accent); font-weight: 600; }
  /* A glossary word: inline text, underlined with dots; a bold one keeps the bold look. */
  .term { all: unset; cursor: help; text-decoration: underline dotted color-mix(in srgb, var(--accent) 70%, transparent); text-underline-offset: 3px; }
  .term.bold { color: var(--accent); font-weight: 600; }
  .term:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; border-radius: 2px; }
  .tip { position: fixed; z-index: 50; display: grid; gap: 3px; padding: 8px 10px; border-radius: 6px; background: #10181a; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); box-shadow: 0 6px 20px #0008; font-size: 13px; line-height: 1.4; color: #cfd8da; pointer-events: none; }
  .tip b { color: var(--accent); }
  .tip .from { font-size: 11.5px; color: var(--dim); }
  .widget { margin: 12px 0; }

  .try { border-top: 1px solid var(--line); padding-top: 10px; }
  .try-title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .try > ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .try > ol > li { display: grid; grid-template-columns: 24px 1fr; gap: 8px; align-items: start; }
  .tick { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #222b2f; font: 600 10px var(--mono); color: var(--dim); margin-top: 1px; }
  .text { margin: 0; font-size: 14px; color: var(--dim); }
  li.now .text { color: var(--text); font-size: 15px; }
  li.now .tick { background: var(--accent); color: #0b1314; }
  li.done .tick { background: #7be08a30; color: #7be08a; }
  li.done .text { color: #9fb0b3; }
  .why { margin: 3px 0 0; font-size: 13px; color: #b9c5c8; line-height: 1.45; }
  .done-why { color: var(--dim); font-size: 12px; }
  .checks { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; font-size: 12px; color: var(--dim); }
  .checks .ok { color: #7be08a; }
  .v { font: 11px var(--mono); color: var(--dim); margin-left: 6px; }
  .complete { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; margin: 6px 0 0; padding: 5px 8px; border-radius: 4px; background: #7be08a18; color: #7be08a; font-size: 13px; }
  .complete button { font-size: 12px; padding: 2px 10px; border-color: #7be08a; color: #7be08a; }
  .complete i { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: #7be08a; transform-origin: left; animation: countdown linear forwards; }
  @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  .chapter-recipes { margin-top: 10px; }
  .page-done { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 10px 0 0; padding: 8px 10px; border-radius: 6px; background: #7be08a14; color: #7be08a; font-size: 14px; }
  .skip { margin-top: 8px; font-size: 11px; padding: 2px 10px; color: var(--dim); }

  .mini { display: grid; gap: 8px; position: sticky; top: 8px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; }
  /* The signal path in one line; the modulators after it, dashed. The block a step is about lights up. */
  .chain { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12px; }
  .chain .link { padding: 2px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: #b9c5c8; cursor: help; }
  .chain .link.mod { border-style: dashed; }
  .chain .link:not(.mod) + .mod { margin-left: 8px; }
  .chain .link.target { border-color: #ffcc33; color: #ffe08a; }
  .arrow { color: var(--accent); }
  .hidden-note { margin: 0; font-size: 11.5px; color: var(--dim); }
  .knobmap { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 13px; }
  .knobmap li { display: flex; gap: 8px; align-items: baseline; }
  .knobmap .n { font: 600 11px var(--mono); color: var(--accent); width: 52px; }
  .knobmap .target { color: #ffe08a; }
  .dim { margin: 0; color: var(--dim); font-size: 12px; }

  @media (max-width: 1000px) {
    .layout { grid-template-columns: 1fr; }
    .mini { position: static; }
  }
  /* Phones: the chapter's pages in one row that scrolls sideways, and Back / Next at the right edge. */
  @media (max-width: 700px) {
    .pages { gap: 8px; }
    .chips { flex: 1 1 100%; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
    .chips li { flex: none; }
    .nav { flex: 1 1 100%; }
    .nav .gap { flex: 1; }
    .page { padding: 12px 14px; }
  }
  /* Touch screens: fingers need bigger targets than a mouse. */
  @media (pointer: coarse) {
    .chips button { padding: 7px 12px 7px 6px; }
    .nav button { padding: 8px 14px; }
    .skip { padding: 6px 12px; }
  }
</style>
