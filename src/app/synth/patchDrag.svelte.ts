// Patching by dragging cables in the Synth view. Drag from a modulator's socket to a block to make a
// route (the block shows its destinations to drop on); drag a route cable's end to another destination
// to move it, or into empty space to remove it. A socket clicked without dragging starts click patching
// (then click a block), which also works from the keyboard.

import { getContext, setContext } from "svelte";
import { MOD_DESTS } from "../../audio/params";
import type { Playground } from "../playground.svelte";
import { DEST_NAMES } from "./blocks";

/** Pointer travel (px) before a press on a socket or cable end counts as a drag. */
const DRAG_PX = 4;
/** How close to the window's top or bottom edge (px) the page starts scrolling during a drag. */
const EDGE_PX = 48;

export interface PatchDragState {
  /** The source, by MOD_SOURCES index. */
  src: number;
  /** The route whose end is being moved; null while making a new route. */
  route: number | null;
  /** Where the cable starts (the source's socket) and where the pointer is, in the diagram's coordinates. */
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** The destination under the pointer, by MOD_DESTS index. */
  over: number | null;
}

export class PatchDrag {
  /** The drag under way, once the pointer has moved far enough. */
  state = $state<PatchDragState | null>(null);
  private dragged = false;

  constructor(
    private playground: () => Playground,
    private container: () => HTMLElement | undefined,
    /** What a cable is dropped on, for the hint at the pointer. */
    private target = "a block",
  ) {}

  /** A press on source `src`'s socket (`route` null) or on route `route`'s cable end. */
  press(e: PointerEvent, src: number, route: number | null) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const box = this.container();
    const jack = box?.querySelector<HTMLElement>(`[data-jack="${src}"]`);
    if (!box || !jack) return;
    const startX = e.clientX;
    const startY = e.clientY;
    /** The pointer, in the window. */
    let px = startX;
    let py = startY;
    let frame = 0;
    const update = () => {
      const base = box.getBoundingClientRect();
      const j = jack.getBoundingClientRect();
      const zone = document.elementFromPoint(px, py)?.closest<HTMLElement>("[data-dest]");
      this.state = {
        src, route,
        x0: j.left + j.width / 2 - base.left, y0: j.top + j.height / 2 - base.top,
        x: px - base.left, y: py - base.top,
        over: zone ? +zone.dataset.dest! : null,
      };
    };
    // Near the window's top or bottom edge the page scrolls, so a block off screen can still be reached.
    const scroll = () => {
      const edge = py < EDGE_PX ? py - EDGE_PX : py > innerHeight - EDGE_PX ? py - (innerHeight - EDGE_PX) : 0;
      if (edge) {
        window.scrollBy(0, edge / 3);
        update();
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (ev: PointerEvent) => {
      px = ev.clientX;
      py = ev.clientY;
      if (!this.state && Math.hypot(px - startX, py - startY) < DRAG_PX) return;
      if (!this.state) frame = requestAnimationFrame(scroll);
      update();
    };
    const end = (ev: PointerEvent | null) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      cancelAnimationFrame(frame);
      const s = this.state;
      this.state = null;
      if (!s) return;
      // A drag that ends where it started still fires a click there: that click isn't one.
      this.dragged = true;
      setTimeout(() => (this.dragged = false));
      if (ev) this.drop(s);
    };
    const up = (ev: PointerEvent) => end(ev);
    const cancel = () => end(null);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      end(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
  }

  private get pg() {
    return this.playground();
  }

  /** What letting go here would do, for the label at the pointer. */
  get hint(): string {
    const s = this.state;
    if (!s) return "";
    if (s.over !== null) return `→ ${DEST_NAMES[MOD_DESTS[s.over]]}`;
    return s.route === null ? `Drop on ${this.target}` : `Let go to remove route ${s.route}`;
  }

  /** A click on a socket or cable end (mouse or keyboard), when it wasn't the end of a drag. */
  click(e: MouseEvent, src: number, route: number | null) {
    e.stopPropagation();
    if (this.dragged) return;
    if (route !== null) return this.pg.focus("matrix");
    // Click patching from this source: the next block clicked is the destination.
    this.pg.patch = this.pg.patch === src ? null : src;
  }

  private drop(s: PatchDragState) {
    this.pg.patch = null;
    if (s.route === null) {
      if (s.over !== null) this.pg.addRoute(s.src, s.over);
    } else if (s.over === null) this.pg.removeRoute(s.route);
    else this.pg.moveRoute(s.route, s.over);
  }
}

const KEY = Symbol("patchDrag");
export const providePatchDrag = (drag: PatchDrag) => setContext(KEY, drag);
/** The Synth view's drag, or undefined outside it. */
export const usePatchDrag = () => getContext<PatchDrag | undefined>(KEY);
