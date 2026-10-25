// The recipes. Every one starts from Init (see recipe.ts): Osc 1's saw alone, filter open, no effects.
// Enum values: Voice 1 = mono; LFO To 1 = filter.

import type { Recipe } from "./recipe";

const reese: Recipe = {
  id: "reese",
  name: "Reese Bass",
  summary: "A dark, growling bass made of two saw waves rubbing against each other.",
  category: "Bass",
  color: [0, 80, 90],
  steps: [
    {
      text: "Play a low note and hold it.",
      why: "This is Init: one sawtooth wave, nothing else. Bright and buzzy, and it doesn't move.",
      checks: [{ play: "low" }],
    },
    {
      text: "Bring in Oscillator 2: turn Osc Mix to the middle.",
      why: "Osc 2 is a saw too, at the same pitch, so you only hear it a little louder. Not for long.",
      checks: [{ param: "oscMix", min: 0.4, max: 0.6, aim: 0.5 }],
    },
    {
      text: "Detune Osc 2: turn Detune up to about 25 cents, and hold a low note.",
      why: "The two saws are now slightly apart in pitch, so they drift in and out of step: the slow 'beating' you hear. That rubbing is the Reese sound.",
      checks: [{ param: "osc2Detune", min: 18, aim: 25 }],
    },
    {
      text: "Make it a bass that plays one note at a time: set Voice to mono.",
      why: "Basses are usually mono: a new note takes over from the last one instead of piling up.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Darken it: turn Cutoff down to about 500 Hz.",
      why: "The low-pass filter removes the highs. The buzz goes deep and heavy, and the beating moves down into the low end.",
      checks: [{ param: "cutoff", min: 200, max: 900, aim: 500 }],
    },
    {
      text: "Add weight underneath: raise Sub Osc to about 40%.",
      why: "The sub is a square wave an octave lower. It adds a solid floor that the detuned saws can't give.",
      checks: [{ param: "subLevel", min: 0.3, aim: 0.4 }],
    },
    {
      text: "Add grit: raise Drive to about 30%.",
      why: "Drive squashes the wave's peaks, which adds harmonics: the growl gets an edge.",
      checks: [{ param: "drive", min: 0.2, aim: 0.3 }],
    },
    {
      text: "Get ready to move the filter: set LFO 1's To to Filter.",
      why: "An LFO is a slow wave that moves a setting up and down by itself. Pointing it at the filter makes the cutoff breathe.",
      checks: [{ param: "lfoTarget", is: 1 }],
    },
    {
      text: "Slow it down: turn LFO 1's Rate below 1 Hz.",
      why: "Under one movement a second, the filter sways slowly instead of wobbling.",
      checks: [{ param: "lfoRate", max: 1, aim: 0.4 }],
    },
    {
      text: "Raise LFO 1's Depth to about 15%.",
      why: "Depth is how far it moves the cutoff. A little goes a long way: the bass now slowly opens and closes.",
      checks: [{ param: "lfoDepth", min: 0.08, max: 0.35, aim: 0.15 }],
    },
    {
      text: "Play a low note and hold it for a few seconds.",
      why: "Listen for three things: the beating of the two saws, the weight of the sub, and the slow filter sway.",
      checks: [{ play: "low" }],
    },
  ],
  outro: "That's a Reese bass: two detuned saws, filtered dark, with a sub, some drive and a slow filter sway. It's the classic drum & bass bass.",
};

