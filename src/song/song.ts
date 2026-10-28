// A song's tracks, as plain data: what each track is, its mixer settings, and the rules between them (solo,
// names, order). The app (playground.svelte.ts) gives each synth track its sound and its part in the engine.
// Plain code, so it is tested without a browser.

import { STRIP_MIN_DB } from "../audio/fx";
import type { Rgb } from "../presets/presets";

export type TrackKind = "synth" | "drums";

export interface Track {
  /** Stays the same for good: the part's id in the engine ("track-3"). */
  id: string;
  kind: TrackKind;
  name: string;
  /** Index into TRACK_COLORS. */
  color: number;
  /** dB; VOLUME_MIN is off. */
  volume: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Most notes at once (synth tracks), within the sound's own Max Voices: it spares the CPU. */
  voices: number;
}

/** One drum track, and up to this many synth tracks. */
export const MAX_SYNTH_TRACKS = 7;
export const MAX_NAME = 16;
export const VOLUME_MIN = STRIP_MIN_DB;
export const VOLUME_MAX = 6;
/**
 * A synth track's voices to start with. Measured (bun run bench, 2026-10-28): 4 tracks and the Play view's
 * two parts, pads holding 4 notes, take about the budget a laptop 3–4x slower than this desktop can carry.
 */
export const DEFAULT_TRACK_VOICES = 4;
export const MAX_TRACK_VOICES = 8;

/** Track colours (the MiniLab's LED range, like the presets'), told apart at a glance. */
export const TRACK_COLORS: Rgb[] = [
  [127, 60, 20],
  [20, 90, 127],
  [110, 30, 127],
  [20, 120, 60],
  [127, 110, 0],
  [127, 20, 70],
  [0, 115, 115],
  [90, 90, 90],
];

/** The drum track's id: there is only ever one. */
export const DRUM_TRACK_ID = "drums";

export const isTrackId = (id: string) => id === DRUM_TRACK_ID || id.startsWith("track-");

function track(id: string, kind: TrackKind, name: string, color: number): Track {
  return { id, kind, name, color, volume: 0, pan: 0, mute: false, solo: false, voices: DEFAULT_TRACK_VOICES };
}

/** A new song: the drums and three synth tracks. */
export function defaultTracks(): Track[] {
  return [track(DRUM_TRACK_ID, "drums", "Drums", 0), track("track-1", "synth", "Bass", 1), track("track-2", "synth", "Chords", 2), track("track-3", "synth", "Lead", 3)];
}

/** The sound each of defaultTracks' synth tracks starts on, by preset name. */
export const DEFAULT_TRACK_PRESETS: Record<string, string> = { "track-1": "Round Bass", "track-2": "Juno Pad", "track-3": "Square Lead" };

export const synthTracks = (tracks: readonly Track[]) => tracks.filter((t) => t.kind === "synth");

export const canAddTrack = (tracks: readonly Track[]) => synthTracks(tracks).length < MAX_SYNTH_TRACKS;

/** A new synth track, after the others: a fresh id, the next free "Synth N" name and the next colour. */
export function newSynthTrack(tracks: readonly Track[]): Track {
  let n = 1;
  while (tracks.some((t) => t.id === `track-${n}`)) n++;
  let k = synthTracks(tracks).length + 1;
  while (tracks.some((t) => t.name === `Synth ${k}`)) k++;
  return track(`track-${n}`, "synth", `Synth ${k}`, tracks.length % TRACK_COLORS.length);
}

/** Whether a track is heard: not muted, and soloed when any track is. */
export function audible(t: Track, tracks: readonly Track[]): boolean {
  if (t.mute) return false;
  return !tracks.some((x) => x.solo) || t.solo;
}

/** The tracks with one moved up (-1) or down (+1); the same list when it can't move. */
export function moveTrack(tracks: readonly Track[], id: string, delta: number): Track[] {
  const i = tracks.findIndex((t) => t.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= tracks.length) return [...tracks];
  const out = [...tracks];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export const cleanName = (name: string) => name.trim().slice(0, MAX_NAME);

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/**
 * Tracks from storage, checked: unreadable entries are dropped, values kept in range, and the drum track is
 * there exactly once. Nothing readable gives a new song's tracks.
 */
export function readTracks(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return defaultTracks();
  const out: Track[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !isTrackId(r.id) || out.some((t) => t.id === r.id)) continue;
    const kind: TrackKind = r.id === DRUM_TRACK_ID ? "drums" : "synth";
    if (kind === "synth" && synthTracks(out).length >= MAX_SYNTH_TRACKS) continue;
    const name = typeof r.name === "string" && cleanName(r.name) ? cleanName(r.name) : kind === "drums" ? "Drums" : "Synth";
    out.push({
      id: r.id,
      kind,
      name,
      color: Math.round(clamp(r.color, 0, TRACK_COLORS.length - 1, 0)),
      volume: clamp(r.volume, VOLUME_MIN, VOLUME_MAX, 0),
      pan: clamp(r.pan, -1, 1, 0),
      mute: r.mute === true,
      solo: r.solo === true,
      voices: Math.round(clamp(r.voices, 1, MAX_TRACK_VOICES, DEFAULT_TRACK_VOICES)),
    });
  }
  if (!out.length) return defaultTracks();
  if (!out.some((t) => t.kind === "drums")) out.unshift(track(DRUM_TRACK_ID, "drums", "Drums", 0));
  return out;
}
