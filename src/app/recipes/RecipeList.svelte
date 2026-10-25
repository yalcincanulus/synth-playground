<script lang="ts">
  import { RECIPES } from "../../recipes/library";
  import { aimOf, initValues, isPlay, type Recipe } from "../../recipes/recipe";
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  /** The recipe's colour (the MiniLab's 0-127 LED range) as CSS. */
  const rgb = (c: [number, number, number]) => `rgb(${c.map((x) => Math.round((x / 127) * 255)).join(" ")})`;

  /**
   * The finished sound's volume shape (its amp envelope), as an SVG path in a 120 x 36 box: what you
   * will build, at a glance. Attack, decay and release are drawn on a log-ish scale so 5 ms and 2 s both show.
   */
  function envelopePath(recipe: Recipe): string {
    const v = initValues();
    for (const step of recipe.steps) for (const c of step.checks) if (!isPlay(c)) v[c.param] = aimOf(c);
    const len = (s: number) => 4 + 22 * Math.min(1, Math.log10(1 + s * 20) / Math.log10(41));
    const top = 4, bottom = 32;
    const y = (level: number) => bottom - (bottom - top) * level;
    const a = len(v.attack), d = len(v.decay), r = len(v.release);
    const x1 = 4 + a, x2 = x1 + d, x3 = Math.max(x2 + 10, 120 - 4 - r);
    return `M4 ${bottom} L${x1} ${top} L${x2} ${y(v.sustain)} L${x3} ${y(v.sustain)} L${x3 + r} ${bottom}`;
  }
</script>

<section class="list" aria-label="Recipes">
  <header>
    <h3>Recipes</h3>
    <p>Build a classic sound yourself, one step at a time. Each recipe starts from <strong>Init</strong>, a blank sound, on the Keys part: the sound you had there is replaced (save it first if you want to keep it).</p>
    <button onclick={() => (pg.recipeList = false)} aria-label="Close the recipe list">×</button>
  </header>
  <div class="cards">
    {#each RECIPES as r (r.id)}
      <button class="card" style:--c={rgb(r.color)} onclick={() => pg.startRecipe(r.id)}>
        <span class="meta"><span class="cat">{r.category}</span><span class="steps">{r.steps.length} steps</span></span>
        <span class="name">{r.name}</span>
        <span class="sum">{r.summary}</span>
        <span class="shape" title="The finished sound's volume shape: how each note rises, holds and fades">
          <svg viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">
            <line x1="4" y1="32" x2="116" y2="32" />
            <path d={envelopePath(r)} />
          </svg>
          <span class="caption">volume shape</span>
        </span>
      </button>
    {/each}
  </div>
</section>

<style>
  .list { background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; display: grid; gap: 10px; }
  header { display: flex; align-items: baseline; gap: 14px; }
  h3 { margin: 0; font-size: 15px; color: var(--accent); }
  header p { margin: 0; flex: 1; font-size: 12px; color: #b9c5c8; }
  header button { padding: 0 8px; font-size: 16px; color: var(--dim); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  /* A soft glow of the recipe's colour from the top right, fading into the panel. */
  .card {
    display: grid; grid-template-rows: auto auto 1fr auto; gap: 6px; text-align: left; padding: 10px 12px 8px;
    border-radius: 8px; border-color: color-mix(in srgb, var(--c) 18%, var(--line));
    background:
      radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 65%),
      linear-gradient(160deg, color-mix(in srgb, var(--c) 7%, var(--panel)), var(--panel) 70%);
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--c) 60%, transparent); transform: translateY(-1px);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--c) 14%, transparent);
  }
  .meta { display: flex; align-items: center; justify-content: space-between; }
  .cat { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text); padding: 1px 7px; border: 1px solid var(--line); border-radius: 999px; }
  .steps { font: 10px var(--mono); color: var(--dim); }
  .name { font-size: 15px; font-weight: 600; color: var(--text); }
  .sum { font-size: 12px; color: #a9b6ba; line-height: 1.35; }
  .shape { display: grid; gap: 2px; padding-top: 6px; border-top: 1px solid color-mix(in srgb, var(--c) 15%, var(--line)); }
  svg { width: 100%; height: 32px; display: block; }
  svg line { stroke: #2a3338; stroke-width: 1; vector-effect: non-scaling-stroke; }
  svg path { fill: none; stroke: #9aa7ab; stroke-width: 1.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; transition: stroke 0.15s; }
  .card:hover svg path { stroke: color-mix(in srgb, var(--c) 75%, white); }
  .caption { font-size: 9px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; }
</style>
