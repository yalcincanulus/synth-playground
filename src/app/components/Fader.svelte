<script lang="ts">
  import { dragValue } from "./drag";

  interface Props {
    label: string;
    display: string;
    position: number;
    hot?: boolean;
    /** Track length in pixels. */
    height?: number;
    onchange: (position: number) => void;
  }
  let { label, display, position, hot = false, height = 120, onchange }: Props = $props();
</script>

<div class="fader" class:hot>
  <div
    class="track"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuenow={Math.round(position * 127)}
    aria-valuemin={0}
    aria-valuemax={127}
    style:height="{height}px"
    use:dragValue={{ get: () => position, set: onchange, range: height }}
  >
    <div class="fill" style:height="{position * 100}%"></div>
    <div class="thumb" style:bottom="{position * 100}%"></div>
  </div>
  <div class="label">{label}</div>
  <div class="display">{display}</div>
</div>

<style>
  .fader { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .track { width: 8px; background: #0b0e10; border-radius: 4px; position: relative; cursor: ns-resize; touch-action: none; margin: 8px 0; outline: none; }
  .fill { position: absolute; bottom: 0; left: 0; right: 0; background: var(--accent); opacity: 0.5; border-radius: 4px; }
  .thumb { position: absolute; left: 50%; width: 34px; height: 16px; transform: translate(-50%, 50%); background: linear-gradient(#f2f4f5, #c7cdd0); border-radius: 3px; box-shadow: 0 2px 4px #0008; }
  .thumb::after { content: ""; position: absolute; left: 4px; right: 4px; top: 7px; height: 2px; background: #333; }
  .track:focus-visible .thumb, .hot .thumb { outline: 2px solid var(--accent); }
  .label { font-size: 12px; }
  .display { font: 11px var(--mono); color: var(--dim); white-space: nowrap; }
  .hot .display { color: var(--accent); }
</style>
