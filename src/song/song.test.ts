import { describe, expect, test } from "bun:test";
import { FACTORY_PRESETS, factoryId } from "../presets/presets";
import { audible, canAddTrack, DEFAULT_TRACK_PRESETS, defaultTracks, DRUM_TRACK_ID, MAX_SYNTH_TRACKS, moveTrack, newSynthTrack, readTracks, type Track } from "./song";

const solo = (tracks: Track[], ...ids: string[]) => tracks.map((t) => ({ ...t, solo: ids.includes(t.id) }));

describe("tracks", () => {
  test("a new song: the drums and three synth tracks, each on a factory sound", () => {
    const tracks = defaultTracks();
    expect(tracks.map((t) => t.kind)).toEqual(["drums", "synth", "synth", "synth"]);
    for (const t of tracks.slice(1)) expect(FACTORY_PRESETS.some((p) => p.id === factoryId(DEFAULT_TRACK_PRESETS[t.id]))).toBe(true);
  });

  test("new tracks get a fresh id and name, up to the limit", () => {
    let tracks = defaultTracks();
    while (canAddTrack(tracks)) tracks = [...tracks, newSynthTrack(tracks)];
    expect(tracks.filter((t) => t.kind === "synth").length).toBe(MAX_SYNTH_TRACKS);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
    expect(new Set(tracks.map((t) => t.name)).size).toBe(tracks.length);
    // An id freed by a removed track is used again, never one still taken.
    const fewer = tracks.filter((t) => t.id !== "track-2");
    expect(newSynthTrack(fewer).id).toBe("track-2");
  });

  test("solo: only the soloed tracks are heard; mute always wins", () => {
    const tracks = defaultTracks();
    expect(tracks.every((t) => audible(t, tracks))).toBe(true);
    const s = solo(tracks, "track-1", "track-3");
    expect(s.map((t) => audible(t, s))).toEqual([false, true, false, true]);
    const m = s.map((t) => (t.id === "track-1" ? { ...t, mute: true } : t));
    expect(audible(m[1], m)).toBe(false);
  });

  test("moving a track up and down, and not past the ends", () => {
    const tracks = defaultTracks();
    expect(moveTrack(tracks, "track-1", -1).map((t) => t.id)).toEqual(["track-1", DRUM_TRACK_ID, "track-2", "track-3"]);
    expect(moveTrack(tracks, DRUM_TRACK_ID, -1)).toEqual(tracks);
    expect(moveTrack(tracks, "track-3", 1)).toEqual(tracks);
  });

  test("reading saved tracks: checked, in range, with exactly one drum track", () => {
    expect(readTracks(null)).toEqual(defaultTracks());
    expect(readTracks([])).toEqual(defaultTracks());
    const read = readTracks([
      { id: "track-2", name: "  Keys  ", volume: 99, pan: -5, voices: 0.4, color: 3, mute: true },
      { id: "track-2", name: "copy" },
      { id: "nope" },
      "junk",
    ]);
    expect(read.map((t) => t.id)).toEqual([DRUM_TRACK_ID, "track-2"]);
    expect(read[1]).toMatchObject({ name: "Keys", volume: 6, pan: -1, voices: 1, color: 3, mute: true, solo: false, kind: "synth" });
  });
});
