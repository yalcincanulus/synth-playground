import type { ParamId } from "../../audio/params";

export type BlockId =
  | "osc1" | "osc2" | "subNoise" | "mixer" | "drive" | "filter" | "amp"
  | "chorus" | "delay" | "reverb" | "output"
  | "lfo" | "filterEnv" | "ampEnv" | "perf";

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
    explain: "Makes the raw tone. The wave shape sets its character: sine is pure, triangle mellow, sawtooth bright and buzzy, square hollow.",
    tryThis: "Hold a note and switch the wave shape. Watch the picture change and listen.",
    params: ["osc1Wave"],
  },
  osc2: {
    title: "Oscillator 2",
    short: "A second tone you can shift in pitch or detune.",
    explain: "A second tone. Shift its pitch (12 semitones = one octave) or detune it slightly against Osc 1 for a thicker, moving sound.",
    tryThis: "Set Osc Mix to the middle, then slowly raise Detune: the two tones start to 'beat' against each other.",
    params: ["osc2Wave", "osc2Semi", "osc2Detune"],
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
    explain: "Pushes the signal too hard, like an overdriven guitar amp. Squashing the wave adds grit and extra harmonics.",
    tryThis: "Raise Drive and watch the curve bend: the flatter its ends, the more the wave's peaks get flattened.",
    params: ["drive"],
  },
  filter: {
    title: "Filter",
    short: "Removes frequencies. Cutoff sets where.",
    explain: "Removes part of the frequency range. Lowpass keeps lows and cuts highs; Cutoff sets where; Resonance boosts the frequencies right at the cutoff.",
    tryThis: "Hold a note and sweep Cutoff slowly: the classic synth 'wah'. Then raise Resonance and sweep again.",
    params: ["filterType", "cutoff", "resonance", "keyTrack"],
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
    explain: "Adds slightly delayed, wobbling copies of the sound, spread left and right. Makes it wider and shimmery.",
    tryThis: "On a pad, turn Chorus up and down while holding a chord.",
    params: ["chorus"],
  },
  delay: {
    title: "Delay",
    short: "Echoes, in time with the tempo.",
    explain: "Echoes, timed to the tempo. Feedback sets how many times each echo repeats.",
    tryThis: "Raise Delay and Feedback, then play one short note and listen to the repeats.",
    params: ["delayMix", "delayDiv", "delayFeedback"],
  },
  reverb: {
    title: "Reverb",
    short: "The reflections of a room or hall.",
    explain: "Simulates the reflections of a room or hall. Room Size sets how long the tail lasts.",
    tryThis: "Set a big Room Size and Reverb at 60%, then play short notes.",
    params: ["reverbMix", "reverbSize"],
  },
  output: {
    title: "Output",
    short: "The final sound, with a limiter.",
    explain: "The final sound. A limiter keeps it from getting too loud and distorting.",
    tryThis: "Watch the meter while you play: the limiter catches the loudest peaks.",
    params: ["volume"],
  },
  lfo: {
    title: "LFO",
    short: "A slow wave that moves another setting automatically.",
    explain: "A slow, repeating wave that moves another setting up and down automatically. On pitch: vibrato. On filter: wobble. On amp: tremolo.",
    tryThis: "Set Target to filter, Depth to 50%, then change Rate while holding a note.",
    params: ["lfoTarget", "lfoRate", "lfoDepth"],
  },
  filterEnv: {
    title: "Filter Envelope",
    short: "Moves the filter's cutoff during each note.",
    explain: "Moves the filter's cutoff during each note. Amount sets how far (negative moves it down). Its release follows the Amp Envelope's release.",
    tryThis: "With a low Cutoff, set Amount high and Decay short: every note starts bright and quickly darkens, like a pluck.",
    params: ["filterEnvAmt", "filterAttack", "filterDecay", "filterSustain"],
  },
  ampEnv: {
    title: "Amp Envelope",
    short: "The volume shape of each note. Faders 1–4.",
    explain: "The volume shape of each note: Attack (fade in), Decay (fall), Sustain (level while held), Release (fade out after you let go). Faders 1–4.",
    tryThis: "A long Attack makes a slow swell. Sustain 0 with a short Decay makes a pluck.",
    params: ["attack", "decay", "sustain", "release"],
  },
  perf: {
    title: "Playing",
    short: "How your playing shapes the sound.",
    explain: "How you shape the sound while playing: pitch strip bends notes, mod strip adds LFO movement, Mono plays one note at a time, Glide slides between notes, Unison stacks copies.",
    tryThis: "Switch to mono, raise Glide, and play overlapping notes.",
    params: ["modTarget", "mono", "glide", "unison"],
  },
};

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
    knobs: ["osc1Wave", "osc2Wave", "osc2Semi", "osc2Detune", "oscMix", "subLevel", "noiseLevel", "unison"],
    blocks: ["osc1", "osc2", "subNoise", "mixer"],
  },
  {
    name: "Filter",
    knobs: ["cutoff", "resonance", "filterType", "keyTrack", "drive", "filterEnvAmt", "filterAttack", "filterDecay"],
    blocks: ["drive", "filter"],
  },
  {
    name: "Envelopes",
    knobs: ["attack", "decay", "sustain", "release", "filterEnvAmt", "filterAttack", "filterDecay", "filterSustain"],
    blocks: ["amp", "ampEnv", "filterEnv"],
  },
  {
    name: "Modulation",
    knobs: ["lfoRate", "lfoDepth", "lfoTarget", "modTarget", "velocity", "glide", "mono", "keyTrack"],
    blocks: ["lfo", "perf"],
  },
  {
    name: "Effects",
    knobs: ["chorus", "delayMix", "delayDiv", "delayFeedback", "reverbMix", "reverbSize", "volume", null],
    blocks: ["chorus", "delay", "reverb", "output"],
  },
];

export const pageOf = (block: BlockId) => KNOB_PAGES.findIndex((p) => p.blocks.includes(block));
