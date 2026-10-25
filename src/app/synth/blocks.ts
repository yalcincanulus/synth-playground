import type { ListenTap } from "../../audio/engine";
import { MOD_DESTS, MOD_SOURCES, slotIds, type ModDest, type ModSource, type ParamId, type ParamValues } from "../../audio/params";

export type BlockId =
  | "osc1" | "osc2" | "subNoise" | "mixer" | "drive" | "filter" | "filter2" | "amp"
  | "chorus" | "delay" | "reverb" | "output"
  | "lfo" | "lfo2" | "filterEnv" | "ampEnv" | "pitchEnv" | "modEnv" | "perf" | "matrix";

export interface BlockDef {
  title: string;
  /** Shown on the block itself: a few words. */
  short: string;
  /** Shown in the detail panel when the block is selected: plain English, what it is and does. */
  explain: string;
  /** Something to do right now to hear it. */
  tryThis: string;
  /** Controls shown on the block. */
  params: ParamId[];
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  osc1: {
    title: "Oscillator 1",
    short: "Makes the raw tone. The wave shape sets its character.",
    explain: "Makes the raw tone. The wave shape sets its character: sine is pure, triangle mellow, sawtooth bright and buzzy, square hollow. Table plays a wavetable: a stack of waves that Position moves through (see the Wavetable tab). Pulse Width changes the square: at 50% it is an even square, narrower pulses sound thinner and more nasal (it applies to the square wave of both oscillators). Moving the width slowly with an LFO ('PWM') gives the lush, animated sound of classic analog strings.",
    tryThis: "Pick the square wave, hold a note and turn Pulse Width down from 50%. Then set LFO 2 to Width with a slow sine to hear PWM.",
    params: ["osc1Wave", "pulseWidth", "wtTable", "wtPos"],
  },
  osc2: {
    title: "Oscillator 2",
    short: "A second tone you can shift in pitch, sync or use for FM.",
    explain: "A second tone. Shift its pitch (12 semitones = one octave) or detune it slightly against Osc 1 for a thicker, moving sound. Sync restarts Osc 2's wave every time Osc 1 starts a cycle: Osc 2's pitch then changes its tone instead of its note, which gives the 'screaming' sync sound. FM uses Osc 2 to wobble Osc 1's pitch hundreds of times a second: too fast to hear as wobble, it turns into new, often metallic or bell-like tones (Osc 1's picture shows the bent wave).",
    tryThis: "Sync: turn Sync on, set Osc Mix towards Osc 2, hold a note and sweep Osc2 Pitch. FM: set both oscillators to sine, Osc Mix to Osc 1, Osc2 Pitch to +19 and raise FM Amount.",
    params: ["osc2Wave", "wtTable", "wtPos", "osc2Semi", "osc2Detune", "oscSync", "fmAmount"],
  },
  subNoise: {
    title: "Sub & Noise",
    short: "Two extra sources. Their levels are in the Mixer.",
    explain: "Sub is a square wave one octave below the note you play: it adds weight under bass sounds. Noise is random hiss with no pitch: good for breath, wind and percussive attacks.",
    tryThis: "On a bass, raise Sub in the Mixer and play low notes. Then raise Noise and lower the Cutoff: it turns into wind.",
    params: [],
  },
  mixer: {
    title: "Mixer",
    short: "Sets how loud each source is.",
    explain: "Sets how loud each source is before they are combined into one signal.",
    tryThis: "Turn Osc Mix from one end to the other: you hear Osc 1, then both, then Osc 2.",
    params: ["oscMix", "subLevel", "noiseLevel"],
  },
  drive: {
    title: "Drive",
    short: "Overdrives the signal for grit.",
    explain: "Pushes the signal too hard, like an overdriven guitar amp. Squashing the wave adds grit and extra harmonics. With the Ladder filter, Drive pushes the filter itself instead: the squashing happens inside it, together with the resonance, which gives the classic acid 'squelch'. The picture still shows the curve.",
    tryThis: "Raise Drive and watch the curve bend: the flatter its ends, the more the wave's peaks get flattened.",
    params: ["drive"],
  },
  filter: {
    title: "Filter",
    short: "Removes frequencies. Cutoff sets where.",
    explain: "Removes part of the frequency range. Cutoff sets where; Resonance boosts the frequencies right at the cutoff. Morph sets which part goes: at the left it is a low-pass (keeps the lows, cuts the highs), in the middle a band-pass (keeps only a band around the cutoff), at the right a high-pass (cuts the lows). In between it blends smoothly, so an LFO or envelope on Morph changes the sound's colour over time. The model sets the filter's character. Clean is smooth and polite. Ladder is modelled on Moog's 'ladder' filter: it cuts twice as steeply, loses some bass as Resonance rises, and near the top of Resonance it sings a tone of its own at the cutoff (self-oscillation). Drive then overdrives the filter from inside.",
    tryThis: "Hold a chord and turn Morph slowly from left to right: the sound thins from full to nasal to airy. Then load Acid Line, set Model to Ladder, turn Resonance all the way up and sweep Cutoff: the filter whistles by itself.",
    params: ["filterModel", "filterMorph", "cutoff", "resonance", "keyTrack"],
  },
  filter2: {
    title: "Filter 2",
    short: "A second filter, after the first or beside it.",
    explain: "A second, clean filter with its own Cutoff, Resonance and Morph. Series puts it after Filter 1: both filters shape the sound, e.g. a low-pass then a high-pass keep only the band between them. Parallel feeds it the same signal as Filter 1 and adds the two: two band-passes at different cutoffs make two resonant peaks, like the formants of a voice. It follows Key Track, but not the filter envelope or the LFOs; move it with the mod matrix (Cutoff 2).",
    tryThis: "Set Filter 2 to Series with Morph at high-pass and raise its Cutoff: the bass thins out while Filter 1 still shapes the top. Then try Parallel with both filters' Morph in the middle and the cutoffs far apart: a vowel-like sound.",
    params: ["filter2Mode", "filter2Morph", "filter2Cutoff", "filter2Resonance"],
  },
  amp: {
    title: "Amp",
    short: "The volume of each note, shaped by the Amp Envelope.",
    explain: "Controls the volume of each note, following the Amp Envelope. Velocity sets how much harder key presses play louder.",
    tryThis: "Set Velocity to 100% and play soft and hard notes. At 0%, every note plays equally loud.",
    params: ["velocity"],
  },
  chorus: {
    title: "Chorus",
    short: "Wobbling copies that make the sound wider.",
    explain: "Adds three slightly delayed copies of the sound, placed left, centre and right, each with its delay slowly swept up and down. The sweeps are a third of a cycle apart, so while one copy goes up in pitch another comes down: the sound gets wider and shimmery without going out of tune. Chorus is also a mod matrix destination.",
    tryThis: "On a pad, turn Chorus up and down while holding a chord. Then patch LFO 2 (slow) to Chorus for a chorus that comes and goes.",
    params: ["chorus"],
  },
  delay: {
    title: "Delay",
    short: "Echoes, in time with the tempo.",
    explain: "Echoes, timed to the tempo. Feedback sets how many times each echo repeats. Stereo keeps each side's echoes on its own side; Ping-pong bounces them from left to right and back. Both parts share one delay: each sets how much of it it gets (Delay, also a mod matrix destination), but the Delay Time, Feedback and Mode are the Keys part's.",
    tryThis: "Raise Delay and Feedback, set Mode to Ping-pong, then play one short note and listen to the repeats bounce. Patch the Mod Envelope to Delay (Decay 300 ms) to echo only each note's start.",
    params: ["delayMix", "delayDiv", "delayFeedback", "delayMode"],
  },
  reverb: {
    title: "Reverb",
    short: "The reflections of a room or hall.",
    explain: "Simulates the reflections of a room or hall. Room Size sets how long the tail lasts. Damping makes the highs die away sooner than the lows, as soft furnishings and air do: low Damping is a bright, hard room (a tiled bathroom), high Damping a warm, dark hall. Both parts share one reverb: each sets how much of it it gets (Reverb, also a mod matrix destination), but the Room Size and Damping are the Keys part's.",
    tryThis: "Set a big Room Size and Reverb at 60%, then play short notes while turning Damping from 0 to 100%: the tail goes from hiss to a soft glow.",
    params: ["reverbMix", "reverbSize", "reverbDamping"],
  },
  output: {
    title: "Output",
    short: "The final sound, with a limiter.",
    explain: "The final sound. A limiter keeps it from getting too loud and distorting. Volume is this part's own level, so you can balance the Keys and Sequencer parts. The meters show left and right; the stereo picture below draws the sound's shape: a vertical line is mono (both sides the same), a wide cloud is a wide stereo sound.",
    tryThis: "Load a pad with unison and play a chord: the stereo picture spreads out. Turn Stereo (in Playing) to 0 and it closes to a vertical line: mono.",
    params: ["volume"],
  },
  lfo: {
    title: "LFO 1",
    short: "A slow wave that moves another setting automatically.",
    explain: "A slow, repeating wave that moves another setting up and down automatically. On pitch: vibrato. On filter: wobble. On amp: tremolo. The shape sets how it moves: sine and triangle glide smoothly, saw ramps up then drops, square jumps between two values, and random picks a new value every cycle ('sample & hold'). Sync locks its speed to the tempo. The mod strip adds depth to this LFO.",
    tryThis: "Set To: Filter, Depth 50%, Sync 1/8, then start the drum loop: the wobble now lands on the beat. Then try the random shape.",
    params: ["lfoTarget", "lfoWave", "lfoSync", "lfoRate", "lfoDepth"],
  },
  lfo2: {
    title: "LFO 2",
    short: "A second LFO, so two things can move at once.",
    explain: "Works like LFO 1, with its own target, shape and speed. With two LFOs you can have vibrato on the pitch while the filter slowly sweeps, or two movements at different speeds on the same target.",
    tryThis: "Leave LFO 1 on pitch for vibrato, then set LFO 2 to Filter with a slow sine (0.2 Hz) and 40% Depth: a slow sweep under the vibrato.",
    params: ["lfo2Target", "lfo2Wave", "lfo2Sync", "lfo2Rate", "lfo2Depth"],
  },
  filterEnv: {
    title: "Filter Envelope",
    short: "Moves the filter's cutoff during each note.",
    explain: "Moves the filter's cutoff during each note, with its own Attack, Decay, Sustain and Release. Amount sets how far (negative moves it down). Release sets how fast the cutoff falls back after you let go of the key.",
    tryThis: "With a low Cutoff, set Amount high and Decay short: every note starts bright and quickly darkens, like a pluck.",
    params: ["filterEnvAmt", "filterAttack", "filterDecay", "filterSustain", "filterRelease"],
  },
  ampEnv: {
    title: "Amp Envelope",
    short: "The volume shape of each note. Faders 1–4.",
    explain: "The volume shape of each note: Attack (fade in), Decay (fall), Sustain (level while held), Release (fade out after you let go). Faders 1–4.",
    tryThis: "A long Attack makes a slow swell. Sustain 0 with a short Decay makes a pluck.",
    params: ["attack", "decay", "sustain", "release"],
  },
  pitchEnv: {
    title: "Pitch Envelope",
    short: "Bends each note's pitch at its start.",
    explain: "Starts every note off its pitch by Amount (in semitones; negative starts below) and slides it back to the note's real pitch in the Decay time. Big amounts with a short decay make laser zaps and synth drums; a small amount gives a little 'scoop' into each note. 'Osc 2' moves only Osc 2: combined with Sync, that sweeps Osc 2's tone at the start of every note, the classic sync lead.",
    tryThis: "Set Amount to +24 and Decay to 100 ms, then play low notes: a synth tom. Then try +48 with 300 ms for a laser.",
    params: ["pitchEnvAmt", "pitchEnvDecay", "pitchEnvTarget"],
  },
  modEnv: {
    title: "Mod Envelope",
    short: "A spare envelope: connect it with the mod matrix.",
    explain: "A fourth envelope with its own Attack, Decay, Sustain and Release. Unlike the others it isn't wired to anything: patch it to any destination in the mod matrix. Its classic use is the wavetable position: every note sweeps through the table and settles, the 'Serum pluck'.",
    tryThis: "Set Osc 1 to Table, press Patch, click this block, then Oscillator 1 (it picks WT Pos if a table is playing). Set Decay to 400 ms and Sustain to 0, then play short notes.",
    params: ["modEnvAttack", "modEnvDecay", "modEnvSustain", "modEnvRelease"],
  },
  matrix: {
    title: "Mod Matrix",
    short: "Extra connections: any source to any destination.",
    explain: "Each route connects a source (an LFO, an envelope, how hard you play, which key, the mod strip, or a random value per note) to a destination (pitch, cutoff, wavetable position…), by an Amount. Negative amounts move the destination the other way. Routes add to the synth's normal wiring and show as cables in the source's colour.",
    tryThis: "Add a route Velocity → Cutoff at +50%, then play soft and hard notes: harder notes are brighter. Knobs 1–8 set the amounts of routes 1–8.",
    params: [],
  },
  perf: {
    title: "Playing",
    short: "How your playing shapes the sound.",
    explain: "How you shape the sound while playing: pitch strip bends notes, mod strip adds LFO movement, Mono plays one note at a time, Glide slides between notes, Unison stacks copies, and Stereo spreads them from left to right (in mono, they sound the same as without it). Max Voices is how many notes can sound at once: when you play more, the quietest fading note (or else the oldest) makes way. If the computer gets too busy, fewer notes sound, so the sound never crackles.",
    tryThis: "Switch to mono, raise Glide, and play overlapping notes.",
    params: ["modTarget", "mono", "glide", "unison", "stereoWidth", "maxVoices"],
  },
};

