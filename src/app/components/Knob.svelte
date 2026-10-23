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
    onchange: (position: number) => void;
    onreset?: () => void;
  }
  let { label, display, position, hot = false, number, size = 64, onchange, onreset }: Props = $props();

  const R = 26;
  const START = 225;
  const SWEEP = 270;
  const point = (t: number, r = R) => {
    const a = ((START - SWEEP * t) * Math.PI) / 180;
    return [32 + r * Math.cos(a), 32 - r * Math.sin(a)];
  };
  const arc = (t: number) => {
    const [x0, y0] = point(0);
    const [x1, y1] = point(Math.max(t, 0.0001));
    return `M ${x0} ${y0} A ${R} ${R} 0 ${t > 2 / 3 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  let pointer = $derived(point(position, 14));
</script>

<div class="knob" class:hot class:small={size < 56}>
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
    <path d={arc(1)} class="track" />
    <path d={arc(position)} class="value" />
    <circle cx="32" cy="32" r="18" class="face" />
    <line x1="32" y1="32" x2={pointer[0]} y2={pointer[1]} class="pointer" />
  </svg>
  <div class="label">{#if number}<span class="num">{number}</span>{/if}{label}</div>
  <div class="display">{display}</div>
</div>

<style>
  .knob { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  svg { width: 64px; height: 64px; cursor: ns-resize; touch-action: none; outline: none; }
  svg:focus-visible .face { stroke: var(--accent); }
  .track { fill: none; stroke: var(--line); stroke-width: 4; stroke-linecap: round; }
  .value { fill: none; stroke: var(--accent); stroke-width: 4; stroke-linecap: round; transition: stroke 0.2s; }
  .face { fill: #262d31; stroke: #3a454b; stroke-width: 1.5; }
  .hot .face { fill: #33403f; }
  .pointer { stroke: #e8eef0; stroke-width: 3; stroke-linecap: round; }
  .label { font-size: 12px; color: var(--text); white-space: nowrap; }
  .small .label { font-size: 11px; }
  .small .display { font-size: 10px; }
  .num { color: var(--dim); margin-right: 4px; font-size: 10px; }
  .display { font: 11px var(--mono); color: var(--dim); white-space: nowrap; }
  .hot .display { color: var(--accent); }
</style>
