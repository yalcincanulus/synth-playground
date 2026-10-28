<script lang="ts">
  // Small drawn pictures for the ideas that are hardest in words. Only the beats picture moves: its playhead
  // goes round the loop (still, for those who ask for less motion).
  import type { DiagramKind } from "../../course/song/guide";

  let { kind }: { kind: DiagramKind } = $props();
  const BEATS = Array.from({ length: 16 }, (_, i) => i);
  /** The looper's pad lights, as the MiniLab shows them (LOOP_PAD_COLORS, brightened for a screen). */
  const LIGHTS = [
    ["#20262a", "empty"],
    ["#5a1f1f", "selected"],
    ["#a82a2a", "ready"],
    ["#ff3b3b", "recording"],
    ["#36d05a", "playing"],
    ["#1f4a2a", "stopped"],
  ];
  /** A point on the loop circle, at a fraction of the way round from the top, clockwise. */
  const at = (f: number, r: number) => [80 + r * Math.sin(f * 2 * Math.PI), 56 - r * Math.cos(f * 2 * Math.PI)];
  /** An arc of the circle from one fraction to another. */
  function arc(from: number, to: number, r: number) {
    const [x1, y1] = at(from, r);
    const [x2, y2] = at(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  }
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
  {:else if kind === "pads"}
    <svg viewBox="0 0 300 64" role="img" aria-label="The six pad lights: empty, selected, ready, recording, playing, stopped">
      {#each LIGHTS as [fill, word], i (word)}
        <rect x={6 + i * 49} y="6" width="40" height="34" rx="5" {fill} class="padlight" />
        <text x={26 + i * 49} y="54" class="note" text-anchor="middle">{word}</text>
      {/each}
    </svg>
    <figcaption>Tap: empty → selected → ready. Your first note: recording. Tap: playing. Tap: stopped, and back.</figcaption>
  {:else if kind === "loop"}
    <svg viewBox="0 0 300 112" role="img" aria-label="A loop drawn as a circle: two bars, with the drums, bass and chords as rings going round together">
      {#each [["drums", 46, 0, 1], ["bass", 36, 0, 1], ["chords", 26, 0.5, 1]] as [name, r, from, to] (name)}
        <circle cx="80" cy="56" r={+r} class="ring" />
        <path d={arc(+from, +to - 0.001, +r)} class="layer {name}" />
      {/each}
      <line x1="80" y1="2" x2="80" y2="16" class="head static" />
      <text x="84" y="10" class="note">bar 1</text>
      <text x="80" y="59" class="note" text-anchor="middle">2 bars</text>
      <text x="146" y="34" class="note"><tspan class="drums-t">●</tspan> drums: the whole loop</text>
      <text x="146" y="52" class="note"><tspan class="bass-t">●</tspan> bass: the whole loop</text>
      <text x="146" y="70" class="note"><tspan class="chords-t">●</tspan> chords: bar 2 only</text>
      <text x="146" y="96" class="note">the playhead goes round,</text>
      <text x="146" y="108" class="note">and the layers with it</text>
    </svg>
    <figcaption>A loop is a circle: its end joins its start. Each layer is a ring, so they line up every time round.</figcaption>
  {:else if kind === "round"}
    <svg viewBox="0 0 300 96" role="img" aria-label="Time rounds of a bar each: a take whose first note falls partway through a round records from that round's start, and a tap ends it at the round's end">
      {#each [0, 1, 2] as r (r)}
        <rect x={10 + r * 94} y="18" width="90" height="22" rx="3" class="bar" />
        <text x={14 + r * 94} y="13" class="num">round {r + 1}</text>
      {/each}
      <rect x="104" y="48" width="90" height="16" rx="3" class="ghost" />
      <rect x="140" y="48" width="54" height="16" rx="3" class="note-box" />
      <line x1="194" y1="18" x2="194" y2="70" class="head static" />
      <path d="M 140 68 L 140 76" class="arrow" />
      <text x="140" y="88" class="note" text-anchor="middle">first note</text>
      <path d="M 176 68 L 176 76" class="arrow" />
      <text x="178" y="88" class="note">tap</text>
      <text x="200" y="60" class="note">the take ends</text>
      <text x="200" y="72" class="note">with the round</text>
    </svg>
    <figcaption>The take belongs to the round your first note falls in (dashed), and ends at its end, so the new layer lines up with the others.</figcaption>
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
  .padlight { stroke: #0006; }
  .ring { fill: none; stroke: #262f32; stroke-width: 6; }
  .layer { fill: none; stroke-width: 6; stroke-linecap: butt; }
  .drums, .drums-t { stroke: #ffb15c; fill: #ffb15c; }
  .bass, .bass-t { stroke: var(--accent); fill: var(--accent); }
  .chords, .chords-t { stroke: #b48cff; fill: #b48cff; }
  .layer.drums, .layer.bass, .layer.chords { fill: none; }
</style>
