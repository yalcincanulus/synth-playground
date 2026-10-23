import { defaultValues, type ParamId, type ParamValues } from "../audio/params";

export type Rgb = [number, number, number]; // 0-127, the MiniLab's LED range

export interface Preset {
  name: string;
  category: "Bass" | "Lead" | "Pad" | "Keys" | "Brass" | "FX";
  /** Pad LED and UI accent colour. */
  color: Rgb;
  /** What knobs 1-8 control. Faders are always the amp envelope. */
  knobs: [ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId];
  values: Partial<ParamValues>;
}

/** Faders 1-4 are the same for every preset, so the envelope is always under your fingers. */
export const FADERS: [ParamId, ParamId, ParamId, ParamId] = ["attack", "decay", "sustain", "release"];

// Wave indices: 0 sine, 1 triangle, 2 saw, 3 square.
// Filter: 0 lowpass, 1 highpass, 2 bandpass. LFO/mod target: 0 pitch, 1 filter, 2 amp.
// Delay div: 0 1/16, 1 1/8, 2 3/16, 3 1/4, 4 3/8, 5 1/2.

export const FACTORY_PRESETS: Preset[] = [
  {
    name: "First Saw",
    category: "Lead",
    color: [0, 110, 100],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc2Detune", "oscMix", "delayMix", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 7, cutoff: 1800, resonance: 2, filterEnvAmt: 2, filterDecay: 0.4, filterSustain: 0.3, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.3, reverbMix: 0.15, modTarget: 0, lfoRate: 5.5 },
  },
  {
    name: "Round Bass",
    category: "Bass",
    color: [127, 30, 0],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "subLevel", "drive", "glide", "osc2Semi"],
    values: { mono: 1, glide: 0.04, osc1Wave: 2, osc2Wave: 3, osc2Semi: -12, osc2Detune: 4, oscMix: 0.4, subLevel: 0.6, cutoff: 260, resonance: 3, filterEnvAmt: 2.5, filterDecay: 0.25, filterSustain: 0.1, keyTrack: 0.3, attack: 0.002, decay: 0.4, sustain: 0.8, release: 0.08, drive: 0.25, reverbMix: 0, modTarget: 1, lfoRate: 6 },
  },
  {
    name: "Acid Line",
    category: "Bass",
    color: [127, 110, 0],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "drive", "glide", "delayMix", "osc1Wave"],
    values: { mono: 1, glide: 0.08, osc1Wave: 2, oscMix: 0, osc2Detune: 0, cutoff: 320, resonance: 14, filterEnvAmt: 3.5, filterDecay: 0.18, filterSustain: 0, keyTrack: 0.6, attack: 0.002, decay: 0.25, sustain: 0.6, release: 0.06, drive: 0.55, delayMix: 0.2, delayDiv: 2, delayFeedback: 0.4, reverbMix: 0.05, modTarget: 1 },
  },
  {
    name: "Wobble",
    category: "Bass",
    color: [90, 0, 127],
    knobs: ["lfoRate", "lfoDepth", "cutoff", "resonance", "subLevel", "drive", "osc2Detune", "reverbMix"],
    values: { mono: 1, osc1Wave: 2, osc2Wave: 3, osc2Semi: 0, osc2Detune: 12, subLevel: 0.7, cutoff: 220, resonance: 8, filterEnvAmt: 0.5, keyTrack: 0.4, lfoTarget: 1, lfoRate: 3, lfoDepth: 0.55, modTarget: 1, attack: 0.005, decay: 0.2, sustain: 1, release: 0.1, drive: 0.4, reverbMix: 0.05 },
  },
  {
    name: "Warm Pad",
    category: "Pad",
    color: [40, 60, 127],
    knobs: ["cutoff", "resonance", "osc2Detune", "unison", "chorus", "lfoDepth", "reverbMix", "reverbSize"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 14, unison: 3, cutoff: 1400, resonance: 1.2, filterEnvAmt: 1, filterAttack: 1.2, filterDecay: 2, filterSustain: 0.5, keyTrack: 0.3, attack: 0.9, decay: 1.5, sustain: 0.85, release: 2.2, chorus: 0.6, reverbMix: 0.45, reverbSize: 4, lfoTarget: 1, lfoRate: 0.25, lfoDepth: 0.15, velocity: 0.3 },
  },
  {
    name: "Glass Strings",
    category: "Pad",
    color: [0, 127, 50],
    knobs: ["cutoff", "filterEnvAmt", "osc2Detune", "osc2Semi", "chorus", "lfoRate", "reverbMix", "reverbSize"],
    values: { osc1Wave: 2, osc2Wave: 1, osc2Semi: 12, osc2Detune: 9, unison: 2, oscMix: 0.35, cutoff: 3200, resonance: 0.8, filterEnvAmt: 0.5, filterAttack: 0.6, keyTrack: 0.5, attack: 0.5, decay: 1, sustain: 0.9, release: 1.6, chorus: 0.8, reverbMix: 0.5, reverbSize: 5, modTarget: 0, lfoRate: 5, velocity: 0.4 },
  },
  {
    name: "Brass Stab",
    category: "Brass",
    color: [127, 70, 0],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "filterDecay", "osc2Detune", "chorus", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 10, cutoff: 600, resonance: 1.5, filterEnvAmt: 3, filterAttack: 0.06, filterDecay: 0.5, filterSustain: 0.45, keyTrack: 0.5, attack: 0.03, decay: 0.4, sustain: 0.75, release: 0.25, chorus: 0.25, reverbMix: 0.2, velocity: 0.7, modTarget: 0, lfoRate: 5 },
  },
  {
    name: "Pluck",
    category: "Keys",
    color: [127, 0, 70],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc1Wave", "delayMix", "delayFeedback", "delayDiv"],
    values: { osc1Wave: 3, osc2Wave: 1, osc2Semi: 12, oscMix: 0.3, osc2Detune: 3, cutoff: 500, resonance: 3, filterEnvAmt: 4, filterDecay: 0.18, filterSustain: 0, keyTrack: 0.7, attack: 0.001, decay: 0.5, sustain: 0, release: 0.4, delayMix: 0.35, delayDiv: 2, delayFeedback: 0.45, reverbMix: 0.25, velocity: 0.8 },
  },
  {
    name: "Square Lead",
    category: "Lead",
    color: [0, 70, 127],
    knobs: ["cutoff", "resonance", "glide", "osc2Semi", "lfoRate", "drive", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.06, osc1Wave: 3, osc2Wave: 2, osc2Semi: 7, oscMix: 0.25, osc2Detune: 5, cutoff: 2600, resonance: 2, filterEnvAmt: 1.5, filterDecay: 0.3, filterSustain: 0.5, attack: 0.005, decay: 0.2, sustain: 0.85, release: 0.15, modTarget: 0, lfoRate: 5.5, delayMix: 0.25, delayDiv: 4, reverbMix: 0.2, drive: 0.15 },
  },
  {
    name: "Bell Tower",
    category: "Keys",
    color: [110, 110, 127],
    knobs: ["osc2Semi", "osc2Detune", "oscMix", "cutoff", "filterEnvAmt", "chorus", "reverbMix", "reverbSize"],
    values: { osc1Wave: 0, osc2Wave: 0, osc2Semi: 19, osc2Detune: 4, oscMix: 0.45, cutoff: 6000, resonance: 0.7, filterEnvAmt: 1, filterDecay: 1, attack: 0.001, decay: 2.5, sustain: 0, release: 2.5, chorus: 0.3, reverbMix: 0.55, reverbSize: 6, velocity: 0.8 },
  },
  {
    name: "Combo Organ",
    category: "Keys",
    color: [127, 20, 20],
    knobs: ["osc2Semi", "oscMix", "subLevel", "cutoff", "lfoRate", "lfoDepth", "chorus", "drive"],
    values: { osc1Wave: 3, osc2Wave: 0, osc2Semi: 12, oscMix: 0.5, osc2Detune: 2, subLevel: 0.3, cutoff: 4000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, lfoTarget: 2, lfoRate: 6, lfoDepth: 0.35, modTarget: 0, chorus: 0.5, drive: 0.2, reverbMix: 0.2, velocity: 0 },
  },
  {
    name: "Wind Sweep",
    category: "FX",
    color: [60, 127, 127],
    knobs: ["cutoff", "resonance", "noiseLevel", "lfoRate", "lfoDepth", "filterType", "reverbMix", "reverbSize"],
    values: { osc1Wave: 0, osc2Wave: 1, oscMix: 0.3, noiseLevel: 0.9, filterType: 2, cutoff: 900, resonance: 9, filterEnvAmt: 0, keyTrack: 1, lfoTarget: 1, lfoRate: 0.15, lfoDepth: 0.6, attack: 1.2, decay: 1, sustain: 1, release: 3, reverbMix: 0.6, reverbSize: 7, delayMix: 0.2, delayDiv: 5, volume: 1 },
  },
];

export function presetValues(p: Preset): ParamValues {
  return { ...defaultValues(), ...p.values };
}

const USER_KEY = "minilab3.userPresets";

export function loadUserPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: Preset[]) {
  localStorage.setItem(USER_KEY, JSON.stringify(presets));
}
