// Synth parameters. Every parameter maps to and from a 0..1 "control" position,
// which is what knobs, faders and the MiniLab's 0-127 values drive.

export type Curve = "lin" | "exp" | "int";

export interface ParamDef {
  /** Short label, fits the OLED's 10-character first line. */
  label: string;
  min: number;
  max: number;
  curve: Curve;
  default: number;
  /** Discrete choices, for enum parameters (value is the index). */
  options?: readonly string[];
  format?: (v: number) => string;
}

import { WAVETABLE_NAMES } from "./wavetables";

export const WAVES = ["sine", "triangle", "sawtooth", "square", "table"] as const;
/** Filter 2's place: off, after Filter 1 (series), or beside it on the same input (parallel). */
export const FILTER2_MODES = ["off", "series", "parallel"] as const;
/** Clean: the state-variable filter (2-pole). Ladder: the Moog-style 4-pole, which can self-oscillate. */
export const FILTER_MODELS = ["clean", "ladder"] as const;
export const LFO_TARGETS = ["pitch", "filter", "amp", "width", "position"] as const;
export const LFO_WAVES = ["sine", "triangle", "saw", "square", "random"] as const;
/** LFO tempo sync: "off" uses the Rate knob, otherwise one cycle lasts this many beats. */
export const LFO_SYNCS = ["off", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16"] as const;
export const LFO_SYNC_BEATS = [0, 8, 4, 2, 1, 0.5, 0.25];
/** Mod matrix sources and destinations (a route's value is the index). */
export const MOD_SOURCES = ["off", "lfo 1", "lfo 2", "filter env", "amp env", "pitch env", "mod env", "velocity", "key", "mod strip", "random"] as const;
export const MOD_DESTS = [
  "pitch", "osc 2 pitch", "cutoff", "resonance", "volume", "wt pos", "width", "fm", "osc mix", "sub", "noise", "pan", "morph", "cutoff 2",
  // Shared by the whole part rather than per note (see SHARED_DESTS).
  "chorus", "delay", "reverb", "lfo 1 rate", "lfo 1 depth", "lfo 2 rate", "lfo 2 depth",
] as const;
/**
 * Destinations that belong to the whole part, not to each note: the effect amounts and the LFOs. Per-note
 * sources (envelopes, velocity, key, random) reach them from the newest note.
 */
export const SHARED_DESTS: readonly ModDest[] = ["chorus", "delay", "reverb", "lfo 1 rate", "lfo 1 depth", "lfo 2 rate", "lfo 2 depth"];
export type ModSource = (typeof MOD_SOURCES)[number];
export type ModDest = (typeof MOD_DESTS)[number];
export const MOD_SLOTS = 8;

export const DELAY_DIVS = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2"] as const;
export const DELAY_DIV_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2];
/** Stereo: each side echoes on its own side. Ping-pong: the echoes bounce from left to right. */
export const DELAY_MODES = ["stereo", "ping-pong"] as const;

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${v.toFixed(v < 10 ? 2 : 0)} Hz`);
const sec = (v: number) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** A filter morph position: 0 low-pass, 0.5 band-pass, 1 high-pass, and blends between. */
const morph = (v: number) => {
  if (v < 0.005) return "low-pass";
  if (Math.abs(v - 0.5) < 0.005) return "band-pass";
  if (v > 0.995) return "high-pass";
  const t = Math.round((v < 0.5 ? v * 2 : v * 2 - 1) * 100);
  return v < 0.5 ? `LP ${100 - t}/BP ${t}` : `BP ${100 - t}/HP ${t}`;
};
const signed = (unit: string, digits = 0) => (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;

const enumParam = (label: string, options: readonly string[], def = 0): ParamDef => ({
  label, min: 0, max: options.length - 1, curve: "int", default: def, options,
});

type SlotIds<N extends number> = `mod${N}Src` | `mod${N}Dst` | `mod${N}Amt`;
type ModSlotIds = SlotIds<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>;

function modSlots(): Record<ModSlotIds, ParamDef> {
  const out: Record<string, ParamDef> = {};
  for (let n = 1; n <= MOD_SLOTS; n++) {
    out[`mod${n}Src`] = enumParam(`Mod${n} From`, MOD_SOURCES, 0);
    out[`mod${n}Dst`] = enumParam(`Mod${n} To`, MOD_DESTS, 2);
    out[`mod${n}Amt`] = { label: `Mod${n} Amt`, min: -1, max: 1, curve: "lin", default: 0, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%` };
  }
  return out as Record<ModSlotIds, ParamDef>;
}

