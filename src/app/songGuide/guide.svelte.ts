// A course's lesson being followed ("Make a song", "Live looping"): which lesson, which step, and which lessons
// are done (kept across reloads, with a final project's ticks and its song).
//
// The playground owns the song: it opens a lesson's practice song and gives this a picture of the app
// (`GuideState`) whenever anything in it changes. A step is done once its check holds (for HOLD_MS with
// `hold`): it stays on screen, ticked, for LINGER_MS so you can listen, then the next one comes (or sooner
// with Next). A milestone lesson ticks each step whenever it holds, in any order.

import { HOLD_MS, LINGER_MS } from "../../recipes/recipe";
import type { GuideCourse, GuideState, GuideStep, SongLesson } from "../../course/song/guide";

interface Saved {
  done: string[];
  /** The final project's song and its ticked milestones. */
  project: { song: string; ticks: string[] } | null;
}

function load(course: GuideCourse): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(course.storageKey) ?? "null");
    const done = Array.isArray(s?.done) ? s.done.filter((id: unknown) => typeof id === "string" && course.lessons.some((l) => l.id === id)) : [];
    const p = s?.project;
    const project = p && typeof p.song === "string" && Array.isArray(p.ticks) ? { song: p.song, ticks: p.ticks.filter((t: unknown) => typeof t === "string") } : null;
    return { done, project };
  } catch {
    return { done: [], project: null };
  }
}

export class SongGuide {
  /** The lesson open (an index into the course's lessons), or null. */
  index = $state<number | null>(null);
  step = $state(0);
  /** The current step is done, and the next one comes after a pause to listen. */
  complete = $state(false);
  /** Every step is done. */
  finished = $state(false);
  /** A milestone lesson's ticked steps. */
  ticks = $state<string[]>([]);
  /** Lessons whose steps were all done. */
  done = $state<string[]>([]);
  /** The final project's song (the lesson opens it again). */
  project = $state<{ song: string; ticks: string[] } | null>(null);
  /** The lesson list over the steps. */
  listOpen = $state(false);
  /** On a phone: the panel folded to its current step. */
  folded = $state(false);

  /** The app when the step began (a milestone lesson: when it opened). */
  private base: GuideState | null = null;
  private holdTimer = 0;
  private lingerTimer = 0;

  constructor(
    readonly course: GuideCourse,
    /** The app now (read reactively by the caller's effect). */
    private now: () => GuideState,
    /** Whether a MiniLab is connected: steps that need one are skipped without it. */
    private hasDevice: () => boolean,
  ) {
    const saved = load(course);
    this.done = saved.done;
    this.project = saved.project;
  }

  get lesson(): SongLesson | null {
    return this.index === null ? null : this.lessons[this.index];
  }

  get current(): GuideStep | null {
    return this.lesson && !this.finished ? (this.lesson.steps[this.step] ?? null) : null;
  }

  get lessons() {
    return this.course.lessons;
  }

  isDone(id: string) {
    return this.done.includes(id);
  }

  /** The first lesson not done yet (-1: all are). */
  get nextUndone() {
    return this.lessons.findIndex((l) => !this.done.includes(l.id));
  }

  /** Whether a step can't be done here (it needs a MiniLab, and none is connected). */
  skipped(s: GuideStep) {
    return !!s.miniLab && !this.hasDevice();
  }

  /** Start a lesson (its song is open already), from its first step. */
  start(i: number) {
    this.stopTimers();
    this.index = i;
    this.listOpen = false;
    this.folded = false;
    this.base = $state.snapshot(this.now()) as GuideState;
    const lesson = this.lessons[i];
    this.ticks = lesson.milestones ? [...(this.project?.ticks ?? [])] : [];
    this.go(0);
  }

  close() {
    this.stopTimers();
    this.index = null;
    this.base = null;
  }

  /**
   * Which steps hold now, from a picture of the app. Called inside the caller's effect, so the checks' reads
   * are what makes it run again.
   */
  evaluate(s: GuideState): boolean[] {
    const lesson = this.lesson;
    const base = this.base;
    if (!lesson || !base) return [];
    if (lesson.milestones) return lesson.steps.map((step) => step.done(s, base));
    const step = this.current;
    return step ? [step.done(s, base)] : [];
  }

  /** What evaluate found: tick what holds (after its hold time). */
  apply(holds: boolean[]) {
    const lesson = this.lesson;
    if (!lesson) return;
    if (lesson.milestones) {
      const add = lesson.steps.filter((step, i) => holds[i] && !this.ticks.includes(step.id)).map((step) => step.id);
      if (!add.length) return;
      this.ticks = [...this.ticks, ...add];
      if (this.project) this.project = { ...this.project, ticks: this.ticks };
      if (this.ticks.length >= lesson.steps.length) this.finish();
      this.save();
      return;
    }
    const step = this.current;
    if (!step || this.complete) return;
    if (!holds[0]) {
      clearTimeout(this.holdTimer);
      this.holdTimer = 0;
      return;
    }
    if (!step.hold) return this.pass();
    if (this.holdTimer) return;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = 0;
      // Still true after the wait: a slider dragged through the range and out again doesn't count.
      if (this.current === step && this.base && step.done(this.now(), this.base)) this.pass();
    }, HOLD_MS);
  }

  /** Skip this step, or go on straight away after one that is done. */
  next() {
    if (!this.lesson || this.finished) return;
    this.go(this.step + 1);
  }

  back() {
    if (!this.lesson) return;
    if (this.finished) return this.go(this.lesson.steps.length - 1);
    // Back over steps that are skipped here.
    let i = this.step - 1;
    while (i > 0 && this.skipped(this.lesson.steps[i])) i--;
    if (i >= 0) this.go(i);
  }

  /** The final project's song: the lesson opens it again next time. */
  setProject(song: string) {
    this.project = { song, ticks: this.project?.song === song ? this.project.ticks : [] };
    this.ticks = this.project.ticks;
    this.save();
  }

  /** Forget the done lessons and the final project's ticks (its song stays among yours). */
  reset() {
    this.done = [];
    this.project = null;
    this.ticks = [];
    this.save();
  }

  private pass() {
    this.complete = true;
    this.lingerTimer = window.setTimeout(() => this.go(this.step + 1), LINGER_MS);
  }

  /** Go to a step (past the last one: the lesson is done). The new step's checks start from the app as it is now. */
  private go(i: number) {
    const lesson = this.lesson;
    if (!lesson) return;
    this.stopTimers();
    this.complete = false;
    // Steps that need a MiniLab are passed over without one.
    while (i < lesson.steps.length && this.skipped(lesson.steps[i])) i++;
    if (!lesson.milestones) this.base = $state.snapshot(this.now()) as GuideState;
    if (i >= lesson.steps.length) return this.finish();
    this.finished = false;
    this.step = i;
  }

  private finish() {
    const lesson = this.lesson!;
    this.finished = true;
    this.step = lesson.steps.length - 1;
    if (!this.done.includes(lesson.id)) this.done = [...this.done, lesson.id];
    this.save();
  }

  private stopTimers() {
    clearTimeout(this.holdTimer);
    clearTimeout(this.lingerTimer);
    this.holdTimer = 0;
  }

  private save() {
    try {
      localStorage.setItem(this.course.storageKey, JSON.stringify({ done: this.done, project: this.project } satisfies Saved));
    } catch {
      // Not kept (private window): the progress lasts until the page closes.
    }
  }
}
