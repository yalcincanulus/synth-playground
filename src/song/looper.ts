// The looper: a song built up live, a layer at a time, like a loop station. Each track is a pad: tap it to
// select it, again to get it ready, then the first note you play starts recording; a tap ends the take and
// the loop plays. The first loop's length (rounded to 1, 2, 4 or 8 bars) sets the grid every later loop keeps
// to, so they all fit. What the launcher played can be written onto the timeline afterwards (capture).
// Plain code, so it is tested without a browser.

import { BEATS_PER_BAR } from "./clips";
import { EARLY_BEATS } from "./recorder";

/** The lengths a first loop is rounded to, in bars. */
export const LOOP_LENGTHS = [1, 2, 4, 8];

/** The loops' grid: time rounds of `bars` bars, one of which starts on beat `origin` (since Play). */
export interface LoopGrid {
  bars: number;
  origin: number;
}

/** A tap this soon after a time round's end (in beats) ends a layer's take there and then, not a whole round later. */
export const TAP_GRACE_BEATS = 1;

const EPS = 1e-9;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The start of the time round (of `period` beats, from `origin`) a beat is in; a beat just before a round's start (an early downbeat) counts as in it. */
export function roundStart(beat: number, origin: number, period: number): number {
  return origin + Math.floor((beat - origin + EARLY_BEATS) / period + EPS) * period;
}

/** The first time round start at or after a beat. */
export function nextRound(beat: number, origin: number, period: number): number {
  return origin + Math.ceil((beat - origin) / period - EPS) * period;
}

/** A first take `beats` long becomes a loop of this many bars: the nearest bar line, then up to 1, 2, 4 or 8 (at most `max`). */
export function loopBarsFor(beats: number, max = 8): number {
  const bars = Math.max(1, Math.round(beats / BEATS_PER_BAR));
  return Math.min(max, LOOP_LENGTHS.find((n) => n >= bars) ?? LOOP_LENGTHS[LOOP_LENGTHS.length - 1]);
}

/**
 * Where a later take (a layer or an overdub, its loop's length already known) ends after a tap at `beat`: at the
 * end of the time round it is in, so an early tap doesn't cut the phrase short; but a tap just after a round
 * began (a late tap for the round before) ends it at once.
 */
export function layerEnd(beat: number, start: number, period: number): number {
  const into = mod(beat - start, period);
  return into < TAP_GRACE_BEATS ? beat : beat + period - into;
}

/** A track as its pad shows it. */
export type PadState = "off" | "selected" | "ready" | "recording" | "playing" | "stopped";

export function padState(s: { selected: boolean; ready: boolean; recording: boolean; chosen: boolean; hasLoop: boolean }): PadState {
  if (s.recording) return "recording";
  if (s.ready) return "ready";
  if (s.chosen) return "playing";
  if (s.hasLoop) return "stopped";
  return s.selected ? "selected" : "off";
}

/** The clip a track plays from some beat on (null: the arrangement), with the beat its time rounds count from. */
export interface LaunchEntry {
  track: string;
  clip: string | null;
  /** Transport beat it starts at. */
  at: number;
  /** Transport beat its first time round started on (before `at` when it started partway through one). */
  start: number;
}

/**
 * A performance on the timeline: each stretch a track played a launched clip becomes a placement, from bar
 * `fromBar` on as the transport ran (beat 0 is `fromBar`), up to `endBeat`. Stretches of the arrangement are
 * left out (what was there stays). In order of the log.
 */
export function captureRuns(log: readonly LaunchEntry[], endBeat: number, fromBar: number): { clip: string; bar: number; bars: number }[] {
  const out: { clip: string; bar: number; bars: number }[] = [];
  const tracks = [...new Set(log.map((e) => e.track))];
  for (const track of tracks) {
    const mine = log.filter((e) => e.track === track);
    mine.forEach((e, i) => {
      const end = Math.min(endBeat, mine[i + 1]?.at ?? Infinity);
      if (e.clip === null || end <= e.at + EPS) return;
      const first = Math.floor(e.start / BEATS_PER_BAR + EPS);
      const bars = Math.ceil(end / BEATS_PER_BAR - EPS) - first;
      if (bars > 0) out.push({ clip: e.clip, bar: fromBar + first, bars });
    });
  }
  return out;
}

