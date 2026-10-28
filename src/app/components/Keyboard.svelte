<script lang="ts">
  interface Props {
    notes: Set<number>;
    /** Keys held but not sounding themselves (the arpeggiator plays them one at a time): outlined. */
    held?: Set<number>;
    from?: number;
    to?: number;
    onnoteon: (note: number) => void;
    onnoteoff: (note: number) => void;
    /** Scale lock: whether a key plays its own note (the others are greyed out: they move to a neighbour). */
    playable?: (note: number) => boolean;
    /** Scale lock: the scale's root (0 = C), marked on its keys. */
    root?: number | null;
    /** A word on a key (the drum it plays), or null for none. */
    label?: (note: number) => string | null;
  }
  let { notes, held = new Set(), from = 36, to = 84, onnoteon, onnoteoff, playable = () => true, root = null, label }: Props = $props();

  const BLACK = new Set([1, 3, 6, 8, 10]);
  let keys = $derived.by(() => {
    const out: { note: number; black: boolean; left: number }[] = [];
    const whites = Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((n) => !BLACK.has(n % 12)).length;
    let wi = 0;
    for (let n = from; n <= to; n++) {
      const black = BLACK.has(n % 12);
      out.push({ note: n, black, left: ((black ? wi - 0.3 : wi) / whites) * 100 });
      if (!black) wi++;
    }
    return { out, whiteWidth: 100 / whites };
  });

  // The note under each finger (or the mouse), so several fingers play a chord and each slides on its own.
  const pointers = new Map<number, number>();
  function down(note: number, e: PointerEvent) {
    // Let go of the capture a touch takes by itself, so sliding a finger moves onto the next key.
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    pointers.set(e.pointerId, note);
    onnoteon(note);
  }
  function enter(note: number, e: PointerEvent) {
    const from = pointers.get(e.pointerId);
    if (from === undefined || from === note || e.buttons === 0) return;
    onnoteoff(from);
    pointers.set(e.pointerId, note);
    onnoteon(note);
  }
  function up(e: PointerEvent) {
    const note = pointers.get(e.pointerId);
    if (note === undefined) return;
    pointers.delete(e.pointerId);
    onnoteoff(note);
  }
</script>

<svelte:window onpointerup={up} onpointercancel={up} />

<div class="keyboard">
  {#each keys.out as k (k.note)}
    <div
      class="key"
      class:black={k.black}
      class:on={notes.has(k.note)}
      class:held={held.has(k.note)}
      class:outside={!playable(k.note)}
      class:root={root !== null && k.note % 12 === root}
      style:left="{k.left}%"
      style:width="{keys.whiteWidth * (k.black ? 0.6 : 1)}%"
      onpointerdown={(e) => down(k.note, e)}
      onpointerenter={(e) => enter(k.note, e)}
      role="presentation"
    >
      {#if label?.(k.note)}<span class="word">{label(k.note)}</span>{:else if k.note % 12 === 0}<span>C{k.note / 12 - 1}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .keyboard { position: relative; height: 76px; user-select: none; touch-action: none; }
  .key { position: absolute; top: 0; bottom: 0; background: #e9edee; border: 1px solid #0b0e10; border-radius: 0 0 4px 4px; cursor: pointer; display: flex; align-items: flex-end; justify-content: center; }
  .key span { font: 9px var(--mono); color: #667; margin-bottom: 4px; pointer-events: none; }
  .key span.word { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9px; color: #445; white-space: nowrap; }
  .key.black span.word { color: #a9b6ba; }
  .key.black { bottom: 38%; background: #15191b; z-index: 1; border-color: #000; }
  .key.on { background: var(--accent); }
  .key.black.on { background: var(--accent); filter: brightness(0.7); }
  .key.held { box-shadow: inset 0 0 0 2px var(--accent), inset 0 -10px 12px -6px color-mix(in srgb, var(--accent) 60%, transparent); }
  .key.outside { background: #8b9497; }
  .key.black.outside { background: #3a4144; }
  .key.root::after { content: ""; position: absolute; left: 25%; right: 25%; bottom: 16px; height: 3px; border-radius: 2px; background: var(--accent); }
  .key.black.root::after { bottom: 6px; }
  .key.on::after { background: #0b1314; }
  @media (pointer: coarse) {
    .keyboard { height: 104px; }
  }
</style>
