import { describe, expect, test } from "bun:test";
import { defaultValues } from "../audio/params";
import { FACTORY_PRESETS, factoryId, presetValues, type Preset } from "../presets/presets";
import { EXAMPLE_SONGS } from "./examples";
import { readLink, songLink, soundLink, type LinkData } from "./songLink";

const preset = (name: string) => FACTORY_PRESETS.find((p) => p.id === factoryId(name))!;

/** A song or a sound out of a link, failing the test when the link opens something else. */
async function open<K extends LinkData["kind"]>(link: string, kind: K): Promise<Extract<LinkData, { kind: K }>> {
  const data = await readLink(`#${link}`);
  if (data?.kind !== kind) throw new Error(`not a ${kind}`);
  return data as Extract<LinkData, { kind: K }>;
}

// Made by the first version of links (2026-10-28). They must keep opening, whatever changes later.
const OLD_SONG =
  "song=1.rZIxb9swEIX_SvBmRqBk10i5tXW3FAGcAB2KDLR0sglTpEBSQg1B_70gJdvykKXIRL4jde_T4w0wsiEIvOjqQStzAkNwsjx5iD8DVAWBynWNB8NJmaWcP9zOsrTaOgjO0FvdxSPO0EqT1qYLBFFL7YnBW22voreqJA-xHtlsl-wf85uhP5twvBl-l37hl3-SX_Gh34-jddXCsfgkx9WHjs8kq5vf6r_93hlKrdrFU0aZok0Id2HP3jtV12DYS-dTuDOhsYHSo6c19vNBupBQNJlDOEJ83TC0KpRHiNWGoSdtSxXOEDnn43uiOVpPBmIYGVotS2rIhAVeqiWaCLrk3ctptiauIv2A8a31MZXYOlDT2olhQWZtC2E6raf9i1lE1pnKQwzXCMSA1pGnEHcJp5ZlsO4sdvHuwzx3l5xutZGhl7qLuQywvix-y57Su0XxSo2CeMyLSW4pdIYg1kn-Un8heLZm8N3-mXrSUW4Yyi7YuoZYc87gyFsjTTk1rZyK7XlWfGGolQ7kfpr-WxMgiuxa2lIpz_e3XjsfpIrjk-WX2o40yRRixp8YTnR-myaDZysGGcIsOC8YqkvPxHtt9hQJ79ro2u5knM8NQ2OrN-kOMdac4aBVNV1bxyNjU9VRT24_hTEyVMrFsQmuo3Ec_wE";
const OLD_SOUND =
  "sound=1.tVI7b4MwGPwr1c0uMiSlkbdW6dYsSaQOUQZDPiIUsCvboKKI_145PAoZq3ay7vw97s6-4tOQJQdxhZIlQWDTPCTSWjCk0tFZmwYCrz2jC20gDmH0zBac8SPDRenEQhyQVk5nGRgMWa2kSgkMWV44Mm-qfindCNeUygYMtkreqaYCDCeT177-XOQnf2qbRjsqcxwZallUZL3CUisNEQ5lggd8easNP2RNEFHX2IHFZIp4DPu7NblKEUTXt8m__JTlRIvgQcwGMyKK-dSQHzqzJKLgaW5L8CAaqV1lncyVJ0OGCzV7I9OLhwsG6VwPOI8YTkP7Tc3Yt_L7C5K287sasur3GKrJJJ0PhlKf9tKc_XuGDEWmt9IRRNy20xj_OaP4TuLvA-u47dz-H6X4E859bLPPNX65adBt-w0";

