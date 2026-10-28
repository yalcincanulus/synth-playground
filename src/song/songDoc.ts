// A whole song as one piece of plain data, as it is saved in the browser and in a file: its tracks and their
// sounds, clips, arrangement and tempo. Each track keeps its sound's values (not a link to the preset), so
// editing or deleting a preset never changes a song. Custom wavetables (imported or drawn) a sound uses are
// kept with the song too, so it still sounds right after the table is deleted, and on another computer.
// Plain code, so it is tested without a browser.

import type { ParamValues } from "../audio/params";
import type { Preset } from "../presets/presets";
import { readPlacements, readRange, MAX_SONG_BARS, type BarRange, type Placement } from "./arrangement";
import { fitsTrack, readClips, type Clip } from "./clips";
import { readTracks, type Track } from "./song";

/** A synth track's sound: the preset it started from (with that preset's settings), its own settings, and whether they were edited. */
export interface SongSound {
  preset: Preset;
  values: Partial<ParamValues>;
  dirty: boolean;
  /** The song's table (an index into its tables) the sound's Wavetable setting points at, when that is a custom one. */
  table?: number;
}

/** A custom wavetable kept with a song: every frame back to back (FRAME_SIZE samples each), like the table store's. */
export interface SongTable {
  name: string;
  short: string;
  explain: string;
  samples: Float32Array;
  drawn?: { keys: Float32Array; blend: "harmonics" | "crossfade" };
}

export interface SongDoc {
  /** Stays the same for good ("song-…"): its key in the browser's storage. */
  id: string;
  name: string;
  /** When it was last saved (ms since 1970), for the song list's order. */
  modified: number;
  tracks: Track[];
  /** Each synth track's sound, by track id. */
  sounds: Record<string, SongSound>;
  clips: Clip[];
  /** Each track's clip chosen in the clip launcher. */
  chosen: Record<string, string>;
  placements: Placement[];
  tempo: number;
  /** The bar Play starts from. */
  start: number;
  loop: BarRange | null;
  loopOn: boolean;
}

export const MAX_SONG_NAME = 32;
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

