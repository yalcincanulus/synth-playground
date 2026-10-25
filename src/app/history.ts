import { formatValue, MOD_SLOTS, MOD_SOURCES, PARAMS, slotIds, type ParamId, type ParamValues } from "../audio/params";

/** Changes to the same control closer together than this are one step (turning one knob a long way). */
export const MERGE_MS = 800;
/** Oldest steps are forgotten past this many. */
export const MAX_STEPS = 200;

interface Step<T> {
  state: T;
  label: string;
}

/**
 * Undo and redo, by snapshots: before a change, `record` keeps the state as it was. Calls with the same
 * `key` (a control's id) close together in time join the step already open, so a knob turned a long way
 * is undone in one go.
 */
export class History<T> {
  private undos: Step<T>[] = [];
  private redos: Step<T>[] = [];
  private open: { key: string; at: number } | null = null;

  /** Call before changing the state. `before` is the state as it is now. */
  record(before: () => T, label: string, key: string | null = null, now = performance.now()) {
    if (key !== null && this.open?.key === key && now - this.open.at < MERGE_MS) {
      this.open.at = now;
      return;
    }
    this.undos.push({ state: before(), label });
    if (this.undos.length > MAX_STEPS) this.undos.shift();
    this.redos = [];
    this.open = key === null ? null : { key, at: now };
  }

  /** Step back: returns the state to restore and what is being undone, or null at the start. */
  undo(current: T): Step<T> | null {
    const step = this.undos.pop();
    if (!step) return null;
    this.redos.push({ state: current, label: step.label });
    this.open = null;
    return step;
  }

  redo(current: T): Step<T> | null {
    const step = this.redos.pop();
    if (!step) return null;
    this.undos.push({ state: current, label: step.label });
    this.open = null;
    return step;
  }

  /** The next change starts a new step, even on the same control. */
  close() {
    this.open = null;
  }

  clear() {
    this.undos = [];
    this.redos = [];
    this.open = null;
  }

  get canUndo() {
    return this.undos.length > 0;
  }
  get canRedo() {
    return this.redos.length > 0;
  }
  /** What undo and redo would take back or bring back. */
  get undoLabel() {
    return this.undos.at(-1)?.label ?? null;
  }
  get redoLabel() {
    return this.redos.at(-1)?.label ?? null;
  }
}

export interface Change {
  id: ParamId;
  label: string;
  from: string;
  to: string;
}

/**
 * What differs between the saved sound and the current one, in words ("Cutoff: 1.80 kHz → 400 Hz").
 * Values that read the same are left out, and so are the settings of empty mod matrix routes.
 */
export function diffValues(saved: ParamValues, current: ParamValues): Change[] {
  const unused = new Set<ParamId>();
  for (let n = 1; n <= MOD_SLOTS; n++) {
    const ids = slotIds(n);
    if (MOD_SOURCES[saved[ids.src]] === "off" && MOD_SOURCES[current[ids.src]] === "off") {
      unused.add(ids.dst);
      unused.add(ids.amt);
    }
  }
  const out: Change[] = [];
  for (const id of Object.keys(PARAMS) as ParamId[]) {
    if (unused.has(id)) continue;
    const from = formatValue(id, saved[id]);
    const to = formatValue(id, current[id]);
    if (from !== to) out.push({ id, label: PARAMS[id].label, from, to });
  }
  return out;
}
