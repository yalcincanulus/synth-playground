// A recipe being followed: which step you are on, and when its check passes. The playground tells it
// about every settings change and every note played. Once a step's checks have held for HOLD_MS it is
// done: it stays on screen, ticked, for LINGER_MS so you can listen, then the next step comes (or sooner
// with Next). `onStep` lets the playground point the MiniLab knobs at the next step's control.
// A course page's "try this" steps run on it too (anything with a list of steps).

import { SvelteSet } from "svelte/reactivity";
import type { ParamValues } from "../../audio/params";
import { HIGH_NOTE, HOLD_MS, isPlay, LINGER_MS, LOW_NOTE, settingHolds, type PlayCheck, type Recipe, type RecipeStep } from "../../recipes/recipe";

export class RecipeRun<R extends { steps: RecipeStep[] } = Recipe> {
  index = $state(0);
  done = $state(false);
  hint = $state(false);
  /** The current step is done, and the next one comes after a pause to listen. */
  complete = $state(false);
  /** What was played during this step (reactive, so the ticks next to play checks show). */
  private played = new SvelteSet<PlayCheck["play"]>();
  private holdTimer = 0;
  private lingerTimer = 0;

  constructor(
    readonly recipe: R,
    /** The settings being built (the Keys part's). */
    private values: () => ParamValues,
    private onStep: () => void,
  ) {}

  get step(): RecipeStep | null {
    return this.done ? null : this.recipe.steps[this.index];
  }

  get total() {
    return this.recipe.steps.length;
  }

  /** Whether one of the current step's checks holds right now (for ticks next to each). */
  holds(i: number): boolean {
    const c = this.step?.checks[i];
    if (!c) return false;
    return isPlay(c) ? this.played.has(c.play) : settingHolds(c, this.values());
  }

  /** The settings changed. */
  changed() {
    this.evaluate();
  }

  /** A key went down; `held` is how many notes sound now. */
  notePlayed(note: number, held: number) {
    this.played.add("note");
    if (note < LOW_NOTE) this.played.add("low");
    if (note >= HIGH_NOTE) this.played.add("high");
    if (held >= 3) this.played.add("chord");
    this.evaluate();
  }

  /** Skip this step, or go on straight away after one that is done. */
  next() {
    if (this.done) return;
    const wasComplete = this.complete;
    this.go(this.index + 1);
    if (wasComplete) this.evaluate();
  }

  back() {
    if (this.done) return this.go(this.total - 1);
    if (this.index > 0) this.go(this.index - 1);
  }

  /** Start again from step 1 (the sound itself is reset by the playground). */
  restart() {
    this.go(0);
  }

  stop() {
    clearTimeout(this.holdTimer);
    clearTimeout(this.lingerTimer);
  }

  private evaluate() {
    const step = this.step;
    if (!step || this.complete) return;
    const all = step.checks.every((_, i) => this.holds(i));
    if (!all) {
      clearTimeout(this.holdTimer);
      this.holdTimer = 0;
      return;
    }
    if (this.holdTimer) return;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = 0;
      // Still true after the wait: a knob swept through the range and out again doesn't count.
      if (this.step === step && step.checks.every((_, i) => this.holds(i))) this.pass();
    }, HOLD_MS);
  }

  private pass() {
    this.complete = true;
    this.lingerTimer = window.setTimeout(() => {
      this.go(this.index + 1);
      // The next step may be done already (you went ahead): check it straight away.
      this.evaluate();
    }, LINGER_MS);
  }

  /** Go to a step (past the last one: done). Going back never passes a step by itself: it waits for a change. */
  private go(index: number) {
    clearTimeout(this.holdTimer);
    clearTimeout(this.lingerTimer);
    this.holdTimer = 0;
    this.complete = false;
    this.played.clear();
    this.hint = false;
    this.done = index >= this.total;
    this.index = Math.min(index, this.total - 1);
    this.onStep();
  }
}