const pluck: Recipe = {
  id: "pluck",
  name: "Pluck",
  summary: "A short, bright note that dies away, like a plucked string.",
  category: "Keys",
  color: [127, 60, 90],
  steps: [
    {
      text: "Play a note and hold it.",
      why: "Init sounds like an organ: full volume for as long as you hold the key. A pluck does the opposite.",
      checks: [{ play: "note" }],
    },
    {
      text: "Turn Sustain all the way down (fader 3).",
      why: "Sustain is the level while you hold the key. At zero, every note fades out even while held.",
      checks: [{ param: "sustain", max: 0.05, aim: 0 }],
    },
    {
      text: "Shorten the fade: bring Decay down to about 300 ms (fader 2).",
      why: "Decay is how long the note takes to fade. Short and it's a pluck; longer and it rings like a bell.",
      checks: [{ param: "decay", max: 0.5, aim: 0.3 }],
    },
    {
      text: "Turn Cutoff down to about 600 Hz.",
      why: "The note goes dark and muffled. The next step brings the brightness back, but only at the start of each note.",
      checks: [{ param: "cutoff", max: 900, aim: 600 }],
    },
    {
      text: "Raise the filter envelope's Amount (Filt Env) to about +3 octaves.",
      why: "Now every note starts with the filter wide open and closes it as it goes: the bright 'pick' at the start of each note.",
      checks: [{ param: "filterEnvAmt", min: 2.2, aim: 3 }],
    },
    {
      text: "Make the pick snappier: turn the filter envelope's F Decay down to about 200 ms.",
      why: "The filter now closes quickly, so the brightness is just a flick at the start.",
      checks: [{ param: "filterDecay", max: 0.3, aim: 0.2 }],
    },
    {
      text: "Add a little Resonance: about 4.",
      why: "Resonance boosts the frequencies right at the cutoff. As the filter closes, it adds a small 'tok' to each note.",
      checks: [{ param: "resonance", min: 2.5, max: 10, aim: 4 }],
    },
    {
      text: "Give it some space: raise Reverb to about 25%.",
      why: "Short notes sound dry on their own; a bit of reverb lets each one hang in the air.",
      checks: [{ param: "reverbMix", min: 0.15, aim: 0.25 }],
    },
    {
      text: "Add echoes: raise Delay to about 20%.",
      why: "The delay repeats each note in time with the tempo: plucks and echoes are a classic pair.",
      checks: [{ param: "delayMix", min: 0.1, aim: 0.2 }],
    },
    {
      text: "Play a few short notes.",
      why: "Each one starts bright, closes fast and echoes away.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's a pluck: no sustain, a short decay, and a filter envelope that opens each note and closes it fast. Try it with the step sequencer.",
};

const supersaw: Recipe = {
  id: "supersaw",
  name: "Supersaw Pad",
  summary: "A huge, wide pad: many detuned saws that swell in slowly.",
  category: "Pad",
  color: [70, 40, 127],
  steps: [
    {
      text: "Hold a chord (3 notes or more).",
      why: "One saw per note: it sounds thin and plain. A supersaw stacks many saws on every note.",
      checks: [{ play: "chord" }],
    },
    {
      text: "Bring in Oscillator 2: turn Osc Mix to the middle.",
      why: "Two saws per note now, but at exactly the same pitch they just sound like one louder saw.",
      checks: [{ param: "oscMix", min: 0.35, max: 0.65, aim: 0.5 }],
    },
    {
      text: "Detune Osc 2 by about 12 cents.",
      why: "The two saws drift against each other and the chord starts to shimmer.",
      checks: [{ param: "osc2Detune", min: 8, max: 30, aim: 12 }],
    },
    {
      text: "Set Unison to 3 voices.",
      why: "Each oscillator becomes 3 slightly detuned copies: 6 saws per note. This is the 'super' in supersaw.",
      checks: [{ param: "unison", is: 3 }],
    },
    {
      text: "Spread the copies out: turn Stereo up to 100%.",
      why: "The unison copies move from the middle to the left and right: the pad gets wide. Headphones make it obvious.",
      checks: [{ param: "stereoWidth", min: 0.9, aim: 1 }],
    },
    {
      text: "Make it swell in: raise Attack to about 600 ms (fader 1).",
      why: "Attack is the fade-in. Pads rise slowly instead of starting with a hit.",
      checks: [{ param: "attack", min: 0.3, aim: 0.6 }],
    },
    {
      text: "Make it fade away slowly: raise Release to about 2 seconds (fader 4).",
      why: "Release is the fade-out after you let go. Long releases let chords blur into each other.",
      checks: [{ param: "release", min: 1.2, aim: 2 }],
    },
    {
      text: "Soften the top: turn Cutoff down to about 3 kHz.",
      why: "So many saws are very bright. Taking the highest frequencies away makes the pad warmer and less harsh.",
      checks: [{ param: "cutoff", min: 1200, max: 6000, aim: 3000 }],
    },
    {
      text: "Add Chorus: about 50%.",
      why: "Chorus adds wobbling copies on the left and right: even more width and movement.",
      checks: [{ param: "chorus", min: 0.3, aim: 0.5 }],
    },
    {
      text: "Put it in a big room: Reverb to about 40% and Room Size to about 4 seconds.",
      why: "A long reverb tail is what turns a wide sound into a pad that fills the space.",
      checks: [
        { param: "reverbMix", min: 0.3, aim: 0.4 },
        { param: "reverbSize", min: 3, aim: 4 },
      ],
    },
    {
      text: "Hold a chord, let go, and play another.",
      why: "It swells in, shimmers wide, and the chords blur into each other as they fade.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's a supersaw pad: detuned saws times unison, spread wide, with a slow swell, chorus and a big reverb. It's the trance and EDM pad.",
};

export const RECIPES: Recipe[] = [reese, pluck, supersaw];
