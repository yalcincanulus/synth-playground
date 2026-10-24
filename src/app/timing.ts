// Timing measurements for the About page: how long MIDI input waits before the page handles it,
// and how long the page froze at its worst. Together with the audio output delay they say how far
// apart a key press and its sound are.

/** The last `size` values of a measurement. */
export class Rolling {
  private values: number[] = [];

  constructor(private size = 50) {}

  add(v: number) {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }

  get count() {
    return this.values.length;
  }

  get average(): number | null {
    return this.values.length ? this.values.reduce((a, b) => a + b, 0) / this.values.length : null;
  }

  get max(): number | null {
    return this.values.length ? Math.max(...this.values) : null;
  }
}

/** Times (performance.now()) and lengths of page freezes over 50 ms, kept for `windowMs`. */
export class Freezes {
  private tasks: [number, number][] = [];

  constructor(private windowMs = 60_000) {}

  add(at: number, durationMs: number) {
    this.tasks.push([at, durationMs]);
  }

  /** The longest freeze within the window before `now`, in ms (0 when none). */
  longest(now: number): number {
    this.tasks = this.tasks.filter(([at]) => at > now - this.windowMs);
    return this.tasks.reduce((m, [, d]) => Math.max(m, d), 0);
  }

  /** Watch the page's long tasks (Chromium only; elsewhere nothing is recorded). */
  observe() {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => this.add(e.startTime, e.duration))).observe({ type: "longtask" });
    } catch {
      // Long task timing isn't supported here.
    }
  }
}
