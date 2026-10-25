import { describe, expect, test } from "bun:test";
import { emptyFilter, filterPresets, matchesQuery, presetFile, readPresetFile } from "./browser";
import { PARAMS, type ParamId } from "../audio/params";
import { DEFAULT_FAVOURITES, FACTORY_PRESETS, factoryId, TAG_CHOICES, type Preset } from "./presets";

const names = (list: Preset[]) => list.map((p) => p.name);
const find = (query: string, change = {}) => names(filterPresets(FACTORY_PRESETS, { ...emptyFilter(), query, ...change }, DEFAULT_FAVOURITES));
const user = (name: string, values: Preset["values"] = { cutoff: 500 }): Preset => ({ id: `user:${name}`, name, category: "Bass", color: [1, 2, 3], knobs: FACTORY_PRESETS[0].knobs, values, tags: ["dark"] });

describe("factory presets", () => {
  test("each has its own id and some describing words", () => {
    expect(new Set(FACTORY_PRESETS.map((p) => p.id)).size).toBe(FACTORY_PRESETS.length);
    for (const p of FACTORY_PRESETS) expect(p.tags?.length).toBeGreaterThan(1);
  });

  test("every Classic says what it recreates, and its settings are real ones in range", () => {
    const classics = FACTORY_PRESETS.filter((p) => p.category === "Classics");
    expect(classics.length).toBeGreaterThanOrEqual(15);
    for (const p of classics) {
      expect(p.about, p.name).toMatch(/\d{4}\)|\d{2}s/);
      for (const [id, v] of Object.entries(p.values)) {
        const def = PARAMS[id as ParamId];
        expect(def, `${p.name}: ${id}`).toBeDefined();
        expect(v, `${p.name}: ${id}`).toBeGreaterThanOrEqual(def.min);
        expect(v, `${p.name}: ${id}`).toBeLessThanOrEqual(def.max);
      }
    }
  });

  test("every tag button finds something, and every favourite exists", () => {
    for (const tag of TAG_CHOICES) expect(FACTORY_PRESETS.some((p) => p.tags?.includes(tag))).toBe(true);
    for (const id of DEFAULT_FAVOURITES) expect(FACTORY_PRESETS.some((p) => p.id === id)).toBe(true);
  });
});

describe("search", () => {
  test("words match the name, the category and the tags; all of them must match", () => {
    expect(find("dark bass")).toEqual(["Reese Bass", "Sub Bass"]);
    expect(find("dark")).toContain("Dark Pad");
    expect(find("plucky keys")).toEqual(["Pluck", "Mallets", "Digital Keys", "Table Pluck"]);
    expect(find("wobble")).toEqual(["Wobble"]);
  });

  test("a Classic is found by its original instrument or artist", () => {
    expect(find("oberheim")).toEqual(["Stadium Brass", "Growl Sweep"]);
    expect(find("vangelis")).toEqual(["Blade Brass"]);
    expect(find("", { group: "Classics" })).toContain("Hoover");
  });

  test("the start of a word is enough, plurals and other words for a category work", () => {
    expect(find("glas")).toEqual(["Glass Strings", "FM Bell"]); // the name, and the tag "glassy"
    expect(find("pads").length).toBe(find("pad").length);
    expect(find("effects")).toEqual(find("fx"));
    expect(matchesQuery(FACTORY_PRESETS[0], "  ")).toBe(true);
  });

  test("groups, tag buttons and favourites", () => {
    expect(find("", { group: "Brass" })).toEqual(["Brass Stab", "Synth Brass"]);
    expect(find("", { group: "Pad", tags: ["dark"] })).toEqual(["Dark Pad"]);
    // Favourites keep the order they were starred in.
    const favs = [factoryId("Pluck"), factoryId("First Saw"), "user:gone"];
    expect(names(filterPresets(FACTORY_PRESETS, { ...emptyFilter(), group: "favourites" }, favs))).toEqual(["Pluck", "First Saw"]);
    const all = [...FACTORY_PRESETS, user("Mine")];
    expect(names(filterPresets(all, { ...emptyFilter(), group: "mine" }, []))).toEqual(["Mine"]);
  });
});

describe("preset files", () => {
  test("export and import bring the same sounds back, with new ids", () => {
    const mine = [user("Low One"), user("Low Two", { cutoff: 900, wtTable: 2 })];
    const back = readPresetFile(presetFile(mine), [], 8);
    expect(back.added.map(({ name, category, color, knobs, values, tags }) => ({ name, category, color, knobs, values, tags }))).toEqual(
      mine.map(({ name, category, color, knobs, values, tags }) => ({ name, category, color, knobs, values, tags })),
    );
    for (const p of back.added) expect(p.id.startsWith("user:")).toBe(true);
  });

  test("presets you already have are skipped; a name taken by another sound gets a number", () => {
    const mine = [user("Low One")];
    const file = presetFile([user("Low One"), user("Low One", { cutoff: 1200 })]);
    const r = readPresetFile(file, mine, 8);
    expect(r.skipped).toBe(1);
    expect(names(r.added)).toEqual(["Low One 2"]);
  });

  test("settings are checked: unknown ones dropped, out of range clamped, missing wavetables replaced", () => {
    const raw = { name: "Odd", category: "Nope", values: { cutoff: 1e9, bogus: 3, resonance: "x", wtTable: 20, filterType: 1 }, knobs: ["cutoff"] };
    const [p] = readPresetFile(JSON.stringify(raw), [], 8).added;
    expect(p.category).toBe("Lead");
    expect(p.values.cutoff).toBeLessThanOrEqual(20000);
    expect("bogus" in p.values || "resonance" in p.values || "filterType" in p.values).toBe(false);
    expect(p.values.filterMorph).toBeDefined();
    expect(p.values.wtTable).toBe(0);
    expect(p.knobs.length).toBe(8);
  });

  test("a file that isn't presets says so", () => {
    expect(() => readPresetFile("not json", [], 8)).toThrow("isn't JSON");
    expect(() => readPresetFile(JSON.stringify({ hello: 1 }), [], 8)).toThrow("No presets");
  });
});
