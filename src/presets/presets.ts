import { defaultValues, MORPH_OF_OLD_TYPE, type ParamId, type ParamValues } from "../audio/params";

export type Rgb = [number, number, number]; // 0-127, the MiniLab's LED range

export interface Preset {
  /** Stays the same for good (a name can change): factory presets "factory:<name>", your own "user:<random>". */
  id: string;
  name: string;
  /**
   * "Classics": recreations of famous synth sounds, made with this synth's own parts.
   * "Test": small presets that each show one feature, for trying it out quickly.
   */
  category: "Bass" | "Lead" | "Pad" | "Keys" | "Brass" | "FX" | "Classics" | "Test";
  /** Pad LED and UI accent colour. */
  color: Rgb;
  /** What knobs 1-8 control. Faders are always the amp envelope. */
  knobs: [ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId, ParamId];
  values: Partial<ParamValues>;
  /** Words that describe the sound (dark, plucky, wide…), for the preset browser's search. */
  tags?: string[];
  /** Classics: the original instrument and a record to hear it on, and how to play it. Searchable too. */
  about?: string;
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
// Effects (fxSlot1-8 hold them in the order they run): 0 distortion, 1 compressor, 2 EQ, 3 phaser, 4 flanger, 5 chorus, 6 delay, 7 reverb.
// Distortion type: 0 soft, 1 hard, 2 fold, 3 crush. Filter model: 0 clean (state-variable), 1 ladder.
// Mod matrix source 11 is LFO 3; destination 21 is LFO 3 rate.

/** Presets in the order they were added; FACTORY_PRESETS below groups them by category. */
const ALL_PRESETS: Omit<Preset, "id">[] = [
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
  // The effects of slice 22: knob 1 switches the effect on and off, to compare; the next knobs are its settings.
  {
    // Hold a chord: the phaser's notches swirl slowly through it.
    name: "Phaser Keys",
    category: "Test",
    color: [0, 127, 90],
    knobs: ["phaserOn", "phaserRate", "phaserDepth", "phaserFeedback", "phaserMix", "cutoff", "decay", "reverbMix"],
    values: { osc1Wave: 1, osc2Wave: 0, osc2Semi: 12, oscMix: 0.3, osc2Detune: 2, cutoff: 3000, resonance: 0.8, filterEnvAmt: 1, filterDecay: 0.6, attack: 0.002, decay: 1.2, sustain: 0.5, release: 0.6, velocity: 0.5, phaserOn: 1, phaserRate: 0.35, phaserDepth: 0.8, phaserFeedback: 0.6, phaserMix: 0.5, reverbMix: 0.2 },
  },
  {
    // Long notes on a bright, slightly noisy sound: the jet-plane swoosh.
    name: "Jet Flanger",
    category: "Test",
    color: [127, 0, 90],
    knobs: ["flangerOn", "flangerRate", "flangerDepth", "flangerFeedback", "flangerMix", "noiseLevel", "cutoff", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 5, noiseLevel: 0.15, cutoff: 9000, resonance: 0.7, filterEnvAmt: 0, attack: 0.01, decay: 1, sustain: 0.9, release: 0.8, flangerOn: 1, flangerRate: 0.12, flangerDepth: 0.9, flangerFeedback: 0.8, flangerMix: 0.5, reverbMix: 0.15 },
  },
  {
    // A hard-clipped mono lead: single notes sing, chords turn into a rough wall.
    name: "Fuzz Lead",
    category: "Test",
    color: [127, 30, 30],
    knobs: ["distortionOn", "distDrive", "distType", "distTone", "distMix", "cutoff", "glide", "delayMix"],
    values: { mono: 1, glide: 0.05, osc1Wave: 2, osc2Wave: 3, oscMix: 0.4, osc2Detune: 6, cutoff: 2500, resonance: 1.5, filterEnvAmt: 1, filterDecay: 0.4, attack: 0.005, decay: 0.5, sustain: 0.8, release: 0.25, lfoTarget: 0, lfoDepth: 0, distortionOn: 1, distType: 1, distDrive: 0.7, distTone: 4000, distMix: 1, delayMix: 0.2, delayDiv: 4, reverbMix: 0.15, volume: 0.6 },
  },
  {
    // A sine pluck, folded: turn Drive up and it rings brighter and more metallic; velocity matters.
    name: "Fold Pluck",
    category: "Test",
    color: [127, 80, 0],
    knobs: ["distortionOn", "distDrive", "distType", "distTone", "distMix", "decay", "velocity", "reverbMix"],
    values: { osc1Wave: 0, osc2Wave: 0, oscMix: 0, cutoff: 18000, resonance: 0.5, filterEnvAmt: 0, attack: 0.002, decay: 0.6, sustain: 0, release: 0.4, velocity: 0.8, distortionOn: 1, distType: 2, distDrive: 0.55, distTone: 9000, distMix: 1, reverbMix: 0.25 },
  },
  {
    // Square keys through the bit-crusher: fewer levels and a lower sample rate, like an old sampler or game.
    name: "Crushed Keys",
    category: "Test",
    color: [60, 127, 0],
    knobs: ["distortionOn", "distDrive", "distMix", "distTone", "cutoff", "decay", "release", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 3, osc2Semi: 12, oscMix: 0.3, osc2Detune: 3, cutoff: 6000, resonance: 0.7, filterEnvAmt: 0.5, attack: 0.002, decay: 0.8, sustain: 0.4, release: 0.3, distortionOn: 1, distType: 3, distDrive: 0.75, distTone: 18000, distMix: 1, reverbMix: 0.1 },
  },
  {
    // Plucks with long, quiet tails: the compressor brings the tails up. Turn Attack up for snappier starts.
    name: "Squash Pluck",
    category: "Test",
    color: [127, 90, 60],
    knobs: ["compressorOn", "compThreshold", "compRatio", "compAttack", "compRelease", "decay", "cutoff", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 3, oscMix: 0.4, osc2Detune: 5, cutoff: 900, resonance: 2, filterEnvAmt: 3.5, filterDecay: 0.3, filterSustain: 0, attack: 0.001, decay: 1.5, sustain: 0, release: 0.4, compressorOn: 1, compThreshold: -35, compRatio: 10, compAttack: 0.005, compRelease: 0.3, reverbMix: 0.1, volume: 0.6 },
  },
  {
    // The lows and highs cut, a narrow band boosted: an old telephone. Sweep knob 2 (Mid Freq) for a radio.
    name: "Telephone EQ",
    category: "Test",
    color: [90, 90, 127],
    knobs: ["eqOn", "eqMidFreq", "eqMid", "eqLow", "eqHigh", "cutoff", "osc2Detune", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 8, cutoff: 6000, resonance: 0.7, filterEnvAmt: 0, attack: 0.01, decay: 0.5, sustain: 0.8, release: 0.3, eqOn: 1, eqLow: -15, eqMid: 10, eqMidFreq: 1200, eqHigh: -15, reverbMix: 0.1 },
  },
  {
    // The order matters: here the reverb comes first and the distortion after it, so the whole tail is
    // distorted and swells up. Drag Distortion after Reverb in the Synth view to hear the usual order.
    name: "Fuzzed Reverb",
    category: "Test",
    color: [127, 0, 30],
    knobs: ["distortionOn", "distDrive", "reverbMix", "reverbSize", "distType", "distTone", "decay", "volume"],
    values: { osc1Wave: 2, osc2Wave: 3, oscMix: 0.4, osc2Detune: 6, cutoff: 2200, resonance: 1, filterEnvAmt: 2, filterDecay: 0.2, filterSustain: 0, attack: 0.002, decay: 0.3, sustain: 0, release: 0.2, reverbMix: 0.6, reverbSize: 4, reverbDamping: 0.5, distortionOn: 1, distType: 0, distDrive: 0.6, distTone: 3500, fxSlot1: 7, fxSlot2: 0, fxSlot3: 1, fxSlot4: 2, fxSlot5: 3, fxSlot6: 4, fxSlot7: 5, fxSlot8: 6, volume: 0.6 },
  },
  // ---------------------------------------------------------------- Classics
  // Famous sounds rebuilt from what this synth has. Each `about` names the original instrument and a
  // record to compare with; they are approximations by design, not copies of the originals.
  {
    name: "Stadium Brass",
    category: "Classics",
    color: [127, 70, 0],
    about: "Oberheim OB-Xa brass: Van Halen, \"Jump\" (1983). Two detuned saws per note and a filter that opens fast and settles. Play big chords.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "osc2Detune", "unison", "chorus", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 9, oscMix: 0.5, unison: 2, stereoWidth: 0.7, cutoff: 700, resonance: 1.3, filterEnvAmt: 2.8, filterAttack: 0.06, filterDecay: 0.9, filterSustain: 0.55, filterRelease: 0.4, keyTrack: 0.5, attack: 0.012, decay: 0.5, sustain: 0.9, release: 0.35, velocity: 0.4, chorus: 0.35, reverbMix: 0.22, reverbSize: 2.2, volume: 0.55 },
  },
  {
    name: "Acid 303",
    category: "Classics",
    color: [127, 120, 0],
    about: "Roland TB-303 bass line: Phuture, \"Acid Tracks\" (1987). Ladder filter, high resonance, short envelope. Play it from the step sequencer with slides; play harder for an accent-like squelch, and turn Cutoff and Resonance while it runs.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "drive", "glide", "osc1Wave", "delayMix"],
    values: { mono: 1, glide: 0.06, osc1Wave: 2, oscMix: 0, filterModel: 1, cutoff: 330, resonance: 8, filterEnvAmt: 3, filterDecay: 0.2, filterSustain: 0, filterRelease: 0.1, keyTrack: 0.5, attack: 0.002, decay: 0.3, sustain: 0.8, release: 0.04, velocity: 0.5, drive: 0.35, mod1Src: 7, mod1Dst: 2, mod1Amt: 0.2, delayMix: 0.15, delayDiv: 2, delayFeedback: 0.35, reverbMix: 0.05, volume: 0.55 },
  },
  {
    name: "Filthy Acid",
    category: "Classics",
    color: [127, 40, 0],
    about: "A TB-303 through distortion: Daft Punk, \"Da Funk\" (1995). The acid sound, overdriven into a growl. Play a slow, low riff and open the filter as it goes.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "distDrive", "distTone", "glide", "reverbMix"],
    values: { mono: 1, glide: 0.05, osc1Wave: 2, oscMix: 0, filterModel: 1, cutoff: 500, resonance: 7, filterEnvAmt: 2.5, filterDecay: 0.3, filterSustain: 0.1, keyTrack: 0.4, attack: 0.002, decay: 0.4, sustain: 0.8, release: 0.06, velocity: 0.4, drive: 0.4, distortionOn: 1, distType: 0, distDrive: 0.7, distTone: 4500, distMix: 1, reverbMix: 0.1, volume: 0.5 },
  },
  {
    name: "Prog Lead",
    category: "Classics",
    color: [0, 90, 127],
    about: "A Moog lead with long portamento: Emerson, Lake & Palmer, \"Lucky Man\" (1970), the solo at the end. Play slow, sliding single notes; the mod strip adds vibrato.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "glide", "osc2Detune", "drive", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.2, osc1Wave: 2, osc2Wave: 2, osc2Detune: 6, oscMix: 0.5, filterModel: 1, cutoff: 1100, resonance: 2.5, filterEnvAmt: 2, filterAttack: 0.02, filterDecay: 0.6, filterSustain: 0.5, keyTrack: 0.7, attack: 0.01, decay: 0.4, sustain: 0.85, release: 0.25, velocity: 0.3, drive: 0.3, modTarget: 0, lfoRate: 5.5, delayMix: 0.1, reverbMix: 0.25, volume: 0.6 },
  },
  {
    name: "Funk Moog Bass",
    category: "Classics",
    color: [127, 20, 60],
    about: "Minimoog bass: Parliament, \"Flash Light\" (1977), played by Bernie Worrell. A saw and a square an octave down, through a squelchy ladder filter. Play short, bouncy notes.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "osc2Semi", "drive", "glide", "subLevel"],
    values: { mono: 1, glide: 0.03, osc1Wave: 2, osc2Wave: 3, osc2Semi: -12, osc2Detune: 3, oscMix: 0.45, filterModel: 1, cutoff: 260, resonance: 4, filterEnvAmt: 3.2, filterDecay: 0.3, filterSustain: 0.25, keyTrack: 0.4, attack: 0.003, decay: 0.4, sustain: 0.8, release: 0.1, velocity: 0.5, drive: 0.35, reverbMix: 0.04, volume: 0.6 },
  },
  {
    name: "Sync Sweep",
    category: "Classics",
    color: [0, 127, 90],
    about: "Prophet-5 sync lead: The Cars, \"Let's Go\" (1979). Osc 2 is synced to Osc 1 and its pitch falls at the start of every note, which sweeps the tone. Play short riffs.",
    knobs: ["pitchEnvAmt", "pitchEnvDecay", "osc2Semi", "cutoff", "filterEnvAmt", "oscMix", "delayMix", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, oscSync: 1, osc2Semi: 5, osc2Detune: 0, oscMix: 0.85, pitchEnvAmt: 19, pitchEnvDecay: 0.5, pitchEnvTarget: 1, cutoff: 3500, resonance: 1.2, filterEnvAmt: 1.5, filterDecay: 0.4, filterSustain: 0.5, keyTrack: 0.5, attack: 0.004, decay: 0.4, sustain: 0.8, release: 0.25, velocity: 0.3, delayMix: 0.15, delayDiv: 3, reverbMix: 0.15, volume: 0.55 },
  },
  {
    name: "Hoover",
    category: "Classics",
    color: [110, 0, 127],
    about: "Roland Alpha Juno \"Hoover\": Joey Beltram, \"Mentasm\" (1991), and 90s rave. Detuned saw and pulse, wide unison, heavy chorus and a pitch that scoops up into each note. Play low chords and stabs.",
    knobs: ["pitchEnvAmt", "pitchEnvDecay", "osc2Detune", "lfo2Depth", "cutoff", "chorus", "glide", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Semi: -12, osc2Detune: 15, oscMix: 0.55, pulseWidth: 0.3, unison: 3, stereoWidth: 1, cutoff: 4000, resonance: 0.8, filterEnvAmt: 0.5, keyTrack: 0.5, pitchEnvAmt: -5, pitchEnvDecay: 0.35, lfo2Target: 3, lfo2Wave: 1, lfo2Rate: 2.5, lfo2Depth: 0.5, attack: 0.01, decay: 0.5, sustain: 0.9, release: 0.5, velocity: 0.3, chorus: 0.9, reverbMix: 0.2, volume: 0.5 },
  },
  {
    name: "Trance Supersaw",
    category: "Classics",
    color: [60, 30, 127],
    about: "Roland JP-8000's Super Saw, the sound of late-90s trance leads and chords. The original stacks 7 saws per note; this one has 6 (two oscillators of 3), spread wide. Play chords or a high lead.",
    knobs: ["osc2Detune", "cutoff", "stereoWidth", "unison", "delayMix", "reverbMix", "chorus", "release"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 22, oscMix: 0.5, unison: 3, stereoWidth: 1, cutoff: 7000, resonance: 0.8, filterEnvAmt: 0.5, filterDecay: 0.6, keyTrack: 0.3, attack: 0.005, decay: 0.6, sustain: 0.85, release: 0.45, velocity: 0.3, chorus: 0.25, delayMix: 0.2, delayDiv: 2, delayFeedback: 0.3, delayMode: 1, reverbMix: 0.35, reverbSize: 3, volume: 0.6 },
  },
  {
    name: "Juno Pad",
    category: "Classics",
    color: [0, 70, 127],
    about: "Roland Juno-60/106 pad: one oscillator's saw and moving pulse, a sub, and the famous Juno chorus; 80s pop and today's synthwave. Hold chords.",
    knobs: ["cutoff", "resonance", "pulseWidth", "lfo2Depth", "subLevel", "chorus", "attack", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Detune: 0, oscMix: 0.5, pulseWidth: 0.35, subLevel: 0.35, lfo2Target: 3, lfo2Wave: 1, lfo2Rate: 0.6, lfo2Depth: 0.35, cutoff: 1600, resonance: 1.5, filterEnvAmt: 1, filterAttack: 0.3, filterDecay: 1.5, filterSustain: 0.6, keyTrack: 0.5, attack: 0.35, decay: 1, sustain: 0.85, release: 1.2, velocity: 0.2, chorus: 0.85, reverbMix: 0.3, reverbSize: 3, volume: 0.65 },
  },
  {
    name: "Oxygene Strings",
    category: "Classics",
    color: [0, 110, 70],
    about: "A 70s string machine through a phaser: Jean-Michel Jarre, \"Oxygène (Part IV)\" (1976), an Eminent 310 organ's strings and a Small Stone phaser. Hold slow chords and let the phaser swirl.",
    knobs: ["phaserRate", "phaserDepth", "phaserFeedback", "chorus", "cutoff", "attack", "release", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Semi: 12, osc2Detune: 4, oscMix: 0.4, unison: 2, stereoWidth: 0.8, cutoff: 3500, resonance: 0.7, filterEnvAmt: 0, keyTrack: 0.6, attack: 0.3, decay: 1, sustain: 1, release: 1.3, velocity: 0.1, chorus: 1, phaserOn: 1, phaserRate: 0.12, phaserDepth: 0.8, phaserFeedback: 0.55, phaserMix: 0.5, fxSlot4: 5, fxSlot6: 3, reverbMix: 0.4, reverbSize: 4.5, volume: 0.55 },
  },
  {
    name: "Blade Brass",
    category: "Classics",
    color: [127, 50, 30],
    about: "Yamaha CS-80 brass: Vangelis, \"Blade Runner\" (1982). A slow, glowing swell in a huge hall. The CS-80 is played with pressure on each key; here the mod strip adds vibrato and harder notes are brighter.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "attack", "release", "reverbMix", "reverbSize"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Detune: 10, oscMix: 0.4, pulseWidth: 0.4, unison: 2, stereoWidth: 0.8, cutoff: 500, resonance: 2, filterEnvAmt: 3, filterAttack: 0.5, filterDecay: 2, filterSustain: 0.6, filterRelease: 1.5, keyTrack: 0.5, attack: 0.25, decay: 1.5, sustain: 0.9, release: 2.2, velocity: 0.5, modTarget: 0, lfoRate: 5.5, lfo3Rate: 0.3, lfo3Wave: 0, mod1Src: 7, mod1Dst: 2, mod1Amt: 0.25, mod2Src: 11, mod2Dst: 0, mod2Amt: 0.004, chorus: 0.4, reverbMix: 0.55, reverbSize: 6, reverbDamping: 0.5, volume: 0.55 },
  },
  {
    name: "Growl Sweep",
    category: "Classics",
    color: [90, 60, 0],
    about: "Oberheim OB-X growl: Rush, \"Tom Sawyer\" (1981). A resonant filter that sweeps up slowly and falls back on every note. Hold low notes; the clean filter here is the same kind as Oberheim's.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterAttack", "filterDecay", "osc2Detune", "drive", "glide"],
    values: { mono: 1, glide: 0.05, osc1Wave: 2, osc2Wave: 2, osc2Detune: 12, oscMix: 0.5, cutoff: 200, resonance: 6, filterEnvAmt: 4.5, filterAttack: 0.9, filterDecay: 1.2, filterSustain: 0.15, filterRelease: 0.8, keyTrack: 0.3, attack: 0.05, decay: 1, sustain: 1, release: 0.6, velocity: 0.2, drive: 0.2, reverbMix: 0.2, volume: 0.6 },
  },
  {
    name: "FM House Bass",
    category: "Classics",
    color: [0, 60, 110],
    about: "Yamaha TX81Z \"Lately Bass\", the FM bass of 90s house and R&B. A sine modulating a sine: each note starts bright and turns round. Play short, syncopated notes; harder is brighter.",
    knobs: ["fmAmount", "mod1Amt", "modEnvDecay", "mod2Amt", "decay", "release", "glide", "reverbMix"],
    values: { mono: 1, osc1Wave: 0, osc2Wave: 0, osc2Semi: 0, osc2Detune: 0, oscMix: 0, fmAmount: 0.15, cutoff: 8000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, attack: 0.001, decay: 0.8, sustain: 0.5, release: 0.12, velocity: 0.7, modEnvAttack: 0.001, modEnvDecay: 0.35, modEnvSustain: 0.1, modEnvRelease: 0.2, mod1Src: 6, mod1Dst: 7, mod1Amt: 0.6, mod2Src: 7, mod2Dst: 7, mod2Amt: 0.3, reverbMix: 0.05, volume: 0.9 },
  },
  {
    name: "FM Tine Piano",
    category: "Classics",
    color: [70, 90, 127],
    about: "Yamaha DX7 electric piano (\"E. Piano 1\"), all over 80s ballads. FM with a bright bark at the start that softens; harder notes bark more. The DX7 uses six operators; this is two, so it is the gist, not the exact tine.",
    knobs: ["fmAmount", "mod1Amt", "modEnvDecay", "mod2Amt", "decay", "chorus", "release", "reverbMix"],
    values: { osc1Wave: 0, osc2Wave: 0, osc2Semi: 0, osc2Detune: 0, oscMix: 0, fmAmount: 0.08, cutoff: 9000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, attack: 0.001, decay: 2.5, sustain: 0.15, release: 0.6, velocity: 0.85, modEnvAttack: 0.001, modEnvDecay: 0.25, modEnvSustain: 0.05, modEnvRelease: 0.3, mod1Src: 6, mod1Dst: 7, mod1Amt: 0.45, mod2Src: 7, mod2Dst: 7, mod2Amt: 0.4, chorus: 0.5, reverbMix: 0.25, volume: 0.75 },
  },
  {
    name: "Popcorn Pluck",
    category: "Classics",
    color: [127, 100, 40],
    about: "A Moog \"pock\": Hot Butter, \"Popcorn\" (1972). A square wave with a resonant filter blip that dies at once. Play the tune short and staccato.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "decay", "oscMix", "osc1Wave", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 3, osc2Semi: 12, osc2Detune: 0, oscMix: 0.3, cutoff: 900, resonance: 3, filterEnvAmt: 3.5, filterDecay: 0.12, filterSustain: 0, keyTrack: 0.7, attack: 0.001, decay: 0.18, sustain: 0, release: 0.08, velocity: 0.3, reverbMix: 0.12, volume: 0.75 },
  },
  {
    name: "Axel Lead",
    category: "Classics",
    color: [127, 0, 90],
    about: "Roland Jupiter-8 lead: Harold Faltermeyer, \"Axel F\" (1984). A bright square and saw with a quick snap of filter. Play the riff short and punchy.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "oscMix", "osc2Detune", "delayMix", "reverbMix"],
    values: { osc1Wave: 3, osc2Wave: 2, osc2Detune: 6, oscMix: 0.35, pulseWidth: 0.5, cutoff: 2200, resonance: 1.5, filterEnvAmt: 1.2, filterDecay: 0.25, filterSustain: 0.6, keyTrack: 0.6, attack: 0.003, decay: 0.2, sustain: 0.75, release: 0.15, velocity: 0.3, delayMix: 0.12, delayDiv: 1, reverbMix: 0.15, volume: 0.6 },
  },
  {
    name: "Monday Bass",
    category: "Classics",
    color: [40, 40, 127],
    about: "Moog Source bass: New Order, \"Blue Monday\" (1983). A short, punchy sequenced bass. Play steady sixteenths from the step sequencer, or with the arpeggiator on one note.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "decay", "drive", "oscMix", "osc2Semi"],
    values: { mono: 1, osc1Wave: 2, osc2Wave: 3, osc2Semi: -12, osc2Detune: 2, oscMix: 0.4, filterModel: 1, cutoff: 400, resonance: 2.5, filterEnvAmt: 2.5, filterDecay: 0.15, filterSustain: 0.1, keyTrack: 0.5, attack: 0.001, decay: 0.2, sustain: 0.5, release: 0.06, velocity: 0.3, drive: 0.2, reverbMix: 0.05, volume: 0.65 },
  },
  {
    name: "Feel Love Seq",
    category: "Classics",
    color: [127, 0, 40],
    about: "Giorgio Moroder's Moog modular sequence: Donna Summer, \"I Feel Love\" (1977). A tight pluck with a 1/16 echo that fills the gaps. Turn on the arpeggiator (Up, 1/8) and hold a root and its octave and fifth.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "delayMix", "delayFeedback", "decay", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 3, osc2Detune: 4, oscMix: 0.3, filterModel: 1, cutoff: 500, resonance: 2, filterEnvAmt: 3, filterDecay: 0.14, filterSustain: 0.05, keyTrack: 0.6, attack: 0.001, decay: 0.22, sustain: 0, release: 0.08, velocity: 0.3, delayMix: 0.45, delayDiv: 0, delayFeedback: 0.1, delayMode: 1, reverbMix: 0.08, volume: 1 },
  },
  {
    name: "G-Funk Whine",
    category: "Classics",
    color: [127, 90, 0],
    about: "The high Minimoog lead of early-90s G-funk, as on Dr. Dre's \"The Chronic\" (1992). A soft, high tone that slides between notes with a gentle vibrato. Play slow melodies high up.",
    knobs: ["glide", "lfoDepth", "lfoRate", "cutoff", "resonance", "oscMix", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.18, osc1Wave: 0, osc2Wave: 1, osc2Semi: 12, osc2Detune: 0, oscMix: 0.25, filterModel: 1, cutoff: 3000, resonance: 3, filterEnvAmt: 0.5, keyTrack: 1, lfoTarget: 0, lfoWave: 0, lfoRate: 5.5, lfoDepth: 0.15, attack: 0.03, decay: 0.3, sustain: 1, release: 0.3, velocity: 0.2, delayMix: 0.2, delayDiv: 3, reverbMix: 0.2, volume: 0.85 },
  },
  {
    name: "Electro-Theremin",
    category: "Classics",
    color: [0, 127, 127],
    about: "Paul Tanner's Electro-Theremin: The Beach Boys, \"Good Vibrations\" (1966). A pure sine that slides from note to note with a wide vibrato. Play slow, overlapping notes so it glides.",
    knobs: ["glide", "lfoDepth", "lfoRate", "attack", "release", "cutoff", "delayMix", "reverbMix"],
    values: { mono: 1, glide: 0.35, osc1Wave: 0, oscMix: 0, cutoff: 6000, resonance: 0.7, filterEnvAmt: 0, keyTrack: 1, lfoTarget: 0, lfoWave: 0, lfoRate: 6, lfoDepth: 0.22, attack: 0.15, decay: 0.3, sustain: 1, release: 0.5, velocity: 0, reverbMix: 0.3, volume: 0.7 },
  },
  {
    name: "Upside Arp",
    category: "Classics",
    color: [127, 0, 0],
    about: "The sequenced arpeggio of the \"Stranger Things\" theme (Kyle Dixon & Michael Stein, 2016). A resonant saw pluck with echoes and a slow filter drift. Turn on the arpeggiator (Up, 1/8, 2 octaves) and hold a C major 7 chord.",
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", "lfo2Depth", "delayMix", "delayFeedback", "reverbMix"],
    values: { osc1Wave: 2, osc2Wave: 2, osc2Detune: 6, oscMix: 0.5, filterModel: 1, cutoff: 700, resonance: 4, filterEnvAmt: 2, filterDecay: 0.2, filterSustain: 0.2, keyTrack: 0.5, lfo2Target: 1, lfo2Wave: 0, lfo2Rate: 0.06, lfo2Depth: 0.25, attack: 0.002, decay: 0.25, sustain: 0.4, release: 0.2, velocity: 0.3, delayMix: 0.3, delayDiv: 2, delayFeedback: 0.45, reverbMix: 0.35, reverbSize: 3.5, volume: 0.6 },
  },
];

