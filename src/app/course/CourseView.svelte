<script lang="ts">
  import { formatValue, PARAMS } from "../../audio/params";
  import { controlsOf, lessonBlockOf } from "../../course/lesson";
  import { FADERS } from "../../presets/presets";
  import { CHAPTERS, PAGES } from "../../course/course";
  import { describe, isPlay, LINGER_MS } from "../../recipes/recipe";
  import type { Playground } from "../playground.svelte";
  import { BLOCKS } from "../synth/blocks";
  import ParamControl from "../synth/ParamControl.svelte";
  import LessonWidget from "./LessonWidget.svelte";

  let { pg, accent }: { pg: Playground; accent: string } = $props();

  let course = $derived(pg.course);
  let lesson = $derived(course.lesson);
  let run = $derived(course.run);
  let targetBlock = $derived(pg.targetParams[0] ? lessonBlockOf(pg.targetParams[0]) : null);
  let last = $derived(course.index === course.total - 1);
  let controls = $derived(controlsOf(lesson));
  let faders = $derived(lesson.faders ?? []);

  /** A paragraph cut into plain text and **bold** words. */
  const pieces = (text: string) => text.split(/\*\*(.+?)\*\*/).map((t, i) => ({ t, bold: i % 2 === 1 }));
  const pageNumber = (id: string) => PAGES.findIndex((p) => p.lesson.id === id);
  /** Where step i stands: done, being done now, or still to come. */
  const stepState = (i: number) => (!run ? "todo" : run.done || i < run.index ? "done" : i === run.index ? "now" : "todo");
</script>

<section class="course" aria-label="Learn">
  <header class="pages">
    <div class="chapter">
      <span class="kicker">Learn · Chapter {CHAPTERS.indexOf(course.chapter) + 1}</span>
      <h2>{course.chapter.title}</h2>
    </div>
    <ol class="chips">
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
      <button onclick={() => course.goTo(course.index - 1)} disabled={course.index === 0}>← Back</button>
      <button class="primary" onclick={() => course.goTo(course.index + 1)} disabled={last}>Next →</button>
    </div>
  </header>

  <div class="layout">
    <article class="page">
      <h3><span class="pn">{course.index + 1}</span>{lesson.title}</h3>
      {#each lesson.text as p, i (i)}
        <p>{#each pieces(p) as piece, j (j)}{#if piece.bold}<strong>{piece.t}</strong>{:else}{piece.t}{/if}{/each}</p>
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
                <p class="text">{step.text}</p>
                {#if state === "now" && run}
                  <p class="why">{step.why}</p>
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
                  <p class="why done-why">{step.why}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
        {#if run?.done}
          <p class="page-done">
            ✓ Page done.
            {#if !last}<button class="primary" onclick={() => course.goTo(course.index + 1)}>Next: {PAGES[course.index + 1].lesson.title} →</button>
            {:else}That's the end of Chapter {CHAPTERS.indexOf(course.chapter) + 1}. More chapters are coming.{/if}
          </p>
        {:else if run}
          <button class="skip" onclick={() => run.next()}>Skip this step</button>
        {/if}
      </section>
    </article>

    <aside class="mini" aria-label="The synth on this page">
      <div class="title">The synth on this page</div>
      <div class="blocks">
        {#each lesson.blocks as b, i (b)}
          {@const own = controls.filter((id) => lessonBlockOf(id) === b)}
          {#if i > 0}<div class="arrow" aria-hidden="true">↓</div>{/if}
          <div class="block" class:target={b === targetBlock}>
            <h4>{BLOCKS[b].title}</h4>
            <p>{BLOCKS[b].short}</p>
            {#if own.length}
              <div class="controls">
                {#each own as id (id)}<ParamControl {pg} {id} />{/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      {#if lesson.modulators?.length}
        <div class="title">Shaping it</div>
        {#each lesson.modulators as b (b)}
          {@const own = controls.filter((id) => lessonBlockOf(id) === b)}
          <div class="block mod" class:target={b === targetBlock}>
            <h4>{BLOCKS[b].title}</h4>
            <p>{BLOCKS[b].short}</p>
            {#if own.length}
              <div class="controls" class:four={own.length > 2}>
                {#each own as id (id)}<ParamControl {pg} {id} />{/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
      <p class="hidden-note">The rest of the synth is hidden and held still, so only what this page explains changes the sound.</p>

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
      <p class="progress">
        {course.done.length} of {course.total} pages done
        {#if course.done.length}<button class="link" onclick={() => course.reset()}>reset</button>{/if}
      </p>
    </aside>
  </div>
</section>

<style>
  .course { display: grid; gap: 10px; }
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
  .nav button:disabled { opacity: 0.35; cursor: default; }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
  .page { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 18px; }
  h3 { margin: 0 0 8px; font-size: 20px; display: flex; align-items: center; gap: 10px; }
  .pn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #0b1314; font: 600 13px var(--mono); }
  .page > p { margin: 0 0 8px; font-size: 14.5px; line-height: 1.5; color: #cfd8da; max-width: 92ch; }
  .page > p strong { color: var(--accent); font-weight: 600; }
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
  .page-done { display: flex; align-items: center; gap: 12px; margin: 10px 0 0; padding: 8px 10px; border-radius: 6px; background: #7be08a14; color: #7be08a; font-size: 14px; }
  .skip { margin-top: 8px; font-size: 11px; padding: 2px 10px; color: var(--dim); }

  .mini { display: grid; gap: 8px; position: sticky; top: 8px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; }
  .blocks { display: grid; justify-items: stretch; }
  .arrow { text-align: center; color: var(--accent); line-height: 18px; font-size: 14px; }
  .block { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; transition: border-color 0.2s, box-shadow 0.2s; }
  .block.target { border-color: #ffcc33; box-shadow: 0 0 0 1px #ffcc33, 0 0 14px #ffcc3340; }
  h4 { margin: 0; font-size: 13px; }
  .block p { margin: 2px 0 0; font-size: 11.5px; color: var(--dim); line-height: 1.35; }
  .controls { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; align-items: start; }
  .controls.four { grid-template-columns: repeat(4, 1fr); }
  /* A knob's box is only as wide as the knob, so its number badge sits at the knob, not at the edge of a wide cell. */
  .controls :global(.knob-wrap) { justify-self: center; }
  .block.mod { border-style: dashed; }
  .hidden-note { margin: 0; font-size: 11.5px; color: var(--dim); }
  .knobmap { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 13px; }
  .knobmap li { display: flex; gap: 8px; align-items: baseline; }
  .knobmap .n { font: 600 11px var(--mono); color: var(--accent); width: 52px; }
  .knobmap .target { color: #ffe08a; }
  .dim { margin: 0; color: var(--dim); font-size: 12px; }
  .progress { margin: 4px 0 0; font-size: 12px; color: var(--dim); }
  .link { background: none; border: none; padding: 0 4px; color: var(--dim); text-decoration: underline; font-size: 12px; }

  @media (max-width: 1000px) {
    .layout { grid-template-columns: 1fr; }
    .mini { position: static; }
  }
</style>
