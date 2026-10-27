<script lang="ts">
  import { BLEND_MODES, BLEND_NAMES, HARMONIC_SLIDERS, MAX_KEYS, MIN_KEYS, type ShapeName } from "../../audio/tableDraw";
  import { FRAME_SIZE } from "../../audio/wavetables";
  import { grid, surface, type Surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";
  import type { TableEditor } from "./tableEditor.svelte";

  let { pg, editor, accent }: { pg: Playground; editor: TableEditor; accent: string } = $props();

  const SHAPES: [ShapeName, string][] = [["sine", "Sine"], ["triangle", "Triangle"], ["saw", "Saw"], ["square", "Square"]];
  /** Share of the half-height a level of 1 reaches, so the drawing has room above and below. */
  const REACH = 0.85;
  const PAD = 14;

  let playingDraft = $derived(pg.tables[pg.values.wtTable] === editor.draft);
  let repaint = $derived(`${editor.version}/${editor.selected}/${editor.keys.length}/${accent}`);

  function wave(g: CanvasRenderingContext2D, x: Float32Array, x0: number, y0: number, w: number, amp: number) {
    g.beginPath();
    const points = Math.min(FRAME_SIZE, Math.max(64, Math.round(w * 2)));
    for (let i = 0; i <= points; i++) {
      const v = x[Math.min(FRAME_SIZE - 1, Math.floor((i / points) * FRAME_SIZE))];
      const px = x0 + (i / points) * w;
      const py = y0 - Math.max(-1.2, Math.min(1.2, v)) * amp;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  }

  /** The keyframe being drawn, large, with its neighbours faint behind it as a guide. */
  function drawKey({ g, w, h }: Surface) {
    const amp = (h / 2) * REACH;
    grid(g, w, h, [PAD, w / 4, w / 2, (3 * w) / 4, w - PAD], [h / 2 - amp, h / 2, h / 2 + amp]);
    for (const k of [editor.selected - 1, editor.selected + 1]) {
      if (!editor.keys[k]) continue;
      wave(g, editor.keys[k], PAD, h / 2, w - 2 * PAD, amp);
      g.strokeStyle = "#ffffff26";
      g.lineWidth = 1;
      g.setLineDash([3, 4]);
      g.stroke();
      g.setLineDash([]);
    }
    wave(g, editor.key, PAD, h / 2, w - 2 * PAD, amp);
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.stroke();
    g.font = "10px ui-monospace, monospace";
    g.fillStyle = "#ffffff60";
    g.fillText("+1", 2, h / 2 - amp + 3);
    g.fillText("-1", 2, h / 2 + amp + 3);
  }

  function thumb(i: number) {
    return ({ g, w, h }: Surface) => {
      wave(g, editor.keys[i], 2, h / 2, w - 4, h * 0.4);
      g.strokeStyle = i === editor.selected ? accent : "#9aa7ab";
      g.lineWidth = 1.5;
      g.stroke();
    };
  }

  const BAR_TOP = 8;
  const BAR_BOTTOM = 16;

  function drawBars({ g, w, h }: Surface) {
    const amps = editor.amps();
    const bw = w / HARMONIC_SLIDERS;
    const height = h - BAR_TOP - BAR_BOTTOM;
    g.font = "10px ui-monospace, monospace";
    g.textAlign = "center";
    for (let i = 0; i < HARMONIC_SLIDERS; i++) {
      const bh = Math.min(1, amps[i]) * height;
      g.fillStyle = "#ffffff10";
      g.fillRect(i * bw + 1, BAR_TOP, bw - 2, height);
      g.fillStyle = accent;
      g.fillRect(i * bw + 1, BAR_TOP + height - bh, bw - 2, bh);
      if (i < 8) {
        g.fillStyle = "#ffffff20";
        g.fillRect(i * bw + 1, h - BAR_BOTTOM + 3, bw - 2, 2);
      }
      if ([1, 2, 4, 8, 16, 32].includes(i + 1)) {
        g.fillStyle = "#ffffff80";
        g.fillText(String(i + 1), i * bw + bw / 2, h - 2);
      }
    }
    g.textAlign = "left";
  }

  // --- pointer: drawing the wave
  let last: [number, number] | null = null;

  function wavePoint(e: PointerEvent): [number, number] {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const amp = (r.height / 2) * REACH;
    return [(e.clientX - r.left - PAD) / (r.width - 2 * PAD), (r.height / 2 - (e.clientY - r.top)) / amp];
  }

  function waveDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    last = wavePoint(e);
    editor.draw(last[0], last[1], last[0], last[1]);
  }

  function waveMove(e: PointerEvent) {
    if (!last) return;
    const p = wavePoint(e);
    editor.draw(last[0], last[1], p[0], p[1]);
    last = p;
  }

  // --- pointer: harmonic bars
  let lastBar: [number, number] | null = null;

  function barPoint(e: PointerEvent): [number, number] {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const bar = Math.floor(((e.clientX - r.left) / r.width) * HARMONIC_SLIDERS);
    const height = r.height - BAR_TOP - BAR_BOTTOM;
    return [bar, (r.height - BAR_BOTTOM - (e.clientY - r.top)) / height];
  }

  function barsDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    editor.beginBars();
    lastBar = barPoint(e);
    editor.setBars(lastBar[0], lastBar[1], lastBar[0], lastBar[1]);
  }

  function barsMove(e: PointerEvent) {
    if (!lastBar) return;
    const p = barPoint(e);
    editor.setBars(lastBar[0], lastBar[1], p[0], p[1]);
    lastBar = p;
  }

  function barsUp() {
    lastBar = null;
    editor.endBars();
  }
</script>

