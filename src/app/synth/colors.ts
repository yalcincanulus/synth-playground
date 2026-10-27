// Modulation colours, shared by the cables, the knob rings, the legend and the modulators' pictures.

import type { ModSource } from "../../audio/params";
import { SOURCE_BLOCK } from "./blocks";

export const LFO = "#ffcc33";
export const LFO2 = "#ff9f43";
export const LFO3 = "#ffd8a8";
export const FENV = "#ff7ab6";
export const AENV = "#7ab8ff";
export const PLAY = "#b388ff";
export const PENV = "#5ee0a0";
export const OSC = "#ff6b6b";
export const MENV = "#c6f05e";

/** Each modulator block's colour, for its cables, rings and matrix routes. */
export const COLORS: Record<string, string> = { lfo: LFO, lfo2: LFO2, lfo3: LFO3, filterEnv: FENV, ampEnv: AENV, pitchEnv: PENV, modEnv: MENV, perf: PLAY, osc: OSC };

export const sourceColor = (source: Exclude<ModSource, "off">) => COLORS[SOURCE_BLOCK[source]];
