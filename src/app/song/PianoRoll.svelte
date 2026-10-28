<script lang="ts" module>
  import type { Clipboard } from "../../song/noteEdit";
  /** Copied notes, shared by every piano roll (copy in one clip, paste in another). */
  let clipboard: Clipboard | null = null;
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { inScale, snapToScale } from "../../audio/scale";
  import { noteName } from "../../audio/stepSequencer";
  import { BEATS_PER_BAR, MAX_BARS, TICKS_PER_BEAT, type Note, type NoteClip } from "../../song/clips";
  import {
    addNote,
    barTicks,
    clampMove,
    copyNotes,
    deleteNotes,
    doubleNotes,
    GRIDS,
    legato,
    moveNotes,
    notesInBox,
    pasteNotes,
    quantize,
    resizeNotes,
    reverse,
    settle,
    shiftVelocity,
    snap,
    snapDown,
    transpose,
    type Edited,
  } from "../../song/noteEdit";
  import { surface, type Surface } from "../components/canvas";
  import { narrow, touch } from "../media.svelte";
  import type { Playground } from "../playground.svelte";

  interface Props {
    pg: Playground;
    clip: NoteClip;
    /** The track's colour on screen. */
    color: string;
  }
  let { pg, clip, color }: Props = $props();

  // Layout of the canvas: the keyboard on the left, the ruler on top, the velocity lane at the bottom.
  const KEYS_W = 46;
  const RULER_H = 18;
  const VEL_H = 56;
  const VEL_GAP = 6;
  const Q = TICKS_PER_BEAT;
  /** Pixels from a note's right end that drag its length. */
  const EDGE_PX = 6;
  const LONG_PRESS_MS = 450;
  /** Movement (px) that makes a press a drag. */
  const SLOP = 5;

  /** On a phone the piano roll shows the notes and plays its keys, but doesn't edit. */
  let readOnly = $derived(narrow.current);

  let gridIdx = $state(2); // 1/16
  let snapOn = $state(true);
  let strength = $state(1);
  let tall = $state(false);
  let grid = $derived(GRIDS[gridIdx].ticks);

  // The view: zoom (pixels a beat, pixels a row) and scroll (pixels from the clip's start, from the top row).
  let pxPerBeat = $state(80);
  let rowH = $state(12);
  let scrollX = $state(0);
  let scrollY = $state(0);
  let size = { w: 0, h: 0 };
  let fitted = false;

  let selected = $state.raw<Set<number>>(new Set());
  /** The notes as they are while a drag goes on (committed when it ends), with their selection. */
  let draft = $state.raw<Edited | null>(null);
  let box = $state.raw<{ t0: number; p0: number; t1: number; p1: number } | null>(null);
  /** The key held on the keyboard on the left (it sounds while held). */
  let keyDown = $state<number | null>(null);
  /** The length new notes get: the last one drawn or resized. */
  let lastLength = Q / 4;
  /** Where the next paste goes. */
  let pasteAt = 0;

  let canvas: HTMLCanvasElement;
  let dirty = true;

  const end = $derived(barTicks(clip.bars));
  const notes = $derived(draft?.notes ?? clip.notes);
  const shownSel = $derived(draft?.selected ?? selected);

  // Geometry.
  const areaW = () => Math.max(1, size.w - KEYS_W);
  const areaH = () => Math.max(1, size.h - RULER_H - VEL_H - VEL_GAP);
  const velTop = () => size.h - VEL_H;
  const tickX = (t: number) => KEYS_W + (t / Q) * pxPerBeat - scrollX;
  const xTick = (x: number) => ((x - KEYS_W + scrollX) / pxPerBeat) * Q;
  const pitchY = (p: number) => RULER_H + (127 - p) * rowH - scrollY;
  const yPitch = (y: number) => Math.max(0, Math.min(127, 127 - Math.floor((y - RULER_H + scrollY) / rowH)));
  const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);

  function clampScroll() {
    scrollX = Math.max(0, Math.min(Math.max(0, (end / Q) * pxPerBeat - areaW() + 24), scrollX));
    scrollY = Math.max(0, Math.min(Math.max(0, 128 * rowH - areaH()), scrollY));
  }

  /** Zoom across, keeping the tick under `x` in place. */
  function zoomX(factor: number, x = KEYS_W + areaW() / 2) {
    const t = xTick(x);
    pxPerBeat = Math.max(12, Math.min(480, pxPerBeat * factor));
    scrollX = (t / Q) * pxPerBeat - (x - KEYS_W);
    clampScroll();
  }
  /** Zoom up and down, keeping the pitch under `y` in place. */
  function zoomY(factor: number, y = RULER_H + areaH() / 2) {
    const rows = (y - RULER_H + scrollY) / rowH;
    rowH = Math.max(6, Math.min(32, rowH * factor));
    scrollY = rows * rowH - (y - RULER_H);
    clampScroll();
  }

  /** Show the whole clip across, and its notes (or the octaves around middle C when empty) up and down. */
  function fit() {
    if (!size.w) return;
    pxPerBeat = Math.max(12, Math.min(480, areaW() / (end / Q)));
    scrollX = 0;
    const ps = clip.notes.map((n) => n.pitch);
    let lo = ps.length ? Math.min(...ps) - 2 : 48;
    let hi = ps.length ? Math.max(...ps) + 2 : 72;
    const need = Math.max(hi - lo + 1, 24);
    lo = Math.max(0, Math.round((lo + hi) / 2 - need / 2));
    hi = Math.min(127, lo + need - 1);
    rowH = Math.max(6, Math.min(32, areaH() / (hi - lo + 1)));
    scrollY = (127 - hi) * rowH;
    clampScroll();
  }

  // Repaint when anything drawn changes (the canvas also repaints every frame while the transport plays).
  $effect(() => {
    void [$state.snapshot(clip), shownSel, draft, box, keyDown, pxPerBeat, rowH, scrollX, scrollY, color, grid, pg.scale.scale, pg.scale.root, readOnly];
    dirty = true;
  });

  // A new clip, or the notes changed by something else (undo): the selection no longer means anything.
  let mine: Note[] | null = null;
  $effect(() => {
    const ref = clip.notes;
    untrack(() => {
      if (ref !== mine) selected = new Set();
      mine = ref;
    });
  });
  let shownClip = "";
  $effect(() => {
    if (clip.id === shownClip) return;
    shownClip = clip.id;
    untrack(() => {
      pasteAt = 0;
      fitted = false;
      if (size.w) {
        fit();
        fitted = true;
      }
    });
  });

  function commit(e: Edited, label: string, key: string | null = null, bars?: number) {
    pg.setClipNotes(clip.id, e.notes, label, key, bars);
    const now = pg.songClips.find((c) => c.id === clip.id);
    mine = now?.kind === "notes" ? now.notes : null;
    selected = e.selected;
    draft = null;
  }

  const canSnap = (alt: boolean) => snapOn && !alt;
  const scaleOn = () => pg.scale.scale !== "off";

  // ------------------------------------------------------------------ drawing

  function draw({ g, w, h }: Surface) {
    dirty = false;
    const wider = size.w !== w;
    const resized = wider || size.h !== h;
    size = { w, h };
    // A new width (a turned phone, a resized window): fitted again, as the old zoom no longer suits it.
    if (!fitted || wider) {
      fit();
      fitted = true;
    } else if (resized) clampScroll();
    const aTop = RULER_H;
    const aBottom = RULER_H + areaH();
    const lit = scaleOn();

    // Rows.
    g.fillStyle = "#0d1113";
    g.fillRect(0, 0, w, h);
    const top = yPitch(aTop);
    const bottom = yPitch(aBottom - 1);
    for (let p = bottom; p <= top; p++) {
      const y = pitchY(p);
      const inside = !lit || inScale(p, pg.scale);
      g.fillStyle = lit ? (inside ? (isBlack(p) ? "#151c1f" : "#192125") : "#0a0d0e") : isBlack(p) ? "#111618" : "#151b1e";
      g.fillRect(KEYS_W, y, w - KEYS_W, rowH);
      if (p % 12 === 0) {
        g.fillStyle = "#ffffff18";
        g.fillRect(KEYS_W, y + rowH - 1, w - KEYS_W, 1);
      }
    }

    // Past the clip's end.
    const endX = tickX(end);
    if (endX < w) {
      g.fillStyle = "#000000a0";
      g.fillRect(Math.max(KEYS_W, endX), aTop, w - Math.max(KEYS_W, endX), aBottom - aTop);
    }

    // Grid, beats and bars.
    const step = grid * pxPerBeat < Q * 5 ? Q : grid; // too close together: beats only
    for (let t = snapDown(xTick(KEYS_W), step); t <= Math.min(end, xTick(w)); t += step) {
      const x = Math.round(tickX(t)) + 0.5;
      if (x < KEYS_W) continue;
      const bar = t % (Q * BEATS_PER_BAR) === 0;
      const beat = t % Q === 0;
      g.fillStyle = bar ? "#ffffff38" : beat ? "#ffffff1c" : "#ffffff0b";
      g.fillRect(x - 0.5, aTop, 1, aBottom - aTop);
    }

    // Notes.
    g.save();
    g.beginPath();
    g.rect(KEYS_W, aTop, w - KEYS_W, aBottom - aTop);
    g.clip();
    g.font = `${Math.min(11, rowH - 2)}px ui-monospace, monospace`;
    g.textBaseline = "middle";
    notes.forEach((n, i) => {
      const x = tickX(n.start);
      const x2 = tickX(n.start + n.length);
      const y = pitchY(n.pitch);
      if (x2 < KEYS_W || x > w || y + rowH < aTop || y > aBottom) return;
      const sel = shownSel.has(i);
      g.globalAlpha = 0.45 + (0.55 * n.velocity) / 127;
      g.fillStyle = color;
      g.fillRect(x + 0.5, y + 0.5, Math.max(2, x2 - x - 1), rowH - 1);
      g.globalAlpha = 1;
      g.strokeStyle = sel ? "#ffffff" : "#00000080";
      g.lineWidth = sel ? 1.5 : 1;
      g.strokeRect(x + 1, y + 1, Math.max(1, x2 - x - 2), rowH - 2);
      if (x2 - x > 28 && rowH >= 10) {
        g.fillStyle = "#0b1314";
        g.fillText(noteName(n.pitch), x + 4, y + rowH / 2 + 0.5);
      }
    });
    if (box) {
      const x1 = tickX(Math.min(box.t0, box.t1));
      const x2 = tickX(Math.max(box.t0, box.t1));
      const y1 = pitchY(Math.max(box.p0, box.p1));
      const y2 = pitchY(Math.min(box.p0, box.p1)) + rowH;
      g.fillStyle = "#7fe0d01a";
      g.fillRect(x1, y1, x2 - x1, y2 - y1);
      g.strokeStyle = "#7fe0d0";
      g.lineWidth = 1;
      g.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
    }
    g.restore();

    // Keyboard.
    g.save();
    g.beginPath();
    g.rect(0, aTop, KEYS_W, aBottom - aTop);
    g.clip();
    g.font = "9px ui-monospace, monospace";
    g.textBaseline = "middle";
    for (let p = bottom; p <= top; p++) {
      const y = pitchY(p);
      const black = isBlack(p);
      const out = lit && !inScale(p, pg.scale);
      g.fillStyle = keyDown === p ? color : black ? (out ? "#15191b" : "#20282b") : out ? "#5d6567" : "#c9d2d4";
      g.fillRect(0, y, KEYS_W - 1, rowH - 0.5);
      if (p % 12 === 0 && rowH >= 8) {
        g.fillStyle = "#0b1314";
        g.fillText(noteName(p), 3, y + rowH / 2);
      }
    }
    g.restore();

    // Ruler.
    g.fillStyle = "#13181b";
    g.fillRect(0, 0, w, RULER_H);
    g.font = "10px ui-monospace, monospace";
    g.textBaseline = "middle";
    const beatPx = pxPerBeat;
    for (let b = Math.max(0, Math.floor(xTick(KEYS_W) / Q)); b <= end / Q && tickX(b * Q) <= w; b++) {
      const x = Math.round(tickX(b * Q)) + 0.5;
      if (x < KEYS_W) continue;
      const bar = b % BEATS_PER_BAR === 0;
      g.fillStyle = bar ? "#7d8b90" : "#3a4448";
      g.fillRect(x - 0.5, bar ? 2 : 10, 1, bar ? RULER_H - 2 : RULER_H - 10);
      if (bar) g.fillText(`${b / BEATS_PER_BAR + 1}`, x + 3, 8);
      else if (beatPx > 36) {
        g.fillStyle = "#56636a";
        g.fillText(`${Math.floor(b / BEATS_PER_BAR) + 1}.${(b % BEATS_PER_BAR) + 1}`, x + 3, 12);
      }
    }

    // Velocity lane.
    const vTop = velTop();
    g.fillStyle = "#101416";
    g.fillRect(KEYS_W, vTop, w - KEYS_W, VEL_H);
    g.fillStyle = "#56636a";
    g.font = "9px ui-monospace, monospace";
    g.fillText("Vel", 4, vTop + 10);
    g.save();
    g.beginPath();
    g.rect(KEYS_W, vTop, w - KEYS_W, VEL_H);
    g.clip();
    notes.forEach((n, i) => {
      const x = tickX(n.start);
      if (x < KEYS_W - 4 || x > w) return;
      const vh = ((VEL_H - 6) * n.velocity) / 127;
      const sel = shownSel.has(i);
      g.fillStyle = sel ? "#ffffff" : color;
      g.globalAlpha = sel ? 0.9 : 0.75;
      g.fillRect(x, vTop + VEL_H - vh, 3, vh);
      g.fillRect(x - 2, vTop + VEL_H - vh, 7, 2);
    });
    g.globalAlpha = 1;
    g.restore();

    // The playhead, while the clip plays.
    const beat = pg.clipBeatNow(clip.id);
    if (beat >= 0) {
      const x = tickX(beat * Q);
      if (x >= KEYS_W && x <= w) {
        g.fillStyle = "#ffffffc0";
        g.fillRect(Math.round(x), 0, 1.5, aBottom);
        g.fillRect(Math.round(x), vTop, 1.5, VEL_H);
      }
    }
  }

  const painter = { draw, animate: true, idle: () => !dirty && !pg.playing };

  // ------------------------------------------------------------------ pointer

  type Drag =
    | { mode: "key"; pitch: number }
    | { mode: "draw"; index: number; base: Note[]; start: number; pitch: number; alt: boolean }
    | { mode: "move"; anchor: number; x: number; y: number; started: boolean; heard: number }
    | { mode: "resize"; anchor: number; x: number }
    | { mode: "box"; base: Set<number> }
    | { mode: "vel"; anchor: number; group: boolean }
    | { mode: "pan"; x: number; y: number; sx: number; sy: number }
    /** A touch on the notes before it is known what it is: a tap draws, a drag draws and lengthens, a long press selects. */
    | { mode: "press"; x: number; y: number; hit: number; timer: ReturnType<typeof setTimeout> };

  let drag: Drag | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  /** Two fingers: scroll and zoom, from where they were. */
  let pinch: { mid: { x: number; y: number }; dx: number; dy: number } | null = null;

  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inNotes = (x: number, y: number) => x >= KEYS_W && y >= RULER_H && y < RULER_H + areaH();
  const inVel = (x: number, y: number) => x >= KEYS_W && y >= velTop();

  /** The note under a point (the top one where they overlap), and whether the point is on its right end. */
  function hitNote(x: number, y: number): { index: number; edge: boolean } | null {
    const p = yPitch(y);
    const t = xTick(x);
    for (let i = clip.notes.length - 1; i >= 0; i--) {
      const n = clip.notes[i];
      if (n.pitch !== p || t < n.start || t >= n.start + n.length) continue;
      const x2 = tickX(n.start + n.length);
      return { index: i, edge: x2 - x <= Math.min(EDGE_PX, (x2 - tickX(n.start)) / 3) };
    }
    return null;
  }

  /** The note whose velocity bar is nearest `x` (selected ones first), within a few pixels. */
  function hitVel(x: number): number {
    let best = -1;
    let bestD = 7;
    clip.notes.forEach((n, i) => {
      const d = Math.abs(tickX(n.start) + 1.5 - x) - (selected.has(i) ? 0.5 : 0);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  }

  function hear(pitch: number, velocity = 100) {
    pg.trackNoteOn(clip.track, pitch, velocity);
  }

  /** Start drawing a note at a point; dragging on lengthens it. */
  function startDraw(x: number, y: number, alt: boolean): Extract<Drag, { mode: "draw" }> | null {
    const t = xTick(x);
    if (t < 0 || t >= end) return null;
    let pitch = yPitch(y);
    if (scaleOn()) pitch = snapToScale(pitch, pg.scale);
    const start = canSnap(alt) ? snapDown(t, grid) : Math.round(t);
    const length = Math.min(lastLength, end - start);
    const added = addNote(clip.notes, { start, length, pitch, velocity: 100 }, clip.bars);
    draft = { notes: added.notes, selected: new Set() };
    const d: Drag = { mode: "draw", index: added.index, base: clip.notes, start, pitch, alt };
    drag = d;
    hear(pitch);
    return d;
  }

  function startBox(x: number, y: number, add: boolean) {
    const t = xTick(x);
    const p = yPitch(y);
    box = { t0: t, p0: p, t1: t, p1: p };
    drag = { mode: "box", base: add ? new Set(selected) : new Set() };
    draft = { notes: clip.notes, selected: drag.base };
  }

  function startMove(index: number, x: number, y: number) {
    drag = { mode: "move", anchor: index, x, y, started: false, heard: clip.notes[index].pitch };
  }

  function down(e: PointerEvent) {
    canvas.focus({ preventScroll: true });
    const { x, y } = local(e);
    if (e.pointerType === "touch") {
      pointers.set(e.pointerId, { x, y });
      if (pointers.size === 2) {
        cancelDrag();
        const [a, b] = [...pointers.values()];
        pinch = { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y) };
        return;
      }
      if (pointers.size > 2) return;
    }
    if (e.button === 1) return;
    canvas.setPointerCapture(e.pointerId);

    if (x < KEYS_W && y >= RULER_H && y < RULER_H + areaH()) {
      const p = yPitch(y);
      keyDown = p;
      pg.trackNoteOn(clip.track, p, 100, null);
      drag = { mode: "key", pitch: p };
      return;
    }
    if (readOnly) {
      if (inNotes(x, y) || inVel(x, y)) drag = { mode: "pan", x, y, sx: scrollX, sy: scrollY };
      return;
    }
    if (inVel(x, y)) {
      const i = hitVel(x);
      if (i >= 0) {
        drag = { mode: "vel", anchor: i, group: selected.has(i) };
        setVelocity(y);
      }
      return;
    }
    if (!inNotes(x, y)) return;

    const hit = hitNote(x, y);
    if (e.pointerType === "touch") {
      // Decided on move, on release or after a long press.
      const timer = setTimeout(() => longPress(), LONG_PRESS_MS);
      drag = { mode: "press", x, y, hit: hit?.index ?? -1, timer };
      return;
    }
    if (e.button === 2) {
      if (hit) commit({ notes: deleteNotes(clip.notes, new Set([hit.index])), selected: new Set() }, "Delete note");
      return;
    }
    if (hit) {
      if (e.shiftKey) {
        const s = new Set(selected);
        if (s.has(hit.index)) s.delete(hit.index);
        else s.add(hit.index);
        selected = s;
        return;
      }
      if (!selected.has(hit.index)) selected = new Set([hit.index]);
      hear(clip.notes[hit.index].pitch, clip.notes[hit.index].velocity);
      if (hit.edge) drag = { mode: "resize", anchor: hit.index, x };
      else startMove(hit.index, x, y);
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) return startBox(x, y, e.shiftKey);
    // A click on an empty place: lets go of the selection, or (with none) draws a note.
    if (selected.size) {
      selected = new Set();
      return;
    }
    startDraw(x, y, e.altKey);
  }

  function longPress() {
    if (drag?.mode !== "press") return;
    const { x, y, hit } = drag;
    navigator.vibrate?.(15);
    if (hit >= 0) {
      const s = new Set(selected);
      if (s.has(hit)) s.delete(hit);
      else s.add(hit);
      selected = s;
      drag = null;
    } else startBox(x, y, true);
  }

  function move(e: PointerEvent) {
    const { x, y } = local(e);
    if (e.pointerType === "touch" && pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x, y });
      if (pinch && pointers.size === 2) return pinchMove();
    }
    if (!drag) return;
    switch (drag.mode) {
      case "key": {
        const p = yPitch(y);
        if (p !== drag.pitch && x < KEYS_W + 20) {
          pg.trackNoteOff(clip.track, drag.pitch);
          pg.trackNoteOn(clip.track, p, 100, null);
          drag.pitch = keyDown = p;
        }
        return;
      }
      case "pan":
        scrollX = drag.sx - (x - drag.x);
        scrollY = drag.sy - (y - drag.y);
        return clampScroll();
      case "press": {
        if (Math.hypot(x - drag.x, y - drag.y) < SLOP * 2) return;
        clearTimeout(drag.timer);
        const { x: x0, y: y0, hit } = drag;
        drag = null;
        if (hit >= 0) {
          if (!selected.has(hit)) selected = new Set([hit]);
          startMove(hit, x0, y0);
        } else startDraw(x0, y0, false);
        return move(e);
      }
      case "draw": {
        const t = xTick(x);
        const len = canSnap(drag.alt || e.altKey) ? Math.max(grid, snap(t - drag.start, grid)) : Math.max(6, Math.round(t - drag.start));
        const notes = drag.base.map((n) => ({ note: { ...n }, sel: false }));
        notes.push({ note: { start: drag.start, length: Math.min(len, end - drag.start), pitch: drag.pitch, velocity: 100 }, sel: true });
        const out = settle(notes, clip.bars);
        drag.index = [...out.selected][0] ?? drag.index;
        draft = { notes: out.notes, selected: new Set() };
        return;
      }
      case "move": {
        if (!drag.started && Math.hypot(x - drag.x, y - drag.y) < SLOP) return;
        drag.started = true;
        const a = clip.notes[drag.anchor];
        const raw = xTick(x) - xTick(drag.x);
        const dt = canSnap(e.altKey) ? snap(a.start + raw, grid) - a.start : Math.round(raw);
        const dp = yPitch(y) - yPitch(drag.y);
        draft = moveNotes(clip.notes, selected, dt, dp, clip.bars);
        const p = a.pitch + clampMove(clip.notes, selected, dt, dp, clip.bars).dp;
        if (p !== drag.heard) {
          drag.heard = p;
          hear(p, a.velocity);
        }
        return;
      }
      case "resize": {
        const a = clip.notes[drag.anchor];
        const raw = xTick(x) - xTick(drag.x);
        const aEnd = a.start + a.length;
        const dl = canSnap(e.altKey) ? Math.max(a.start + grid, snap(aEnd + raw, grid)) - aEnd : Math.round(raw);
        draft = resizeNotes(clip.notes, selected, dl, canSnap(e.altKey) ? Math.min(grid, a.length) : 4, clip.bars);
        return;
      }
      case "box": {
        if (!box) return;
        box = { ...box, t1: xTick(x), p1: yPitch(y) };
        const inside = notesInBox(clip.notes, box.t0, box.t1, box.p0, box.p1);
        draft = { notes: clip.notes, selected: new Set([...drag.base, ...inside]) };
        return;
      }
      case "vel":
        return setVelocity(y);
    }
  }

  function setVelocity(y: number) {
    if (drag?.mode !== "vel") return;
    const a = clip.notes[drag.anchor];
    if (!a) return;
    const v = Math.round(Math.max(1, Math.min(127, ((velTop() + VEL_H - y) / (VEL_H - 6)) * 127)));
    draft = shiftVelocity(clip.notes, drag.group ? selected : new Set([drag.anchor]), v - a.velocity, clip.bars);
    // Keep the selection as it was (a single bar changed outside the selection doesn't select it).
    if (!drag.group) draft = { notes: draft.notes, selected };
  }

  function pinchMove() {
    if (!pinch) return;
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    scrollX -= mid.x - pinch.mid.x;
    scrollY -= mid.y - pinch.mid.y;
    if (pinch.dx > 40 && dx > 40) zoomX(dx / pinch.dx, mid.x);
    if (pinch.dy > 40 && dy > 40) zoomY(dy / pinch.dy, mid.y);
    clampScroll();
    pinch = { mid, dx, dy };
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    switch (d.mode) {
      case "key":
        pg.trackNoteOff(clip.track, d.pitch);
        keyDown = null;
        return;
      case "press":
        clearTimeout(d.timer);
        if (d.hit >= 0) {
          // A tap on a note selects it alone.
          selected = new Set([d.hit]);
          hear(clip.notes[d.hit].pitch, clip.notes[d.hit].velocity);
        } else if (selected.size) selected = new Set();
        else {
          const tap = startDraw(d.x, d.y, false);
          if (tap) finishDraw(tap);
          drag = null;
        }
        return;
      case "draw":
        return finishDraw(d);
      case "move": {
        if (!d.started || !draft) {
          draft = null;
          return;
        }
        const same = JSON.stringify(draft.notes) === JSON.stringify(clip.notes);
        if (same) draft = null;
        else commit(draft, selected.size > 1 ? "Move notes" : "Move note");
        return;
      }
      case "resize":
        if (draft) {
          const n = draft.notes[[...draft.selected][0]];
          if (n) lastLength = n.length;
          commit(draft, selected.size > 1 ? "Length of notes" : "Length of note");
        }
        return;
      case "box":
        box = null;
        selected = draft?.selected ?? selected;
        draft = null;
        return;
      case "vel":
        if (draft) commit(draft, "Velocity");
        return;
    }
  }

  function finishDraw(d: Extract<Drag, { mode: "draw" }>) {
    if (!draft) return;
    const n = draft.notes[d.index];
    if (n) lastLength = n.length;
    commit({ notes: draft.notes, selected: new Set() }, "Draw note");
  }

  function cancelDrag() {
    if (drag?.mode === "press") clearTimeout(drag.timer);
    if (drag?.mode === "key") {
      pg.trackNoteOff(clip.track, drag.pitch);
      keyDown = null;
    }
    drag = null;
    draft = null;
    box = null;
  }

  function dblclick(e: MouseEvent) {
    if (readOnly) return;
    const { x, y } = local(e);
    if (!inNotes(x, y)) return;
    const hit = hitNote(x, y);
    if (hit) commit({ notes: deleteNotes(clip.notes, new Set([hit.index])), selected: new Set() }, "Delete note");
  }

  // Wheel: scroll up and down (Shift: across), Ctrl (or a trackpad pinch): zoom across, Alt: zoom up and down.
  onMount(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(e);
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (e.ctrlKey || e.metaKey) zoomX(Math.exp(-d * 0.004), x);
      else if (e.altKey) zoomY(Math.exp(-d * 0.004), y);
      else if (e.shiftKey) scrollX += d;
      else {
        scrollY += d;
        scrollX += e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      }
      clampScroll();
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", wheel);
      cancelDrag();
    };
  });

  // ------------------------------------------------------------------ keys and tools

  function key(e: KeyboardEvent) {
    if (readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    let done = true;
    if ((k === "Delete" || k === "Backspace") && selected.size) commit({ notes: deleteNotes(clip.notes, selected), selected: new Set() }, selected.size > 1 ? "Delete notes" : "Delete note");
    else if (k === "Escape") selected = new Set();
    else if (k === "ArrowLeft" || k === "ArrowRight") {
      if (!selected.size) return;
      const dt = (k === "ArrowLeft" ? -1 : 1) * grid;
      commit(moveNotes(clip.notes, selected, dt, 0, clip.bars), "Move notes", "nudge");
    } else if (k === "ArrowUp" || k === "ArrowDown") {
      if (!selected.size) return;
      const dp = (k === "ArrowDown" ? -1 : 1) * (e.shiftKey ? 12 : 1);
      const out = moveNotes(clip.notes, selected, 0, dp, clip.bars);
      commit(out, "Move notes", "nudge");
      const first = [...out.selected][0];
      if (first !== undefined && out.selected.size === 1) hear(out.notes[first].pitch, out.notes[first].velocity);
    } else if (mod && k.toLowerCase() === "a") selected = new Set(clip.notes.map((_, i) => i));
    else if (mod && (k.toLowerCase() === "c" || k.toLowerCase() === "x")) {
      const c = copyNotes(clip.notes, selected);
      if (!c) return;
      clipboard = c;
      pasteAt = Math.min(...[...selected].map((i) => clip.notes[i].start)) + roundUp(c.span);
      if (k.toLowerCase() === "x") commit({ notes: deleteNotes(clip.notes, selected), selected: new Set() }, "Cut notes");
    } else if (mod && k.toLowerCase() === "v") paste();
    else if (mod && k.toLowerCase() === "d") {
      const c = copyNotes(clip.notes, selected);
      if (!c) return;
      clipboard = c;
      pasteAt = Math.min(...[...selected].map((i) => clip.notes[i].start)) + roundUp(c.span);
      paste();
    } else done = false;
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** A span rounded up to the grid (so a pasted copy lands on it). */
  const roundUp = (t: number) => Math.max(grid, Math.ceil(t / grid - 1e-9) * grid);

  function paste() {
    if (!clipboard) return;
    if (pasteAt >= end) pasteAt = 0;
    commit(pasteNotes(clip.notes, clipboard, pasteAt, clip.bars), "Paste notes");
    pasteAt += roundUp(clipboard.span);
  }

  const toolTarget = $derived(selected.size ? `the ${selected.size} selected note${selected.size > 1 ? "s" : ""}` : "every note");

  function tool(which: "quantize" | "reverse" | "legato" | "up" | "down" | "octUp" | "octDown" | "double") {
    const n = clip.notes;
    switch (which) {
      case "quantize":
        return commit(quantize(n, selected, grid, strength, clip.bars), "Quantize");
      case "reverse":
        return commit(reverse(n, selected, clip.bars), "Reverse");
      case "legato":
        return commit(legato(n, selected, clip.bars), "Legato");
      case "up":
      case "down":
      case "octUp":
      case "octDown": {
        const st = { up: 1, down: -1, octUp: 12, octDown: -12 }[which];
        return commit(transpose(n, selected, st, clip.bars), "Transpose");
      }
      case "double": {
        const out = doubleNotes(n, clip.bars);
        if (!out) return;
        commit({ notes: out.notes, selected: new Set() }, "Double the clip", null, out.bars);
        // Fitted to the new length at the next paint.
        fitted = false;
        dirty = true;
      }
    }
  }
</script>

<div class="roll" class:tall style:--track={color}>
  <div class="tools" role="toolbar" aria-label="Piano roll">
    {#if !readOnly}
      <label title="Notes snap to this grid when drawn, moved or lengthened (hold Alt to place them freely)">
        Grid
        <select bind:value={gridIdx}>
          {#each GRIDS as gr, i (gr.name)}<option value={i}>{gr.name}</option>{/each}
        </select>
      </label>
      <button class:active={snapOn} aria-pressed={snapOn} onclick={() => (snapOn = !snapOn)} title="Snap to the grid (Alt while dragging: off for that drag)">Snap</button>
      <span class="sep"></span>
      <span class="group" title="Pull {toolTarget}'s starts to the grid, all the way or part of the way">
        <button onclick={() => tool("quantize")}>Quantize</button>
        <select bind:value={strength} aria-label="Quantize strength">
          {#each [1, 0.75, 0.5, 0.25] as s (s)}<option value={s}>{s * 100}%</option>{/each}
        </select>
      </span>
      <span class="group" role="group" aria-label="Transpose" title="Move {toolTarget} up or down">
        <button onclick={() => tool("octDown")} aria-label="Down an octave">−12</button>
        <button onclick={() => tool("down")} aria-label="Down a semitone">−1</button>
        <button onclick={() => tool("up")} aria-label="Up a semitone">+1</button>
        <button onclick={() => tool("octUp")} aria-label="Up an octave">+12</button>
      </span>
      <button onclick={() => tool("legato")} title="Hold each of {toolTarget} until the next note starts">Legato</button>
      <button onclick={() => tool("reverse")} title="Play {toolTarget} backwards">Reverse</button>
      <button onclick={() => tool("double")} disabled={clip.bars * 2 > MAX_BARS.notes} title="Make the clip twice as long, its notes played twice">Double</button>
      <span class="sep"></span>
    {/if}
    <span class="group" role="group" aria-label="Zoom">
      <button onclick={() => zoomX(1 / 1.5)} aria-label="Zoom out" title="Zoom out (Ctrl + wheel)">−</button>
      <button onclick={() => zoomX(1.5)} aria-label="Zoom in" title="Zoom in (Ctrl + wheel; Alt + wheel: up and down)">+</button>
      <button onclick={fit} title="Show the whole clip and all its notes">Fit</button>
    </span>
    <button class:active={tall} aria-pressed={tall} onclick={() => (tall = !tall)} title="Use the whole height of the window">Tall</button>
    <span class="info">
      {clip.notes.length} note{clip.notes.length === 1 ? "" : "s"}{selected.size ? ` · ${selected.size} selected` : ""}
    </span>
  </div>
  <canvas
    bind:this={canvas}
    use:surface={painter}
    class:read-only={readOnly}
    tabindex="0"
    aria-label="Piano roll of {clip.name}: {clip.notes.length} notes"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={(e) => {
      pointers.delete(e.pointerId);
      pinch = null;
      cancelDrag();
    }}
    ondblclick={dblclick}
    oncontextmenu={(e) => e.preventDefault()}
    onkeydown={key}
  ></canvas>
  {#if readOnly}
    <p class="hint">On a phone the piano roll shows the notes. Edit them on a bigger screen.</p>
  {:else if pg.explain}
    <p class="hint">
      {#if touch.current}
        Tap an empty place to draw a note (drag to make it longer), drag a note to move it, drag its right end to change its length. A long press selects a note, or
        starts a box on an empty place. Two fingers scroll and zoom. The bars at the bottom are each note's velocity (how hard it is played): drag them.
      {:else}
        Click an empty place to draw a note (drag to make it longer). Drag a note to move it, drag its right end to change its length; double-click or right-click
        deletes it. Shift + click adds to the selection, Shift + drag (or Ctrl + drag) draws a box. Delete, the arrow keys (Shift: an octave), Ctrl+C, Ctrl+V,
        Ctrl+D and Ctrl+A work on the selection. The bars at the bottom are each note's velocity (how hard it is played): drag them. Click the keys on the left to hear
        a note.
      {/if}
      {#if pg.scale.scale !== "off"}With Scale lock on, the scale's rows are lit and new notes snap into it.{/if}
    </p>
  {/if}
</div>

<style>
  .roll { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .tools { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .tools label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
  .tools button { font-size: 12px; padding: 2px 8px; }
  .tools select { font-size: 12px; padding: 2px 4px; }
  .tools .active { border-color: var(--track); color: var(--track); }
  .group { display: inline-flex; gap: 2px; align-items: center; }
  .sep { width: 1px; height: 18px; background: var(--line); }
  .info { margin-left: auto; color: var(--dim); font-family: var(--mono); }
  canvas {
    width: 100%;
    height: 360px;
    border: 1px solid var(--line);
    border-radius: 6px;
    touch-action: none;
    outline: none;
    cursor: crosshair;
  }
  canvas:focus-visible { border-color: var(--track); }
  canvas.read-only { cursor: grab; height: 260px; }
  .tall canvas { height: calc(100vh - 200px); min-height: 360px; }
  .hint { margin: 0; font-size: 12px; color: #a9b6ba; line-height: 1.45; max-width: 900px; }
  @media (pointer: coarse) {
    .tools button, .tools select { min-height: 36px; }
  }
</style>
