<script lang="ts">
  import { onMount } from "svelte";
  import { DRUM_NAMES } from "../../audio/drums";
  import type { Pattern } from "../../audio/sequencer";

  interface Props {
    pattern: Pattern;
    getStep: () => number;
    levels: number[];
    /** Track being step-edited on the pads, if any. */
    selected?: number | null;
    ontoggle: (track: number, step: number) => void;
    onselect?: (track: number) => void;
  }
  let { pattern, getStep, levels, selected = null, ontoggle, onselect }: Props = $props();

  let step = $state(-1);
  onMount(() => {
    let frame = 0;
    const tick = () => {
      step = getStep();
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="seq">
  {#each pattern as row, track}
    <button class="name" class:selected={selected === track} style:--level={levels[track]} onclick={() => onselect?.(track)}>
      {DRUM_NAMES[track]}
    </button>
    {#each row as vel, s}
      <button
        class="cell"
        class:on={vel > 0}
        class:now={s === step}
        class:beat={s % 4 === 0}
        style:--vel={vel / 127}
        onclick={() => ontoggle(track, s)}
        aria-label="{DRUM_NAMES[track]} step {s + 1}"
      ></button>
    {/each}
  {/each}
</div>

<style>
  .seq { display: grid; grid-template-columns: 74px repeat(16, 1fr); gap: 3px; align-items: center; }
  .name { font-size: 11px; color: var(--dim); position: relative; background: none; border: none; padding: 0; text-align: left; cursor: pointer; }
  .name.selected { color: var(--accent); font-weight: 600; }
  .name::before { content: ""; position: absolute; left: -8px; top: 50%; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: var(--accent); opacity: var(--level); }
  .cell { height: 16px; padding: 0; border: none; border-radius: 3px; background: #1e2427; cursor: pointer; }
  .cell.beat { background: #252d31; }
  .cell.on { background: var(--accent); opacity: calc(0.45 + var(--vel) * 0.55); }
  .cell.now { outline: 1px solid #fff8; }
  .cell.now.on { filter: brightness(1.5); }
</style>
