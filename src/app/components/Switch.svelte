<script lang="ts">
  /** An on/off switch: a pill with a sliding dot, then its label. */
  let { on, label, title, onchange }: { on: boolean; label: string; title?: string; onchange: () => void } = $props();
</script>

<!-- The focus goes back after a click, so the computer keyboard plays notes again. -->
<button class="switch" class:on role="switch" aria-checked={on} {title} onclick={(e) => { onchange(); e.currentTarget.blur(); }}>
  <span class="track"><span class="thumb"></span></span>
  {label}
</button>

<style>
  .switch { display: flex; align-items: center; gap: 8px; flex: none; background: none; border: none; padding: 4px 2px; color: var(--dim); font-size: 12px; }
  .switch:hover { color: var(--text); }
  .track { position: relative; width: 30px; height: 16px; border-radius: 8px; background: #2a3338; border: 1px solid var(--line); transition: background 0.15s; }
  .thumb { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #8b9497; transition: transform 0.15s, background 0.15s; }
  .on { color: var(--text); }
  .on .track { background: color-mix(in srgb, var(--accent) 35%, #0b0e10); border-color: var(--accent); }
  .on .thumb { transform: translateX(14px); background: var(--accent); }
</style>
