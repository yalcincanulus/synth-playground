import { defaultValues, MORPH_OF_OLD_TYPE, type ParamId, type ParamValues } from "../audio/params";

export type Rgb = [number, number, number]; // 0-127, the MiniLab's LED range

export interface Preset {
  name: string;
  /** "Test": small presets that each show one feature, for trying it out quickly. */
  category: "Bass" | "Lead" | "Pad" | "Keys" | "Brass" | "FX" | "Test";
  /** Pad LED and UI accent colour. */
  color: Rgb;
  /** What knobs 1-8 control. Faders are always the amp envelope. */
  knobs: [ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId];
  values: Partial<ParamValues>;
  /** A sound that isn't in the list (until saved): a rolled Dice patch, or the one a recipe builds. */
  from?: "dice" | "recipe";
}

/** Faders 1-4 are the same for every preset, so the envelope is always under your fingers. */
export const FADERS: [ParamId, ParamId, ParamId, ParamId] = ["attack", "decay", "sustain", "release"];

// Wave indices: 0 sine, 1 triangle, 2 saw, 3 square, 4 wavetable.
// Wavetables: 0 Shapes, 1 PWM, 2 Sync, 3 Fold, 4 Formant, 5 Vowels, 6 Organ, 7 Digital.
// Filter: 0 lowpass, 1 highpass, 2 bandpass. LFO/mod target: 0 pitch, 1 filter, 2 amp, 3 pulse width.
// Pitch envelope target: 0 both oscillators, 1 Osc 2 only.
// Mod matrix sources: 1 LFO 1, 2 LFO 2, 3 filter env, 4 amp env, 5 pitch env, 6 mod env, 7 velocity, 8 key, 9 mod strip, 10 random.
// Destinations: 0 pitch, 1 osc 2 pitch, 2 cutoff, 3 resonance, 4 volume, 5 wt pos, 6 width, 7 fm, 8 osc mix, 9 sub, 10 noise,
// 11 pan, 12 morph, 13 cutoff 2, 14 chorus, 15 delay, 16 reverb, 17 LFO 1 rate, 18 LFO 1 depth, 19 LFO 2 rate, 20 LFO 2 depth.
// LFO sync: 0 off, 1 2 bars, 2 1 bar, 3 1/2, 4 1/4, 5 1/8, 6 1/16. LFO shapes: 0 sine, 1 triangle, 2 saw, 3 square, 4 random.
// Delay div: 0 1/16, 1 1/8, 2 3/16, 3 1/4, 4 3/8, 5 1/2.

