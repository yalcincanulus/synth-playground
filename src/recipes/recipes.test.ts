import { describe, expect, test } from "bun:test";
import { PARAMS } from "../audio/params";
import { RECIPES } from "./library";
import { aimOf, blockOf, describe as say, hardwareFor, initValues, isPlay, settingHolds, stepParam, type SettingCheck } from "./recipe";

describe("recipes", () => {
  test("ids are unique", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  for (const recipe of RECIPES) {
    describe(recipe.name, () => {
      test("can be built from Init by following the hints, and no step is done before you start it", () => {
        const v = initValues();
        recipe.steps.forEach((step, i) => {
          const settings = step.checks.filter((c) => !isPlay(c)) as SettingCheck[];
          if (!settings.length) return;
          // Not already done: otherwise the step would flash past before you read it.
          expect(settings.every((c) => settingHolds(c, v)), `step ${i + 1} is already done`).toBe(false);
          for (const c of settings) v[c.param] = aimOf(c);
          for (const c of settings) expect(settingHolds(c, v), `step ${i + 1}: ${say(c)}`).toBe(true);
        });
        // The finished sound still passes every step (later steps don't undo earlier ones).
        for (const step of recipe.steps) for (const c of step.checks) if (!isPlay(c)) expect(settingHolds(c, v), say(c)).toBe(true);
      });

      test("every aim is within its control's range, and every check is described", () => {
        for (const step of recipe.steps) {
          for (const c of step.checks) {
            expect(say(c).length).toBeGreaterThan(5);
            if (isPlay(c)) continue;
            const def = PARAMS[c.param];
            const aim = aimOf(c);
            expect(aim).toBeGreaterThanOrEqual(def.min);
            expect(aim).toBeLessThanOrEqual(def.max);
          }
        }
      });

      test("every control it asks for is on a Synth view block and on a MiniLab knob or fader", () => {
        for (const step of recipe.steps) {
          const param = stepParam(step);
          if (!param) continue;
          expect(blockOf(param), param).not.toBeNull();
          expect(hardwareFor(param), param).not.toBeNull();
        }
      });

      test("ends by playing the finished sound", () => {
        expect(recipe.steps.at(-1)!.checks.every(isPlay)).toBe(true);
      });
    });
  }
});

describe("hardwareFor", () => {
  test("the amp envelope is on the faders", () => {
    expect(hardwareFor("sustain")).toEqual({ kind: "fader", index: 2, focus: "ampEnv" });
  });

  test("a knob on its own block's page", () => {
    expect(hardwareFor("cutoff")).toEqual({ kind: "knob", index: 0, focus: "filter" });
    expect(hardwareFor("filterDecay")).toEqual({ kind: "knob", index: 5, focus: "filterEnv" });
  });

  test("a control whose block has no page of its own uses a page that has it", () => {
    expect(hardwareFor("filterEnvAmt")).toMatchObject({ kind: "knob", index: 5 });
  });
});