export function newSongId(): string {
  return `song-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const cleanSongName = (name: string) => name.trim().slice(0, MAX_SONG_NAME);

/** A name not taken by any of `names`: the name itself, else "Name 2", "Name 3"… */
export function uniqueSongName(name: string, names: readonly string[]): string {
  const base = cleanSongName(name) || "Song";
  if (!names.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const next = base.slice(0, MAX_SONG_NAME - suffix.length) + suffix;
    if (!names.includes(next)) return next;
  }
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : fallback);

/**
 * A song from storage or a file, checked: tracks, clips and placements are read as in their own modules, the
 * tempo, start and loop kept in range. Sounds are only sorted out by track here (reading a sound needs the
 * preset list: the app does it). Nothing readable gives a new song.
 */
export function readSongDoc(raw: unknown, id: string = newSongId()): SongDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tracks = readTracks(r.tracks);
  const clips = readClips(r.clips, tracks);
  const sounds: Record<string, SongSound> = {};
  const rawSounds = (r.sounds && typeof r.sounds === "object" ? r.sounds : {}) as Record<string, unknown>;
  for (const t of tracks) {
    const s = rawSounds[t.id] as Record<string, unknown> | undefined;
    if (t.kind !== "synth" || !s || typeof s !== "object") continue;
    // The preset and values are checked when the sound is made (they need the preset list).
    sounds[t.id] = { preset: s.preset as Preset, values: (s.values ?? {}) as Partial<ParamValues>, dirty: s.dirty === true };
    if (typeof s.table === "number" && Number.isInteger(s.table) && s.table >= 0) sounds[t.id].table = s.table;
  }
  const chosen: Record<string, string> = {};
  const rawChosen = (r.chosen && typeof r.chosen === "object" ? r.chosen : {}) as Record<string, unknown>;
  for (const t of tracks) {
    const clip = clips.find((c) => c.id === rawChosen[t.id]);
    if (clip && clip.track === t.id && fitsTrack(clip.kind, t)) chosen[t.id] = clip.id;
  }
  const loop = readRange(r.loop);
  return {
    id: typeof r.id === "string" && r.id ? r.id : id,
    name: typeof r.name === "string" && cleanSongName(r.name) ? cleanSongName(r.name) : "My song",
    modified: typeof r.modified === "number" && Number.isFinite(r.modified) ? r.modified : Date.now(),
    tracks,
    sounds,
    clips,
    chosen,
    placements: readPlacements(r.placements, clips),
    tempo: clampInt(r.tempo, MIN_TEMPO, MAX_TEMPO, 120),
    start: clampInt(r.start, 0, MAX_SONG_BARS - 1, 0),
    loop,
    loopOn: r.loopOn === true && loop !== null,
  };
}

/** A new, empty song: the drums and three synth tracks, nothing on them yet. */
export const emptySong = (name: string): SongDoc => ({ ...readSongDoc(null), name });

/** Whether a table kept with a song is this one: the same name and the same frames. */
export function sameTable(t: SongTable, name: string, frames: readonly Float32Array[]): boolean {
  if (t.name !== name) return false;
  const size = frames[0]?.length ?? 0;
  if (frames.length * size !== t.samples.length) return false;
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    for (let i = 0; i < size; i++) if (frame[i] !== t.samples[f * size + i]) return false;
  }
  return true;
}

// ------------------------------------------------------------------ files

const FILE_APP = "minilab3-playground";
const FILE_KIND = "song";
const FILE_VERSION = 1;

/** Float32 samples as base64 text, for a JSON file (exact: the bytes as they are). */
export function samplesToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function base64ToSamples(text: string): Float32Array {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length - (bin.length % 4));
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** A song as a file (JSON), with the custom wavetables it uses. The id stays behind: it belongs to this browser. */
export function songFile(doc: SongDoc, tables: readonly SongTable[]): string {
  const { id: _, modified: __, ...song } = doc;
  const out = tables.map((t) => ({
    name: t.name,
    short: t.short,
    explain: t.explain,
    samples: samplesToBase64(t.samples),
    drawn: t.drawn && { keys: samplesToBase64(t.drawn.keys), blend: t.drawn.blend },
  }));
  return JSON.stringify({ app: FILE_APP, kind: FILE_KIND, version: FILE_VERSION, song, tables: out });
}

function readFileTable(raw: unknown): SongTable | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.name !== "string" || typeof r.samples !== "string") return null;
  try {
    const samples = base64ToSamples(r.samples);
    if (!samples.length) return null;
    const drawn = r.drawn as { keys?: unknown; blend?: unknown } | undefined;
    return {
      name: r.name.slice(0, 24),
      short: typeof r.short === "string" ? r.short.slice(0, 8) : r.name.slice(0, 8),
      explain: typeof r.explain === "string" ? r.explain : "",
      samples,
      drawn: drawn && typeof drawn.keys === "string" ? { keys: base64ToSamples(drawn.keys), blend: drawn.blend === "crossfade" ? "crossfade" : "harmonics" } : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Read a song file: the song (with a new id) and its tables. A sound pointing at a table the file doesn't
 * have loses the pointer (it gets the first table, as a preset from another computer does).
 */
export function readSongFile(text: string): { doc: SongDoc; tables: SongTable[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't a song file (it isn't JSON).");
  }
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.kind !== FILE_KIND || !d.song || typeof d.song !== "object") throw new Error("This isn't a song file.");
  if (typeof d.version === "number" && d.version > FILE_VERSION) throw new Error("This song was saved by a newer version of the app.");
  const raw = (Array.isArray(d.tables) ? d.tables : []).map(readFileTable);
  // Keep the indexes the sounds point at: an unreadable table is dropped and the pointers after it move down.
  const index = new Map<number, number>();
  const tables: SongTable[] = [];
  raw.forEach((t, i) => {
    if (!t) return;
    index.set(i, tables.length);
    tables.push(t);
  });
  const doc = readSongDoc({ ...(d.song as object), id: undefined, modified: undefined });
  for (const s of Object.values(doc.sounds)) {
    if (s.table === undefined) continue;
    const at = index.get(s.table);
    if (at === undefined) delete s.table;
    else s.table = at;
  }
  return { doc, tables };
}
