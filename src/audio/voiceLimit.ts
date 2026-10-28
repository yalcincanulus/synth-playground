// Which notes to cut when there are too many, and how many fit in the CPU time available.
// Plain code, so it is tested without a browser; the engine (engine.ts) uses it.

/** How much work a voice is, relative to others: its oscillator copies, plus the filter and the rest. */
export const voiceWeight = (unison: number) => 1 + Math.max(1, Math.min(3, Math.round(unison)));

export interface LimitedVoice {
  /** The part playing it (see NoteOwner). */
  owner: string;
  releasedAt: number | null;
  startedAt: number;
}

/**
 * The voice to cut to make room: released voices first (the quietest, as `level` says), then the ones
 * played for you (the step sequencer's, a song's), then your own (`player`'s: the part your keys play);
 * the oldest first among held voices. So held chords survive longest.
 */
export function pickVictim<V extends LimitedVoice>(voices: readonly V[], level: (v: V) => number, player = "keys"): V | undefined {
  const released = voices.filter((v) => v.releasedAt !== null);
  if (released.length) return released.reduce((a, b) => (level(b) < level(a) ? b : a));
  const oldest = (vs: V[]) => vs.reduce<V | undefined>((a, b) => (!a || b.startedAt < a.startedAt ? b : a), undefined);
  return oldest(voices.filter((v) => v.owner !== player)) ?? oldest([...voices]);
}

/**
 * Learns how much CPU time one unit of voice weight costs from the meter, and from that how much
 * weight fits under `target` (a share of the time available). Notes beyond that are cut before they
 * can make the sound crackle.
 *
 * The meter covers our own audio code: the voice processors, and the effects written in our code (whose
 * time is kept out of the voices' cost, and off their budget). The browser's own effect nodes run on the
 * same thread too, so the target leaves room for them.
 */
export class CpuGuard {
  /** Load per unit of voice weight, smoothed; null until measured. */
  private perUnit: number | null = null;
  /** The load of our own effects, which is there whatever the notes do. */
  private fx = 0;

  constructor(
    readonly target = 0.6,
    /** Above this measured load, a voice is cut right away. */
    readonly high = 0.8,
  ) {}

  /** A meter report: the voices' load over a time in which `units` of voice weight sounded on average, and the effects' load. */
  report(load: number, units: number, fx = 0) {
    this.fx = fx;
    if (units < 1 || !(load > 0)) return;
    const k = load / units;
    // Rise quickly (a heavier preset), fall slowly (one quiet report shouldn't let too many notes in).
    if (this.perUnit === null) this.perUnit = k;
    else this.perUnit = k > this.perUnit ? this.perUnit * 0.5 + k * 0.5 : this.perUnit * 0.8 + k * 0.2;
  }

  /** How much voice weight fits under the target (unlimited until measured). */
  get budget(): number {
    return this.perUnit ? Math.max(0, this.target - this.fx) / this.perUnit : Infinity;
  }

  overloaded(load: number) {
    return load > this.high;
  }
}
