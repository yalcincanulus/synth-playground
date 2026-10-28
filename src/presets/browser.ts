// The preset browser's logic: finding presets by words, and moving your own presets between computers
// as files.

import { PARAMS, type ParamId } from "../audio/params";
import { CATEGORIES, migrate, userId, type Preset } from "./presets";

/** Where the browser looks: everything, your favourites, your own presets, or one category. */
export type PresetGroup = "all" | "favourites" | "mine" | Preset["category"];

export interface PresetFilter {
  group: PresetGroup;
  /** Typed words: each one must match the name, the category or a tag (the start of a word is enough). */
  query: string;
  /** Tag buttons switched on: a preset needs all of them. */
  tags: string[];
}

export const emptyFilter = (): PresetFilter => ({ group: "all", query: "", tags: [] });

export const isUserPresetId = (id: string) => id.startsWith("user:");

/** Other words people use for a category. */
const SYNONYMS: Record<string, string> = { effect: "fx", effects: "fx", sfx: "fx", sound: "fx", keyboard: "keys", horn: "brass", string: "strings", synthwave: "retro" };

/** Every word a preset can be found by, lower case (a Classic's note too: "oberheim", "vangelis"). */
function wordsOf(p: Preset): string[] {
  return [p.name, p.category, ...(p.tags ?? []), p.about ?? ""].flatMap((text) => text.toLowerCase().split(/[\s\-/()]+/)).filter(Boolean);
}

/** Whether a typed word finds a preset word: the start of it ("dar" finds dark), or a plural of it ("pads" finds pad). */
function wordMatches(token: string, word: string) {
  return word.startsWith(token) || (token.endsWith("s") && word === token.slice(0, -1));
}

/** Whether a preset has every typed word (as the start of one of its words). */
export function matchesQuery(p: Preset, query: string): boolean {
  const tokens = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return true;
  const words = wordsOf(p);
  return tokens.every((t) => {
    const token = SYNONYMS[t] ?? t;
    return words.some((w) => wordMatches(token, w));
  });
}

/** The presets the browser shows, in list order. */
export function filterPresets(presets: readonly Preset[], filter: PresetFilter, favourites: readonly string[]): Preset[] {
  let list: Preset[];
  if (filter.group === "favourites") list = favourites.map((id) => presets.find((p) => p.id === id)).filter((p): p is Preset => !!p);
  else if (filter.group === "mine") list = presets.filter((p) => isUserPresetId(p.id));
  else if (filter.group === "all") list = [...presets];
  else list = presets.filter((p) => p.category === filter.group);
  return list.filter((p) => filter.tags.every((t) => p.tags?.includes(t)) && matchesQuery(p, filter.query));
}

// ------------------------------------------------------------------ files

const FILE_APP = "minilab3-playground";
const FILE_KIND = "presets";

/** A file of presets (JSON), to keep or to open on another computer. Ids stay behind: they belong to this browser. */
export function presetFile(presets: readonly Preset[]): string {
  const out = presets.map(({ name, category, color, knobs, values, tags }) => ({ name, category, color, knobs, values, tags }));
  return JSON.stringify({ app: FILE_APP, kind: FILE_KIND, version: 1, presets: out }, null, 1);
}

const FALLBACK_KNOBS: Preset["knobs"] = ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc2Detune", "oscMix", "chorus", "reverbMix"];
const isParam = (id: unknown): id is ParamId => typeof id === "string" && Object.hasOwn(PARAMS, id);

/**
 * Sound settings from a file or storage, checked: settings this app doesn't know are dropped, the others
 * kept within their range. Older versions' settings are moved to today's (migrate).
 */
export function readValues(raw: unknown, tableCount: number): Preset["values"] {
  if (!raw || typeof raw !== "object") return {};
  const old = migrate({ id: "x", name: "", category: "Lead", color: [0, 0, 0], knobs: FALLBACK_KNOBS, values: raw as Preset["values"] });
  const values: Preset["values"] = {};
  for (const [id, v] of Object.entries(old.values)) {
    if (!isParam(id) || typeof v !== "number" || !Number.isFinite(v)) continue;
    // A wavetable this browser doesn't have (one imported on the other computer): the first table instead.
    if (id === "wtTable") values.wtTable = v >= 0 && v < tableCount ? Math.round(v) : 0;
    else values[id] = Math.min(PARAMS[id].max, Math.max(PARAMS[id].min, v));
  }
  return values;
}

/** One preset from a file, checked and cleaned up; null when it isn't one. */
function readPreset(raw: unknown, tableCount: number): Preset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim() || !r.values || typeof r.values !== "object") return null;
  const values = readValues(r.values, tableCount);
  const knobs = Array.isArray(r.knobs) && r.knobs.length === 8 ? r.knobs.map((k, i) => (k === "filterType" ? "filterMorph" : isParam(k) ? k : FALLBACK_KNOBS[i])) : FALLBACK_KNOBS;
  const color = Array.isArray(r.color) && r.color.length === 3 && r.color.every((c) => typeof c === "number") ? (r.color.map((c) => Math.min(127, Math.max(0, c))) as Preset["color"]) : ([0, 110, 100] as Preset["color"]);
  const category = CATEGORIES.includes(r.category as Preset["category"]) ? (r.category as Preset["category"]) : "Lead";
  const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().slice(0, 24)).slice(0, 12) : [];
  return { id: userId(), name: r.name.trim().slice(0, 18), category, color, knobs: knobs as Preset["knobs"], values, tags };
}

export interface ImportResult {
  /** The new presets, ready to add to yours. */
  added: Preset[];
  /** Presets you already have (same name and settings). */
  skipped: number;
  /** Entries that weren't presets. */
  invalid: number;
}

/**
 * Read a presets file. Accepts this app's files, a list of presets, or one preset. A preset you already have
 * is skipped; one whose name is taken by a different sound gets a number ("Lead 2").
 */
export function readPresetFile(text: string, existing: readonly Preset[], tableCount: number): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't a presets file (it isn't JSON).");
  }
  const entries: unknown[] = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { presets?: unknown }).presets) ? (data as { presets: unknown[] }).presets : [data];
  const result: ImportResult = { added: [], skipped: 0, invalid: 0 };
  const settings = (p: Preset) => JSON.stringify(Object.entries(p.values).sort(([a], [b]) => a.localeCompare(b)));
  const sameSound = (a: Preset, b: Preset) => a.name === b.name && settings(a) === settings(b);
  for (const entry of entries) {
    const p = readPreset(entry, tableCount);
    if (!p) {
      result.invalid++;
      continue;
    }
    const all = [...existing, ...result.added];
    if (all.some((q) => sameSound(p, q))) {
      result.skipped++;
      continue;
    }
    const base = p.name;
    for (let n = 2; all.some((q) => q.name === p.name); n++) p.name = `${base.slice(0, 18 - String(n).length - 1)} ${n}`;
    result.added.push(p);
  }
  if (!result.added.length && !result.skipped && result.invalid) throw new Error("No presets found in this file.");
  return result;
}
