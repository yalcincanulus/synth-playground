import type { Action } from "svelte/action";

interface DragOptions {
  get: () => number;
  set: (position: number) => void;
  /** Pixels for the full 0..1 range. */
  range?: number;
}

/** Vertical drag (and arrow keys) adjusts a 0..1 position. Shift drags finely. */
export const dragValue: Action<Element, DragOptions> = (node, initial) => {
  let opts = initial;
  let startY = 0;
  let startValue = 0;

  const move = (e: PointerEvent) => {
    const range = (opts.range ?? 180) * (e.shiftKey ? 5 : 1);
    opts.set(Math.max(0, Math.min(1, startValue + (startY - e.clientY) / range)));
  };
  const up = (e: PointerEvent) => {
    node.releasePointerCapture?.(e.pointerId);
    node.removeEventListener("pointermove", move as EventListener);
    node.removeEventListener("pointerup", up as EventListener);
  };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    startY = e.clientY;
    startValue = opts.get();
    node.setPointerCapture?.(e.pointerId);
    node.addEventListener("pointermove", move as EventListener);
    node.addEventListener("pointerup", up as EventListener);
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 1 / 127;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") opts.set(Math.min(1, opts.get() + step));
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") opts.set(Math.max(0, opts.get() - step));
    else return;
    e.preventDefault();
  };

  node.addEventListener("pointerdown", down as EventListener);
  node.addEventListener("keydown", key as EventListener);
  return {
    update(next) {
      opts = next;
    },
    destroy() {
      node.removeEventListener("pointerdown", down as EventListener);
      node.removeEventListener("keydown", key as EventListener);
    },
  };
};