export const usesTable = (v: ParamValues) => v.osc1Wave === 4 || v.osc2Wave === 4;

/** Controls only shown on a block while they do something, so blocks stay short. */
export const SHOWN_WHEN: Partial<Record<BlockId, Partial<Record<ParamId, (v: ParamValues) => boolean>>>> = {
  filter2: { filter2Morph: (v) => v.filter2Mode > 0, filter2Cutoff: (v) => v.filter2Mode > 0, filter2Resonance: (v) => v.filter2Mode > 0 },
  osc1: { pulseWidth: (v) => v.osc1Wave === 3 || v.osc2Wave === 3, wtTable: (v) => v.osc1Wave === 4, wtPos: (v) => v.osc1Wave === 4 },
  osc2: { wtTable: (v) => v.osc2Wave === 4 && v.osc1Wave !== 4, wtPos: (v) => v.osc2Wave === 4 && v.osc1Wave !== 4 },
  perf: { stereoWidth: (v) => v.unison > 1 },
};

/** The Wavetable tab's knobs. */
export const WAVETABLE_KNOBS: ParamId[] = ["wtPos", "wtTable", "osc1Wave", "osc2Wave", "lfo2Rate", "lfo2Depth", "cutoff", "resonance"];

/** A page of 8 hardware knob assignments, selected by focusing one of its blocks. */
export interface KnobPage {
  /** Fits the OLED's first line (10 characters). */
  name: string;
  knobs: (ParamId | null)[];
  blocks: BlockId[];
}

