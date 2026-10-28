<script lang="ts">
  // Small drawn pictures for the ideas that are hardest in words. Only the beats picture moves: its playhead
  // goes round the loop (still, for those who ask for less motion).
  import type { DiagramKind } from "../../course/song/guide";

  let { kind }: { kind: DiagramKind } = $props();
  const BEATS = Array.from({ length: 16 }, (_, i) => i);
</script>

<figure class="diagram">
  {#if kind === "beats"}
    <svg viewBox="0 0 300 92" role="img" aria-label="Four bars of four beats each, with the playhead going back to bar 1 at the end of the loop">
      {#each [0, 1, 2, 3] as bar (bar)}
        <rect x={10 + bar * 70} y="22" width="66" height="34" rx="4" class="bar" />
        <text x={14 + bar * 70} y="16" class="num">Bar {bar + 1}</text>
      {/each}
      {#each BEATS as b (b)}
        <circle cx={19 + Math.floor(b / 4) * 70 + (b % 4) * 16} cy="39" r={b % 4 === 0 ? 5 : 3.5} class="beat" class:one={b % 4 === 0} />
      {/each}
      <line x1="10" y1="18" x2="10" y2="60" class="head" />
      <path d="M 288 66 C 288 86, 12 86, 12 66" class="back" />
      <text x="150" y="88" class="note" text-anchor="middle">a 4-bar loop: at the end, back to bar 1</text>
    </svg>
    <figcaption>Each dot is a beat, the big ones are the 1 of each bar. Four beats make a bar.</figcaption>
  {:else if kind === "grid"}
    <svg viewBox="0 0 300 110" role="img" aria-label="A piano roll: pitch goes up, time goes right; a note drawn between grid lines snaps onto the nearest one">
      <rect x="34" y="6" width="258" height="84" class="bar" />
      {#each [0, 1, 2, 3, 4, 5, 6] as r (r)}
        <rect x="6" y={6 + r * 12} width="26" height="12" class={[1, 3, 6].includes(r) ? "black" : "white"} />
      {/each}
      {#each Array.from({ length: 9 }, (_, i) => i) as c (c)}
        <line x1={34 + c * 32.25} y1="6" x2={34 + c * 32.25} y2="90" class={c % 2 === 0 ? "beatline" : "gridline"} />
      {/each}
      <rect x="34" y="54" width="64" height="11" rx="2" class="note-box" />
      <rect x="114" y="30" width="30" height="11" rx="2" class="ghost" />
      <rect x="130.5" y="30" width="30" height="11" rx="2" class="note-box" />
      <path d="M 129 26 L 134 26" class="arrow" />
      <text x="40" y="104" class="note">time →</text>
      <text x="292" y="104" class="note" text-anchor="end">grid 1/8: two lines a beat</text>
      <text x="4" y="104" class="note">pitch ↑</text>
    </svg>
    <figcaption>Up is higher, right is later. A note drawn a little off (dashed) snaps onto the nearest grid line.</figcaption>
  {:else if kind === "placements"}
    <svg viewBox="0 0 300 110" role="img" aria-label="One clip in the track's list, placed three times on the timeline: two linked placements and one made unique">
      <text x="6" y="14" class="num">The clip</text>
      <rect x="6" y="20" width="60" height="22" rx="4" class="clip" />
      <text x="36" y="35" class="label" text-anchor="middle">Chorus</text>
      <text x="96" y="14" class="num">On the timeline</text>
      <rect x="96" y="60" width="198" height="30" class="bar" />
      {#each [0, 1, 2, 3, 4, 5] as b (b)}
        <text x={100 + b * 33} y="56" class="num">{b * 4 + 1}</text>
      {/each}
      <rect x="96" y="64" width="64" height="22" rx="3" class="clip" />
      <rect x="162" y="64" width="64" height="22" rx="3" class="clip" />
      <rect x="228" y="64" width="64" height="22" rx="3" class="unique" />
      <text x="128" y="79" class="label" text-anchor="middle">∞ Chorus</text>
      <text x="194" y="79" class="label" text-anchor="middle">∞ Chorus</text>
      <text x="260" y="79" class="label" text-anchor="middle">Chorus 2</text>
      <path d="M 66 31 C 100 31, 120 40, 128 62" class="link" />
      <path d="M 66 31 C 130 31, 186 40, 194 62" class="link" />
      <text x="161" y="104" class="note" text-anchor="middle">linked</text>
      <text x="260" y="104" class="note" text-anchor="middle">unique</text>
    </svg>
    <figcaption>Placements point at a clip; they don't copy it. "Make unique" gives one its own copy.</figcaption>
  {:else}
    <svg viewBox="0 0 300 100" role="img" aria-label="An automation lane: points joined by straight lines, the knob following the line as the playhead passes">
      <rect x="6" y="8" width="288" height="66" class="bar" />
      <polyline points="6,66 80,66 150,16 220,40 294,62" class="line" />
      {#each [[80, 66], [150, 16], [220, 40]] as [x, y] (x)}
        <circle cx={x} cy={y} r="4" class="point" />
      {/each}
      <line x1="186" y1="8" x2="186" y2="74" class="head static" />
      <text x="10" y="90" class="note">bar 1</text>
      <text x="290" y="90" class="note" text-anchor="end">bar 4</text>
      <text x="192" y="22" class="note">Cutoff here</text>
    </svg>
    <figcaption>High is the knob turned up, low turned down. The setting follows the line as the playhead passes.</figcaption>
  {/if}
</figure>

<style>
  .diagram { margin: 8px 0 0; }
  svg { width: 100%; max-width: 340px; height: auto; display: block; }
  figcaption { font-size: 11.5px; color: var(--dim); margin-top: 3px; }
  .bar { fill: #141a1c; stroke: var(--line); }
  .num { fill: var(--dim); font: 10px var(--mono); }
  .note { fill: var(--dim); font-size: 10px; }
  .label { fill: #0b1314; font-size: 10px; font-weight: 600; }
  .beat { fill: #4a5a5e; }
  .beat.one { fill: var(--accent); }
  .head { stroke: #ffcc33; stroke-width: 2; }
  .head:not(.static) { animation: walk 9.6s linear infinite; }
  @keyframes walk { from { transform: translateX(0); } to { transform: translateX(280px); } }
  @media (prefers-reduced-motion: reduce) { .head:not(.static) { animation: none; transform: translateX(120px); } }
  .back { fill: none; stroke: var(--dim); stroke-dasharray: 3 3; }
  .white { fill: #cfd8da; }
  .black { fill: #2a3236; }
  .beatline { stroke: #3a4549; }
  .gridline { stroke: #262f32; }
  .note-box { fill: var(--accent); }
  .ghost { fill: none; stroke: var(--accent); stroke-dasharray: 3 2; }
  .arrow { stroke: #ffcc33; stroke-width: 1.5; }
  .clip { fill: var(--accent); }
  .unique { fill: #ffb15c; }
  .link { fill: none; stroke: var(--accent); stroke-dasharray: 3 3; }
  .line { fill: none; stroke: #ffcc33; stroke-width: 2; }
  .point { fill: #ffcc33; }
</style>
