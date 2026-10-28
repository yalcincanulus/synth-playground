// The arrangement: clips put on the song's timeline, in bars. A placement plays its clip from its first bar,
// over and over for as many bars as it lasts, so a 1-bar clip placed for 4 bars plays 4 times. Placements of
// one clip share it (change the clip once, every placement changes), and each can transpose it. Plain code,
// so it is tested without a browser.

import { BEATS_PER_BAR, type Clip } from "./clips";

export interface Placement {
  /** Stays the same for good ("place-3"). */
  id: string;
  /** The clip it plays (its track is the clip's). */
  clip: string;
  /** The bar it starts on, from 0. */
  bar: number;
  /** How many bars it lasts: the clip repeats to fill them (the last time round can be cut short). */
  bars: number;
  /** Semitones the clip's notes move by (drum clips ignore it). */
  transpose: number;
}

/** A stretch of the song in bars, [start, end). */
export interface BarRange {
  start: number;
  end: number;
}

/** The longest song: 256 bars (8.5 minutes at 120 BPM). */
export const MAX_SONG_BARS = 256;
export const MAX_TRANSPOSE = 24;

export const placementEnd = (p: Placement) => p.bar + p.bars;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : fallback);

export function newPlacementId(placements: readonly Placement[]): string {
  let n = 1;
  while (placements.some((p) => p.id === `place-${n}`)) n++;
  return `place-${n}`;
}

/** A placement kept inside the song: from bar 0, at least a bar long, ending by MAX_SONG_BARS. */
export function clampPlacement(p: Placement): Placement {
  const bar = clampInt(p.bar, 0, MAX_SONG_BARS - 1, 0);
  return { ...p, bar, bars: clampInt(p.bars, 1, MAX_SONG_BARS - bar, 1), transpose: clampInt(p.transpose, -MAX_TRANSPOSE, MAX_TRANSPOSE, 0) };
}

/**
 * Put `p` in (new, or changed: one with its id is replaced), making room for it on its track: a placement
 * there that starts before it is cut short where it starts, and one that starts inside it is removed. The
 * others are kept. `trackOf` gives a clip's track. In order of bar.
 */
export function fitPlacement(placements: readonly Placement[], placed: Placement, trackOf: (clip: string) => string | undefined): Placement[] {
  const p = clampPlacement(placed);
  const track = trackOf(p.clip);
  const out: Placement[] = [];
  for (const q of placements) {
    if (q.id === p.id) continue;
    if (trackOf(q.clip) !== track || placementEnd(q) <= p.bar || q.bar >= placementEnd(p)) out.push(q);
    else if (q.bar < p.bar) out.push({ ...q, bars: p.bar - q.bar });
  }
  out.push(p);
  return sortPlacements(out);
}

export const sortPlacements = (ps: Placement[]) => ps.sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));

/** The placement on a track at a bar, if any. */
export function placementAt(placements: readonly Placement[], track: string, bar: number, trackOf: (clip: string) => string | undefined): Placement | undefined {
  return placements.find((p) => trackOf(p.clip) === track && p.bar <= bar && bar < placementEnd(p));
}

/** The first free bar on a track at or after `from` with room for `bars` bars (where a copy can go). */
export function freeBar(placements: readonly Placement[], track: string, from: number, bars: number, trackOf: (clip: string) => string | undefined): number {
  const mine = placements.filter((p) => trackOf(p.clip) === track).sort((a, b) => a.bar - b.bar);
  let bar = from;
  for (const p of mine) if (p.bar < bar + bars && placementEnd(p) > bar) bar = placementEnd(p);
  return bar;
}

/** The bar after the last placement (0 for an empty song). */
export const songEnd = (placements: readonly Placement[]) => placements.reduce((m, p) => Math.max(m, placementEnd(p)), 0);

/** How many placements play each clip. */
export function uses(placements: readonly Placement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of placements) m.set(p.clip, (m.get(p.clip) ?? 0) + 1);
  return m;
}

/** Placements from storage, checked: ones whose clip is gone are dropped, overlaps on a track resolved (the later one in the list wins). */
export function readPlacements(raw: unknown, clips: readonly Clip[]): Placement[] {
  if (!Array.isArray(raw)) return [];
  const trackOf = (id: string) => clips.find((c) => c.id === id)?.track;
  let out: Placement[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.clip !== "string" || !trackOf(r.clip) || out.some((p) => p.id === r.id)) continue;
    out = fitPlacement(out, { id: r.id, clip: r.clip, bar: r.bar as number, bars: r.bars as number, transpose: r.transpose as number }, trackOf);
  }
  return out;
}

/** A loop region from storage (null when unreadable or empty). */
export function readRange(raw: unknown): BarRange | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const start = clampInt(r.start, 0, MAX_SONG_BARS - 1, -1);
  const end = clampInt(r.end, 1, MAX_SONG_BARS, -1);
  return start >= 0 && end > start ? { start, end } : null;
}

const EPS = 1e-9;

/**
 * The song's position as the transport plays: transport beats (since Play) to song beats, from the start bar,
 * jumping back to the loop region's start each time its end comes. The jumps are planned as the clip player
 * plans the music (a little ahead), and kept so a beat heard a moment later still finds its place.
 */
export class SongClock {
  /** From each transport beat on, song beat = transport beat + offset. */
  private jumps: { at: number; offset: number }[] = [{ at: -Infinity, offset: 0 }];
  /** The loop region in beats, while looping. */
  loop: { start: number; end: number } | null = null;

  /** Play from a song beat. */
  reset(from: number) {
    this.jumps = [{ at: -Infinity, offset: from }];
  }

  /** The song beat at a transport beat. */
  songAt(beat: number): number {
    let off = this.jumps[0].offset;
    for (const j of this.jumps) if (j.at <= beat + EPS) off = j.offset;
    return beat + off;
  }

  /** The loop's next jump at or after a transport beat (Infinity: none coming). */
  nextJump(beat: number): number {
    for (const j of this.jumps) if (j.at > beat + EPS) return j.at;
    const L = this.loop;
    if (!L || L.end - L.start < 1) return Infinity;
    const s = this.songAt(beat);
    // Played past the loop's end (started after it, or the loop was drawn behind the playhead): no jump.
    return s < L.end - EPS ? beat + (L.end - s) : Infinity;
  }

  /** Plan [from, to): a jump that falls in it (or at its end) is kept. */
  plan(from: number, to: number) {
    const L = this.loop;
    if (!L) return;
    const at = this.nextJump(from);
    if (at > to + EPS || this.jumps.some((j) => Math.abs(j.at - at) < EPS)) return;
    this.jumps.push({ at, offset: L.start - at });
    // Only the last few matter (the heard beat is at most a slice or two behind).
    if (this.jumps.length > 6) this.jumps.splice(1, this.jumps.length - 6);
  }
}

/** Beats in a bar range. */
export const rangeBeats = (r: BarRange) => ({ start: r.start * BEATS_PER_BAR, end: r.end * BEATS_PER_BAR });