export const KNOB_PAGES: KnobPage[] = [
  {
    name: "Sources",
    knobs: ["osc1Wave", "osc2Wave", "osc2Semi", "osc2Detune", "oscMix", "subLevel", "noiseLevel", "wtPos"],
    blocks: ["osc1", "osc2", "subNoise", "mixer"],
  },
  {
    name: "Filter",
    knobs: ["cutoff", "resonance", "filterMorph", "filterModel", "drive", "filterEnvAmt", "filterAttack", "filterDecay"],
    blocks: ["drive", "filter"],
  },
  {
    name: "Filter 2",
    knobs: ["filter2Cutoff", "filter2Resonance", "filter2Morph", "filter2Mode", "cutoff", "resonance", "filterMorph", "keyTrack"],
    blocks: ["filter2"],
  },
  {
    name: "Osc Tricks",
    knobs: ["pulseWidth", "oscSync", "fmAmount", "osc2Semi", "pitchEnvAmt", "pitchEnvDecay", "pitchEnvTarget", "oscMix"],
    blocks: ["pitchEnv"],
  },
  {
    name: "Envelopes",
    knobs: ["attack", "decay", "sustain", "release", "filterAttack", "filterDecay", "filterSustain", "filterRelease"],
    blocks: ["amp", "ampEnv", "filterEnv"],
  },
  {
    name: "LFO 1",
    knobs: ["lfoRate", "lfoDepth", "lfoTarget", "lfoWave", "lfoSync", "modTarget", null, null],
    blocks: ["lfo"],
  },
  {
    name: "LFO 2",
    knobs: ["lfo2Rate", "lfo2Depth", "lfo2Target", "lfo2Wave", "lfo2Sync", null, null, null],
    blocks: ["lfo2"],
  },
  {
    name: "Playing",
    knobs: ["velocity", "glide", "mono", "unison", "keyTrack", "modTarget", "maxVoices", "stereoWidth"],
    blocks: ["perf"],
  },
  {
    name: "Mod Env",
    knobs: ["modEnvAttack", "modEnvDecay", "modEnvSustain", "modEnvRelease", "mod1Amt", "mod2Amt", "mod3Amt", "mod4Amt"],
    blocks: ["modEnv"],
  },
  {
    name: "Matrix",
    knobs: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => slotIds(n).amt),
    blocks: ["matrix"],
  },
  {
    name: "Effects",
    knobs: ["chorus", "delayMix", "delayDiv", "delayFeedback", "reverbMix", "reverbSize", "reverbDamping", "volume"],
    blocks: ["chorus", "delay", "reverb", "output"],
  },
];