/** Category order in the preset browser. */
export const CATEGORIES: Preset["category"][] = ["Lead", "Bass", "Pad", "Brass", "Keys", "FX", "Classics", "Test"];

/**
 * What each factory preset sounds like, in the words someone might search for. The browser offers the
 * words in TAG_CHOICES as buttons; the others are found by typing.
 */
const TAGS: Record<string, string[]> = {
  "First Saw": ["bright", "classic", "buzzy"],
  "Square Lead": ["hollow", "retro", "echo", "mono"],
  "Fifth Lead": ["fat", "classic", "echo", "mono"],
  "Chip Lead": ["8-bit", "retro", "bright", "vibrato", "mono"],
  Whistle: ["soft", "airy", "pure", "vibrato", "spacey"],
  "Sync Lead": ["hard", "bright", "screaming", "sync", "mono"],
  "Vowel Lead": ["moving", "talking", "wavetable", "mono"],
  "Round Bass": ["warm", "fat", "round", "mono"],
  "Acid Line": ["acid", "squelchy", "dirty", "resonant", "303", "mono"],
  Wobble: ["wobbly", "dubstep", "dirty", "moving", "mono"],
  "Reese Bass": ["dark", "fat", "wide", "moving", "drum and bass", "mono"],
  "Sub Bass": ["deep", "dark", "clean", "pure", "sub", "mono"],
  "Funk Bass": ["plucky", "funky", "resonant", "punchy", "mono"],
  "Pulse Bass": ["hollow", "punchy", "retro", "mono"],
  "Fold Bass": ["buzzy", "dirty", "wavetable", "punchy", "mono"],
  "Velocity Bass": ["punchy", "warm", "dynamic", "mono"],
  "Warm Pad": ["warm", "soft", "wide", "slow", "chords"],
  "Glass Strings": ["glassy", "bright", "strings", "wide", "chords"],
  "Dark Pad": ["dark", "slow", "moving", "spacey", "ambient"],
  "Sweep Pad": ["sweep", "resonant", "moving", "slow", "chords"],
  "PWM Strings": ["strings", "retro", "warm", "moving", "chords"],
  "Scan Pad": ["wavetable", "moving", "wide", "ambient", "slow"],
  "Drift Pad": ["moving", "soft", "ambient", "slow", "evolving"],
  "Brass Stab": ["punchy", "bright", "chords", "classic"],
  "Synth Brass": ["fat", "warm", "chords", "retro"],
  Pluck: ["plucky", "short", "echo", "bright"],
  "Bell Tower": ["bell", "metallic", "spacey", "pure"],
  "Combo Organ": ["organ", "retro", "chords", "buzzy"],
  "E-Piano": ["piano", "soft", "warm", "chords", "tremolo"],
  Mallets: ["percussive", "plucky", "soft", "short"],
  "FM Bell": ["bell", "metallic", "glassy", "fm"],
  "Digital Keys": ["wavetable", "digital", "plucky", "moving"],
  "Table Pluck": ["wavetable", "plucky", "wide", "bright"],
  "Wind Sweep": ["noise", "airy", "ambient", "moving"],
  Ocean: ["noise", "ambient", "soft", "moving", "waves"],
  "Sci-Fi Drone": ["dark", "drone", "dirty", "spacey", "moving"],
  "Laser Zap": ["zap", "retro", "percussive", "short"],
  "Synth Toms": ["drum", "percussive", "punchy", "short"],
  "Ping-pong Pluck": ["echo", "plucky", "stereo", "demo"],
  "Damping Room": ["reverb", "spacey", "demo"],
  "Chorus Tide": ["chorus", "wide", "moving", "demo"],
  "Delay Throw": ["echo", "rhythmic", "demo"],
  "Reverb Breath": ["reverb", "spacey", "demo"],
  "Echo Starts": ["echo", "demo"],
  "Strip Vibrato": ["vibrato", "mod strip", "demo", "mono"],
  "Velocity Vibrato": ["vibrato", "dynamic", "demo"],
  "Phaser Keys": ["phaser", "moving", "soft", "chords", "demo"],
  "Jet Flanger": ["flanger", "metallic", "moving", "bright", "demo"],
  "Fuzz Lead": ["distortion", "fuzz", "dirty", "mono", "demo"],
  "Fold Pluck": ["distortion", "metallic", "plucky", "demo"],
  "Crushed Keys": ["bitcrusher", "lo-fi", "retro", "dirty", "demo"],
  "Squash Pluck": ["compressor", "plucky", "punchy", "demo"],
  "Telephone EQ": ["eq", "lo-fi", "retro", "demo"],
  "Fuzzed Reverb": ["distortion", "reverb", "dirty", "spacey", "effect order", "demo"],
  "Stadium Brass": ["brass", "fat", "bright", "chords", "retro", "80s"],
  "Acid 303": ["acid", "squelchy", "resonant", "303", "mono"],
  "Filthy Acid": ["acid", "dirty", "distortion", "303", "mono"],
  "Prog Lead": ["lead", "warm", "glide", "retro", "mono"],
  "Funk Moog Bass": ["bass", "funky", "fat", "punchy", "mono"],
  "Sync Sweep": ["lead", "sync", "bright", "retro"],
  "Hoover": ["rave", "wide", "fat", "dirty", "chords"],
  "Trance Supersaw": ["supersaw", "trance", "wide", "bright", "chords"],
  "Juno Pad": ["pad", "warm", "wide", "moving", "chords", "retro"],
  "Oxygene Strings": ["strings", "phaser", "moving", "spacey", "slow", "retro"],
  "Blade Brass": ["brass", "warm", "slow", "spacey", "chords"],
  "Growl Sweep": ["growl", "resonant", "moving", "slow", "mono"],
  "FM House Bass": ["bass", "fm", "punchy", "plucky", "mono"],
  "FM Tine Piano": ["piano", "fm", "soft", "chords", "80s"],
  "Popcorn Pluck": ["plucky", "short", "resonant", "retro"],
  "Axel Lead": ["lead", "bright", "punchy", "retro", "80s"],
  "Monday Bass": ["bass", "punchy", "short", "retro", "mono"],
  "Feel Love Seq": ["sequence", "plucky", "echo", "retro", "disco"],
  "G-Funk Whine": ["lead", "soft", "glide", "vibrato", "mono"],
  "Electro-Theremin": ["theremin", "pure", "glide", "vibrato", "retro", "mono"],
  "Upside Arp": ["arp", "plucky", "echo", "dark", "retro"],
};

