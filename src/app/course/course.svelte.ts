// The course being followed: which page is open, its "try this" steps (a RecipeRun), the A/B side
// heard, and which pages are done. The page and the done pages are kept across reloads.
//
// The playground owns the sound: it gives each page its starting settings when the page opens, and
// tells this about every settings change and every note played.

import { fromControl, toControl, type ParamId, type ParamValues } from "../../audio/params";
import { PAGES } from "../../course/course";
import { controlsOf, lessonValues, type Lesson } from "../../course/lesson";
import { RecipeRun } from "../recipes/recipeRun.svelte";

const COURSE_KEY = "minilab3.course";

interface Saved {
  page: string;
  done: string[];
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(COURSE_KEY) ?? "null");
    const known = (id: unknown) => PAGES.some((p) => p.lesson.id === id);
    return {
      page: known(s?.page) ? s.page : PAGES[0].lesson.id,
      done: Array.isArray(s?.done) ? s.done.filter(known) : [],
    };
  } catch {
    return { page: PAGES[0].lesson.id, done: [] };
  }
}

export class Course {
  index = $state(0);
  /** Pages whose "try this" steps were all done. */
  done = $state<string[]>([]);
  /** The current page's steps. */
  run = $state.raw<RecipeRun<Lesson> | null>(null);
  /** A/B pages: the side last picked (null until one is). */
  side = $state<"a" | "b" | null>(null);
  /** The last note played on this page (for the pitch picture). */
  lastNote = $state<number | null>(null);
  /** The overview over the page: the contents (every chapter, its pages and recipes) or the glossary. */
  panel = $state<"contents" | "glossary" | null>(null);

  constructor(
    /** The settings being taught (the Keys part's). */
    private values: () => ParamValues,
    /** Change one setting, as a knob would. */
    private set: (id: ParamId, value: number) => void,
    /** A page opened with these settings, or its step changed. */
    private onPage: (values: ParamValues | null) => void,
  ) {
    const saved = load();
    this.index = Math.max(0, PAGES.findIndex((p) => p.lesson.id === saved.page));
    this.done = saved.done;
  }

  get lesson(): Lesson {
    return PAGES[this.index].lesson;
  }

  get chapter() {
    return PAGES[this.index].chapter;
  }

  get total() {
    return PAGES.length;
  }

  isDone(id: string) {
    return this.done.includes(id);
  }

  /** The first page not done yet (-1: all are). */
  get nextUndone() {
    return PAGES.findIndex((p) => !this.done.includes(p.lesson.id));
  }

  /** Open the current page, from its starting sound. */
  open() {
    this.run?.stop();
    this.side = null;
    this.lastNote = null;
    this.panel = null;
    this.run = new RecipeRun(this.lesson, this.values, () => this.stepChanged());
    this.save();
    this.onPage(lessonValues(this.lesson));
  }

  /** Go to page i. Returns false when there is no such page. */
  goTo(i: number): boolean {
    if (i < 0 || i >= PAGES.length || i === this.index) return false;
    this.index = i;
    this.open();
    return true;
  }

  /** Open page i from the overview (closing it, even if page i is the open one). */
  show(i: number) {
    this.panel = null;
    this.goTo(i);
  }

  /** Leaving the course: the timers stop, the page is remembered. */
  close() {
    this.run?.stop();
    this.run = null;
  }

  changed() {
    this.run?.changed();
  }

  notePlayed(note: number, held: number) {
    this.lastNote = note;
    this.run?.notePlayed(note, held);
  }

  /** Whether a control is on this page (on a knob or a fader). */
  allows(id: ParamId) {
    return controlsOf(this.lesson).includes(id);
  }

  /** The page's controls on the MiniLab's 8 knobs. */
  get knobs(): (ParamId | null)[] {
    return Array.from({ length: 8 }, (_, i) => this.lesson.knobs[i] ?? null);
  }

  /** How many choices a control has on this page (fewer than it has elsewhere), or undefined. */
  choicesOf(id: ParamId) {
    return this.lesson.choices?.[id];
  }

  /** A knob position (0..1) to a value: a limited choice control spreads its few choices over the whole turn. */
  fromKnob(id: ParamId, t: number): number {
    const n = this.choicesOf(id);
    return n ? Math.round(Math.max(0, Math.min(1, t)) * (n - 1)) : fromControl(id, t);
  }

  /** Where a knob sits for a value (the reverse of fromKnob). */
  knobPosition(id: ParamId, v: number): number {
    const n = this.choicesOf(id);
    return n ? Math.min(1, v / (n - 1)) : toControl(id, v);
  }

  /** A/B: put one side's settings on the page's controls. */
  pick(side: "a" | "b") {
    const w = this.lesson.widget;
    if (w.kind !== "compare") return;
    this.side = side;
    for (const [id, v] of Object.entries(w[side].values)) this.set(id as ParamId, v!);
  }

  /** The encoder click: switch A/B (A first). */
  click() {
    if (this.lesson.widget.kind === "compare") this.pick(this.side === "a" ? "b" : "a");
  }

  private stepChanged() {
    const run = this.run;
    if (run?.done && !this.done.includes(this.lesson.id)) {
      this.done = [...this.done, this.lesson.id];
      this.save();
    }
    this.onPage(null);
  }

  /** Forget the done pages, and start at page 1 next time. */
  reset() {
    this.done = [];
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(COURSE_KEY, JSON.stringify({ page: this.lesson.id, done: this.done } satisfies Saved));
    } catch {
      // Not kept (private window): the progress lasts until the page closes.
    }
  }
}