describe("song links", () => {
  test("a factory song comes back the same: tracks, clips, placements, tempo and every sound's values", async () => {
    for (const ex of EXAMPLE_SONGS) {
      const made = ex.make();
      const { doc } = await open(await songLink({ ...made, id: "song-x", modified: 1 }), "song");
      expect(doc.id).not.toBe("song-x");
      expect(doc.name).toBe(made.name);
      expect(doc.tempo).toBe(made.tempo);
      expect(doc.tracks).toEqual(made.tracks);
      expect(doc.clips).toEqual(made.clips);
      expect(doc.placements).toEqual(made.placements);
      expect(doc.chosen).toEqual(made.chosen);
      for (const [track, s] of Object.entries(made.sounds)) {
        // The factory preset goes by its id; the app takes it from its list.
        expect(doc.sounds[track].preset.id).toBe(s.preset.id);
        expect(doc.sounds[track].values).toEqual({ ...defaultValues(), ...s.values });
        expect(doc.sounds[track].dirty).toBe(false);
      }
    }
  });

  test("the factory songs fit in a link of 8 KB or less", async () => {
    for (const ex of EXAMPLE_SONGS) expect((await songLink({ ...ex.make(), id: "x", modified: 0 })).length).toBeLessThanOrEqual(8192);
  });

  test("an edited sound stays edited; a preset not from the factory travels whole, without its id", async () => {
    const mine: Preset = { ...preset("Round Bass"), id: "user:abc", name: "My bass", from: undefined };
    const song = EXAMPLE_SONGS[0].make();
    const track = Object.keys(song.sounds)[0];
    song.sounds[track] = { preset: mine, values: { ...presetValues(mine), cutoff: 321 }, dirty: true };
    const { doc } = await open(await songLink({ ...song, id: "x", modified: 0 }), "song");
    const s = doc.sounds[track];
    expect(s.preset.id.startsWith("link:")).toBe(true);
    expect(s.preset.name).toBe("My bass");
    expect(s.preset.values).toEqual(mine.values);
    expect(s.preset.knobs).toEqual(mine.knobs);
    expect(s.values.cutoff).toBe(321);
    expect(s.dirty).toBe(true);
  });

  test("an old link still opens", async () => {
    const { doc } = await open(OLD_SONG, "song");
    expect(doc.name).toBe("Old link");
    expect(doc.tempo).toBe(96);
    expect(doc.clips).toEqual([{ id: "clip-1", track: "track-1", name: "Riff", bars: 1, kind: "notes", notes: [{ start: 0, length: 96, pitch: 36, velocity: 100 }] }]);
    expect(doc.placements).toEqual([{ id: "place-1", clip: "clip-1", bar: 0, bars: 2, transpose: 0 }]);
    expect(doc.sounds["track-1"].preset.id).toBe(factoryId("Round Bass"));
    expect(doc.sounds["track-1"].values).toEqual({ ...presetValues(preset("Round Bass")), cutoff: 400 });
    expect(doc.sounds["track-1"].dirty).toBe(true);

    const sound = await open(OLD_SOUND, "sound");
    expect(sound.preset.name).toBe("My bass");
    expect(sound.values).toEqual({ ...presetValues(preset("Round Bass")), resonance: 6 });
    expect(sound.dirty).toBe(false);
  });
});

describe("sound links", () => {
  test("a factory preset goes by its id, with its values", async () => {
    const p = preset("Acid 303");
    const sound = await open(await soundLink(p, { ...presetValues(p), resonance: 9 }, true), "sound");
    expect(sound.preset.id).toBe(p.id);
    expect(sound.values).toEqual({ ...presetValues(p), resonance: 9 });
    expect(sound.dirty).toBe(true);
  });
});

describe("reading links", () => {
  test("a '#' that isn't a link of ours is nothing", async () => {
    for (const hash of ["", "#", "#top", "#song", "#song=x"]) expect(await readLink(hash)).toBeNull();
  });

  test("a broken link, or one from a newer app, says so", async () => {
    expect(readLink(`#${OLD_SONG.slice(0, 60)}`)).rejects.toThrow("broken");
    expect(readLink("#song=1.!!")).resolves.toBeNull();
    expect(readLink("#song=1.AAAA")).rejects.toThrow("broken");
    expect(readLink(`#song=${2}.${OLD_SONG.slice(7)}`)).rejects.toThrow("newer version");
    expect(readLink(`#song=0.${OLD_SONG.slice(7)}`)).rejects.toThrow("isn't one");
  });
});
