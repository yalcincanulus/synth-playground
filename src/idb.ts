// The app's IndexedDB database: imported and drawn wavetables (tableStore.ts) and songs (songStore.ts). Both
// can outgrow localStorage (a 256-frame table is 2 MB; a song with many notes is big too).

const DB_NAME = "minilab3";
/** 1: wavetables. 2: songs, and the custom wavetables each song keeps. */
const DB_VERSION = 2;
export const TABLES_STORE = "wavetables";
export const SONGS_STORE = "songs";
export const SONG_TABLES_STORE = "songTables";

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(TABLES_STORE)) d.createObjectStore(TABLES_STORE, { autoIncrement: true });
      if (!d.objectStoreNames.contains(SONGS_STORE)) d.createObjectStore(SONGS_STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(SONG_TABLES_STORE)) d.createObjectStore(SONG_TABLES_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

/** One request on one store, as a promise. */
export function request<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}