/** The describing words the browser offers as buttons. */
export const TAG_CHOICES = ["dark", "bright", "warm", "soft", "fat", "dirty", "punchy", "plucky", "slow", "moving", "wide", "spacey", "retro", "metallic", "chords", "mono"];

export const factoryId = (name: string) => `factory:${name}`;

/** Grouped by category, so the browser lists them group by group. */
export const FACTORY_PRESETS: Preset[] = CATEGORIES.flatMap((c) => ALL_PRESETS.filter((p) => p.category === c)).map((p) => ({ ...p, id: factoryId(p.name), tags: TAGS[p.name] ?? [] }));

/** The favourites before you pick your own: a mix across categories (pad bank B loads the first 8). */
export const DEFAULT_FAVOURITES = ["First Saw", "Round Bass", "Acid Line", "Wobble", "Warm Pad", "Glass Strings", "Brass Stab", "Pluck"].map(factoryId);

export function presetValues(p: Preset): ParamValues {
  // Presets made before the filter envelope had its own release used the amp's release for it.
  const filterRelease = p.values.release ?? defaultValues().release;
  return { ...defaultValues(), filterRelease, ...p.values };
}

const USER_KEY = "minilab3.userPresets";

/** A new id for a preset of your own. */
export const userId = () => `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function loadUserPresets(): Preset[] {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_KEY) ?? "[]") as Preset[];
    const presets = saved.map(migrate);
    // Saved before presets had ids: give them one for good.
    if (saved.some((p) => !p.id)) saveUserPresets(presets);
    return presets;
  } catch {
    return [];
  }
}

/** Bring a preset saved by an older version up to date: the filter type became Filter Morph, and presets got ids. */
export function migrate(p: Preset): Preset {
  const values: Record<string, number> = { ...p.values };
  if ("filterType" in values) {
    values.filterMorph ??= MORPH_OF_OLD_TYPE[values.filterType] ?? 0;
    delete values.filterType;
  }
  const knobs = p.knobs.map((k) => ((k as string) === "filterType" ? "filterMorph" : k)) as Preset["knobs"];
  return { ...p, id: p.id || userId(), tags: p.tags ?? [], values: values as Preset["values"], knobs };
}

export function saveUserPresets(presets: Preset[]) {
  localStorage.setItem(USER_KEY, JSON.stringify(presets));
}
