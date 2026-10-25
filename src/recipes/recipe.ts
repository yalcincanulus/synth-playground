// Guided recipes: build a sound step by step from a blank "Init" patch.
//
// A recipe is a list of steps. Each step says in plain English what to do, points at the control to
// touch (its block in the Synth view, and its MiniLab knob or fader), and has a check: conditions on the
// settings, or on what you play, that move you on by themselves once they hold.

import { defaultValues, formatValue, PARAMS, type ParamId, type ParamValues } from "../audio/params";
import { FADERS, type Preset } from "../presets/presets";
import { BLOCKS, KNOB_PAGES, type BlockId } from "../app/synth/blocks";

/** A condition on one setting. With `is`, it must be that choice; otherwise within min..max (either may be left out). */
export interface SettingCheck {
  param: ParamId;
  min?: number;
  max?: number;
  is?: number;
  /** The value the hint suggests ("about 500 Hz"). Defaults to `is`. */
  aim?: number;
}

/** A condition on what you play: any note, a low one (below C3), or a chord (3 or more notes at once). */
export interface PlayCheck {
  play: "note" | "low" | "chord";
}

export type Check = SettingCheck | PlayCheck;

export interface RecipeStep {
  /** What to do. */
  text: string;
  /** What it does, or what to listen for. */
  why: string;
  /** All of these must hold. The first setting's control is the one pointed out. */
  checks: Check[];
}

export interface Recipe {
  id: string;
  name: string;
  /** One line: what you will build. */
  summary: string;
  category: Preset["category"];
  color: Preset["color"];
  steps: RecipeStep[];
  /** Said when it is done. */
  outro: string;
}

export const LOW_NOTE = 48; // C3
/** How long a step's checks must hold before it counts as done, so sweeping a knob through the range doesn't count. */
export const HOLD_MS = 1200;
/** How long a done step stays on screen (ticked) before the next one, so you can hear what changed. */
export const LINGER_MS = 3000;

/**
 * The blank sound every recipe starts from: Osc 1's saw alone, the filter wide open with no envelope,
 * an organ-like volume shape (full while held), and no effects or movement.
 */
export const INIT_VALUES: Partial<ParamValues> = {
  osc1Wave: 2,
  osc2Wave: 2,
  oscMix: 0,
  osc2Semi: 0,
  osc2Detune: 0,
  subLevel: 0,
  noiseLevel: 0,
  unison: 1,
  cutoff: 18000,
  resonance: 0.7,
  filterEnvAmt: 0,
  filterDecay: 0.6,
  filterSustain: 0.2,
  drive: 0,
  attack: 0.005,
  decay: 1,
  sustain: 1,
  release: 0.1,
  lfoDepth: 0,
  lfo2Depth: 0,
  chorus: 0,
  delayMix: 0,
  reverbMix: 0,
  mono: 0,
  glide: 0,
};

export function initPreset(recipe: Recipe): Preset {
  return {
    id: `recipe:${recipe.id}`,
    name: "Init",
    category: recipe.category,
    color: recipe.color,
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc2Detune", "oscMix", "chorus", "reverbMix"],
    values: { ...INIT_VALUES },
    from: "recipe",
  };
}

export const initValues = (): ParamValues => ({ ...defaultValues(), ...INIT_VALUES });

export const isPlay = (c: Check): c is PlayCheck => "play" in c;

export function settingHolds(c: SettingCheck, v: ParamValues): boolean {
  const x = v[c.param];
  if (c.is !== undefined) return Math.round(x) === c.is;
  return (c.min === undefined || x >= c.min) && (c.max === undefined || x <= c.max);
}

/** The check in words: "Cutoff below 900 Hz", "Voice: mono", "Play a chord". */
export function describe(c: Check): string {
  if (isPlay(c)) return { note: "Play a note", low: "Play a low note (below C3)", chord: "Play a chord (3 notes or more)" }[c.play];
  const label = PARAMS[c.param].label;
  const f = (x: number) => formatValue(c.param, x);
  if (c.is !== undefined) return `${label}: ${f(c.is)}`;
  if (c.min !== undefined && c.max !== undefined) return `${label} between ${f(c.min)} and ${f(c.max)}`;
  if (c.min !== undefined) return `${label} at least ${f(c.min)}`;
  return `${label} at most ${f(c.max!)}`;
}

/** The value a hint suggests for a setting check. */
export function aimOf(c: SettingCheck): number {
  if (c.aim !== undefined) return c.aim;
  if (c.is !== undefined) return c.is;
  if (c.min !== undefined && c.max !== undefined) return (c.min + c.max) / 2;
  return c.min ?? c.max!;
}

/** The step's first setting: the control it points at. */
export function stepParam(step: RecipeStep): ParamId | null {
  const c = step.checks.find((c) => !isPlay(c)) as SettingCheck | undefined;
  return c?.param ?? null;
}

/** Controls a recipe may ask for that no MiniLab knob reaches in the Synth view: you set them on screen. */
export const SCREEN_ONLY: ParamId[] = ["wtTable"];

/** The Synth view block a control is on. */
export function blockOf(param: ParamId): BlockId | null {
  for (const [id, def] of Object.entries(BLOCKS)) if (def.params.includes(param)) return id as BlockId;
  return null;
}

/**
 * Where on the MiniLab a control is: a fader (the amp envelope is always on faders 1-4), or a knob on
 * one of the Synth view's knob pages. `focus` is the block to focus so that page is on the knobs: the
 * control's own block when its page has it, so the detail panel explains the right thing.
 */
export function hardwareFor(param: ParamId): { kind: "fader" | "knob"; index: number; focus: BlockId } | null {
  const block = blockOf(param);
  const fader = FADERS.indexOf(param);
  if (fader >= 0 && block) return { kind: "fader", index: fader, focus: block };
  const pages = KNOB_PAGES.filter((p) => p.knobs.includes(param));
  const page = pages.find((p) => block && p.blocks.includes(block)) ?? pages[0];
  if (!page) return null;
  return { kind: "knob", index: page.knobs.indexOf(param), focus: block && page.blocks.includes(block) ? block : page.blocks[0] };
}
