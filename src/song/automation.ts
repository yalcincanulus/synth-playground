// Automation: knob moves kept in a note clip. A lane holds one setting's line over the clip: points (a tick and
// a 0..1 control position, as a knob turns) joined by straight lines, held flat before the first point and after
// the last. The settings are the track's sound settings that turn smoothly, and the track's volume and pan.
// Plain code, so it is tested without a browser.

import { fromControl, PARAMS, toControl, type ParamId } from "../audio/params";
import { VOLUME_MAX, VOLUME_MIN } from "./song";

/** The track's own mixer settings, beside its sound's. */
export const TRACK_TARGETS = ["trackVolume", "trackPan"] as const;
export type TrackTarget = (typeof TRACK_TARGETS)[number];
export type AutoTarget = ParamId | TrackTarget;

export interface AutoPoint {
  /** Ticks from the start of the clip (its end is the last place a point can go). */
  tick: number;
  /** 0..1, the control position (a knob's turn, so a sweep over an exponential setting sounds even). */
  value: number;
}

export interface AutoLane {
  target: AutoTarget;
  /** In order of tick, at most one at a tick. */
  points: AutoPoint[];
}

/**
 * Settings that are not automated: building the reverb is too slow to follow a line. Settings that step
 * (choices, whole numbers) aren't either.
 */
const NOT_AUTOMATED = new Set<ParamId>(["reverbSize", "reverbDamping"]);

export const isTrackTarget = (t: string): t is TrackTarget => (TRACK_TARGETS as readonly string[]).includes(t);

/** Whether a sound setting can have a lane. */
export function automatable(id: ParamId): boolean {
  const def = PARAMS[id];
  return !!def && def.curve !== "int" && !NOT_AUTOMATED.has(id);
}

export const isAutoTarget = (t: unknown): t is AutoTarget => typeof t === "string" && (isTrackTarget(t) || (t in PARAMS && automatable(t as ParamId)));

export function targetLabel(t: AutoTarget): string {
  if (t === "trackVolume") return "Track Volume";
  if (t === "trackPan") return "Track Pan";
  return PARAMS[t].label;
}

/** A track volume's control position as dB: VOLUME_MIN (off) to VOLUME_MAX, evenly. */
export const volumeAt = (v: number) => VOLUME_MIN + Math.max(0, Math.min(1, v)) * (VOLUME_MAX - VOLUME_MIN);
export const volumeControl = (db: number) => Math.max(0, Math.min(1, (db - VOLUME_MIN) / (VOLUME_MAX - VOLUME_MIN)));
/** A track pan's control position, -1 (left) .. 1 (right). */
export const panAt = (v: number) => Math.max(-1, Math.min(1, v * 2 - 1));
export const panControl = (pan: number) => Math.max(0, Math.min(1, (pan + 1) / 2));

/** A sound setting's value at a control position (the track's are converted by the mixer: volumeAt, panAt). */
export const paramAt = (id: ParamId, v: number) => fromControl(id, v);
export const paramControl = (id: ParamId, value: number) => toControl(id, value);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The lane's value at a tick: along the line between the points around it, flat outside them. NaN with no points. */
export function valueAt(points: readonly AutoPoint[], tick: number): number {
  if (!points.length) return NaN;
  if (tick <= points[0].tick) return points[0].value;
  const last = points[points.length - 1];
  if (tick >= last.tick) return last.value;
  let i = 1;
  while (points[i].tick < tick) i++;
  const a = points[i - 1];
  const b = points[i];
  return b.tick === a.tick ? b.value : a.value + ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick);
}

/**
 * Points made to fit a clip `end` ticks long: inside it, whole ticks, values in range, in order. Of points at
 * the same tick, the one that comes last in the list wins (an edit adds its points at the end).
 */
export function cleanPoints(points: readonly AutoPoint[], end: number): AutoPoint[] {
  const out = new Map<number, number>();
  for (const p of points) {
    if (!Number.isFinite(p.tick) || !Number.isFinite(p.value)) continue;
    const tick = Math.round(p.tick);
    if (tick < 0 || tick > end) continue;
    out.delete(tick);
    out.set(tick, clamp01(p.value));
  }
  return [...out].map(([tick, value]) => ({ tick, value })).sort((a, b) => a.tick - b.tick);
}

/** A point added, or the one at its tick moved to its value. */
export const setPoint = (points: readonly AutoPoint[], tick: number, value: number, end: number) => cleanPoints([...points, { tick, value }], end);

