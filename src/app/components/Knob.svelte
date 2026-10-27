<script module lang="ts">
  /** A modulation drawn around the knob: the range it reaches (knob positions 0..1) and where it is now. */
  export interface KnobRing {
    lo: number;
    hi: number;
    live: number | null;
    color: string;
    /** Faded: connected but doing nothing, or another source is being shown. */
    dim?: boolean;
    title?: string;
  }
</script>

<script lang="ts">
  import { dragValue } from "./drag";

  interface Props {
    label: string;
    display: string;
    /** 0..1 */
    position: number;
    hot?: boolean;
    number?: number;
    /** Rendered size in pixels. */
    size?: number;
    /** Label and value beside the knob instead of under it: half the height, for dense panels. */
    inline?: boolean;
    onchange: (position: number) => void;
    onreset?: () => void;
    /** Modulations, one ring each, outside the value arc. */
    rings?: KnobRing[];
  }
  let { label, display, position, hot = false, number, size = 64, inline = false, onchange, onreset, rings = [] }: Props = $props();

  const R = 26;
  const START = 225;
  const SWEEP = 270;
  const point = (t: number, r = R) => {
    const a = ((START - SWEEP * t) * Math.PI) / 180;
    return [32 + r * Math.cos(a), 32 - r * Math.sin(a)];
  };
  const arc = (from: number, to: number, r = R) => {
    const [a, b] = from < to ? [from, to] : [to, from];
    const [x0, y0] = point(a, r);
    const [x1, y1] = point(Math.max(b, a + 0.004), r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${b - a > 2 / 3 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  /** Ring i's radius: outside the value arc, one inside the next. */
  const ringR = (i: number) => R + 4.5 + i * 3.5;
  let pointer = $derived(point(position, 14));
</script>

<div class="knob" class:hot class:small={size < 56} class:inline>
  <svg
    style:width="{size}px"
    style:height="{size}px"
    viewBox="0 0 64 64"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuenow={Math.round(position * 127)}
    aria-valuemin={0}
    aria-valuemax={127}
    use:dragValue={{ get: () => position, set: onchange }}
    ondblclick={onreset}
  >
    <path d={arc(0, 1)} class="track" />
    <path d={arc(0, position)} class="value" />
    {#each rings as ring, i (i)}
      <g class="ring" class:dim={ring.dim} style:color={ring.color}>
        {#if ring.title}<title>{ring.title}</title>{/if}
        <path d={arc(ring.lo, ring.hi, ringR(i))} />
        {#if ring.live !== null}{@const [x, y] = point(ring.live, ringR(i))}<circle cx={x} cy={y} r="2.6" />{/if}
      </g>
    {/each}
    <circle cx="32" cy="32" r="18" class="face" />
    <line x1="32" y1="32" x2={pointer[0]} y2={pointer[1]} class="pointer" />
  </svg>
  <div class="text">
    <div class="label">{#if number}<span class="num">{number}</span>{/if}{label}</div>
    <div class="display">{display}</div>
  </div>
</div>

<style>
  .knob { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  .knob:not(.inline) .text { display: contents; }
  .knob.inline { flex-direction: row; gap: 4px; width: 100%; }
  .inline svg { flex: none; }
  .inline .text { min-width: 0; display: grid; }
  .inline .label, .inline .display { overflow: hidden; text-overflow: ellipsis; }
  .inline .label { font-size: 10.5px; }
  svg { width: 64px; height: 64px; cursor: ns-resize; touch-action: none; outline: none; overflow: visible; }
  svg:focus-visible .face { stroke: var(--accent); }
  .track { fill: none; stroke: var(--line); stroke-width: 4; stroke-linecap: round; }
  .value { fill: none; stroke: var(--accent); stroke-width: 4; stroke-linecap: round; transition: stroke 0.2s; }
  .face { fill: #262d31; stroke: #3a454b; stroke-width: 1.5; }
  .hot .face { fill: #33403f; }
  .ring path { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; opacity: 0.85; }
  .ring circle { fill: currentColor; stroke: #0b0e10; stroke-width: 1; }
  .ring.dim { opacity: 0.3; }
  .pointer { stroke: #e8eef0; stroke-width: 3; stroke-linecap: round; }
  .label { font-size: 12px; color: var(--text); white-space: nowrap; }
  .small .label { font-size: 11px; }
  .small .display { font-size: 10px; }
  .num { color: var(--dim); margin-right: 4px; font-size: 10px; }
  .display { font: 11px var(--mono); color: var(--dim); white-space: nowrap; }
  .hot .display { color: var(--accent); }
</style>
