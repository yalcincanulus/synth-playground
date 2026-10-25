<script lang="ts">
  /**
   * One line of text that fits its box. Text too long for it slides slowly to show the rest, waits, and
   * slides back, like a long song title in a media player.
   */
  let { text }: { text: string } = $props();

  let box: HTMLElement;
  /** The text; new for each text, so a new name starts sliding from its beginning. */
  let inner = $state<HTMLElement>();
  /** How much of the text doesn't fit, in px (0: it fits). It slides a little further, past the faded edge. */
  let overflow = $state(0);

  function measure() {
    if (inner) overflow = Math.max(0, Math.ceil(inner.scrollWidth - box.clientWidth));
  }

  $effect(() => {
    void inner;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  });
</script>

<span class="marquee" class:sliding={overflow > 0} bind:this={box} title={overflow > 0 ? text : undefined}>
  <!-- About 30 px a second, with pauses at both ends. -->
  {#key text}
    <span class="inner" bind:this={inner} style:--slide="-{overflow + 14}px" style:--time="{3 + (overflow / 30) * 2}s">{text}</span>
  {/key}
</span>

<style>
  .marquee { display: block; overflow: hidden; white-space: nowrap; min-width: 0; }
  .inner { display: inline-block; }
  .sliding .inner { animation: slide var(--time) ease-in-out infinite; }
  /* Fade the cut edge so it reads as "more to come". */
  .sliding { mask-image: linear-gradient(to right, #000 calc(100% - 12px), transparent); }
  @keyframes slide {
    0%, 25% { transform: translateX(0); }
    50%, 75% { transform: translateX(var(--slide)); }
    100% { transform: translateX(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sliding .inner { animation: none; }
  }
</style>
