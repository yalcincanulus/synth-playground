<script lang="ts">
  import { ARP_MAX_OCTAVES, ARP_PATTERNS } from "../../audio/arpeggiator";
  import { RATES } from "../../audio/stepSequencer";
  import type { Playground } from "../playground.svelte";
  import Switch from "./Switch.svelte";

  let { pg }: { pg: Playground } = $props();

  let a = $derived(pg.arp);
  const OCTAVES = Array.from({ length: ARP_MAX_OCTAVES }, (_, i) => i + 1);
  const PATTERN_TIPS: Record<(typeof ARP_PATTERNS)[number], string> = {
    Up: "Lowest note to highest, then again",
    Down: "Highest note to lowest, then again",
    "Up-down": "Up, then back down",
    Random: "Any held note, never the same twice in a row",
    Played: "In the order you pressed the keys",
  };

  /** Menus give the focus back, so the computer keyboard plays notes again. */
  const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();
</script>

<div class="arp">
  <Switch on={a.on} label="Arp" title="Arpeggiator: hold notes or a chord and it plays them one at a time, in time with the drums.{pg.hw(' On the MiniLab: Shift + fader 1')}" onchange={() => pg.setArp({ on: !a.on })} />

  {#if a.on}
    <div class="settings">
      <select value={a.pattern} aria-label="Pattern" title={PATTERN_TIPS[ARP_PATTERNS[a.pattern]]} onchange={(e) => {
        pg.setArp({ pattern: +e.currentTarget.value });
        blur(e);
      }}>
        {#each ARP_PATTERNS as name, i (i)}<option value={i}>{name}</option>{/each}
      </select>
      <select value={a.octaves} aria-label="Octaves" title="How many octaves the pattern climbs through{pg.hw(' (Shift + fader 2)')}" onchange={(e) => {
        pg.setArp({ octaves: +e.currentTarget.value });
        blur(e);
      }}>
        {#each OCTAVES as n (n)}<option value={n}>{n} oct</option>{/each}
      </select>
      <select value={a.rate} aria-label="Rate" title="How fast: a note every 8th or 16th of a beat (T = triplets)" onchange={(e) => {
        pg.setArp({ rate: +e.currentTarget.value });
        blur(e);
      }}>
        {#each RATES as r, i (i)}<option value={i}>{r.name}</option>{/each}
      </select>
      <label class="gate" title="Gate: how long each note is held, short and choppy or long and smooth">
        <input type="range" aria-label="Gate" min="0.05" max="1" step="0.05" value={a.gate} oninput={(e) => pg.setArp({ gate: +e.currentTarget.value })} onchange={blur} />
        <span class="value">{Math.round(a.gate * 100)}%</span>
      </label>
      <button class="latch" class:active={a.latch} aria-pressed={a.latch} title="Keeps playing after you let go, until you play a new chord" onclick={(e) => {
        pg.setArp({ latch: !a.latch });
        blur(e);
      }}>Latch</button>
    </div>
  {/if}
</div>

<style>
  .arp { display: flex; align-items: center; gap: 10px; flex: none; font-size: 12px; }
  .settings { display: flex; align-items: center; gap: 6px; }
  select { font-size: 12px; padding: 3px 6px; }
  .gate { display: flex; align-items: center; gap: 5px; color: var(--dim); }
  .gate input { width: 48px; margin: 0; accent-color: var(--accent); }
  .value { font: 11px var(--mono); color: var(--text); min-width: 28px; }
  .latch { font-size: 11.5px; padding: 3px 9px; color: var(--dim); }
  .latch.active { border-color: var(--accent); color: var(--accent); }
</style>
