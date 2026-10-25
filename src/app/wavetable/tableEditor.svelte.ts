// The state of the "Draw a table" editor: the keyframes being drawn and how they blend. The playground
// owns the table list and the engine; it hears about every edit through `onChange` and updates the
// draft table the synth is playing (see Playground.openTableEditor).

import {
  blendKeyframes,
  drawLine,
  harmonicAmps,
  HARMONIC_SLIDERS,
  MAX_KEYS,
  MIN_KEYS,
  shapeWave,
  smooth,
  waveFromAmps,
  type BlendMode,
  type ShapeName,
} from "../../audio/tableDraw";
import { FRAME_SIZE, frameAt, type WavetableDef } from "../../audio/wavetables";

export class TableEditor {
  keys = $state.raw<Float32Array[]>([]);
  selected = $state(0);
  blend = $state<BlendMode>("harmonics");
  name = $state("");
  /** Bumped on every edit, so the drawings repaint (the keyframes are changed in place). */
  version = $state(0);
  /** Bumped each time the draft table has been rebuilt from the keyframes. */
  built = $state(0);
  /** Harmonic strengths while the bars are being dragged, so the drag starts from the wave as it was. */
  private dragAmps: number[] | null = null;

  constructor(
    /** The saved drawing being edited again, or null for a new one. */
    readonly original: WavetableDef | null,
    /** The table the synth plays while drawing: added at the end of the list, removed on save or cancel. */
    readonly draft: WavetableDef,
    /** The table that was playing before, to go back to on cancel, and to copy keyframes from. */
    readonly previous: WavetableDef,
    keys: Float32Array[],
    blend: BlendMode,
    /** Called after every edit; `fromKnob` when a MiniLab knob made it (the knob is already in place). */
    private onChange: (fromKnob: boolean) => void,
  ) {
    this.keys = keys;
    this.blend = blend;
  }

  get key(): Float32Array {
    return this.keys[this.selected];
  }

  /** Where keyframe i sits in the table, 0..1. */
  position(i: number) {
    return i / (this.keys.length - 1);
  }

  frames(): Float32Array[] {
    return blendKeyframes(this.keys, this.blend);
  }

  private edited(fromKnob = false) {
    this.version++;
    this.onChange(fromKnob);
  }

  select(i: number) {
    this.selected = Math.max(0, Math.min(this.keys.length - 1, i));
    this.version++;
    this.onChange(false);
  }

  /** A copy of the selected keyframe, right after it. */
  addKey() {
    if (this.keys.length >= MAX_KEYS) return;
    const keys = [...this.keys];
    keys.splice(this.selected + 1, 0, Float32Array.from(this.key));
    this.keys = keys;
    this.selected++;
    this.edited();
  }

  removeKey(i: number) {
    if (this.keys.length <= MIN_KEYS) return;
    this.keys = this.keys.filter((_, k) => k !== i);
    this.selected = Math.min(this.selected, this.keys.length - 1);
    this.edited();
  }

  setBlend(mode: BlendMode) {
    this.blend = mode;
    this.edited();
  }

  /** A line drawn with the mouse, from (p0, v0) to (p1, v1): place in the cycle 0..1, level -1..1. */
  draw(p0: number, v0: number, p1: number, v1: number) {
    drawLine(this.key, p0, v0, p1, v1);
    this.edited();
  }

  setShape(shape: ShapeName | "flat") {
    this.key.set(shape === "flat" ? new Float32Array(FRAME_SIZE) : shapeWave(shape));
    this.edited();
  }

  /** The wave the previous table plays at this keyframe's place in the table. */
  copyPrevious(frames: Float32Array[]) {
    const pos = this.position(this.selected);
    this.key.set(shapeWave((p) => frameAt(frames, pos, p)));
    this.edited();
  }

  smooth() {
    this.key.set(smooth(this.key));
    this.edited();
  }

  /** Upside down. */
  flip() {
    for (let i = 0; i < FRAME_SIZE; i++) this.key[i] = -this.key[i];
    this.edited();
  }

  amps(): number[] {
    return this.dragAmps ?? harmonicAmps(this.key, HARMONIC_SLIDERS);
  }

  beginBars() {
    this.dragAmps = harmonicAmps(this.key, HARMONIC_SLIDERS);
  }

  /** Bars from..to (dragged across) to strengths going from a0 to a1. Rebuilds the keyframe from sine waves. */
  setBars(from: number, a0: number, to: number, a1: number) {
    const amps = this.dragAmps ?? harmonicAmps(this.key, HARMONIC_SLIDERS);
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (let b = Math.max(0, lo); b <= Math.min(HARMONIC_SLIDERS - 1, hi); b++) {
      const t = hi === lo ? 1 : (b - from) / (to - from);
      amps[b] = Math.max(0, Math.min(1, a0 + (a1 - a0) * t));
    }
    this.key.set(waveFromAmps(amps));
    this.edited();
  }

  endBars() {
    this.dragAmps = null;
  }

  /** A MiniLab knob: harmonic h (0-based) of the selected keyframe to strength 0..1. */
  setHarmonic(h: number, amount: number) {
    const amps = harmonicAmps(this.key, HARMONIC_SLIDERS);
    amps[h] = amount;
    this.key.set(waveFromAmps(amps));
    this.edited(true);
  }
}
