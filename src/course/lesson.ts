// The learning course: short pages, each with a few paragraphs, one interactive widget, and only the
// controls the page needs (modelled on Ableton's Learning Synths).
//
// A page lists the blocks and controls it allows. Everything else is held at the course's base sound
// (Init: one oscillator, filter open, no effects or movement), so nothing the page doesn't explain can
// change the sound. Its "try this" steps are recipe steps, checked by the same engine (RecipeRun).

import type { ParamId, ParamValues } from "../audio/params";
import { blockOf, initValues, type RecipeStep } from "../recipes/recipe";
import type { BlockId } from "../app/synth/blocks";

/** One side of an A/B comparison: what it is called, and the settings it puts on the page's controls. */
export interface CompareSide {
  label: string;
  /** One line under the button: what to listen for. */
  text: string;
  values: Partial<ParamValues>;
}

/** The page's one interactive picture. */
export type Widget =
  /** The wave coming out, live. With `fixed`, at a fixed scale (no auto-zoom), so its height shows loudness. */
  | { kind: "wave"; fixed?: boolean }
  /** The note you last played: its name, its frequency, and its wave over 10 ms. */
  | { kind: "pitch" }
  /** One big control, with the wave at a fixed scale beside it. */
  | { kind: "knob"; param: ParamId }
  /** The harmonics in Osc 1's wave: one bar per sine. */
  | { kind: "harmonics" }
  /**
   * Two spectrograms side by side: the sound at one point of the synth and at a later one (say into and out
   * of the filter), so you see what happened between them. Both mark the filter's live cutoff.
   */
  | { kind: "spectrogram"; before: StageTap; after: StageTap }
  /** The filter's response: how much of each frequency gets through, now. */
  | { kind: "response" }
  /** An LFO's shape and where it is now. With `transport`, a ▶ button for the drums (for tempo sync). */
  | { kind: "lfo"; index: 0 | 1 | 2; transport?: boolean }
  /** Route n of the mod matrix as a diagram (from → to, by how much), over a picture of what it moves. */
  | { kind: "route"; n: number; picture: "spectrogram" | "stereo" }
  /**
   * An oscillator's wave as its settings make it (pulse width, sync, FM), over two cycles of Osc 1, beside a
   * spectrogram of what it plays.
   */
  | { kind: "oscillator"; which: 0 | 1 }
  /** Osc 1's wavetable as a stack of waves, the one playing lit, beside its harmonics. */
  | { kind: "table" }
  /** Buttons that leave the course for the Synth view, with Init or with your own sound. */
  | { kind: "build" }
  /** An envelope's shape, with a dot for each note showing where it is now. */
  | { kind: "envelope"; which: "amp" | "filter" }
  /**
   * Two sounds to switch between. Each side sets the page's controls (so you see what changed). The
   * picture under them: the wave (the default) or an envelope.
   */
  | { kind: "compare"; a: CompareSide; b: CompareSide; picture?: "wave" | "amp" | "filter" | "response" };

/** Points in the synth a spectrogram can listen at: after the mixer, after the drive, after the filter. */
export type StageTap = "mix" | "drive" | "filter";

export interface Lesson {
  id: string;
  title: string;
  /** Paragraphs. **Bold** marks a word the page introduces. */
  text: string[];
  widget: Widget;
  /** The synth's blocks on show, in signal order. */
  blocks: BlockId[];
  /** The controls on this page, on MiniLab knobs 1, 2, 3… (none: only the keys play). */
  knobs: ParamId[];
  /** Amp envelope controls on this page: they stay on their own faders (Attack 1 … Release 4). */
  faders?: ParamId[];
  /** Blocks that shape the sound from outside the signal path (the envelopes), shown apart. */
  modulators?: BlockId[];
  /** Choice controls limited to their first n choices here (the Osc 1 wave without "table"). */
  choices?: Partial<Record<ParamId, number>>;
  /** The page's starting sound, over the base sound. */
  sound: Partial<ParamValues>;
  /** "Try this": done one after another, each moving on by itself, like a recipe's steps. */
  steps: RecipeStep[];
}

export interface Chapter {
  id: string;
  title: string;
  lessons: Lesson[];
  /** Recipes (ids) that use what the chapter taught, offered at its end. */
  recipes: string[];
}

/** The course's base sound: Init with a sine wave, at a comfortable level. */
export const COURSE_BASE: Partial<ParamValues> = {
  osc1Wave: 0,
  osc2Wave: 0,
  volume: 0.6,
};

/** A page's starting settings. */
export const lessonValues = (lesson: Lesson): ParamValues => ({ ...initValues(), ...COURSE_BASE, ...lesson.sound });

/** The block a control is on; the mod matrix's routes belong to the Mod Matrix block. */
export const lessonBlockOf = (id: ParamId): BlockId | null => blockOf(id) ?? (/^mod\d(Src|Dst|Amt)$/.test(id) ? "matrix" : null);

/** Every control on the page: its knobs, then its faders. */
export const controlsOf = (lesson: Lesson): ParamId[] => [...lesson.knobs, ...(lesson.faders ?? [])];