export const pageOf = (block: BlockId) => KNOB_PAGES.findIndex((p) => p.blocks.includes(block));

// ------------------------------------------------------------------ mod matrix

/** The block each mod source lives in (velocity, key, random and the mod strip are your playing). */
export const SOURCE_BLOCK: Record<Exclude<ModSource, "off">, BlockId> = {
  "lfo 1": "lfo", "lfo 2": "lfo2", "filter env": "filterEnv", "amp env": "ampEnv", "pitch env": "pitchEnv", "mod env": "modEnv",
  velocity: "perf", key: "perf", "mod strip": "perf", random: "perf",
};

/** The block each destination is in. */
export const DEST_BLOCK: Record<ModDest, BlockId> = {
  pitch: "osc1", "osc 2 pitch": "osc2", cutoff: "filter", resonance: "filter", volume: "amp",
  "wt pos": "osc1", width: "osc1", fm: "osc2", "osc mix": "mixer", sub: "mixer", noise: "mixer", pan: "output",
  morph: "filter", "cutoff 2": "filter2",
  chorus: "chorus", delay: "delay", reverb: "reverb", "lfo 1 rate": "lfo", "lfo 1 depth": "lfo", "lfo 2 rate": "lfo2", "lfo 2 depth": "lfo2",
};

/** Patching: the source a block gives (its first one; change it in the route afterwards). */
export const blockSource = (block: BlockId) => MOD_SOURCES.findIndex((s) => s !== "off" && SOURCE_BLOCK[s] === block);

