// What moves what, for the Panel view: every modulation (the fixed wiring and the matrix routes) as a
// ring around the knob it moves, or as a tag on its panel when the destination has no knob.

import { LFO_SCALE, lfoDepths } from "../../audio/dsp/lfo";
import { MOD_RANGE } from "../../audio/dsp/voiceMath";
import { formatValue, LFO_TARGETS, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, slotIds, toControl, type ModDest, type ModSource, type ParamId, type ParamValues } from "../../audio/params";

/** The knob each destination moves; pitch, volume and pan have none and show as tags on their panel. */
export const DEST_PARAM: Record<ModDest, ParamId | null> = {
  pitch: null, "osc 2 pitch": "osc2Semi", cutoff: "cutoff", resonance: "resonance", volume: null, "wt pos": "wtPos", width: "pulseWidth",
  fm: "fmAmount", "osc mix": "oscMix", sub: "subLevel", noise: "noiseLevel", pan: null, morph: "filterMorph", "cutoff 2": "filter2Cutoff",
  chorus: "chorus", delay: "delayMix", reverb: "reverbMix",
  "lfo 1 rate": "lfoRate", "lfo 1 depth": "lfoDepth", "lfo 2 rate": "lfo2Rate", "lfo 2 depth": "lfo2Depth", "lfo 3 rate": "lfo3Rate",
};

/** The other way round: a knob's destination, by MOD_DESTS index, for dropping a cable on it. */
export const PARAM_DEST: Partial<Record<ParamId, number>> = Object.fromEntries(
  MOD_DESTS.flatMap((d, i) => (DEST_PARAM[d] ? [[DEST_PARAM[d], i]] : [])),
);

export interface Mod {
  source: Exclude<ModSource, "off">;
  dest: ModDest;
  /** How far it moves the destination at the source's full value, in MOD_RANGE's units (cents, dB, octaves or the setting's own). */
  amount: number;
  /** Its matrix route, or null for the synth's fixed wiring. */
  route: number | null;
  /** The amount as the synth shows it ("+2.0 oct", "40%"). */
  text: string;
}

/** The fixed LFO targets as destinations, in LFO_TARGETS order. */
const LFO_DEST: Record<(typeof LFO_TARGETS)[number], ModDest> = { pitch: "pitch", filter: "cutoff", amp: "volume", width: "width", position: "wt pos" };
const LFO_NAMES = ["lfo 1", "lfo 2"] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Everything modulating the sound now. `mod` is the mod strip (0..1), which adds to LFO 1's depth. */
export function activeMods(v: ParamValues, mod: number): Mod[] {
  const list: Mod[] = [
    { source: "amp env", dest: "volume", amount: 1, route: null, text: "100%" },
    { source: "velocity", dest: "volume", amount: v.velocity, route: null, text: formatValue("velocity", v.velocity) },
    { source: "filter env", dest: "cutoff", amount: v.filterEnvAmt * 1200, route: null, text: formatValue("filterEnvAmt", v.filterEnvAmt) },
    { source: "pitch env", dest: v.pitchEnvTarget ? "osc 2 pitch" : "pitch", amount: v.pitchEnvAmt * 100, route: null, text: formatValue("pitchEnvAmt", v.pitchEnvAmt) },
  ];
  // LFO 1 and 2's own targets; at depth 0 still listed (idle), so "To: Filter" shows where it would go.
  LFO_NAMES.forEach((source, i) => {
    const depths = lfoDepths(v, i, mod);
    const target = i === 0 ? v.lfoTarget : v.lfo2Target;
    LFO_TARGETS.forEach((t, k) => {
      if (depths[k] > 0 || target === k) list.push({ source, dest: LFO_DEST[t], amount: depths[k] * LFO_SCALE[k], route: null, text: pct(depths[k]) });
    });
  });
  for (let n = 1; n <= MOD_SLOTS; n++) {
    const ids = slotIds(n);
    const source = MOD_SOURCES[v[ids.src]];
    if (source === "off") continue;
    const dest = MOD_DESTS[v[ids.dst]];
    list.push({ source, dest, amount: v[ids.amt] * MOD_RANGE[dest], route: n, text: formatValue(ids.amt, v[ids.amt]) });
  }
  return list;
}

/** Sources that swing both ways around the setting; the others only push it one way. */
const BIPOLAR = new Set<ModSource>(["lfo 1", "lfo 2", "lfo 3", "random", "key"]);

/** The setting `base` moved by `delta` of the destination's units. */
function shifted(dest: ModDest, base: number, delta: number): number {
  switch (dest) {
    case "cutoff": case "cutoff 2": return base * 2 ** (delta / 1200);
    case "osc 2 pitch": return base + delta / 100;
    case "resonance": return base * 10 ** (delta / 20);
    case "lfo 1 rate": case "lfo 2 rate": case "lfo 3 rate": return base * 2 ** delta;
    default: return base + delta;
  }
}

/**
 * Where on knob `id` (set to `base`) modulation `m` reaches, in knob positions 0..1: from `lo` to `hi`,
 * and `live` where the source has it right now (`value`, null when nothing plays).
 */
export function reach(m: Mod, id: ParamId, base: number, value: number | null) {
  const at = (x: number) => toControl(id, shifted(m.dest, base, m.amount * x));
  return { lo: at(BIPOLAR.has(m.source) ? -1 : 0), hi: at(1), live: value === null ? null : at(value) };
}
