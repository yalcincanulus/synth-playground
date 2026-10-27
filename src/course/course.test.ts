import { describe, expect, test } from "bun:test";
import { PARAMS, toControl } from "../audio/params";
import { FADERS } from "../presets/presets";
import { aimOf, describe as say, isPlay, settingHolds, stepPieces, stepPlain, type SettingCheck } from "../recipes/recipe";
import { SHOWN_WHEN } from "../app/synth/blocks";
import { RECIPES } from "../recipes/library";
import { CHAPTERS, PAGES } from "./course";
import { GLOSSARY, introducedOn, markTerms, termFor } from "./glossary";
import { controlsOf, lessonBlockOf, lessonValues } from "./lesson";

/** Where something is on the MiniLab: only in a step's `{{…}}` asides, never in the plain text. */
const HARDWARE = /\b(knobs? \d|faders? \d|MiniLab|encoder|(mod|pitch) strip)\b/i;

/** Bold words that are the page's control labels, not terms: the reduced synth and the page explain them. */
const NOT_TERMS = ["Volume", "Filt Env", "F Decay", "Filt Morph", "Depth", "Rate", "LFO To", "Random", "LFO Sync", "Amount", "LFO 2", "LFO 3", "FM Amount", "WT Pos", "Synth view"];

describe("course", () => {
  test("page ids are unique", () => {
    expect(new Set(PAGES.map((p) => p.lesson.id)).size).toBe(PAGES.length);
  });

  test("each chapter has about 6 pages", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.lessons.length).toBeGreaterThanOrEqual(5);
      expect(chapter.lessons.length).toBeLessThanOrEqual(8);
    }
  });

  test("each chapter ends with a few recipes that exist", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.recipes.length).toBeGreaterThanOrEqual(1);
      expect(chapter.recipes.length).toBeLessThanOrEqual(4);
      for (const id of chapter.recipes) expect(RECIPES.map((r) => r.id), id).toContain(id);
    }
  });

  describe("glossary", () => {
    test("every bold word is a term, or a control's label", () => {
      for (const [i, { lesson }] of PAGES.entries()) {
        for (const piece of markTerms(lesson.text, i).flat()) if (piece.bold && !piece.term) expect(NOT_TERMS, `${lesson.title}: ${piece.t}`).toContain(piece.t);
      }
    });

    test("every term is introduced (in bold) on some page, and has a short definition", () => {
      for (const t of GLOSSARY) {
        expect(introducedOn(t), t.term).toBeGreaterThanOrEqual(0);
        expect(t.text.split(/\s+/).length, t.term).toBeLessThan(30);
      }
    });

    test("no word belongs to two terms", () => {
      const words = GLOSSARY.flatMap((t) => [t.term, ...(t.also ?? [])].map((w) => w.toLowerCase()));
      expect(new Set(words).size).toBe(words.length);
    });

    test("marking keeps the text, and marks a term from an earlier chapter once per page", () => {
      for (const [i, { lesson }] of PAGES.entries()) {
        const pieces = markTerms(lesson.text, i);
        pieces.forEach((p, k) => expect(p.map((x) => x.t).join("")).toBe(lesson.text[k].replace(/\*\*/g, "")));
        const plain = pieces.flat().filter((x) => x.term && !x.bold).map((x) => x.term!);
        expect(new Set(plain).size).toBe(plain.length);
        for (const t of plain) expect(PAGES[introducedOn(t)].chapter).not.toBe(PAGES[i].chapter);
      }
      // The LFO chapter's "What it moves" names the cutoff, from the filter chapters.
      const at = PAGES.findIndex((p) => p.lesson.id === "lfo-targets");
      const marked = markTerms(PAGES[at].lesson.text, at).flat().filter((x) => x.term && !x.bold);
      expect(marked.map((x) => x.term)).toContain(termFor("cutoff"));
    });
  });

  for (const { lesson } of PAGES) {
    describe(lesson.title, () => {
      test("fits the MiniLab's 8 knobs, and every control is on a block the page shows", () => {
        expect(lesson.knobs.length).toBeLessThanOrEqual(8);
        const shown = [...lesson.blocks, ...(lesson.modulators ?? [])];
        for (const id of controlsOf(lesson)) expect(shown, id).toContain(lessonBlockOf(id)!);
      });

      test("faders only hold the amp envelope, which stays on its own faders (not on a knob too)", () => {
        for (const id of lesson.faders ?? []) {
          expect(FADERS).toContain(id);
          expect(lesson.knobs).not.toContain(id);
        }
      });

      test("names controls, not where they are on the MiniLab, and only the page's controls", () => {
        for (const p of lesson.text) expect(p).not.toMatch(/\[\[|\{\{/);
        for (const p of lesson.text) expect(p).not.toMatch(HARDWARE);
        for (const step of lesson.steps) {
          for (const t of [step.text, step.why]) {
            expect(stepPlain(t)).not.toMatch(HARDWARE);
            for (const piece of stepPieces(t)) if ("param" in piece) expect(controlsOf(lesson), t).toContain(piece.param);
          }
        }
      });

      test("its steps only ask for controls on its knobs and faders", () => {
        for (const step of lesson.steps) for (const c of step.checks) if (!isPlay(c)) expect(controlsOf(lesson), c.param).toContain(c.param);
      });

      test("can be done from its starting sound by following the hints, and no step is done before it starts", () => {
        const v = lessonValues(lesson);
        lesson.steps.forEach((step, i) => {
          const settings = step.checks.filter((c) => !isPlay(c)) as SettingCheck[];
          if (!settings.length) return;
          expect(settings.every((c) => settingHolds(c, v)), `step ${i + 1} is already done`).toBe(false);
          for (const c of settings) v[c.param] = aimOf(c);
          for (const c of settings) expect(settingHolds(c, v), `step ${i + 1}: ${say(c)}`).toBe(true);
        });
      });

      test("aims are within range and within the page's choices", () => {
        for (const step of lesson.steps) {
          for (const c of step.checks) {
            if (isPlay(c)) continue;
            const aim = aimOf(c);
            expect(aim).toBeGreaterThanOrEqual(PARAMS[c.param].min);
            expect(aim).toBeLessThanOrEqual(PARAMS[c.param].max);
            const n = lesson.choices?.[c.param];
            if (n !== undefined) expect(aim).toBeLessThan(n);
          }
        }
      });

      test("every control is on show on its block", () => {
        const v = lessonValues(lesson);
        for (const id of controlsOf(lesson)) {
          const shown = SHOWN_WHEN[lessonBlockOf(id)!]?.[id];
          if (shown) expect(shown(v), id).toBe(true);
        }
      });

      test("has a few short paragraphs", () => {
        expect(lesson.text.length).toBeGreaterThanOrEqual(2);
        expect(lesson.text.length).toBeLessThanOrEqual(4);
        for (const p of lesson.text) expect(p.split(/\s+/).length, p).toBeLessThan(75);
      });

      if (lesson.widget.kind === "compare") {
        const { a, b } = lesson.widget;
        test("A/B only sets the page's controls, and A is the starting sound", () => {
          for (const side of [a, b]) for (const id of Object.keys(side.values)) expect(controlsOf(lesson) as string[]).toContain(id);
          const v = lessonValues(lesson);
          for (const [id, x] of Object.entries(a.values)) expect(v[id as keyof typeof v]).toBe(x!);
        });
      }

      if (lesson.widget.kind === "knob") {
        const param = lesson.widget.param;
        test("the big knob is on the page's knobs", () => {
          expect(lesson.knobs).toContain(param);
          expect(toControl(param, lessonValues(lesson)[param])).toBeGreaterThan(0);
        });
      }
    });
  }
});
