<script lang="ts" module>
  /** The clip being dragged from a track's clip list onto the timeline (a drag's data can't be read until it is dropped). */
  export const clipDrag: { id: string | null } = { id: null };
</script>

<script lang="ts">
  import { MAX_SONG_BARS, placementEnd, songEnd, type Placement } from "../../song/arrangement";
  import { BEATS_PER_BAR, TICKS_PER_BEAT, type Clip } from "../../song/clips";
  import type { Track } from "../../song/song";
  import { surface, type Surface } from "../components/canvas";
  import { narrow } from "../media.svelte";
  import type { Playground } from "../playground.svelte";
  import { trackCss as css } from "./trackColor";

  interface Props {
    pg: Playground;
  }
  let { pg }: Props = $props();

  const HEAD_W = 96;
  const RULER_H = 24;
  /** Pixels from a placement's right end that drag its length. */
  const EDGE_PX = 8;
  /** Movement (px) that makes a press a drag. */
  const SLOP = 4;

  /** On a phone the timeline scrolls and plays (the ruler sets where), but isn't edited. */
  let readOnly = $derived(narrow.current);
  let rowH = $derived(narrow.current ? 30 : 36);

  let pxPerBar = $state(28);
  let scrollX = $state(0);
  let size = { w: 0, h: 0 };
  let fitted = false;
  let canvas: HTMLCanvasElement;
  let dirty = true;

  const tracks = $derived(pg.songTracks);
  /** Bars the timeline reaches: the song, its loop and start, and room after them. */
  const shownBars = $derived(Math.min(MAX_SONG_BARS, Math.max(32, songEnd(pg.placements) + 8, (pg.loopRange?.end ?? 0) + 4, pg.songStart + 8)));
  const height = $derived(RULER_H + tracks.length * rowH + 1);

  const areaW = () => Math.max(1, size.w - HEAD_W);
  const barX = (bar: number) => HEAD_W + bar * pxPerBar - scrollX;
  const xBar = (x: number) => (x - HEAD_W + scrollX) / pxPerBar;
  const rowY = (i: number) => RULER_H + i * rowH;

  function clampScroll() {
    scrollX = Math.max(0, Math.min(Math.max(0, shownBars * pxPerBar - areaW() + 40), scrollX));
  }

  function zoom(factor: number, x = HEAD_W + areaW() / 2) {
    const bar = xBar(x);
    pxPerBar = Math.max(6, Math.min(240, pxPerBar * factor));
    scrollX = bar * pxPerBar - (x - HEAD_W);
    clampScroll();
  }

  /** Show the whole song (at least 16 bars) across. */
  function fit() {
    if (!size.w) return;
    pxPerBar = Math.max(6, Math.min(240, areaW() / Math.max(16, songEnd(pg.placements) + 1)));
    scrollX = 0;
  }

  $effect(() => {
    void [$state.snapshot(pg.placements), $state.snapshot(pg.songClips), $state.snapshot(tracks), pg.selectedPlacement, pg.songStart, pg.loopRange, pg.loopOn, pg.clipLaunch, pxPerBar, scrollX, rowH, readOnly];
    dirty = true;
  });

  const clipOf = (id: string) => pg.songClips.find((c) => c.id === id);

  // ------------------------------------------------------------------ drawing

  /** A small picture of a clip's notes (or hits, or steps) inside a box, repeated for each of the placement's time rounds. */
  function preview(g: CanvasRenderingContext2D, clip: Clip, x: number, y: number, w: number, h: number, bars: number) {
    const roundPx = clip.bars * pxPerBar;
    g.fillStyle = "#0b1314";
    g.globalAlpha = 0.7;
    for (let r = 0; r * clip.bars < bars; r++) {
      const ox = x + r * roundPx;
      if (ox > size.w) break;
      if (ox + roundPx < HEAD_W) continue;
      const limit = x + w;
      if (clip.kind === "notes") {
        if (!clip.notes.length) continue;
        let lo = 127;
        let hi = 0;
        for (const n of clip.notes) [lo, hi] = [Math.min(lo, n.pitch), Math.max(hi, n.pitch)];
        const span = Math.max(12, hi - lo + 1);
        const tickPx = pxPerBar / (BEATS_PER_BAR * TICKS_PER_BEAT);
        for (const n of clip.notes) {
          const nx = ox + n.start * tickPx;
          if (nx >= limit) continue;
          const ny = y + h - 2 - ((n.pitch - lo + (span - (hi - lo + 1)) / 2) / span) * (h - 4);
          g.fillRect(nx, ny - 1, Math.max(1.5, Math.min(n.length * tickPx, limit - nx)), 2);
        }
      } else if (clip.kind === "drums") {
        const stepPx = pxPerBar / 16;
        clip.patterns.forEach((p, bar) =>
          p.forEach((row, d) =>
            row.forEach((v, s) => {
              const nx = ox + (bar * 16 + s) * stepPx;
              if (v > 0 && nx < limit) g.fillRect(nx, y + 2 + (d * (h - 4)) / 8, Math.max(1, stepPx - 1), Math.max(1, (h - 4) / 8 - 1));
            }),
          ),
        );
      } else {
        const on = clip.seq.steps.filter((s, i) => s.on && i < clip.seq.length).length;
        g.fillText(`${on} steps`, ox + 4, y + h / 2);
      }
    }
    g.globalAlpha = 1;
  }

  function drawPlacement(g: CanvasRenderingContext2D, p: Placement, row: number, color: string, opts: { selected?: boolean; ghost?: boolean } = {}) {
    const clip = clipOf(p.clip);
    if (!clip) return;
    const x = barX(p.bar);
    const x2 = barX(placementEnd(p));
    if (x2 < HEAD_W || x > size.w) return;
    const y = rowY(row) + 3;
    const h = rowH - 6;
    const w = x2 - x;
    g.save();
    g.beginPath();
    g.rect(Math.max(HEAD_W, x), y, Math.min(size.w, x2) - Math.max(HEAD_W, x), h);
    g.clip();
    g.globalAlpha = opts.ghost ? 0.45 : 1;
    g.fillStyle = color;
    g.globalAlpha *= 0.55;
    g.fillRect(x, y, w, h);
    g.globalAlpha = opts.ghost ? 0.45 : 1;
    g.fillRect(x, y, w, 12);
    // Each time round of the clip.
    g.strokeStyle = "#0b131480";
    g.setLineDash([3, 3]);
    g.beginPath();
    for (let b = clip.bars; b < p.bars; b += clip.bars) {
      g.moveTo(Math.round(x + b * pxPerBar) + 0.5, y + 12);
      g.lineTo(Math.round(x + b * pxPerBar) + 0.5, y + h);
    }
    g.stroke();
    g.setLineDash([]);
    g.font = "10px ui-sans-serif, system-ui, sans-serif";
    g.textBaseline = "middle";
    g.fillStyle = "#0b1314";
    const linked = pg.clipUses(p.clip) > 1;
    const label = `${clip.name}${p.transpose ? ` ${p.transpose > 0 ? "+" : ""}${p.transpose}` : ""}${linked ? " ∞" : ""}`;
    if (w > 20) g.fillText(label, x + 4, y + 6.5);
    if (h > 18) preview(g, clip, x, y + 13, w, h - 14, p.bars);
    g.restore();
    if (opts.selected || opts.ghost) {
      g.strokeStyle = opts.ghost ? color : "#ffffff";
      g.lineWidth = opts.selected ? 1.5 : 1;
      if (opts.ghost) g.setLineDash([4, 3]);
      g.strokeRect(Math.max(HEAD_W, x) + 0.5, y + 0.5, Math.min(size.w, x2) - Math.max(HEAD_W, x) - 1, h - 1);
      g.setLineDash([]);
    }
  }

  function draw({ g, w, h }: Surface) {
    dirty = false;
    const wider = size.w !== w;
    size = { w, h };
    if (!fitted || wider) {
      if (!fitted) fit();
      fitted = true;
    }
    clampScroll();

    // The playhead stays in sight while it plays.
    const songBeat = pg.songBeatNow();
    if (songBeat >= 0 && pg.follow && !drag) {
      const px = barX(songBeat / BEATS_PER_BAR);
      if (px < HEAD_W || px > w - areaW() * 0.1) {
        scrollX = Math.max(0, (songBeat / BEATS_PER_BAR) * pxPerBar - areaW() * 0.15);
        clampScroll();
      }
    }

    g.fillStyle = "#0d1113";
    g.fillRect(0, 0, w, h);
    const first = Math.max(0, Math.floor(xBar(HEAD_W)));
    const last = Math.min(shownBars, Math.ceil(xBar(w)));

    // Rows, and past the shown song.
    tracks.forEach((t, i) => {
      g.fillStyle = i % 2 ? "#101517" : "#0f1315";
      g.fillRect(HEAD_W, rowY(i), w - HEAD_W, rowH);
    });
    const endX = barX(shownBars);
    if (endX < w) {
      g.fillStyle = "#000000a0";
      g.fillRect(endX, RULER_H, w - endX, h - RULER_H);
    }

    // Loop region under the rows.
    const loop = pg.loopRange;
    if (loop && pg.loopOn) {
      g.fillStyle = "#7fe0d00d";
      g.fillRect(barX(loop.start), RULER_H, (loop.end - loop.start) * pxPerBar, h - RULER_H);
    }

    // Bar lines (every bar when there is room, else every 4).
    const every = pxPerBar < 10 ? 4 : 1;
    for (let b = first - (first % every); b <= last; b += every) {
      const x = Math.round(barX(b)) + 0.5;
      if (x < HEAD_W) continue;
      g.fillStyle = b % 4 === 0 ? "#ffffff24" : "#ffffff0e";
      g.fillRect(x - 0.5, RULER_H, 1, h - RULER_H);
    }

    // Placements.
    tracks.forEach((t, i) => {
      const color = css(t.color);
      for (const p of pg.placementsOf(t.id)) {
        if (drag?.mode === "move" && drag.started && drag.id === p.id && !drag.copy) continue;
        if (drag?.mode === "resize" && drag.id === p.id) continue;
        drawPlacement(g, p, i, color, { selected: pg.selectedPlacement === p.id });
      }
    });
    // What a drag would do.
    const ghost = dragGhost();
    if (ghost) {
      const i = tracks.findIndex((t) => t.id === ghost.track);
      if (i >= 0) {
        if (ghost.p) drawPlacement(g, ghost.p, i, css(tracks[i].color), { ghost: true });
        else {
          g.strokeStyle = css(tracks[i].color);
          g.setLineDash([4, 3]);
          g.strokeRect(barX(ghost.bar) + 0.5, rowY(i) + 3.5, ghost.bars * pxPerBar - 1, rowH - 7);
          g.setLineDash([]);
        }
      }
    }

    // Tracks playing a clip from the launcher: their arrangement is set aside.
    tracks.forEach((t, i) => {
      if (!pg.launcherTracks.includes(t.id)) return;
      g.fillStyle = "#0d1113b0";
      g.fillRect(HEAD_W, rowY(i), w - HEAD_W, rowH);
    });

    // The playhead.
    if (songBeat >= 0) {
      const x = barX(songBeat / BEATS_PER_BAR);
      if (x >= HEAD_W && x <= w) {
        g.fillStyle = "#ffffffd0";
        g.fillRect(Math.round(x), 0, 1.5, h);
      }
    }

    // Ruler: bar numbers, the loop region and the start marker.
    g.fillStyle = "#13181b";
    g.fillRect(HEAD_W, 0, w - HEAD_W, RULER_H);
    if (loop) {
      g.fillStyle = pg.loopOn ? "#7fe0d0" : "#3a4448";
      g.globalAlpha = pg.loopOn ? 0.35 : 0.6;
      g.fillRect(barX(loop.start), 2, (loop.end - loop.start) * pxPerBar, 7);
      g.globalAlpha = 1;
    }
    const sel = rulerDrag();
    if (sel) {
      g.fillStyle = "#7fe0d0";
      g.globalAlpha = 0.5;
      g.fillRect(barX(sel.start), 2, (sel.end - sel.start) * pxPerBar, 7);
      g.globalAlpha = 1;
    }
    g.font = "10px ui-monospace, monospace";
    g.textBaseline = "middle";
    const labelEvery = pxPerBar >= 22 ? 1 : pxPerBar >= 10 ? 4 : 8;
    for (let b = first - (first % labelEvery); b <= last; b += labelEvery) {
      const x = Math.round(barX(b)) + 0.5;
      if (x < HEAD_W) continue;
      g.fillStyle = "#56636a";
      g.fillRect(x - 0.5, 12, 1, RULER_H - 12);
      g.fillStyle = "#93a1a6";
      g.fillText(`${b + 1}`, x + 3, 17);
    }
    const sx = barX(pg.songStart);
    if (sx >= HEAD_W - 1 && sx <= w) {
      g.fillStyle = "#ff9b50";
      g.beginPath();
      g.moveTo(sx, RULER_H);
      g.lineTo(sx - 5, RULER_H - 9);
      g.lineTo(sx + 5, RULER_H - 9);
      g.closePath();
      g.fill();
      g.fillRect(sx - 0.5, RULER_H, 1, h - RULER_H);
    }

    // Track names on the left, over everything.
    g.fillStyle = "#13181b";
    g.fillRect(0, 0, HEAD_W, h);
    g.fillStyle = "#56636a";
    g.font = "10px ui-sans-serif, system-ui, sans-serif";
    g.fillText(readOnly ? "Bars" : "Bars ▸ click: start", 6, RULER_H / 2);
    tracks.forEach((t, i) => {
      const y = rowY(i);
      g.fillStyle = css(t.color);
      g.fillRect(0, y + 1, 4, rowH - 2);
      g.fillStyle = pg.selectedSongTrack === t.id ? "#ffffff" : "#c9d2d4";
      g.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      g.fillText(t.name, 10, y + rowH / 2 - (pg.launcherTracks.includes(t.id) ? 5 : 0), HEAD_W - 14);
      if (pg.launcherTracks.includes(t.id)) {
        g.fillStyle = css(t.color);
        g.font = "9px ui-sans-serif, system-ui, sans-serif";
        g.fillText("▶ launcher", 10, y + rowH / 2 + 8);
      }
      g.fillStyle = "#ffffff10";
      g.fillRect(0, y + rowH - 0.5, w, 0.5);
    });
  }

  const painter = { draw, animate: true, idle: () => !dirty && !pg.playing };

  // ------------------------------------------------------------------ pointer

  type Drag =
    | { mode: "ruler"; x: number; bar0: number; bar1: number; moved: boolean }
    | { mode: "move"; id: string; x: number; grab: number; bar: number; copy: boolean; started: boolean }
    | { mode: "resize"; id: string; bars: number }
    | { mode: "draw"; track: string; x: number; bar0: number; bar1: number; moved: boolean }
    | { mode: "pan"; x: number; sx: number };
  let drag = $state.raw<Drag | null>(null);

  const local = (e: PointerEvent | WheelEvent | MouseEvent | DragEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const rowAt = (y: number) => (y < RULER_H ? -1 : Math.floor((y - RULER_H) / rowH));
  const barAt = (x: number) => Math.max(0, Math.min(shownBars - 1, Math.floor(xBar(x))));

  /** The placement under a point, and whether the point is on its right end. */
  function hit(x: number, y: number): { p: Placement; edge: boolean } | null {
    const t = tracks[rowAt(y)];
    if (!t || x < HEAD_W) return null;
    const bar = xBar(x);
    const p = pg.placementsOf(t.id).find((q) => q.bar <= bar && bar < placementEnd(q));
    if (!p) return null;
    const x2 = barX(placementEnd(p));
    return { p, edge: x2 - x <= Math.min(EDGE_PX, (x2 - barX(p.bar)) / 3) };
  }

  function rulerDrag(): { start: number; end: number } | null {
    if (drag?.mode !== "ruler" || !drag.moved || drag.bar1 === drag.bar0) return null;
    return { start: Math.min(drag.bar0, drag.bar1), end: Math.max(drag.bar0, drag.bar1) + 1 };
  }

  /** The placement a drag would make, or the box a drawn one would fill. */
  function dragGhost(): { track: string; p?: Placement; bar: number; bars: number } | null {
    const d = drag;
    if (d?.mode === "move" && d.started) {
      const p = pg.placements.find((q) => q.id === d.id);
      const clip = p && clipOf(p.clip);
      return p && clip ? { track: clip.track, p: { ...p, bar: d.bar }, bar: d.bar, bars: p.bars } : null;
    }
    if (d?.mode === "resize") {
      const p = pg.placements.find((q) => q.id === d.id);
      const clip = p && clipOf(p.clip);
      return p && clip ? { track: clip.track, p: { ...p, bars: d.bars }, bar: p.bar, bars: d.bars } : null;
    }
    if (d?.mode === "draw" && d.moved) {
      const bar = Math.min(d.bar0, d.bar1);
      return { track: d.track, bar, bars: Math.abs(d.bar1 - d.bar0) + 1 };
    }
    return dropAt;
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    canvas.focus();
    const { x, y } = local(e);
    if (y < RULER_H && x >= HEAD_W) {
      drag = { mode: "ruler", x, bar0: barAt(x), bar1: barAt(x), moved: false };
    } else if (x < HEAD_W) {
      const t = tracks[rowAt(y)];
      if (t) pg.selectSongTrack(t.id);
      return;
    } else if (readOnly) {
      drag = { mode: "pan", x, sx: scrollX };
    } else {
      const h = hit(x, y);
      const t = tracks[rowAt(y)];
      if (h) {
        pg.selectPlacement(h.p.id);
        drag = h.edge ? { mode: "resize", id: h.p.id, bars: h.p.bars } : { mode: "move", id: h.p.id, x, grab: xBar(x) - h.p.bar, bar: h.p.bar, copy: e.altKey, started: false };
      } else if (t && e.pointerType === "mouse") {
        drag = { mode: "draw", track: t.id, x, bar0: barAt(x), bar1: barAt(x), moved: false };
      } else if (t) {
        drag = { mode: "pan", x, sx: scrollX };
      } else return;
    }
    canvas.setPointerCapture(e.pointerId);
    dirty = true;
  }

  function move(e: PointerEvent) {
    const { x } = local(e);
    if (!drag) {
      const { y } = local(e);
      const h = !readOnly && hit(x, y);
      canvas.style.cursor = y < RULER_H ? "pointer" : h ? (h.edge ? "ew-resize" : "grab") : readOnly ? "grab" : "crosshair";
      return;
    }
    const d = drag;
    if (d.mode === "pan") {
      scrollX = d.sx - (x - d.x);
      clampScroll();
    } else if (d.mode === "ruler") {
      drag = { ...d, bar1: barAt(x), moved: d.moved || Math.abs(x - d.x) > SLOP };
    } else if (d.mode === "draw") {
      drag = { ...d, bar1: barAt(x), moved: d.moved || Math.abs(x - d.x) > SLOP };
    } else if (d.mode === "move") {
      const started = d.started || Math.abs(x - d.x) > SLOP;
      drag = { ...d, started, copy: e.altKey, bar: Math.max(0, Math.min(MAX_SONG_BARS - 1, Math.round(xBar(x) - d.grab))) };
    } else if (d.mode === "resize") {
      const p = pg.placements.find((q) => q.id === d.id);
      if (p) drag = { ...d, bars: Math.max(1, Math.min(MAX_SONG_BARS - p.bar, Math.round(xBar(x) - p.bar))) };
    }
    dirty = true;
  }

  function up(e: PointerEvent) {
    const d = drag;
    drag = null;
    dirty = true;
    if (!d) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (d.mode === "ruler") {
      // A drag along the ruler sets the loop; a click, where Play starts.
      if (d.moved && d.bar1 !== d.bar0) pg.setLoop({ start: Math.min(d.bar0, d.bar1), end: Math.max(d.bar0, d.bar1) + 1 });
      else pg.setSongStart(d.bar0);
    } else if (d.mode === "move") {
      if (d.started) pg.movePlacement(d.id, d.bar, d.copy);
    } else if (d.mode === "resize") {
      pg.resizePlacement(d.id, d.bars);
    } else if (d.mode === "draw") {
      if (d.moved) pg.drawPlacement(d.track, Math.min(d.bar0, d.bar1), Math.abs(d.bar1 - d.bar0) + 1);
      else {
        // A click on an empty place: the clip selected on this track goes there; otherwise nothing is selected.
        const c = pg.selectedClipData;
        if (c && c.track === d.track) pg.placeClip(c.id, d.bar0);
        else pg.selectPlacement(null);
      }
    }
  }

  function contextmenu(e: MouseEvent) {
    e.preventDefault();
    if (readOnly) return;
    const { x, y } = local(e);
    const h = hit(x, y);
    if (h) pg.removePlacement(h.p.id);
  }

  function wheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, local(e).x);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      scrollX += e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
      clampScroll();
    }
  }

  function key(e: KeyboardEvent) {
    const p = pg.selectedPlacementData;
    if (!p || readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Delete" || e.key === "Backspace") pg.removePlacement(p.id);
    else if (mod && e.key.toLowerCase() === "d") pg.duplicatePlacement(p.id);
    else if (e.key === "ArrowLeft" && !mod) pg.movePlacement(p.id, Math.max(0, p.bar - 1));
    else if (e.key === "ArrowRight" && !mod) pg.movePlacement(p.id, Math.min(MAX_SONG_BARS - p.bars, p.bar + 1));
    else if (e.key === "ArrowUp" && !mod) pg.transposePlacement(p.id, p.transpose + (e.shiftKey ? 12 : 1));
    else if (e.key === "ArrowDown" && !mod) pg.transposePlacement(p.id, p.transpose - (e.shiftKey ? 12 : 1));
    else if (e.key === "Escape") pg.selectPlacement(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // ------------------------------------------------------------------ dropping a clip from a track's clip list

  /** Where a clip dragged over the timeline would go. */
  let dropAt = $state.raw<{ track: string; p: Placement; bar: number; bars: number } | null>(null);

  function dragover(e: DragEvent) {
    const clip = clipDrag.id ? clipOf(clipDrag.id) : undefined;
    if (!clip || readOnly) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    const bar = barAt(local(e).x);
    if (dropAt?.bar === bar && dropAt.p.clip === clip.id) return;
    dropAt = { track: clip.track, p: { id: "drop", clip: clip.id, bar, bars: clip.bars, transpose: 0 }, bar, bars: clip.bars };
    dirty = true;
  }

  function drop(e: DragEvent) {
    const id = clipDrag.id;
    dropAt = null;
    dirty = true;
    if (!id || readOnly) return;
    e.preventDefault();
    clipDrag.id = null;
    pg.placeClip(id, barAt(local(e).x));
  }

  // The playhead moves by itself while playing (see painter.idle); once more on stop, to take it away.
  $effect(() => {
    void pg.playing;
    dirty = true;
  });

  const sel = $derived(pg.selectedPlacementData);
  const selClip = $derived(sel ? clipOf(sel.clip) : undefined);
  const selTrack = $derived<Track | undefined>(selClip ? tracks.find((t) => t.id === selClip!.track) : undefined);
  const selUses = $derived(sel ? pg.clipUses(sel.clip) : 0);
</script>

<section class="arrangement panel" aria-label="Arrangement">
  <div class="tools" role="toolbar" aria-label="Arrangement">
    <h2>Arrangement</h2>
    <span class="start" title="Play starts here (click a bar on the ruler to move it); Stop comes back here">▶ from bar {pg.songStart + 1}</span>
    <button class:active={pg.loopOn} aria-pressed={pg.loopOn} onclick={() => pg.toggleLoop()} title="Play the loop region over and over (drag along the ruler to set it)">
      ⟲ Loop{pg.loopRange ? ` ${pg.loopRange.start + 1}–${pg.loopRange.end}` : ""}
    </button>
    <button class:active={pg.follow} aria-pressed={pg.follow} onclick={() => (pg.follow = !pg.follow)} title="Scroll to keep the playhead in sight">Follow</button>
    <span class="group" role="group" aria-label="Zoom">
      <button onclick={() => zoom(1 / 1.5)} aria-label="Zoom out" title="Zoom out (Ctrl + wheel)">−</button>
      <button onclick={() => zoom(1.5)} aria-label="Zoom in" title="Zoom in (Ctrl + wheel)">+</button>
      <button onclick={() => { fit(); dirty = true; }} title="Show the whole song">Fit</button>
    </span>
    {#if pg.launcherTracks.length}
      <button class="back" data-guide="back-arr" onclick={() => pg.backToArrangement()} title="Stop the clips playing from the launcher: their tracks play the arrangement again (from the next bar while playing)">
        Back to arrangement ({pg.launcherTracks.length})
      </button>
    {/if}
    <span class="info">{pg.songTempo} BPM · {songEnd(pg.placements)} bars</span>
  </div>
  <canvas
    bind:this={canvas}
    use:surface={painter}
    style:height="{height}px"
    class:read-only={readOnly}
    data-guide="timeline"
    tabindex="0"
    aria-label="Arrangement: {pg.placements.length} placements over {songEnd(pg.placements)} bars"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={() => {
      drag = null;
      dirty = true;
    }}
    oncontextmenu={contextmenu}
    onwheel={wheel}
    onkeydown={key}
    ondragover={dragover}
    ondragleave={() => {
      dropAt = null;
      dirty = true;
    }}
    ondrop={drop}
  ></canvas>
  {#if sel && selClip && selTrack && !readOnly}
    <div class="placement" style:--track={css(selTrack.color)} role="group" aria-label="Placement">
      <strong>{selClip.name}</strong>
      <span class="dim">{selTrack.name} · bars {sel.bar + 1}–{placementEnd(sel)}{sel.bars > selClip.bars ? ` · plays ${Math.ceil(sel.bars / selClip.bars)}×` : ""}</span>
      {#if selUses > 1}<span class="linked" title="Every placement of this clip plays the same notes: change the clip once and they all change">∞ linked: {selUses} places</span>{/if}
      {#if selClip.kind !== "drums"}
        <span class="group" data-guide="place-transpose" role="group" aria-label="Transpose" title="Move this placement's notes up or down (the clip itself stays as it is)">
          Transpose
          <button onclick={() => pg.transposePlacement(sel.id, sel.transpose - 1)} aria-label="Down a semitone">−</button>
          <span class="val">{sel.transpose > 0 ? "+" : ""}{sel.transpose}</span>
          <button onclick={() => pg.transposePlacement(sel.id, sel.transpose + 1)} aria-label="Up a semitone">+</button>
        </span>
      {/if}
      <span class="push"></span>
      <button data-guide="make-unique" onclick={() => pg.makeUnique(sel.id)} disabled={selUses < 2} title="Give this placement its own copy of the clip, to change it without changing the others">Make unique</button>
      <button data-guide="copy-after" onclick={() => pg.duplicatePlacement(sel.id)} title="A linked copy right after it (Ctrl+D)">Copy after</button>
      <button class="danger" onclick={() => pg.removePlacement(sel.id)} title="Take it off the timeline (the clip stays in the track's list)">Remove</button>
    </div>
  {/if}
  {#if pg.explain}
    <p class="hint">
      {#if readOnly}
        The timeline shows the song. Drag it sideways; tap a bar on the ruler to play from there. Edit it on a bigger screen.
      {:else}
        The song from start to end, one row per track. Drag a clip from a track's list onto its row, or click its row with the clip selected; drag on an empty place
        to draw a new empty clip. Drag a placement to move it (Alt: a copy), drag its right end to repeat its clip, right-click or Delete removes it. Placements of
        one clip are <strong>linked</strong>: change the clip once and they all change ("Make unique" gives one its own copy). Click the ruler to play from a bar;
        drag along it to set the loop. A track playing a clip from the launcher (▶ above) leaves the arrangement until you stop that clip.
      {/if}
    </p>
  {/if}
</section>

<style>
  .arrangement { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .tools { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; }
  h2 { margin: 0; font-size: 14px; }
  .tools button { font-size: 12px; padding: 2px 8px; }
  .tools .active { border-color: #7fe0d0; color: #7fe0d0; }
  .start { color: #ff9b50; font-family: var(--mono); }
  .group { display: inline-flex; gap: 2px; align-items: center; }
  .back { color: #ffb347; }
  .info { margin-left: auto; color: var(--dim); font-family: var(--mono); }
  canvas {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 6px;
    touch-action: pan-y;
    outline: none;
    cursor: crosshair;
  }
  canvas:focus-visible { border-color: #7fe0d0; }
  canvas.read-only { cursor: grab; }
  .placement {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 6px 10px; font-size: 12px;
    border: 1px solid var(--track); border-radius: 6px; background: color-mix(in srgb, var(--track) 8%, #101416);
  }
  .placement button { font-size: 12px; padding: 2px 8px; }
  .placement .dim { color: var(--dim); }
  .placement .linked { color: var(--track); }
  .placement .val { font-family: var(--mono); min-width: 26px; text-align: center; }
  .placement .push { flex: 1; }
  .placement .danger { color: #ff8a7a; }
  .hint { margin: 0; font-size: 12px; color: #a9b6ba; line-height: 1.45; max-width: 900px; }
  @media (pointer: coarse) {
    .tools button, .placement button { min-height: 36px; }
  }
</style>
