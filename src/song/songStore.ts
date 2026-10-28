// Songs kept in the browser's IndexedDB: one record a song (its tracks, sounds, clips and arrangement), and
// apart from it the custom wavetables the song keeps (they can be megabytes, so an autosave that only
// changed a note doesn't write them again). The song list and the last song are read once at startup,
// before the app starts, like the wavetables.

import { request, SONG_TABLES_STORE, SONGS_STORE } from "../idb";
import { readSongDoc, type SongDoc, type SongTable } from "./songDoc";

const LAST_SONG_KEY = "minilab3.lastSong";
/** Where the song was kept before songs had a store of their own (one song, in localStorage). */
const OLD_SONG_KEY = "minilab3.song";

export interface SongsAtStart {
  /** Every saved song, the last changed first. */
  songs: SongDoc[];
  /** The song to open (the last one open), with its tables; null when there are no songs yet. */
  open: { doc: SongDoc; tables: SongTable[] } | null;
}

let atStart: SongsAtStart = { songs: [], open: null };

/** What loadSongs() found. */
export const songsAtStart = () => atStart;

/**
 * Read the song list and the last song. The one song kept in localStorage by older versions becomes the
 * first song in the list. Never fails: without storage the app starts with no songs (it makes one).
 */
export async function loadSongs(): Promise<void> {
  try {
    await moveOldSong();
    const songs = (await request(SONGS_STORE, "readonly", (s) => s.getAll() as IDBRequest<unknown[]>)).map((r) => readSongDoc(r));
    songs.sort((a, b) => b.modified - a.modified);
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_SONG_KEY);
    } catch {
      last = null;
    }
    const doc = songs.find((s) => s.id === last) ?? songs[0];
    atStart = { songs, open: doc ? { doc, tables: await getSongTables(doc.id) } : null };
  } catch (e) {
    console.warn("Songs could not be loaded", e);
  }
}

async function moveOldSong() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OLD_SONG_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let old: unknown = null;
  try {
    old = JSON.parse(raw);
  } catch {
    old = null;
  }
  if (old && typeof old === "object") {
    const doc = readSongDoc({ ...old, name: "My song" });
    await putSong(doc);
    rememberOpen(doc.id);
  }
  localStorage.removeItem(OLD_SONG_KEY);
}

/** The song opened last, to open again next time. */
export function rememberOpen(id: string) {
  try {
    localStorage.setItem(LAST_SONG_KEY, id);
  } catch {
    // Not kept (private window): the newest song opens next time.
  }
}

export async function getSong(id: string): Promise<SongDoc | null> {
  const raw = await request(SONGS_STORE, "readonly", (s) => s.get(id));
  return raw ? readSongDoc(raw) : null;
}

/** Save a song (its tables apart, with putSongTables). */
export async function putSong(doc: SongDoc): Promise<void> {
  await request(SONGS_STORE, "readwrite", (s) => s.put(doc));
}

export async function getSongTables(id: string): Promise<SongTable[]> {
  const tables = await request(SONG_TABLES_STORE, "readonly", (s) => s.get(id) as IDBRequest<SongTable[] | undefined>);
  return Array.isArray(tables) ? tables : [];
}

export async function putSongTables(id: string, tables: SongTable[]): Promise<void> {
  if (tables.length) await request(SONG_TABLES_STORE, "readwrite", (s) => s.put(tables, id));
  else await request(SONG_TABLES_STORE, "readwrite", (s) => s.delete(id));
}

export async function deleteSong(id: string): Promise<void> {
  await Promise.all([request(SONGS_STORE, "readwrite", (s) => s.delete(id)), request(SONG_TABLES_STORE, "readwrite", (s) => s.delete(id))]);
}
