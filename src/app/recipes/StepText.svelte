<script lang="ts">
  import { PARAMS, type ParamId } from "../../audio/params";
  import { stepPieces } from "../../recipes/recipe";
  import type { Playground } from "../playground.svelte";

  interface Props {
    pg: Playground;
    /** A step's text or why, with its `[[control]]` and `{{MiniLab aside}}` marks. */
    text: string;
    /** Where a control is on the MiniLab ("knob 1", "fader 3"), if anywhere. */
    where: (id: ParamId) => string | null;
  }
  let { pg, text, where }: Props = $props();
  let pieces = $derived(stepPieces(text));
</script>

<!-- One line on purpose: whitespace between the pieces would show. -->
{#each pieces as p, i (i)}{#if "param" in p}{@const at = pg.hasDevice ? where(p.param) : null}<span class="ctl">{PARAMS[p.param].label}</span>{#if at}<span class="hw">{at}</span>{/if}{:else if "hw" in p}{#if pg.hasDevice}{p.hw}{/if}{:else}{p.t}{/if}{/each}

<style>
  .ctl { font-weight: 600; }
  .hw { font: 600 0.75em var(--mono); color: #0b1314; background: var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 4px; vertical-align: 0.1em; white-space: nowrap; }
</style>
