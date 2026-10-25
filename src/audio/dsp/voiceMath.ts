// Small formulas shared by the voice engine (voiceBank.ts), the engine (engine.ts) and the Synth view.

import { PARAMS, toControl, type ModDest, type ParamValues } from "../params";
import { LADDER_MAX_K } from "./ladder";

export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** The clean filter's resonance in dB (Q = Resonance), capped at 24 dB like the old Web Audio low-pass. */
export const filterQ = (resonance: number) => Math.min(24, 20 * Math.log10(resonance));

/** The clean filter's 1/Q for a resonance in dB. */
export const filterK = (qDb: number) => Math.pow(10, -qDb / 20);

/**
 * The ladder filter's feedback for a Resonance setting: the knob's travel maps evenly onto 0..LADDER_MAX_K,
 * so the filter starts to sing on its own (k = 4) near the top of the knob.
 */
export const ladderK = (resonance: number) => LADDER_MAX_K * toControl("resonance", resonance);

/** A resonance route's units (dB) as ladder feedback: 12 dB (a route at 100%) is about a third of the knob. */
export const LADDER_K_PER_DB = (LADDER_MAX_K * Math.LN10) / (20 * Math.log(PARAMS.resonance.max / PARAMS.resonance.min));

export function filterBase(p: ParamValues, note: number) {
  return Math.min(20000, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
}

/** Filter 2's cutoff for a note: its own Cutoff, with the same Key Track as Filter 1. */
export function filter2Base(p: ParamValues, note: number) {
  return Math.min(20000, p.filter2Cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
}

/** Unison copies are spread this many cents either side (at least), so they never sound like one. */
export const unisonSpread = (p: ParamValues) => Math.max(p.osc2Detune, 8);

/** The "key" source: -1 two octaves below middle C, +1 two octaves above. */
export const keySource = (note: number) => (note - 60) / 24;

/** Amp envelope peak for a velocity: Velocity at 0 ignores how hard you play. */
export const velocityPeak = (p: ParamValues, velocity: number) => 1 - p.velocity + p.velocity * (velocity / 127);

/** Filter envelope depth scale for a velocity (softer notes open the filter less). */
export const velocityFilterScale = (p: ParamValues, velocity: number) => 0.5 + 0.5 * (p.velocity > 0 ? velocity / 127 : 1);

/** A released voice is silent (about -62 dB) this long after its release starts. */
export const releaseEnd = (p: ParamValues) => p.release * 1.8 + 0.05;

/** What a mod matrix route's amount of 100% means at each destination. */
export const MOD_RANGE: Record<ModDest, number> = {
  pitch: 2400, // cents: ±2 octaves
  "osc 2 pitch": 2400,
  cutoff: 4800, // cents: ±4 octaves
  resonance: 12, // dB
  volume: 1,
  "wt pos": 1,
  width: 0.45,
  fm: 1,
  "osc mix": 1,
  sub: 0.8,
  noise: 1,
  pan: 1, // -1 hard left .. +1 hard right
  morph: 1, // the whole way from low-pass to high-pass
  "cutoff 2": 4800,
  chorus: 1, // the whole range of each effect amount
  delay: 1,
  reverb: 1,
  "lfo 1 rate": 3, // octaves: x8 faster or slower
  "lfo 1 depth": 1,
  "lfo 2 rate": 3,
  "lfo 2 depth": 1,
  "lfo 3 rate": 3,
};
