<script lang="ts">
  interface Props {
    notes: Set<number>;
    from?: number;
    to?: number;
    onnoteon: (note: number) => void;
    onnoteoff: (note: number) => void;
    /** Scale lock: whether a key plays its own note (the others are greyed out: they move to a neighbour). */
    playable?: (note: number) => boolean;
    /** Scale lock: the scale's root (0 = C), marked on its keys. */
    root?: number | null;
  }
  let { notes, from = 36, to = 84, onnoteon, onnoteoff, playable = () => true, root = null }: Props = $props();

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

  let mouseNote: number | null = null;
  function down(note: number, e: PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    mouseNote = note;
    onnoteon(note);
  }
  function enter(note: number, e: PointerEvent) {
    if (mouseNote === null || e.buttons === 0) return;
    onnoteoff(mouseNote);
    mouseNote = note;
    onnoteon(note);
  }
  function up() {
    if (mouseNote !== null) onnoteoff(mouseNote);
    mouseNote = null;
  }
</script>

<svelte:window onpointerup={up} />

<div class="keyboard">
  {#each keys.out as k (k.note)}
    <div
      class="key"
      class:black={k.black}
      class:on={notes.has(k.note)}
      class:outside={!playable(k.note)}
      class:root={root !== null && k.note % 12 === root}
      style:left="{k.left}%"
      style:width="{keys.whiteWidth * (k.black ? 0.6 : 1)}%"
      onpointerdown={(e) => down(k.note, e)}
      onpointerenter={(e) => enter(k.note, e)}
      role="presentation"
    >
      {#if k.note % 12 === 0}<span>C{k.note / 12 - 1}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .keyboard { position: relative; height: 90px; user-select: none; touch-action: none; }
  .key { position: absolute; top: 0; bottom: 0; background: #e9edee; border: 1px solid #0b0e10; border-radius: 0 0 4px 4px; cursor: pointer; display: flex; align-items: flex-end; justify-content: center; }
  .key span { font: 9px var(--mono); color: #667; margin-bottom: 4px; pointer-events: none; }
  .key.black { bottom: 38%; background: #15191b; z-index: 1; border-color: #000; }
  .key.on { background: var(--accent); }
  .key.black.on { background: var(--accent); filter: brightness(0.7); }
  .key.outside { background: #8b9497; }
  .key.black.outside { background: #3a4144; }
  .key.root::after { content: ""; position: absolute; left: 25%; right: 25%; bottom: 16px; height: 3px; border-radius: 2px; background: var(--accent); }
  .key.black.root::after { bottom: 6px; }
  .key.on::after { background: #0b1314; }
</style>
