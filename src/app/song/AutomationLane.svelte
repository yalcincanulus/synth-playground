<script lang="ts">
  import { untrack } from "svelte";
  import { formatValue, PARAM_IDS, type ParamId } from "../../audio/params";
  import {
    automatable,
    deletePoint,
    drawLine,
    movePoint,
    panAt,
    paramAt,
    setPoint,
    targetLabel,
    thin,
    TRACK_TARGETS,
    valueAt,
    volumeAt,
    writeRange,
    type AutoPoint,
    type AutoTarget,
  } from "../../song/automation";
  import { BEATS_PER_BAR, TICKS_PER_BEAT, type NoteClip } from "../../song/clips";
  import { barTicks, snap, snapDown } from "../../song/noteEdit";
  import { VOLUME_MIN } from "../../song/song";
  import { surface, type Surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";
  import { BLOCKS } from "../synth/blocks";

  interface Props {
    pg: Playground;
    clip: NoteClip;
    color: string;
    /** The piano roll's view, so the lane lines up with its notes: the keyboard's width, zoom and scroll. */
    left: number;
    pxPerBeat: number;
    scrollX: number;
    grid: number;
    snapOn: boolean;
    readOnly: boolean;
  }
  let { pg, clip, color, left, pxPerBeat, scrollX, grid, snapOn, readOnly }: Props = $props();

  const Q = TICKS_PER_BEAT;
  /** Space above and below the line's range, so a point at the top or bottom can still be grabbed. */
  const PAD = 7;
  const HIT_PX = 7;

  type Tool = "points" | "line" | "pencil";
  let tool = $state<Tool>("points");
  let target = $state<AutoTarget>("cutoff");
  /** The points while a drag goes on (committed when it ends). */
  let draft = $state.raw<AutoPoint[] | null>(null);
  /** Where the pointer is (for the value shown), and the point under it. */
  let hover = $state.raw<{ tick: number; value: number } | null>(null);
  let hot = $state(-1);

  let canvas: HTMLCanvasElement;
  let size = { w: 0, h: 0 };
  let dirty = true;

  const end = $derived(barTicks(clip.bars));
  const lane = $derived(clip.lanes?.find((l) => l.target === target));
  const points = $derived(draft ?? lane?.points ?? []);
  const has = (t: AutoTarget) => !!clip.lanes?.some((l) => l.target === t && l.points.length);

  /** The sound's settings that can have lanes, by the Synth view's blocks (each once), and the rest (the mod matrix's amounts). */
  const groups: { title: string; ids: ParamId[] }[] = [];
  const seen = new Set<ParamId>();
  for (const b of Object.values(BLOCKS)) {
    const ids = b.params.filter((id) => automatable(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length) groups.push({ title: b.title, ids });
  }
  const rest = PARAM_IDS.filter((id) => automatable(id) && !seen.has(id));
  if (rest.length) groups.push({ title: "Other", ids: rest });

  // A new clip: show its first lane (or Cutoff, the classic sweep).
  let shownClip = "";
  $effect(() => {
    if (clip.id === shownClip) return;
    shownClip = clip.id;
    untrack(() => {
      draft = null;
      target = clip.lanes?.[0]?.target ?? "cutoff";
    });
  });

  $effect(() => {
    void [$state.snapshot(clip), draft, hover, hot, target, tool, pxPerBeat, scrollX, left, grid, color, readOnly];
    dirty = true;
  });

  /** A control position as the setting's value, in words. */
  function words(t: AutoTarget, v: number): string {
    if (t === "trackVolume") {
      const db = volumeAt(v);
      return db <= VOLUME_MIN ? "off" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
    }
    if (t === "trackPan") {
      const p = Math.round(panAt(v) * 100);
      return p === 0 ? "centre" : p < 0 ? `L ${-p}` : `R ${p}`;
    }
    return formatValue(t, paramAt(t, v));
  }

  // Geometry.
  const tickX = (t: number) => left + (t / Q) * pxPerBeat - scrollX;
  const xTick = (x: number) => ((x - left + scrollX) / pxPerBeat) * Q;
  const valueY = (v: number) => PAD + (1 - v) * (size.h - 2 * PAD);
  const yValue = (y: number) => Math.max(0, Math.min(1, 1 - (y - PAD) / Math.max(1, size.h - 2 * PAD)));

  function draw({ g, w, h }: Surface) {
    dirty = false;
    size = { w, h };
    g.fillStyle = "#0d1113";
    g.fillRect(0, 0, w, h);

    // Beats and bars, and past the clip's end.
    for (let t = snapDown(Math.max(0, xTick(left)), Q); t <= Math.min(end, xTick(w)); t += Q) {
      const x = Math.round(tickX(t)) + 0.5;
      if (x < left) continue;
      g.fillStyle = t % (Q * BEATS_PER_BAR) === 0 ? "#ffffff38" : "#ffffff14";
      g.fillRect(x - 0.5, 0, 1, h);
    }
    const endX = tickX(end);
    if (endX < w) {
      g.fillStyle = "#000000a0";
      g.fillRect(Math.max(left, endX), 0, w - Math.max(left, endX), h);
    }

    g.save();
    g.beginPath();
    g.rect(left, 0, w - left, h);
    g.clip();
    // The track's own value: where the setting goes back to when the clip stops.
    const own = valueY(pg.ownControl(clip.track, target));
    g.strokeStyle = "#ffffff40";
    g.setLineDash([3, 4]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(left, Math.round(own) + 0.5);
    g.lineTo(w, Math.round(own) + 0.5);
    g.stroke();
    g.setLineDash([]);

    if (points.length) {
      // The line, flat before the first point and after the last, filled below.
      const xs = [left - 1, ...points.map((p) => tickX(p.tick)), Math.max(w, endX) + 1];
      const ys = [valueY(points[0].value), ...points.map((p) => valueY(p.value)), valueY(points[points.length - 1].value)];
      g.beginPath();
      g.moveTo(xs[0], h);
      xs.forEach((x, i) => g.lineTo(x, ys[i]));
      g.lineTo(xs[xs.length - 1], h);
      g.closePath();
      g.fillStyle = color;
      g.globalAlpha = 0.16;
      g.fill();
      g.globalAlpha = 1;
      g.beginPath();
      xs.forEach((x, i) => (i ? g.lineTo(x, ys[i]) : g.moveTo(x, ys[i])));
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.stroke();
      points.forEach((p, i) => {
        const x = tickX(p.tick);
        if (x < left - 4 || x > w + 4) return;
        const y = valueY(p.value);
        g.fillStyle = i === hot ? "#ffffff" : color;
        g.fillRect(x - 3, y - 3, 6, 6);
        g.strokeStyle = "#0b1314";
        g.lineWidth = 1;
        g.strokeRect(x - 3.5, y - 3.5, 7, 7);
      });
    }

    // The playhead, while the clip plays.
    const beat = pg.clipBeatNow(clip.id);
    if (beat >= 0) {
      const x = tickX(beat * Q);
      if (x >= left && x <= w) {
        g.fillStyle = "#ffffffc0";
        g.fillRect(Math.round(x), 0, 1.5, h);
      }
    }
    g.restore();

    // The left column: what the lane is, and its value under the pointer (or at the playhead).
    g.fillStyle = "#13181b";
    g.fillRect(0, 0, left - 1, h);
    g.font = "9px ui-monospace, monospace";
    g.textBaseline = "top";
    g.fillStyle = points.length ? color : "#56636a";
    const label = target === "trackVolume" ? "Volume" : target === "trackPan" ? "Pan" : targetLabel(target);
    g.fillText(label.slice(0, 8), 3, 4);
    const at = hover ?? (beat >= 0 && points.length ? { tick: beat * Q, value: valueAt(points, beat * Q) } : null);
    if (at) {
      g.fillStyle = "#c9d2d4";
      const text = words(target, at.value);
      g.fillText(text.length > 8 ? text.slice(0, 8) : text, 3, h - 14);
    }
  }

  const painter = { draw, animate: true, idle: () => !dirty && !pg.playing };

  // ------------------------------------------------------------------ editing

  function commit(next: AutoPoint[], label: string, key: string | null = null) {
    const others = (clip.lanes ?? []).filter((l) => l.target !== target);
    const lanes = next.length ? [...(clip.lanes ?? []).map((l) => (l.target === target ? { target, points: next } : l)), ...(lane ? [] : [{ target, points: next }])] : others;
    pg.setClipLanes(clip.id, lanes, `${label} (${targetLabel(target)})`, key);
    draft = null;
  }

  function clear() {
    if (lane) commit([], "Clear automation");
  }

  type Drag =
    | { mode: "move"; index: number; base: AutoPoint[] }
    | { mode: "line"; base: AutoPoint[]; a: AutoPoint }
    | { mode: "pencil"; base: AutoPoint[]; stroke: Map<number, number>; last: AutoPoint };
  let drag: Drag | null = null;

  const local = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** A tick for a point: on the grid with Snap (not with Alt held), inside the clip. */
  const tickFor = (x: number, alt: boolean) => Math.max(0, Math.min(end, Math.round(snapOn && !alt ? snap(xTick(x), grid) : xTick(x))));

  function hitPoint(x: number, y: number): number {
    let best = -1;
    let bestD = HIT_PX;
    points.forEach((p, i) => {
      const d = Math.hypot(tickX(p.tick) - x, valueY(p.value) - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  function down(e: PointerEvent) {
    if (readOnly || e.button === 1) return;
    const { x, y } = local(e);
    if (x < left) return;
    canvas.setPointerCapture(e.pointerId);
    const base = lane?.points ?? [];
    const hit = hitPoint(x, y);
    if (e.button === 2) {
      if (hit >= 0) commit(deletePoint(base, hit), "Delete point");
      return;
    }
    const at = { tick: tickFor(x, e.altKey), value: yValue(y) };
    if (tool === "points") {
      if (hit >= 0) {
        drag = { mode: "move", index: hit, base };
        return;
      }
      const next = setPoint(base, at.tick, at.value, end);
      draft = next;
      drag = { mode: "move", index: next.findIndex((p) => p.tick === at.tick), base: next };
    } else if (tool === "line") {
      drag = { mode: "line", base, a: at };
      draft = setPoint(base, at.tick, at.value, end);
    } else {
      const tick = Math.max(0, Math.min(end, Math.round(xTick(x))));
      drag = { mode: "pencil", base, stroke: new Map([[tick, at.value]]), last: { tick, value: at.value } };
      draft = setPoint(base, tick, at.value, end);
    }
  }

  function move(e: PointerEvent) {
    const { x, y } = local(e);
    const value = yValue(y);
    hover = x >= left ? { tick: xTick(x), value } : null;
    if (!drag) {
      hot = readOnly ? -1 : hitPoint(x, y);
      return;
    }
    if (drag.mode === "move") {
      draft = movePoint(drag.base, drag.index, tickFor(x, e.altKey), value, end);
      hot = drag.index;
    } else if (drag.mode === "line") {
      draft = drawLine(drag.base, drag.a, { tick: tickFor(x, e.altKey), value }, end);
    } else {
      // Every 32nd note the pointer crossed since the last move, along a straight line (a quick stroke skips pixels).
      const tick = Math.max(0, Math.min(end, Math.round(xTick(x))));
      const { last, stroke } = drag;
      const step = Q / 8;
      const [lo, hi] = last.tick <= tick ? [last.tick, tick] : [tick, last.tick];
      for (let t = Math.ceil(lo / step) * step; t < hi; t += step) stroke.set(t, valueAt([last, { tick, value }].sort((a, b) => a.tick - b.tick), t));
      stroke.set(tick, value);
      drag.last = { tick, value };
      const ticks = [...stroke.keys()];
      const pts = [...stroke].map(([t, v]) => ({ tick: t, value: v })).sort((a, b) => a.tick - b.tick);
      draft = writeRange(drag.base, Math.min(...ticks), Math.max(...ticks), pts, end);
    }
  }

  function up() {
    const d = drag;
    drag = null;
    if (!d || !draft) return;
    if (JSON.stringify(draft) === JSON.stringify(lane?.points ?? [])) {
      draft = null;
      return;
    }
    if (d.mode === "move") commit(draft, lane && d.base === lane.points ? "Move point" : "Add point");
    else if (d.mode === "line") commit(draft, "Draw line");
    else commit(thin(draft), "Draw automation");
  }

  function dblclick(e: MouseEvent) {
    if (readOnly) return;
    const { x, y } = local(e);
    const hit = hitPoint(x, y);
    if (hit >= 0 && lane) commit(deletePoint(lane.points, hit), "Delete point");
  }
</script>

<div class="lane" style:--track={color}>
  <div class="tools" role="toolbar" aria-label="Automation">
    <label title="The setting this lane moves while the clip plays. A dot marks the ones that have a line.">
      Automation
      <select bind:value={target}>
        <optgroup label="Track">
          {#each TRACK_TARGETS as t (t)}<option value={t}>{has(t) ? "● " : ""}{targetLabel(t)}</option>{/each}
        </optgroup>
        {#each groups as gr (gr.title)}
          <optgroup label={gr.title}>
            {#each gr.ids as id (id)}<option value={id}>{has(id) ? "● " : ""}{targetLabel(id)}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
    {#if !readOnly}
      <span class="group" role="group" aria-label="Drawing tool">
        <button class:active={tool === "points"} aria-pressed={tool === "points"} onclick={() => (tool = "points")} title="Click to add a point, drag one to move it; double-click or right-click deletes it">Points</button>
        <button class:active={tool === "line"} aria-pressed={tool === "line"} onclick={() => (tool = "line")} title="Drag from one place to another: a straight line in place of what was between them (a fade)">Line</button>
        <button class:active={tool === "pencil"} aria-pressed={tool === "pencil"} onclick={() => (tool = "pencil")} title="Draw freehand">Pencil</button>
      </span>
      <button onclick={clear} disabled={!lane} title="Remove this lane: the setting stays at the sound's own value">Clear</button>
    {/if}
    <span class="info">
      {#if hover}{words(target, hover.value)}{:else if lane}{lane.points.length} point{lane.points.length === 1 ? "" : "s"}{:else}No line: the sound's own value{/if}
    </span>
  </div>
  <canvas
    bind:this={canvas}
    use:surface={painter}
    class:read-only={readOnly}
    class:pencil={tool === "pencil"}
    aria-label="Automation of {targetLabel(target)} in {clip.name}: {lane ? `${lane.points.length} points` : 'none'}"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointerleave={() => !drag && (hover = null)}
    onpointercancel={() => {
      drag = null;
      draft = null;
    }}
    ondblclick={dblclick}
    oncontextmenu={(e) => e.preventDefault()}
  ></canvas>
</div>

<style>
  .lane { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .tools { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .tools label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
  .tools button { font-size: 12px; padding: 2px 8px; }
  .tools select { font-size: 12px; padding: 2px 4px; }
  .tools .active { border-color: var(--track); color: var(--track); }
  .group { display: inline-flex; gap: 2px; align-items: center; }
  .info { margin-left: auto; color: var(--dim); font-family: var(--mono); }
  canvas { width: 100%; height: 96px; border: 1px solid var(--line); border-radius: 6px; touch-action: none; cursor: crosshair; }
  canvas.pencil { cursor: cell; }
  canvas.read-only { cursor: default; }
  @media (pointer: coarse) {
    .tools button, .tools select { min-height: 36px; }
  }
</style>