/** Presets in the order they were added; FACTORY_PRESETS below groups them by category. */
const ALL_PRESETS: Preset[] = [
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
    values: { mono: 1, glide: 0.08, osc1Wave: 2, oscMix: 0, osc2Detune: 0, cutoff: 320, resonance: 14, filterEnvAmt: 3.5, filterDecay: 0.18, filterSustain: 0, keyTrack: 0.6, attack: 0.002, decay: 0.25, sustain: 0.6, release: 0.06, drive: 0.55, delayMix: 0.2, delayDiv: 2, delayFeedback: 0.4, reverbMix: 0.05, modTarget: 1, volume: 0.55 },
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
    values: { osc1Wave: 3, osc2Wave: 0, osc2Semi: 12, oscMix: 0.5, osc2Detune: 2, subLevel: 0.3, cutoff: 4000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, lfoTarget: 2, lfoWave: 0, lfoRate: 6, lfoDepth: 0.35, modTarget: 0, chorus: 0.5, drive: 0.2, reverbMix: 0.2, velocity: 0 },
  },
  {
    name: "Wind Sweep",
    category: "FX",
    color: [60, 127, 127],
    knobs: ["cutoff", "resonance", "noiseLevel", "lfoRate", "lfoDepth", "filterMorph", "reverbMix", "reverbSize"],
    values: { osc1Wave: 0, osc2Wave: 1, oscMix: 0.3, noiseLevel: 1, filterMorph: 0.5, cutoff: 900, resonance: 2, filterEnvAmt: 0, keyTrack: 1, lfoTarget: 1, lfoRate: 0.15, lfoDepth: 0.6, attack: 1.2, decay: 1, sustain: 1, release: 3, reverbMix: 0.6, reverbSize: 7, delayMix: 0.2, delayDiv: 5, volume: 1 },
  },
  {
    name: "Reese Bass",
    category: "Bass",
    color: [0, 80, 90],
    knobs: ["osc2Detune", "cutoff", "resonance", "drive", "subLevel", "lfoRate", "lfoDepth", "chorus"],
    values: { mono: 1, glide: 0.03, osc1Wave: 2, osc2Wave: 2, osc2Detune: 28, unison: 2, subLevel: 0.4, cutoff: 480, resonance: 1.5, filterEnvAmt: 0.8, filterDecay: 0.6, filterSustain: 0.4, keyTrack: 0.3, drive: 0.35, lfoTarget: 1, lfoRate: 0.4, lfoDepth: 0.12, modTarget: 1, attack: 0.005, decay: 0.5, sustain: 1, release: 0.15, chorus: 0.2, reverbMix: 0.05 },
  },
  {
    name: "Sub Bass",
    category: "Bass",
    color: [50, 0, 60],
    knobs: ["oscMix", "osc2Wave", "cutoff", "filterEnvAmt", "drive", "glide", "keyTrack", "subLevel"],
    values: { mono: 1, glide: 0.03, osc1Wave: 0, osc2Wave: 1, oscMix: 0.2, osc2Detune: 0, cutoff: 900, resonance: 0.7, filterEnvAmt: 0.5, filterDecay: 0.2, filterSustain: 0, keyTrack: 0.5, attack: 0.004, decay: 0.3, sustain: 1, release: 0.12, drive: 0.1, reverbMix: 0, modTarget: 0, lfoRate: 5 },
  },
  {
    name: "Funk Bass",
    category: "Bass",
    color: [127, 50, 50],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc1Wave", "subLevel", "drive", "glide"],
    values: { mono: 1, glide: 0.015, osc1Wave: 3, oscMix: 0, subLevel: 0.35, cutoff: 280, resonance: 7, filterEnvAmt: 3.2, filterDecay: 0.12, filterSustain: 0.05, keyTrack: 0.5, attack: 0.002, decay: 0.35, sustain: 0.5, release: 0.07, velocity: 0.8, drive: 0.2, reverbMix: 0, modTarget: 1, volume: 0.58 },
  },
  {
    name: "Fifth Lead",
    category: "Lead",
    color: [127, 90, 30],
    knobs: ["cutoff", "resonance", "osc2Semi", "glide", "filterEnvAmt", "lfoRate", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.09, osc1Wave: 2, osc2Wave: 2, osc2Semi: 7, osc2Detune: 4, oscMix: 0.45, cutoff: 1500, resonance: 3, filterEnvAmt: 2, filterAttack: 0.02, filterDecay: 0.6, filterSustain: 0.4, keyTrack: 0.6, attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.25, modTarget: 0, lfoRate: 5.5, delayMix: 0.3, delayDiv: 4, delayFeedback: 0.4, reverbMix: 0.25, drive: 0.2 },
  },
  {
    name: "Chip Lead",
    category: "Lead",
    color: [80, 127, 0],
    knobs: ["osc1Wave", "osc2Semi", "oscMix", "lfoRate", "lfoDepth", "glide", "delayMix", "delayDiv"],
    values: { mono: 1, glide: 0, osc1Wave: 3, osc2Wave: 3, osc2Semi: 12, osc2Detune: 0, oscMix: 0.25, cutoff: 18000, resonance: 0.5, filterEnvAmt: 0, keyTrack: 0, lfoTarget: 0, lfoRate: 7, lfoDepth: 0.2, modTarget: 0, attack: 0.001, decay: 0.1, sustain: 0.8, release: 0.05, velocity: 0, delayMix: 0.25, delayDiv: 1, delayFeedback: 0.3, reverbMix: 0.1, volume: 0.75 },
  },
  {
    name: "Whistle",
    category: "Lead",
    color: [100, 127, 127],
    knobs: ["lfoRate", "lfoDepth", "noiseLevel", "glide", "cutoff", "osc2Semi", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.12, osc1Wave: 0, osc2Wave: 0, osc2Semi: 12, oscMix: 0.08, noiseLevel: 0.06, cutoff: 6000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, lfoTarget: 0, lfoRate: 5.2, lfoDepth: 0.35, modTarget: 0, attack: 0.08, decay: 0.3, sustain: 0.9, release: 0.3, velocity: 0.5, delayMix: 0.2, delayDiv: 3, reverbMix: 0.45, reverbSize: 3.5 },
  },
  {
    name: "Dark Pad",
    category: "Pad",
    color: [30, 20, 100],
    knobs: ["cutoff", "resonance", "lfoRate", "lfoDepth", "osc2Detune", "subLevel", "reverbMix", "reverbSize"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Semi: -12, osc2Detune: 10, unison: 3, oscMix: 0.4, subLevel: 0.2, cutoff: 480, resonance: 2.5, filterEnvAmt: 0.6, filterAttack: 2, filterDecay: 3, filterSustain: 0.6, keyTrack: 0.2, lfoTarget: 1, lfoRate: 0.12, lfoDepth: 0.35, modTarget: 1, attack: 1.8, decay: 2, sustain: 0.9, release: 3.5, chorus: 0.5, reverbMix: 0.55, reverbSize: 6, velocity: 0.2 },
  },
  {
    name: "Sweep Pad",
    category: "Pad",
    color: [127, 0, 127],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "filterDecay", "osc2Detune", "chorus", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 12, unison: 3, cutoff: 180, resonance: 6, filterEnvAmt: 4.5, filterAttack: 2.5, filterDecay: 3, filterSustain: 0.3, keyTrack: 0.4, attack: 0.6, decay: 2, sustain: 0.9, release: 2.5, chorus: 0.6, reverbMix: 0.45, reverbSize: 5, delayMix: 0.15, delayDiv: 4, velocity: 0.3 },
  },
  {
    name: "E-Piano",
    category: "Keys",
    color: [127, 60, 20],
    knobs: ["osc2Semi", "oscMix", "cutoff", "filterEnvAmt", "lfoRate", "lfoDepth", "chorus", "reverbMix"],
    values: { osc1Wave: 0, osc2Wave: 1, osc2Semi: 12, osc2Detune: 3, oscMix: 0.3, cutoff: 2200, resonance: 0.7, filterEnvAmt: 1.5, filterDecay: 0.5, filterSustain: 0.2, keyTrack: 0.8, attack: 0.002, decay: 1.6, sustain: 0.25, release: 0.5, velocity: 0.9, lfoTarget: 2, lfoWave: 0, lfoRate: 4.5, lfoDepth: 0.25, modTarget: 0, chorus: 0.45, reverbMix: 0.2, volume: 0.85 },
  },
  {
    name: "Mallets",
    category: "Keys",
    color: [127, 127, 40],
    knobs: ["osc2Semi", "oscMix", "cutoff", "filterDecay", "osc1Wave", "delayMix", "reverbMix", "reverbSize"],
    values: { osc1Wave: 1, osc2Wave: 0, osc2Semi: 24, osc2Detune: 2, oscMix: 0.35, cutoff: 3500, resonance: 1, filterEnvAmt: 1.5, filterDecay: 0.3, filterSustain: 0, keyTrack: 0.8, attack: 0.001, decay: 0.7, sustain: 0, release: 0.7, velocity: 0.9, delayMix: 0.15, delayDiv: 2, reverbMix: 0.35, reverbSize: 3, volume: 0.85 },
  },
  {
    name: "Synth Brass",
    category: "Brass",
    color: [127, 100, 60],
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "osc2Detune", "unison", "chorus", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 14, unison: 2, cutoff: 450, resonance: 1.2, filterEnvAmt: 3.5, filterAttack: 0.18, filterDecay: 0.8, filterSustain: 0.55, keyTrack: 0.5, attack: 0.08, decay: 0.6, sustain: 0.85, release: 0.4, velocity: 0.6, chorus: 0.4, reverbMix: 0.3, modTarget: 0, lfoRate: 5 },
  },
  {
    name: "Ocean",
    category: "FX",
    color: [0, 60, 127],
    knobs: ["cutoff", "resonance", "lfoRate", "lfoDepth", "noiseLevel", "filterMorph", "reverbMix", "reverbSize"],
    values: { osc1Wave: 0, oscMix: 0, noiseLevel: 1, cutoff: 700, resonance: 1.5, filterEnvAmt: 0, keyTrack: 0.5, lfoTarget: 1, lfoRate: 0.08, lfoDepth: 0.8, attack: 2, decay: 1, sustain: 1, release: 4, reverbMix: 0.5, reverbSize: 6, chorus: 0.4, velocity: 0, volume: 0.65 },
  },
  {
    name: "Sci-Fi Drone",
    category: "FX",
    color: [0, 127, 90],
    knobs: ["cutoff", "resonance", "osc2Semi", "osc2Detune", "lfoRate", "lfoDepth", "drive", "reverbSize"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Semi: -5, osc2Detune: 30, unison: 3, subLevel: 0.3, filterMorph: 0.5, cutoff: 600, resonance: 8, filterEnvAmt: 0, keyTrack: 0.6, lfoTarget: 1, lfoRate: 0.3, lfoDepth: 0.5, modTarget: 0, attack: 1.5, decay: 1, sustain: 1, release: 4, drive: 0.5, chorus: 0.3, delayMix: 0.25, delayDiv: 5, delayFeedback: 0.55, reverbMix: 0.55, reverbSize: 7, volume: 0.85 },
  },
  {
    name: "Sync Lead",
    category: "Lead",
    color: [127, 30, 0],
    knobs: ["pitchEnvAmt", "pitchEnvDecay", "osc2Semi", "oscMix", "cutoff", "resonance", "delayMix", "glide"],
    values: { mono: 1, glide: 0.05, osc1Wave: 2, osc2Wave: 2, oscSync: 1, osc2Semi: 7, osc2Detune: 0, oscMix: 0.75, pitchEnvAmt: 24, pitchEnvDecay: 0.7, pitchEnvTarget: 1, cutoff: 5000, resonance: 1.5, filterEnvAmt: 0.5, filterDecay: 0.4, filterSustain: 0.6, keyTrack: 0.5, attack: 0.003, decay: 0.3, sustain: 0.9, release: 0.2, lfoRate: 5.5, modTarget: 0, drive: 0.2, delayMix: 0.25, delayDiv: 4, delayFeedback: 0.35, reverbMix: 0.15, volume: 0.6 },
  },
  {
    name: "FM Bell",
    category: "Keys",
    color: [90, 127, 127],
    knobs: ["fmAmount", "osc2Semi", "cutoff", "filterEnvAmt", "filterDecay", "decay", "reverbMix", "reverbSize"],
    values: { osc1Wave: 0, osc2Wave: 0, osc2Semi: 22, osc2Detune: 0, oscMix: 0, fmAmount: 0.45, cutoff: 900, resonance: 0.7, filterEnvAmt: 4, filterAttack: 0.001, filterDecay: 1.4, filterSustain: 0.1, filterRelease: 1.5, keyTrack: 1, attack: 0.001, decay: 2.5, sustain: 0, release: 2, velocity: 0.8, chorus: 0.2, reverbMix: 0.4, reverbSize: 4, volume: 0.8 },
  },
  {
    name: "PWM Strings",
    category: "Pad",
    color: [127, 70, 110],
    knobs: ["pulseWidth", "lfo2Rate", "lfo2Depth", "cutoff", "osc2Detune", "chorus", "attack", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 3, osc2Detune: 9, pulseWidth: 0.3, unison: 2, cutoff: 2600, resonance: 0.8, filterEnvAmt: 0.5, filterAttack: 0.5, filterDecay: 1, filterSustain: 0.7, keyTrack: 0.5, lfo2Target: 3, lfo2Wave: 0, lfo2Rate: 0.35, lfo2Depth: 0.45, lfoRate: 5, modTarget: 0, attack: 0.45, decay: 1, sustain: 0.9, release: 1.3, velocity: 0.3, chorus: 0.5, reverbMix: 0.4, reverbSize: 4, volume: 0.65 },
  },
  {
    name: "Pulse Bass",
    category: "Bass",
    color: [40, 127, 40],
    knobs: ["pulseWidth", "cutoff", "resonance", "filterEnvAmt", "filterDecay", "subLevel", "lfoDepth", "glide"],
    values: { mono: 1, glide: 0.03, osc1Wave: 3, oscMix: 0, pulseWidth: 0.15, subLevel: 0.5, cutoff: 350, resonance: 3, filterEnvAmt: 2.5, filterDecay: 0.22, filterSustain: 0.15, keyTrack: 0.4, lfoTarget: 3, lfoWave: 1, lfoRate: 0.6, lfoDepth: 0, modTarget: 3, attack: 0.002, decay: 0.3, sustain: 0.8, release: 0.08, drive: 0.25, reverbMix: 0 },
  },
  {
    name: "Laser Zap",
    category: "FX",
    color: [127, 0, 60],
    knobs: ["pitchEnvAmt", "pitchEnvDecay", "osc1Wave", "cutoff", "resonance", "decay", "delayMix", "delayFeedback"],
    values: { osc1Wave: 3, osc2Wave: 2, osc2Semi: 12, oscMix: 0.3, pulseWidth: 0.25, pitchEnvAmt: 40, pitchEnvDecay: 0.3, cutoff: 6000, resonance: 4, filterEnvAmt: 0, keyTrack: 0.5, attack: 0.001, decay: 0.35, sustain: 0, release: 0.2, velocity: 0.5, delayMix: 0.3, delayDiv: 2, delayFeedback: 0.5, reverbMix: 0.15, volume: 0.6 },
  },
  {
    name: "Synth Toms",
    category: "FX",
    color: [127, 90, 0],
    knobs: ["pitchEnvAmt", "pitchEnvDecay", "decay", "noiseLevel", "cutoff", "drive", "osc1Wave", "reverbMix"],
    values: { osc1Wave: 0, oscMix: 0, noiseLevel: 0.12, pitchEnvAmt: 14, pitchEnvDecay: 0.18, cutoff: 3000, resonance: 0.7, filterEnvAmt: 1.5, filterDecay: 0.08, filterSustain: 0, keyTrack: 0.5, attack: 0.001, decay: 0.45, sustain: 0, release: 0.4, velocity: 0.9, drive: 0.3, reverbMix: 0.2, reverbSize: 1.5, volume: 0.9 },
  },
  {
    name: "Vowel Lead",
    category: "Lead",
    color: [127, 50, 90],
    knobs: ["wtPos", "lfo2Rate", "lfo2Depth", "cutoff", "resonance", "glide", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.06, osc1Wave: 4, wtTable: 5, wtPos: 0.5, osc2Wave: 2, osc2Semi: -12, osc2Detune: 4, oscMix: 0.15, lfo2Target: 4, lfo2Wave: 1, lfo2Rate: 0.6, lfo2Depth: 0.9, cutoff: 5000, resonance: 1, filterEnvAmt: 0.5, filterDecay: 0.4, filterSustain: 0.7, keyTrack: 0.5, attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.25, lfoRate: 5.5, modTarget: 0, delayMix: 0.25, delayDiv: 4, reverbMix: 0.2, volume: 0.7 },
  },
  {
    name: "Scan Pad",
    category: "Pad",
    color: [60, 90, 127],
    knobs: ["wtPos", "wtTable", "lfo2Rate", "lfo2Depth", "cutoff", "osc2Detune", "chorus", "reverbMix"],
    values: { osc1Wave: 4, osc2Wave: 4, wtTable: 4, wtPos: 0.45, osc2Detune: 10, unison: 3, lfo2Target: 4, lfo2Wave: 0, lfo2Rate: 0.12, lfo2Depth: 0.9, cutoff: 6000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 0.3, attack: 0.8, decay: 1.5, sustain: 0.9, release: 2.5, velocity: 0.3, chorus: 0.5, reverbMix: 0.5, reverbSize: 5, volume: 1 },
  },
  {
    name: "Fold Bass",
    category: "Bass",
    color: [127, 110, 0],
    knobs: ["wtPos", "cutoff", "resonance", "filterEnvAmt", "filterDecay", "subLevel", "drive", "glide"],
    values: { mono: 1, glide: 0.02, osc1Wave: 4, wtTable: 3, wtPos: 0.25, oscMix: 0, subLevel: 0.5, cutoff: 900, resonance: 1.5, filterEnvAmt: 2, filterDecay: 0.25, filterSustain: 0.3, keyTrack: 0.4, modTarget: 4, attack: 0.002, decay: 0.3, sustain: 0.85, release: 0.1, drive: 0.15, reverbMix: 0 },
  },
  {
    name: "Digital Keys",
    category: "Keys",
    color: [0, 127, 127],
    knobs: ["wtPos", "lfo2Depth", "lfo2Sync", "cutoff", "filterDecay", "decay", "delayMix", "reverbMix"],
    values: { osc1Wave: 4, wtTable: 7, wtPos: 0.4, osc2Wave: 0, osc2Semi: 12, oscMix: 0.2, lfo2Target: 4, lfo2Wave: 4, lfo2Sync: 5, lfo2Depth: 0.5, cutoff: 1400, resonance: 1.2, filterEnvAmt: 3, filterDecay: 0.35, filterSustain: 0.2, keyTrack: 0.8, attack: 0.002, decay: 0.9, sustain: 0.3, release: 0.5, velocity: 0.8, chorus: 0.3, delayMix: 0.25, delayDiv: 2, delayFeedback: 0.4, reverbMix: 0.25, volume: 1 },
  },
  {
    name: "Table Pluck",
    category: "Keys",
    color: [110, 127, 30],
    knobs: ["mod1Amt", "modEnvDecay", "wtPos", "wtTable", "mod2Amt", "cutoff", "delayMix", "reverbMix"],
    values: { osc1Wave: 4, wtTable: 4, wtPos: 0.05, osc2Wave: 0, osc2Semi: -12, oscMix: 0.2, unison: 2, osc2Detune: 8, mod1Src: 6, mod1Dst: 5, mod1Amt: 0.75, modEnvAttack: 0.001, modEnvDecay: 0.45, modEnvSustain: 0, modEnvRelease: 0.3, mod2Src: 7, mod2Dst: 2, mod2Amt: 0.3, cutoff: 6000, resonance: 0.8, filterEnvAmt: 0, keyTrack: 0.3, attack: 0.001, decay: 0.9, sustain: 0.15, release: 0.4, velocity: 0.7, delayMix: 0.25, delayDiv: 2, delayFeedback: 0.35, reverbMix: 0.3, volume: 1 },
  },
  {
    name: "Velocity Bass",
    category: "Bass",
    color: [127, 40, 40],
    knobs: ["mod1Amt", "mod2Amt", "cutoff", "resonance", "filterEnvAmt", "filterDecay", "subLevel", "glide"],
    values: { mono: 1, glide: 0.02, osc1Wave: 2, osc2Wave: 0, osc2Detune: 0, oscMix: 0, mod1Src: 7, mod1Dst: 2, mod1Amt: 0.5, mod2Src: 7, mod2Dst: 7, mod2Amt: 0.45, subLevel: 0.4, cutoff: 300, resonance: 2, filterEnvAmt: 2, filterDecay: 0.25, filterSustain: 0.2, keyTrack: 0.4, attack: 0.002, decay: 0.35, sustain: 0.8, release: 0.08, velocity: 0.5, drive: 0.2, reverbMix: 0 },
  },
  {
    name: "Drift Pad",
    category: "Pad",
    color: [80, 60, 127],
    knobs: ["mod1Amt", "mod2Amt", "mod3Amt", "mod4Amt", "wtPos", "lfo2Depth", "chorus", "reverbMix"],
    values: { osc1Wave: 4, wtTable: 0, wtPos: 0.4, osc2Wave: 2, osc2Detune: 10, oscMix: 0.4, unison: 2, mod1Src: 10, mod1Dst: 0, mod1Amt: 0.006, mod2Src: 10, mod2Dst: 2, mod2Amt: 0.2, mod3Src: 10, mod3Dst: 5, mod3Amt: 0.3, mod4Src: 8, mod4Dst: 2, mod4Amt: 0.3, lfo2Target: 4, lfo2Wave: 0, lfo2Rate: 0.08, lfo2Depth: 0.4, cutoff: 1800, resonance: 0.9, filterEnvAmt: 0.6, filterAttack: 1, filterDecay: 2, filterSustain: 0.6, keyTrack: 0.2, attack: 1, decay: 1.5, sustain: 0.9, release: 3, velocity: 0.3, chorus: 0.4, reverbMix: 0.55, reverbSize: 6, volume: 0.6 },
  },

  // ---- Test: one feature each (slice 11: effects and the shared mod matrix destinations).
  {
    // Short notes: the echoes bounce left, right, left. Knob 1 switches back to Stereo to compare.
    name: "Ping-pong Pluck",
    category: "Test",
    color: [127, 60, 0],
    knobs: ["delayMode", "delayMix", "delayFeedback", "delayDiv", "cutoff", "filterEnvAmt", "filterDecay", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 1, osc2Semi: 12, oscMix: 0.3, osc2Detune: 3, cutoff: 600, resonance: 3, filterEnvAmt: 4, filterDecay: 0.18, filterSustain: 0, keyTrack: 0.7, attack: 0.001, decay: 0.4, sustain: 0, release: 0.3, delayMode: 1, delayMix: 0.5, delayDiv: 3, delayFeedback: 0.55, reverbMix: 0.1, reverbDamping: 0.5, velocity: 0.6 },
  },
  {
    // Short chords into a long room; turn knob 1 (Damping) from 0 to 100%: the tail goes from hiss to a soft glow.
    name: "Damping Room",
    category: "Test",
    color: [60, 0, 127],
    knobs: ["reverbDamping", "reverbSize", "reverbMix", "cutoff", "chorus", "release", "osc2Detune", "volume"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 10, cutoff: 5000, resonance: 0.7, filterEnvAmt: 0, attack: 0.002, decay: 0.25, sustain: 0, release: 0.15, reverbMix: 0.7, reverbSize: 7, reverbDamping: 0, velocity: 0.4 },
  },
  {
    // Hold a chord: the chorus comes and goes with a slow LFO 2 (knob 1: how much, knob 2: how fast). Knob 3 is the chorus on its own.
    name: "Chorus Tide",
    category: "Test",
    color: [0, 90, 127],
    knobs: ["mod1Amt", "lfo2Rate", "chorus", "cutoff", "unison", "stereoWidth", "reverbMix", "osc2Detune"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 4, cutoff: 2600, resonance: 0.7, filterEnvAmt: 0, attack: 0.3, decay: 1, sustain: 1, release: 1.2, chorus: 0.4, reverbMix: 0.25, lfo2Rate: 0.15, lfo2Depth: 0, mod1Src: 2, mod1Dst: 14, mod1Amt: 0.6, velocity: 0.3 },
  },
  {
    // Play steady notes with the drum loop running: a square LFO 2, synced to 1 bar, throws the delay on for half of each bar.
    name: "Delay Throw",
    category: "Test",
    color: [127, 127, 0],
    knobs: ["mod1Amt", "lfo2Sync", "delayMix", "delayFeedback", "delayDiv", "delayMode", "cutoff", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 2, oscMix: 0.4, osc2Detune: 6, cutoff: 1400, resonance: 2, filterEnvAmt: 2, filterDecay: 0.25, filterSustain: 0.2, attack: 0.002, decay: 0.3, sustain: 0.3, release: 0.2, delayMix: 0.3, delayDiv: 2, delayFeedback: 0.5, delayMode: 1, reverbMix: 0.1, lfo2Wave: 3, lfo2Sync: 2, lfo2Depth: 0, mod1Src: 2, mod1Dst: 15, mod1Amt: 0.6 },
  },
  {
    // Play a short, soft phrase and leave a gap: the reverb follows a slow LFO 2, so some notes ring out and some stay dry.
    name: "Reverb Breath",
    category: "Test",
    color: [0, 127, 90],
    knobs: ["mod1Amt", "lfo2Rate", "reverbMix", "reverbSize", "reverbDamping", "cutoff", "filterEnvAmt", "release"],
    values: { osc1Wave: 1, osc2Wave: 0, osc2Semi: 12, oscMix: 0.3, osc2Detune: 0, cutoff: 2500, resonance: 1, filterEnvAmt: 2, filterDecay: 0.3, filterSustain: 0, attack: 0.002, decay: 0.6, sustain: 0, release: 0.4, reverbMix: 0.4, reverbSize: 5, reverbDamping: 0.4, lfo2Rate: 0.12, lfo2Depth: 0, mod1Src: 2, mod1Dst: 16, mod1Amt: 0.5, velocity: 0.5 },
  },
  {
    // Hold a chord: only each note's start goes into the delay (the Mod Envelope opens it for 300 ms), so the echoes stay clean.
    name: "Echo Starts",
    category: "Test",
    color: [127, 0, 127],
    knobs: ["mod1Amt", "modEnvDecay", "delayFeedback", "delayDiv", "delayMode", "cutoff", "release", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 3, oscMix: 0.4, osc2Detune: 8, cutoff: 1800, resonance: 1.5, filterEnvAmt: 2, filterDecay: 0.3, filterSustain: 0.4, attack: 0.003, decay: 0.4, sustain: 0.7, release: 0.3, delayMix: 0, delayDiv: 1, delayFeedback: 0.55, delayMode: 1, reverbMix: 0.15, modEnvAttack: 0.001, modEnvDecay: 0.3, modEnvSustain: 0, mod1Src: 6, mod1Dst: 15, mod1Amt: 1 },
  },
  {
    // Hold a note and push the mod strip up: the vibrato gets faster (strip -> LFO 1 rate, up to 8x). The strip's usual depth goes nowhere here.
    name: "Strip Vibrato",
    category: "Test",
    color: [127, 90, 90],
    knobs: ["mod1Amt", "lfoRate", "lfoDepth", "lfoWave", "cutoff", "glide", "mono", "reverbMix"],
    values: { mono: 1, glide: 0.05, osc1Wave: 2, osc2Wave: 3, oscMix: 0.3, osc2Detune: 5, cutoff: 2200, resonance: 2, filterEnvAmt: 1, filterDecay: 0.4, filterSustain: 0.5, attack: 0.02, decay: 0.3, sustain: 0.9, release: 0.3, lfoTarget: 0, lfoRate: 2, lfoDepth: 0.35, modTarget: 4, mod1Src: 9, mod1Dst: 17, mod1Amt: 1, reverbMix: 0.2, delayMix: 0.15, delayDiv: 3 },
  },
  {
    // Play soft, then hard: harder notes get more vibrato (velocity -> LFO 1 depth). Velocity is at 0 so the level stays the same.
    name: "Velocity Vibrato",
    category: "Test",
    color: [90, 127, 0],
    knobs: ["mod1Amt", "lfoRate", "lfoDepth", "cutoff", "attack", "release", "reverbMix", "chorus"],
    values: { osc1Wave: 3, osc2Wave: 1, osc2Semi: 12, oscMix: 0.25, osc2Detune: 2, pulseWidth: 0.35, cutoff: 2800, resonance: 1, filterEnvAmt: 0.5, attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.5, lfoTarget: 0, lfoRate: 5.5, lfoDepth: 0, modTarget: 4, mod1Src: 7, mod1Dst: 18, mod1Amt: 0.7, velocity: 0, reverbMix: 0.25 },
  },
];

