<script lang="ts" module>
  export type Side = "l" | "r" | "t" | "b";
  export interface Cable {
    from: string;
    to: string;
    fromSide: Side;
    toSide: Side;
    kind: "audio" | "mod";
    color: string;
    /** Stroke width in px. */
    width: number;
    /** Seconds per dash cycle, for animated modulation cables. */
    period?: number;
    /** Drawn faint: connected but currently doing nothing. */
    idle?: boolean;
    label?: string;
    /** Where along the side the cable attaches, 0..1 (default: the middle). */
    fromAt?: number;
    toAt?: number;
    /** Most the cable may bulge out from its blocks, in px. */
    reach?: number;
    /** A mod matrix route (its slot, and its source by MOD_SOURCES index): its end can be dragged. */
    route?: { n: number; src: number };
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { usePatchDrag } from "./patchDrag.svelte";

  let { container, cables }: { container: HTMLElement; cables: Cable[] } = $props();
  const drag = usePatchDrag();

  type Rect = { x: number; y: number; w: number; h: number };
  let rects = $state<Record<string, Rect>>({});
  let size = $state({ w: 0, h: 0 });

  function measure() {
    const base = container.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    for (const el of container.querySelectorAll<HTMLElement>("[data-block]")) {
      const r = el.getBoundingClientRect();
      next[el.dataset.block!] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    }
    rects = next;
    size = { w: base.width, h: base.height };
  }

  onMount(() => {
    // Blocks change size when explanations toggle or controls change, so watch each one.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    for (const el of container.querySelectorAll("[data-block]")) ro.observe(el);
    measure();
    return () => ro.disconnect();
  });

  // Moving an effect along the chain moves blocks without resizing them: measure again when the cables change.
  $effect(() => {
    void cables;
    untrack(measure);
  });

  const NORMAL: Record<Side, [number, number]> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

  function anchor(r: Rect, side: Side, at = 0.5): [number, number] {
    if (side === "l") return [r.x, r.y + r.h * at];
    if (side === "r") return [r.x + r.w, r.y + r.h * at];
    if (side === "t") return [r.x + r.w * at, r.y];
    return [r.x + r.w * at, r.y + r.h];
  }

  function path(c: Cable): string | null {
    const a = rects[c.from];
    const b = rects[c.to];
    if (!a || !b) return null;
    const [x0, y0] = anchor(a, c.fromSide, c.fromAt);
    const [x3, y3] = anchor(b, c.toSide, c.toAt);
    const k = Math.min(c.reach ?? Infinity, Math.max(28, Math.hypot(x3 - x0, y3 - y0) * 0.35));
    const [n0x, n0y] = NORMAL[c.fromSide];
    const [n3x, n3y] = NORMAL[c.toSide];
    return `M ${x0} ${y0} C ${x0 + n0x * k} ${y0 + n0y * k}, ${x3 + n3x * k} ${y3 + n3y * k}, ${x3} ${y3}`;
  }

  /** The route whose end is being dragged: drawn by the drag instead. */
  let moving = $derived(drag?.state?.route ?? null);
  let audio = $derived(cables.filter((c) => c.kind === "audio"));
  let mod = $derived(cables.filter((c) => c.kind === "mod" && (c.route?.n ?? -1) !== moving));
  let ends = $derived(
    mod.flatMap((c) => {
      const r = rects[c.to];
      return c.route && r ? [{ c, route: c.route, at: anchor(r, c.toSide, c.toAt) }] : [];
    }),
  );
</script>

{#snippet lines(list: Cable[])}
  {#each list as c (c.from + c.to + (c.label ?? ""))}
    {@const d = path(c)}
    {#if d}
      <path {d} class={c.kind} class:idle={c.idle} stroke={c.color} stroke-width={c.width} style:--period="{c.period ?? 1.2}s">
        {#if c.label}<title>{c.label}</title>{/if}
      </path>
    {/if}
  {/each}
{/snippet}

<!-- Behind the blocks: cables show in the gaps between them and never cover controls. -->
<svg width={size.w} height={size.h}>{@render lines(audio)}{@render lines(mod)}</svg>
<!-- Route cables' ends, above the blocks: drag one to another destination, or away to remove the route. -->
{#if drag}
  <div class="ends">
    {#each ends as { c, route, at } (route.n)}
      <button
        class="end"
        style:left="{at[0]}px"
        style:top="{at[1]}px"
        style:background={c.color}
        title="{c.label}: drag to another block to move it, or into empty space to remove it"
        aria-label="Route {route.n} end"
        onpointerdown={(e) => drag.press(e, route.src, route.n)}
        onclick={(e) => drag.click(e, route.src, route.n)}
      ></button>
    {/each}
  </div>
{/if}

<style>
  svg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: visible; }
  path { fill: none; stroke-linecap: round; transition: stroke-width 0.15s; }
  .audio { opacity: 0.7; }
  .mod { stroke-dasharray: 6 6; opacity: 0.85; animation: flow var(--period) linear infinite; }
  .idle { opacity: 0.18; animation: none; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  .ends { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .end {
    position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; padding: 0; border-radius: 50%;
    border: 2px solid #0b1314; pointer-events: auto; cursor: grab; touch-action: none;
  }
  .end:hover, .end:focus-visible { transform: scale(1.35); }
</style>