<section class="editor">
  <header>
    <h3>{editor.original ? `Edit ${editor.original.name}` : "Draw a table"}</h3>
    <label class="name">
      <span>Name</span>
      <input bind:value={editor.name} maxlength="24" />
    </label>
    <label>
      <span>Blend</span>
      <select value={editor.blend} onchange={(e) => editor.setBlend(e.currentTarget.value as (typeof BLEND_MODES)[number])}>
        {#each BLEND_MODES as mode (mode)}<option value={mode}>{BLEND_NAMES[mode]}</option>{/each}
      </select>
    </label>
    {#if !playingDraft}<button onclick={() => pg.playDraft()}>Play the drawing</button>{/if}
    <span class="grow"></span>
    <button class="save" onclick={() => pg.saveTableEditor()}>Save</button>
    <button onclick={() => pg.cancelTableEditor()}>Cancel</button>
  </header>

  {#if pg.explain}
    <p class="note">
      Draw 2 to 4 <strong>keyframes</strong>: single waves placed evenly along the table. The app blends between them to make the
      frames in between, and you hear the result as you draw: play a note and move <em>WT Pos</em>.
      <strong>Harmonics</strong> blending moves each harmonic's strength smoothly from one keyframe to the next, so the sound stays
      full; <strong>Crossfade</strong> mixes the two waves, which can go thin halfway when they are opposite in places.
    </p>
  {/if}

  <div class="keys">
    {#each editor.keys as _, i (i)}
      <div class="key" class:active={editor.selected === i}>
        <button class="pick" onclick={() => editor.select(i)}>
          <canvas use:surface={{ draw: thumb(i), key: repaint }}></canvas>
          <span>Keyframe {i + 1}<span class="pos">{Math.round(editor.position(i) * 100)}%</span></span>
        </button>
        {#if editor.keys.length > MIN_KEYS}<button class="del" title="Remove this keyframe" onclick={() => editor.removeKey(i)}>×</button>{/if}
      </div>
    {/each}
    {#if editor.keys.length < MAX_KEYS}<button class="add" onclick={() => editor.addKey()}>+ Keyframe</button>{/if}
  </div>

  <div class="edit">
    <div class="panel">
      <div class="title">Keyframe {editor.selected + 1}{#if pg.explain}<span class="hint">click and drag to draw</span>{/if}</div>
      <canvas
        class="draw"
        use:surface={{ draw: drawKey, key: repaint }}
        onpointerdown={waveDown}
        onpointermove={waveMove}
        onpointerup={() => (last = null)}
        onpointercancel={() => (last = null)}
      ></canvas>
      <div class="tools">
        {#each SHAPES as [shape, label] (shape)}<button onclick={() => editor.setShape(shape)}>{label}</button>{/each}
        <button onclick={() => editor.copyPrevious(pg.previousFrames())} title="The wave {editor.previous.name} plays at this keyframe's place">From {editor.previous.short}</button>
        <span class="sep"></span>
        <button onclick={() => editor.smooth()} title="Turn the high harmonics down: softer, less buzzy">Smooth</button>
        <button onclick={() => editor.flip()} title="Upside down">Flip</button>
        <button onclick={() => editor.setShape("flat")}>Clear</button>
      </div>
    </div>
    <div class="panel">
      <div class="title">Harmonics{#if pg.explain}<span class="hint">drag the bars{pg.hw(", or MiniLab knobs 1–8")}</span>{/if}</div>
      <canvas
        class="bars"
        use:surface={{ draw: drawBars, key: repaint }}
        onpointerdown={barsDown}
        onpointermove={barsMove}
        onpointerup={barsUp}
        onpointercancel={barsUp}
      ></canvas>
      {#if pg.explain}
        <p class="note">
          Bar 1 is the note itself, the others its overtones. Changing a bar rebuilds the keyframe from pure sine waves (up to the 32nd
          harmonic): it sounds the same, but a drawn shape may look different afterwards.
        </p>
      {/if}
    </div>
  </div>
</section>

<style>
  .editor { background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; padding: 10px 12px; display: grid; gap: 10px; }
  header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  h3 { margin: 0; font-size: 14px; color: var(--accent); }
  label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dim); }
  .name input { width: 150px; }
  .grow { flex: 1; }
  .save { border-color: var(--accent); color: var(--accent); }
  .note { margin: 0; font-size: 11px; line-height: 1.4; color: #a9b6ba; }
  .title { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  /* How to use it, after the name while explanations are on. */
  .title .hint { margin-left: 8px; text-transform: none; letter-spacing: 0; color: #6c777b; }

  .keys { display: flex; gap: 8px; align-items: stretch; }
  .key { display: flex; gap: 2px; }
  .pick { display: grid; grid-template-columns: 70px auto; align-items: center; gap: 8px; padding: 4px 10px 4px 6px; font-size: 12px; }
  .key.active .pick { border-color: var(--accent); color: var(--accent); }
  .pick canvas { width: 70px; height: 30px; display: block; }
  .pos { margin-left: 6px; font: 10px var(--mono); color: var(--dim); }
  .del { padding: 0 7px; font-size: 14px; color: var(--dim); }
  .del:hover { color: #ff8a80; border-color: #ff8a80; }
  .add { font-size: 12px; padding: 0 12px; }

  .edit { display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; align-items: start; }
  .panel { background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px 10px; display: grid; gap: 6px; }
  canvas.draw { width: 100%; height: 220px; display: block; background: #0b0e10; border-radius: 4px; cursor: crosshair; touch-action: none; }
  canvas.bars { width: 100%; height: 150px; display: block; background: #0b0e10; border-radius: 4px; cursor: ns-resize; touch-action: none; }
  .tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .tools button { font-size: 11px; padding: 3px 9px; }
  .sep { width: 8px; }
</style>
