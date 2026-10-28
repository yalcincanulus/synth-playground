// A song, or one sound, packed into a link: the data as JSON, deflated, in base64url after the "#"
// ("…/#song=1.<data>", "…/#sound=1.<data>"). Nothing is uploaded: the song lives only in the link. The number
// is the link's format; a reader for every format ever made stays here, so old links keep opening.
// Custom wavetables are too big for a link: the app offers the song file for a song that uses them.
// Plain code (CompressionStream is in Bun too), so it is tested without a browser.

import { defaultValues, type ParamId, type ParamValues } from "../audio/params";
import { factoryId, FACTORY_PRESETS, type Preset } from "../presets/presets";
import { readSongDoc, type SongDoc } from "./songDoc";

export const LINK_VERSION = 1;

/** What a link opens, before the app makes it a song or a sound. */
export type LinkData = { kind: "song"; doc: SongDoc } | { kind: "sound"; preset: Preset; values: ParamValues; dirty: boolean };

/** A link's JSON may not unpack to more than this (a broken or hostile link could unpack to gigabytes). */
const MAX_JSON = 4 * 1024 * 1024;

// ------------------------------------------------------------------ sounds

/**
 * A sound as a link keeps it: a factory preset by its id and name (the receiver has it), any other one in
 * full but without its id (that belongs to this browser); the values only where they differ from the
 * defaults, which is how presets keep them too.
 */
function packSound(preset: Preset, values: ParamValues, dirty: boolean) {
  const factory = FACTORY_PRESETS.some((p) => p.id === preset.id);
  const { name, category, color, knobs, about } = preset;
  const defaults = defaultValues();
  const diff: Partial<ParamValues> = {};
  for (const [id, v] of Object.entries(values) as [ParamId, number][]) if (v !== defaults[id]) diff[id] = v;
  return {
    preset: factory ? { id: preset.id, name } : { name, category, color, knobs, values: preset.values, about, from: preset.from === "dice" ? "dice" : undefined },
    values: diff,
    dirty: dirty || undefined,
  };
}

/**
 * A sound from a link, as raw as a saved song's (the app checks it against its preset list): the values
 * whole again. A preset not from the factory gets an id of its own, not in anyone's list.
 */
function unpackSound(raw: unknown): { preset: Preset; values: ParamValues; dirty: boolean } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (r.preset && typeof r.preset === "object" ? r.preset : {}) as Partial<Preset>;
  const id = typeof p.id === "string" && p.id.startsWith(factoryId("")) ? p.id : `link:${Math.random().toString(36).slice(2, 10)}`;
  const values = { ...defaultValues(), ...(r.values && typeof r.values === "object" ? r.values : {}) } as ParamValues;
  return { preset: { ...p, id } as Preset, values, dirty: r.dirty === true };
}

// ------------------------------------------------------------------ packing

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of out as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_JSON) throw new Error("too big");
    chunks.push(chunk);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pack(kind: LinkData["kind"], data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  return `${kind}=${LINK_VERSION}.${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
}

/** The part after the "#" for a song. Its custom tables aren't in it (the app checks that there are none). */
export function songLink(doc: SongDoc): Promise<string> {
  const { id: _, modified: __, sounds, ...song } = doc;
  const packed = Object.fromEntries(Object.entries(sounds).map(([track, s]) => [track, packSound(s.preset, s.values as ParamValues, s.dirty)]));
  return pack("song", { ...song, sounds: packed });
}

/** The part after the "#" for one sound. */
export function soundLink(preset: Preset, values: ParamValues, dirty: boolean): Promise<string> {
  return pack("sound", packSound(preset, values, dirty));
}

// ------------------------------------------------------------------ reading

/** Each format's reader, from its JSON to today's data. A new format adds one, and keeps the old ones. */
const READERS: Record<number, (kind: LinkData["kind"], data: unknown) => LinkData> = {
  1: (kind, data) => {
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (kind === "sound") return { kind, ...unpackSound(d) };
    const raw = (d.sounds && typeof d.sounds === "object" ? d.sounds : {}) as Record<string, unknown>;
    const sounds = Object.fromEntries(Object.entries(raw).map(([track, s]) => [track, unpackSound(s)]));
    return { kind, doc: readSongDoc({ ...d, sounds, id: undefined, modified: undefined }) };
  },
};

/**
 * What a URL's "#" part opens: null when it isn't a link of ours (no "#", or another one). Throws, in
 * words, when it is one but can't be read.
 */
export async function readLink(hash: string): Promise<LinkData | null> {
  const m = /^#?(song|sound)=(\d+)\.([A-Za-z0-9_-]*)$/.exec(hash.trim());
  if (!m) return null;
  const kind = m[1] as LinkData["kind"];
  const version = Number(m[2]);
  const reader = READERS[version];
  if (!reader) throw new Error(version > LINK_VERSION ? "This link was made by a newer version of the app." : "This link isn't one the app knows.");
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(m[3]), new DecompressionStream("deflate-raw"))));
  } catch {
    throw new Error(`This ${kind} link is broken: maybe it was cut short when it was copied.`);
  }
  return reader(kind, data);
}

// ------------------------------------------------------------------ at startup

let atStart: LinkData | Error | null = null;

/** Read the link the page was opened with, before the app starts (unpacking it takes a moment). */
export async function loadLink(): Promise<void> {
  try {
    atStart = await readLink(location.hash);
  } catch (e) {
    atStart = e as Error;
  }
}

/** What loadLink() found: a song or a sound, why the link couldn't be read, or nothing. */
export const linkAtStart = () => atStart;
