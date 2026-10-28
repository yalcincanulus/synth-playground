// Imported and drawn wavetables, kept in the browser's IndexedDB (a 256-frame table is 2 MB: too big for
// localStorage). They are read once at startup, before the app starts, so presets that use them find them.

import { request as dbRequest, TABLES_STORE } from "../idb";
import { addTable, FRAME_SIZE, type WavetableDef } from "./wavetables";

export interface StoredTable {
  name: string;
  short: string;
  explain: string;
  /** Every frame back to back, FRAME_SIZE samples each. */
  samples: Float32Array;
  /** A drawn table's keyframes, back to back, and how they blend. */
  drawn?: { keys: Float32Array; blend: "harmonics" | "crossfade" };
}

const request = <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => dbRequest(TABLES_STORE, mode, run);

export const join = (frames: Float32Array[]) => {
  const out = new Float32Array(frames.length * FRAME_SIZE);
  frames.forEach((f, i) => out.set(f, i * FRAME_SIZE));
  return out;
};
export const split = (samples: Float32Array) =>
  Array.from({ length: samples.length / FRAME_SIZE }, (_, f) => samples.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE));

export const toStored = (def: WavetableDef): StoredTable => ({
  name: def.name,
  short: def.short,
  explain: def.explain,
  samples: join(def.frames ?? []),
  drawn: def.drawn && { keys: join(def.drawn.keys), blend: def.drawn.blend },
});

const toDef = (t: StoredTable, storeKey: number): WavetableDef => ({
  name: t.name,
  short: t.short,
  explain: t.explain,
  storeKey,
  frames: split(t.samples),
  drawn: t.drawn && { keys: split(t.drawn.keys).map((k) => Float32Array.from(k)), blend: t.drawn.blend },
});

/** Add every saved table to the table list, in the order they were saved. Never fails: a broken store is skipped. */
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
  const stored = toStored({ ...def, frames });
  const key = (await request("readwrite", (s) => s.add(stored))) as number;
  return addTable(toDef(stored, key));
}

/** Save a table that is already in the list (a new drawing); sets its storeKey. */
export async function storeTable(def: WavetableDef): Promise<void> {
  def.storeKey = (await request("readwrite", (s) => s.add(toStored(def)))) as number;
}

/** Save over a stored table (a drawing edited again). */
export async function updateStoredTable(def: WavetableDef): Promise<void> {
  if (def.storeKey === undefined) return;
  await request("readwrite", (s) => s.put(toStored(def), def.storeKey));
}

export async function deleteImportedTable(storeKey: number): Promise<void> {
  await request("readwrite", (s) => s.delete(storeKey));
}