/** Patching: the destination a block takes, picking what fits the current sound (WT Pos when a table plays). */
export function blockDest(block: BlockId, v: ParamValues): number {
  if (block === "osc1" && usesTable(v)) return MOD_DESTS.indexOf("wt pos");
  if (block === "osc1" && (v.osc1Wave === 3 || v.osc2Wave === 3)) return MOD_DESTS.indexOf("width");
  return MOD_DESTS.findIndex((d) => DEST_BLOCK[d] === block);
}

/** Short names, for the OLED (route labels fit its 10 characters). */
export const MOD_SHORT: Record<string, string> = {
  off: "off", "lfo 1": "LFO1", "lfo 2": "LFO2", "filter env": "FEnv", "amp env": "AEnv", "pitch env": "PEnv", "mod env": "MEnv",
  velocity: "Vel", key: "Key", "mod strip": "Strip", random: "Rand",
  pitch: "Pitch", "osc 2 pitch": "O2Pit", cutoff: "Cut", resonance: "Res", volume: "Vol", "wt pos": "WTPos", width: "Width",
  fm: "FM", "osc mix": "Mix", sub: "Sub", noise: "Noise", pan: "Pan", morph: "Morph", "cutoff 2": "Cut2",
  chorus: "Chor", delay: "Dly", reverb: "Rev", "lfo 1 rate": "L1Rt", "lfo 1 depth": "L1Dp", "lfo 2 rate": "L2Rt", "lfo 2 depth": "L2Dp",
};

/** A param's label; route amounts are named by their route ("LFO1>WTPos"). */
export function paramLabel(id: ParamId, v: ParamValues, fallback: string): string {
  const m = /^mod(\d)Amt$/.exec(id);
  if (!m) return fallback;
  const ids = slotIds(+m[1]);
  const src = MOD_SOURCES[v[ids.src]];
  if (src === "off") return `${m[1]}: empty`;
  return `${MOD_SHORT[src]}>${MOD_SHORT[MOD_DESTS[v[ids.dst]]]}`.slice(0, 10);
}

/** The signal tap each block can be listened to at ("Listen here"). */
export const BLOCK_TAPS: Partial<Record<BlockId, ListenTap>> = {
  osc1: "osc1",
  osc2: "osc2",
  mixer: "mix",
  drive: "drive",
  filter: "filter",
  filter2: "filter2",
  amp: "amp",
  chorus: "chorus",
  delay: "delay",
  reverb: "reverb",
};

/** Names for the OLED and the listening banner. */
export const TAP_NAMES: Record<ListenTap, string> = {
  osc1: "Oscillator 1", osc2: "Oscillator 2", sub: "Sub", noise: "Noise", mix: "Mixer", drive: "Drive",
  filter: "Filter", filter2: "Filter 2", amp: "Amp", chorus: "Chorus", delay: "Delay (echoes)", reverb: "Reverb (tail)",
};
