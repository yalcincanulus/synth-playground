// Imported wavetables, kept in the browser's IndexedDB (a 256-frame table is 2 MB: too big for localStorage).
// They are read once at startup, before the app starts, so presets that use them find them.

import { addTable, FRAME_SIZE, type WavetableDef } from "./wavetables";

const DB_NAME = "minilab3";
const STORE = "wavetables";

interface StoredTable {
  name: string;
  short: string;
  explain: string;
  /** Every frame back to back, FRAME_SIZE samples each. */
  samples: Float32Array;
}

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const toDef = (t: StoredTable, storeKey: number): WavetableDef => ({
  name: t.name,
  short: t.short,
  explain: t.explain,
  storeKey,
  frames: Array.from({ length: t.samples.length / FRAME_SIZE }, (_, f) => t.samples.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE)),
});

/** Add every saved table to the table list, in the order they were imported. Never fails: a broken store is skipped. */
export async function loadImportedTables(): Promise<void> {
  try {
    const [keys, tables] = await Promise.all([
      request("readonly", (s) => s.getAllKeys()),
      request("readonly", (s) => s.getAll() as IDBRequest<StoredTable[]>),
    ]);
    tables.forEach((t, i) => addTable(toDef(t, keys[i] as number)));
  } catch (e) {
    console.warn("Imported wavetables could not be loaded", e);
  }
}

/** Save a new table and add it to the list; returns its id. */
export async function saveImportedTable(def: Omit<WavetableDef, "frames" | "storeKey">, frames: Float32Array[]): Promise<number> {
  const samples = new Float32Array(frames.length * FRAME_SIZE);
  frames.forEach((f, i) => samples.set(f, i * FRAME_SIZE));
  const stored: StoredTable = { name: def.name, short: def.short, explain: def.explain, samples };
  const key = (await request("readwrite", (s) => s.add(stored))) as number;
  return addTable(toDef(stored, key));
}

export async function deleteImportedTable(storeKey: number): Promise<void> {
  await request("readwrite", (s) => s.delete(storeKey));
}