/** A point moved, kept between its neighbours. */
export function movePoint(points: readonly AutoPoint[], index: number, tick: number, value: number, end: number): AutoPoint[] {
  const lo = index > 0 ? points[index - 1].tick + 1 : 0;
  const hi = index < points.length - 1 ? points[index + 1].tick - 1 : end;
  const out = points.map((p) => ({ ...p }));
  if (!out[index]) return out;
  out[index] = { tick: Math.max(lo, Math.min(hi, Math.round(tick))), value: clamp01(value) };
  return out;
}

export const deletePoint = (points: readonly AutoPoint[], index: number) => points.filter((_, i) => i !== index);

/** The points between two ticks (both included) replaced by `add`: the pencil, a straight line, a recorded knob. */
export function writeRange(points: readonly AutoPoint[], from: number, to: number, add: readonly AutoPoint[], end: number): AutoPoint[] {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return cleanPoints([...points.filter((p) => p.tick < lo || p.tick > hi), ...add], end);
}

/** A straight line from one point to another, in place of the points between them. */
export const drawLine = (points: readonly AutoPoint[], a: AutoPoint, b: AutoPoint, end: number) => writeRange(points, a.tick, b.tick, [a, b], end);

/**
 * Fewer points for the same line: a point that lies (within `tolerance`) on the straight line between the points
 * kept around it goes. A recorded knob or the pencil leaves many points; this keeps the corners.
 */
export function thin(points: readonly AutoPoint[], tolerance = 0.004): AutoPoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const out: AutoPoint[] = [points[0]];
  /** The last point kept. */
  let a = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const c = points[i + 1];
    // Every point skipped since the last one kept must still lie on the line from it to the next one.
    let fits = true;
    for (let j = a + 1; j <= i && fits; j++) fits = Math.abs(valueAt([points[a], c], points[j].tick) - points[j].value) <= tolerance;
    if (!fits) {
      out.push(points[i]);
      a = i;
    }
  }
  out.push(points[points.length - 1]);
  return out.map((p) => ({ ...p }));
}

/** A clip's lanes cleaned: unknown settings, repeats and empty lanes dropped. */
export function cleanLanes(lanes: readonly AutoLane[], end: number): AutoLane[] {
  const out: AutoLane[] = [];
  for (const l of lanes) {
    if (!isAutoTarget(l.target) || out.some((x) => x.target === l.target)) continue;
    const points = cleanPoints(l.points, end);
    if (points.length) out.push({ target: l.target, points });
  }
  return out;
}

/**
 * Lanes for a clip whose length changes from `oldEnd` to `end` ticks: made shorter, the points past the end go
 * (with one at the end, so the line keeps its shape up to there); with `repeat` (the piano roll's Double) the
 * line plays again in the new length.
 */
export function lanesForLength(lanes: readonly AutoLane[], oldEnd: number, end: number, repeat = false): AutoLane[] {
  return cleanLanes(
    lanes.map((l) => {
      let pts = l.points;
      if (repeat && end > oldEnd) {
        pts = [];
        for (let at = 0; at < end; at += oldEnd) pts.push(...l.points.filter((p) => p.tick < oldEnd || at + oldEnd >= end).map((p) => ({ tick: p.tick + at, value: p.value })));
      } else if (end < oldEnd && l.points.some((p) => p.tick > end)) pts = [...l.points.filter((p) => p.tick < end), { tick: end, value: valueAt(l.points, end) }];
      return { target: l.target, points: pts };
    }),
    end,
  );
}

/** Lanes from storage, checked. */
export function readLanes(raw: unknown, end: number): AutoLane[] {
  if (!Array.isArray(raw)) return [];
  const lanes = (raw as Record<string, unknown>[])
    .filter((l) => l && typeof l === "object" && Array.isArray(l.points))
    .map((l) => ({
      target: l.target as AutoTarget,
      points: (l.points as Record<string, unknown>[]).filter((p) => p && typeof p === "object" && typeof p.tick === "number" && typeof p.value === "number") as unknown as AutoPoint[],
    }));
  return cleanLanes(lanes, end);
}

/** Where a track's automation goes: its sound (a synth track's part) and its mixer strip. */
export interface AutoSink {
  part?: { automate(id: ParamId, value: number, t: number): void; release(id: ParamId, t: number): void };
  strip?: { automate(what: "volume" | "pan", value: number | null, t: number): void } | null;
}

/** A lane's control position (or null: back to the track's own) to its setting, from audio time `time`. */
export function sendAutomation(sink: AutoSink, target: AutoTarget, value: number | null, time: number) {
  if (target === "trackVolume") sink.strip?.automate("volume", value === null ? null : volumeAt(value), time);
  else if (target === "trackPan") sink.strip?.automate("pan", value === null ? null : panAt(value), time);
  else if (value === null) sink.part?.release(target, time);
  else sink.part?.automate(target, paramAt(target, value), time);
}
