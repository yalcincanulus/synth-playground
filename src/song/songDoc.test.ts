import { describe, expect, test } from "bun:test";
import { FACTORY_PRESETS, factoryId } from "../presets/presets";
import { songEnd } from "./arrangement";
import { EXAMPLE_SONGS } from "./examples";
import { base64ToSamples, readSongDoc, readSongFile, sameTable, samplesToBase64, songFile, uniqueSongName, type SongTable } from "./songDoc";

const table = (name: string, frames: number): SongTable => ({
  name,
  short: name.slice(0, 8),
  explain: "",
  samples: Float32Array.from({ length: frames * 2048 }, (_, i) => Math.sin(i / 7) * 0.9),
});

describe("songs as data", () => {
  test("nothing readable gives a new song", () => {
    for (const raw of [null, 3, "x", { tracks: "no" }]) {
      const doc = readSongDoc(raw);
      expect(doc.tracks.map((t) => t.kind)).toEqual(["drums", "synth", "synth", "synth"]);
      expect(doc.clips).toEqual([]);
      expect(doc.tempo).toBe(120);
      expect(doc.name).toBe("My song");
    }
  });

  test("tempo, start and loop are kept in range; a chosen clip must be on its track", () => {
    const doc = readSongDoc({
      tempo: 999,
      start: -4,
      loop: { start: 2, end: 6 },
      loopOn: true,
      clips: [{ id: "clip-1", track: "drums", kind: "drums", bars: 1, name: "B", patterns: [] }],
      chosen: { drums: "clip-1", "track-1": "clip-1" },
    });
    expect(doc.tempo).toBe(240);
    expect(doc.start).toBe(0);
    expect(doc.loop).toEqual({ start: 2, end: 6 });
    expect(doc.loopOn).toBe(true);
    expect(doc.chosen).toEqual({ drums: "clip-1" });
  });

  test("a sound's table pointer is kept only when it is a whole number", () => {
    const doc = readSongDoc({ sounds: { "track-1": { preset: {}, values: {}, table: 1 }, "track-2": { preset: {}, values: {}, table: "x" } } });
    expect(doc.sounds["track-1"].table).toBe(1);
    expect(doc.sounds["track-2"].table).toBeUndefined();
  });

  test("names: the name itself, else the next number", () => {
    expect(uniqueSongName("Demo", ["Other"])).toBe("Demo");
    expect(uniqueSongName("Demo", ["Demo", "Demo 2"])).toBe("Demo 3");
    expect(uniqueSongName("  ", [])).toBe("Song");
    expect(uniqueSongName("x".repeat(40), ["x".repeat(32)]).length).toBe(32);
  });
});

describe("tables", () => {
  test("samples survive base64 exactly", () => {
    const t = table("Wave", 3);
    expect(Array.from(base64ToSamples(samplesToBase64(t.samples)))).toEqual(Array.from(t.samples));
  });

  test("a table is the same one by name and frames", () => {
    const t = table("Wave", 2);
    const frames = [t.samples.slice(0, 2048), t.samples.slice(2048)];
    expect(sameTable(t, "Wave", frames)).toBe(true);
    expect(sameTable(t, "Other", frames)).toBe(false);
    expect(sameTable(t, "Wave", frames.slice(0, 1))).toBe(false);
    const changed = frames.map((f) => f.slice());
    changed[1][100] += 0.01;
    expect(sameTable(t, "Wave", changed)).toBe(false);
  });
});

describe("song files", () => {
  test("a song and its tables come back from its file, with a new id", () => {
    const made = EXAMPLE_SONGS[0].make();
    const doc = { ...made, id: "song-a", modified: 5 };
    doc.sounds["track-1"] = { ...doc.sounds["track-1"], table: 0 };
    const tables = [table("Mine", 2)];
    const back = readSongFile(songFile(doc, tables));
    expect(back.doc.id).not.toBe("song-a");
    expect(back.doc.name).toBe(doc.name);
    expect(back.doc.clips).toEqual(doc.clips);
    expect(back.doc.placements).toEqual(doc.placements);
    expect(back.doc.tracks).toEqual(doc.tracks);
    expect(back.doc.sounds["track-1"].values).toEqual(doc.sounds["track-1"].values);
    expect(back.doc.sounds["track-1"].table).toBe(0);
    expect(back.tables.length).toBe(1);
    expect(sameTable(back.tables[0], "Mine", [tables[0].samples.slice(0, 2048), tables[0].samples.slice(2048)])).toBe(true);
  });

  test("a sound pointing at a table the file lost forgets it; the others move down", () => {
    const doc = { ...readSongDoc(null), id: "s", modified: 0 };
    doc.sounds = { "track-1": { preset: FACTORY_PRESETS[0], values: {}, dirty: false, table: 0 }, "track-2": { preset: FACTORY_PRESETS[0], values: {}, dirty: false, table: 1 } };
    const data = JSON.parse(songFile(doc, [table("A", 1), table("B", 1)]));
    data.tables[0].samples = 5;
    const back = readSongFile(JSON.stringify(data));
    expect(back.tables.map((t) => t.name)).toEqual(["B"]);
    expect(back.doc.sounds["track-1"].table).toBeUndefined();
    expect(back.doc.sounds["track-2"].table).toBe(0);
  });

  test("other files are refused with a reason", () => {
    expect(() => readSongFile("{")).toThrow("isn't JSON");
    expect(() => readSongFile(JSON.stringify({ kind: "presets", presets: [] }))).toThrow("isn't a song file");
    expect(() => readSongFile(JSON.stringify({ kind: "song", version: 99, song: {} }))).toThrow("newer version");
  });
});

describe("factory songs", () => {
  test("each reads back as it is written, on Classics presets, with an arrangement", () => {
    for (const ex of EXAMPLE_SONGS) {
      const made = ex.make();
      const again = readSongDoc(made);
      expect(again.tracks).toEqual(made.tracks);
      expect(again.clips).toEqual(made.clips);
      expect(again.placements).toEqual(made.placements);
      expect(made.name).toBe(ex.name);
      for (const t of made.tracks.filter((x) => x.kind === "synth")) {
        const s = made.sounds[t.id];
        expect(FACTORY_PRESETS.find((p) => p.id === s.preset.id)?.category).toBe("Classics");
        expect(made.clips.some((c) => c.track === t.id)).toBe(true);
      }
      expect(songEnd(made.placements)).toBe(16);
      // Every clip is placed somewhere.
      for (const c of made.clips) expect(made.placements.some((p) => p.clip === c.id)).toBe(true);
    }
  });

  test("they are made fresh each time", () => {
    const a = EXAMPLE_SONGS[0].make();
    a.clips.length = 0;
    expect(EXAMPLE_SONGS[0].make().clips.length).toBeGreaterThan(0);
    expect(FACTORY_PRESETS.some((p) => p.id === factoryId("Juno Pad"))).toBe(true);
  });
});
