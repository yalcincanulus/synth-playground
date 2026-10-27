// Reordering the effect row: drag an effect by its ⠿ handle. The drop point is before the block whose
// middle is right of the pointer. Shared by the Cables and Panel views.

import { effectOrder, type Effect } from "../../audio/params";
import type { Playground } from "../playground.svelte";

export class EffectRow {
  /** The row of effects, each with a [data-block]. */
  row = $state<HTMLElement>();
  /** Where the dragged effect would land, while it is over the row. */
  dropAt = $state<number | null>(null);

  constructor(private playground: () => Playground) {}

  private index(e: DragEvent): number {
    const blocks = [...(this.row?.querySelectorAll<HTMLElement>("[data-block]") ?? [])];
    const i = blocks.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return e.clientY < r.bottom && (e.clientX < r.left + r.width / 2 || e.clientY < r.top);
    });
    return i < 0 ? blocks.length : i;
  }

  over = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("application/x-effect")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    this.dropAt = this.index(e);
  };

  leave = (e: DragEvent) => {
    if (!this.row?.contains(e.relatedTarget as Node)) this.dropAt = null;
  };

  drop = (e: DragEvent) => {
    const pg = this.playground();
    const order = effectOrder(pg.values);
    const fx = e.dataTransfer?.getData("application/x-effect") as Effect | undefined;
    this.dropAt = null;
    if (!fx || !order.includes(fx)) return;
    e.preventDefault();
    const at = this.index(e);
    // Taken out first, so a later drop point is one place earlier.
    pg.moveEffect(fx, at > order.indexOf(fx) ? at - 1 : at);
  };
}
