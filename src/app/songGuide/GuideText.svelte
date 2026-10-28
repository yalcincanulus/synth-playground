<script lang="ts" module>
  /**
   * A piece of a lesson's text: plain words, a glossary word (**…**), a button's label (`…`), a synth control
   * ([[…]]), a MiniLab aside ({{…}}), or words with a MiniLab and without one ({{…|…}}; they may hold the
   * other marks, synth controls aside).
   */
  export type GuidePiece = { t: string } | { term: string } | { ui: string } | { param: ParamId } | { hw: string; without: string };

  const hwPiece = (s: string) => {
    const bar = s.indexOf("|");
    return bar < 0 ? { hw: s, without: "" } : { hw: s.slice(0, bar), without: s.slice(bar + 1) };
  };

  export const guidePieces = (text: string): GuidePiece[] =>
    text
      .split(/(\{\{.+?\}\}|\*\*.+?\*\*|`[^`]+`|\[\[\w+\]\])/)
      .filter(Boolean)
      .map((s) =>
        s.startsWith("**") ? { term: s.slice(2, -2) } : s.startsWith("`") ? { ui: s.slice(1, -1) } : s.startsWith("[[") ? { param: s.slice(2, -2) as ParamId } : s.startsWith("{{") ? hwPiece(s.slice(2, -2)) : { t: s },
      );
</script>

<script lang="ts">
  import { PARAMS, type ParamId } from "../../audio/params";
  import { songTerm } from "../../course/song/glossary";
  import type { Playground } from "../playground.svelte";

  let { pg, text }: { pg: Playground; text: string } = $props();
  let pieces = $derived(guidePieces(text));
</script>

<!-- One line on purpose: whitespace between the pieces would show. -->
{#each pieces as p, i (i)}{#if "term" in p}<b class="term" title={songTerm(p.term)?.text}>{p.term}</b>{:else if "ui" in p}<span class="ui">{p.ui}</span>{:else if "param" in p}<b>{PARAMS[p.param].label}</b>{:else if "hw" in p}{@const said = pg.hasDevice ? p.hw : p.without}{#if said}{#each guidePieces(said) as q, k (k)}{#if "term" in q}<b class="term" title={songTerm(q.term)?.text}>{q.term}</b>{:else if "ui" in q}<span class="ui">{q.ui}</span>{:else if "t" in q}{q.t}{/if}{/each}{/if}{:else}{p.t}{/if}{/each}

<style>
  .term { color: var(--accent); font-weight: 600; cursor: help; text-decoration: underline dotted color-mix(in srgb, var(--accent) 60%, transparent); text-underline-offset: 3px; }
  .ui { font-size: 0.92em; font-weight: 600; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; background: #1c2326; white-space: nowrap; }
</style>
