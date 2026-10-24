// Small formulas shared by the classic voice (voice.ts) and the new voice engine (voiceBank.ts).

import { FILTER_TYPES, type ParamValues } from "../params";

export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Biquad lowpass/highpass Q is in dB; bandpass Q is a plain quality factor. */
export function filterQ(type: number, resonance: number) {
  return FILTER_TYPES[type] === "bandpass" ? resonance : Math.min(24, 20 * Math.log10(resonance));
}

/** The filter's 1/Q for the state-variable filter, matching the classic biquad's Q. */
export function filterK(type: number, resonance: number) {
  const q = filterQ(type, resonance);
  return FILTER_TYPES[type] === "bandpass" ? 1 / Math.max(q, 0.0001) : Math.pow(10, -q / 20);
}

export function filterBase(p: ParamValues, note: number) {
  return Math.min(20000, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
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