/** The parameter ids of route n (1..8). */
export const slotIds = (n: number) => ({ src: `mod${n}Src`, dst: `mod${n}Dst`, amt: `mod${n}Amt` }) as { src: ParamId; dst: ParamId; amt: ParamId };

export const PARAMS = {
  // Oscillators
  osc1Wave: enumParam("Osc1 Wave", WAVES, 2),
  osc2Wave: enumParam("Osc2 Wave", WAVES, 2),
  osc2Semi: { label: "Osc2 Pitch", min: -24, max: 24, curve: "int", default: 0, format: signed(" st") },
  osc2Detune: { label: "Detune", min: 0, max: 50, curve: "lin", default: 7, format: (v) => `${v.toFixed(1)} ct` },
  oscMix: { label: "Osc Mix", min: 0, max: 1, curve: "lin", default: 0.5, format: (v) => `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}` },
  subLevel: { label: "Sub Osc", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  noiseLevel: { label: "Noise", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  // Imported tables join the list (wavetables.ts), so its top value follows it.
  wtTable: {
    ...enumParam("Wavetable", WAVETABLE_NAMES, 0),
    get max() {
      return WAVETABLE_NAMES.length - 1;
    },
  },
  wtPos: { label: "WT Pos", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  pulseWidth: { label: "PulseWidth", min: 0.05, max: 0.5, curve: "lin", default: 0.5, format: pct },
  oscSync: enumParam("Sync", ["off", "on"], 0),
  fmAmount: { label: "FM Amount", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  unison: { label: "Unison", min: 1, max: 3, curve: "int", default: 1, format: (v) => `${v} voice${v > 1 ? "s" : ""}` },
  /** How far the unison copies spread left and right (0: all in the middle). */
  stereoWidth: { label: "Stereo", min: 0, max: 1, curve: "lin", default: 0.6, format: pct },

  // Filter
  /** Low-pass -> band-pass -> high-pass, smoothly. */
  filterMorph: { label: "Filt Morph", min: 0, max: 1, curve: "lin", default: 0, format: morph },
  filterModel: enumParam("Filt Model", FILTER_MODELS, 0),
  cutoff: { label: "Cutoff", min: 30, max: 18000, curve: "exp", default: 2000, format: hz },
  resonance: { label: "Resonance", min: 0.5, max: 20, curve: "exp", default: 1, format: (v) => v.toFixed(1) },
  drive: { label: "Drive", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  filterEnvAmt: { label: "Filt Env", min: -4, max: 6, curve: "lin", default: 2, format: signed(" oct", 1) },
  filterAttack: { label: "F Attack", min: 0.001, max: 4, curve: "exp", default: 0.005, format: sec },
  filterDecay: { label: "F Decay", min: 0.01, max: 4, curve: "exp", default: 0.4, format: sec },
  filterSustain: { label: "F Sustain", min: 0, max: 1, curve: "lin", default: 0.2, format: pct },
  filterRelease: { label: "F Release", min: 0.01, max: 8, curve: "exp", default: 0.3, format: sec },
  keyTrack: { label: "Key Track", min: 0, max: 1, curve: "lin", default: 0.5, format: pct },

  // Filter 2: always the clean model; follows Key Track, but not the filter envelope or the LFOs.
  filter2Mode: enumParam("Filter 2", FILTER2_MODES, 0),
  filter2Cutoff: { label: "F2 Cutoff", min: 30, max: 18000, curve: "exp", default: 300, format: hz },
  filter2Resonance: { label: "F2 Reso", min: 0.5, max: 20, curve: "exp", default: 1, format: (v) => v.toFixed(1) },
  filter2Morph: { label: "F2 Morph", min: 0, max: 1, curve: "lin", default: 1, format: morph },

  // Pitch envelope
  pitchEnvAmt: { label: "Pitch Env", min: -48, max: 48, curve: "lin", default: 0, format: signed(" st", 1) },
  pitchEnvDecay: { label: "P Decay", min: 0.005, max: 3, curve: "exp", default: 0.15, format: sec },
  pitchEnvTarget: enumParam("P Env To", ["both", "osc 2"], 0),

  // Amp envelope (on the faders)
  attack: { label: "Attack", min: 0.001, max: 5, curve: "exp", default: 0.005, format: sec },
  decay: { label: "Decay", min: 0.01, max: 5, curve: "exp", default: 0.3, format: sec },
  sustain: { label: "Sustain", min: 0, max: 1, curve: "lin", default: 0.7, format: pct },
  release: { label: "Release", min: 0.01, max: 8, curve: "exp", default: 0.3, format: sec },
  velocity: { label: "Velocity", min: 0, max: 1, curve: "lin", default: 0.6, format: pct },

  // LFO and modulation
  lfoRate: { label: "LFO Rate", min: 0.05, max: 20, curve: "exp", default: 5, format: hz },
  lfoDepth: { label: "LFO Depth", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  lfoTarget: enumParam("LFO To", LFO_TARGETS, 0),
  lfoWave: enumParam("LFO Shape", LFO_WAVES, 0),
  lfoSync: enumParam("LFO Sync", LFO_SYNCS, 0),
  lfo2Rate: { label: "LFO2 Rate", min: 0.05, max: 20, curve: "exp", default: 0.5, format: hz },
  lfo2Depth: { label: "LFO2 Depth", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  lfo2Target: enumParam("LFO2 To", LFO_TARGETS, 1),
  lfo2Wave: enumParam("LFO2 Shape", LFO_WAVES, 0),
  lfo2Sync: enumParam("LFO2 Sync", LFO_SYNCS, 0),
  modTarget: enumParam("Mod To", LFO_TARGETS, 0),
  glide: { label: "Glide", min: 0, max: 1, curve: "lin", default: 0, format: sec },
  mono: enumParam("Voice", ["poly", "mono"], 0),
  /** Most notes sounding at once (poly). Fewer can sound when the CPU is busy (see voiceLimit.ts). */
  maxVoices: { label: "Max Voices", min: 1, max: 16, curve: "int", default: 10, format: (v) => `${v} note${v > 1 ? "s" : ""}` },

  // Mod envelope: a fourth envelope, only connected through the mod matrix.
  modEnvAttack: { label: "M Attack", min: 0.001, max: 5, curve: "exp", default: 0.001, format: sec },
  modEnvDecay: { label: "M Decay", min: 0.01, max: 5, curve: "exp", default: 0.5, format: sec },
  modEnvSustain: { label: "M Sustain", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  modEnvRelease: { label: "M Release", min: 0.01, max: 8, curve: "exp", default: 0.3, format: sec },

  // Mod matrix: 8 routes of source -> destination by amount.
  ...modSlots(),

  // Effects
  chorus: { label: "Chorus", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  delayMix: { label: "Delay", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  delayDiv: enumParam("Delay Time", DELAY_DIVS, 3),
  delayFeedback: { label: "Feedback", min: 0, max: 0.9, curve: "lin", default: 0.35, format: pct },
  delayMode: enumParam("Delay Mode", DELAY_MODES, 0),
  reverbMix: { label: "Reverb", min: 0, max: 1, curve: "lin", default: 0.15, format: pct },
  reverbSize: { label: "Room Size", min: 0.3, max: 8, curve: "exp", default: 2, format: sec },
  /** How much faster the highs die away than the lows (soft furnishings, a big hall's air). */
  reverbDamping: { label: "Rev Damp", min: 0, max: 1, curve: "lin", default: 0.4, format: pct },
  volume: { label: "Volume", min: 0, max: 1, curve: "lin", default: 0.7, format: pct },
} satisfies Record<string, ParamDef>;

export type ParamId = keyof typeof PARAMS;
export type ParamValues = Record<ParamId, number>;
export const PARAM_IDS = Object.keys(PARAMS) as ParamId[];

export function defaultValues(): ParamValues {
  return Object.fromEntries(PARAM_IDS.map((id) => [id, PARAMS[id].default])) as ParamValues;
}

/** 0..1 control position -> parameter value. */
export function fromControl(id: ParamId, t: number): number {
  const p: ParamDef = PARAMS[id];
  t = Math.max(0, Math.min(1, t));
  switch (p.curve) {
    case "exp":
      return p.min * Math.pow(p.max / p.min, t);
    case "int":
      return Math.round(p.min + t * (p.max - p.min));
    default:
      return p.min + t * (p.max - p.min);
  }
}

/** Filter Morph positions of the old filter types (lowpass, highpass, bandpass), for presets saved before the morph. */
export const MORPH_OF_OLD_TYPE = [0, 1, 0.5];

/** Parameter value -> 0..1 control position. */
export function toControl(id: ParamId, v: number): number {
  const p: ParamDef = PARAMS[id];
  const t = p.curve === "exp" ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
  return Math.max(0, Math.min(1, t));
}

export function formatValue(id: ParamId, v: number): string {
  const p: ParamDef = PARAMS[id];
  if (p.options) return p.options[Math.round(v)] ?? String(v);
  return p.format ? p.format(v) : v.toFixed(2);
}
