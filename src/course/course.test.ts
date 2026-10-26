import { describe, expect, test } from "bun:test";
import { PARAMS, toControl } from "../audio/params";
import { FADERS } from "../presets/presets";
import { blockOf, aimOf, describe as say, isPlay, settingHolds, type SettingCheck } from "../recipes/recipe";
import { SHOWN_WHEN } from "../app/synth/blocks";
import { CHAPTERS, PAGES } from "./course";
import { controlsOf, lessonValues } from "./lesson";

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

  for (const { lesson } of PAGES) {
    describe(lesson.title, () => {
      test("fits the MiniLab's 8 knobs, and every control is on a block the page shows", () => {
        expect(lesson.knobs.length).toBeLessThanOrEqual(8);
        const shown = [...lesson.blocks, ...(lesson.modulators ?? [])];
        for (const id of controlsOf(lesson)) expect(shown, id).toContain(blockOf(id)!);
      });

      test("faders only hold the amp envelope, which stays on its own faders (not on a knob too)", () => {
        for (const id of lesson.faders ?? []) {
          expect(FADERS).toContain(id);
          expect(lesson.knobs).not.toContain(id);
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
          const shown = SHOWN_WHEN[blockOf(id)!]?.[id];
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