/** Category order in the preset list and dropdown. */
const CATEGORIES: Preset["category"][] = ["Lead", "Bass", "Pad", "Brass", "Keys", "FX", "Test"];

/** Grouped by category, so the numbers count up within each group (and the encoder browses group by group). */
export const FACTORY_PRESETS: Preset[] = CATEGORIES.flatMap((c) => ALL_PRESETS.filter((p) => p.category === c));

/** What pad bank B loads: a mix across categories, by name. */
export const PAD_PRESETS: number[] = ["First Saw", "Round Bass", "Acid Line", "Wobble", "Warm Pad", "Glass Strings", "Brass Stab", "Pluck"].map(
  (name) => FACTORY_PRESETS.findIndex((p) => p.name === name),
);

export function presetValues(p: Preset): ParamValues {
  // Presets made before the filter envelope had its own release used the amp's release for it.
  const filterRelease = p.values.release ?? defaultValues().release;
  return { ...defaultValues(), filterRelease, ...p.values };
}

const USER_KEY = "minilab3.userPresets";

export function loadUserPresets(): Preset[] {
  try {
    return (JSON.parse(localStorage.getItem(USER_KEY) ?? "[]") as Preset[]).map(migrate);
  } catch {
    return [];
  }
}

/** Bring a preset saved by an older version up to date: the filter type became Filter Morph. */
export function migrate(p: Preset): Preset {
  const values: Record<string, number> = { ...p.values };
  if ("filterType" in values) {
    values.filterMorph ??= MORPH_OF_OLD_TYPE[values.filterType] ?? 0;
    delete values.filterType;
  }
  const knobs = p.knobs.map((k) => ((k as string) === "filterType" ? "filterMorph" : k)) as Preset["knobs"];
  return { ...p, values: values as Preset["values"], knobs };
}

export function saveUserPresets(presets: Preset[]) {
  localStorage.setItem(USER_KEY, JSON.stringify(presets));
}
