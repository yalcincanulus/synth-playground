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

export const WAVES = ["sine", "triangle", "sawtooth", "square"] as const;
export const FILTER_TYPES = ["lowpass", "highpass", "bandpass"] as const;
export const LFO_TARGETS = ["pitch", "filter", "amp"] as const;
export const DELAY_DIVS = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2"] as const;
export const DELAY_DIV_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2];

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${v.toFixed(v < 10 ? 2 : 0)} Hz`);
const sec = (v: number) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (unit: string, digits = 0) => (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;

const enumParam = (label: string, options: readonly string[], def = 0): ParamDef => ({
  label, min: 0, max: options.length - 1, curve: "int", default: def, options,
});

export const PARAMS = {
  // Oscillators
  osc1Wave: enumParam("Osc1 Wave", WAVES, 2),
  osc2Wave: enumParam("Osc2 Wave", WAVES, 2),
  osc2Semi: { label: "Osc2 Pitch", min: -24, max: 24, curve: "int", default: 0, format: signed(" st") },
  osc2Detune: { label: "Detune", min: 0, max: 50, curve: "lin", default: 7, format: (v) => `${v.toFixed(1)} ct` },
  oscMix: { label: "Osc Mix", min: 0, max: 1, curve: "lin", default: 0.5, format: (v) => `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}` },
  subLevel: { label: "Sub Osc", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  noiseLevel: { label: "Noise", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  unison: { label: "Unison", min: 1, max: 3, curve: "int", default: 1, format: (v) => `${v} voice${v > 1 ? "s" : ""}` },

  // Filter
  filterType: enumParam("Filter", FILTER_TYPES, 0),
  cutoff: { label: "Cutoff", min: 30, max: 18000, curve: "exp", default: 2000, format: hz },
  resonance: { label: "Resonance", min: 0.5, max: 20, curve: "exp", default: 1, format: (v) => v.toFixed(1) },
  drive: { label: "Drive", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  filterEnvAmt: { label: "Filt Env", min: -4, max: 6, curve: "lin", default: 2, format: signed(" oct", 1) },
  filterAttack: { label: "F Attack", min: 0.001, max: 4, curve: "exp", default: 0.005, format: sec },
  filterDecay: { label: "F Decay", min: 0.01, max: 4, curve: "exp", default: 0.4, format: sec },
  filterSustain: { label: "F Sustain", min: 0, max: 1, curve: "lin", default: 0.2, format: pct },
  keyTrack: { label: "Key Track", min: 0, max: 1, curve: "lin", default: 0.5, format: pct },

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
  modTarget: enumParam("Mod To", LFO_TARGETS, 0),
  glide: { label: "Glide", min: 0, max: 1, curve: "lin", default: 0, format: sec },
  mono: enumParam("Voice", ["poly", "mono"], 0),

  // Effects
  chorus: { label: "Chorus", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  delayMix: { label: "Delay", min: 0, max: 1, curve: "lin", default: 0, format: pct },
  delayDiv: enumParam("Delay Time", DELAY_DIVS, 3),
  delayFeedback: { label: "Feedback", min: 0, max: 0.9, curve: "lin", default: 0.35, format: pct },
  reverbMix: { label: "Reverb", min: 0, max: 1, curve: "lin", default: 0.15, format: pct },
  reverbSize: { label: "Room Size", min: 0.3, max: 8, curve: "exp", default: 2, format: sec },
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
