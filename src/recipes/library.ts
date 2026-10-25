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

const acid: Recipe = {
  id: "acid",
  name: "Acid Bass",
  summary: "The squelchy, rubbery bass of acid house: a screaming filter that snaps shut.",
  category: "Bass",
  color: [127, 110, 0],
  steps: [
    {
      text: "Play a low note.",
      why: "Init again: one plain saw. Acid comes almost entirely from the filter, so that is where you'll spend this recipe.",
      checks: [{ play: "low" }],
    },
    {
      text: "Set Voice to mono.",
      why: "Acid lines are played one note at a time, and later notes will slide into each other.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Switch the filter's model to Ladder.",
      why: "The Ladder model copies the classic analog filter: it cuts more steeply and its resonance sings. That's the acid character.",
      checks: [{ param: "filterModel", is: 1 }],
    },
    {
      text: "Close the filter: Cutoff down to about 300 Hz.",
      why: "Very dark now. The filter envelope will open it again at the start of every note.",
      checks: [{ param: "cutoff", max: 500, aim: 300 }],
    },
    {
      text: "Raise Resonance high: about 14.",
      why: "Resonance boosts a narrow peak at the cutoff. High up it whistles: that's the 'squelch'.",
      checks: [{ param: "resonance", min: 9, aim: 14 }],
    },
    {
      text: "Turn the filter envelope's Amount (Filt Env) up to about +3.5 octaves.",
      why: "Each note now starts with the filter flung open and the resonant peak sweeping down.",
      checks: [{ param: "filterEnvAmt", min: 2.5, aim: 3.5 }],
    },
    {
      text: "Make the sweep snappy: F Decay down to about 180 ms.",
      why: "The faster the filter falls, the more 'wow' each note gets. Try short notes to hear it.",
      checks: [{ param: "filterDecay", max: 0.3, aim: 0.18 }],
    },
    {
      text: "Let it close all the way: F Sustain down to 0.",
      why: "Held notes now end up dark, so only the start of each note bites.",
      checks: [{ param: "filterSustain", max: 0.05, aim: 0 }],
    },
    {
      text: "Overdrive the filter: Drive to about 50%.",
      why: "With the Ladder model, Drive pushes the filter itself: the resonance gets rough and aggressive.",
      checks: [{ param: "drive", min: 0.35, aim: 0.5 }],
    },
    {
      text: "Add a slide between notes: Glide to about 80 ms.",
      why: "In mono, an overlapping note glides up or down from the last one instead of jumping. Hold one key and press another.",
      checks: [{ param: "glide", min: 0.04, max: 0.3, aim: 0.08 }],
    },
    {
      text: "Play a low line, overlapping some notes.",
      why: "Short notes bark, overlapping notes slide. Try the step sequencer with this sound too.",
      checks: [{ play: "low" }],
    },
  ],
  outro: "That's an acid bass: a ladder filter with high resonance, a fast filter envelope, drive and glide. It's the sound of the TB-303.",
};

const sub: Recipe = {
  id: "sub",
  name: "Sub Bass",
  summary: "A deep, round bass you feel more than hear.",
  category: "Bass",
  color: [50, 0, 60],
  steps: [
    {
      text: "Play a low note.",
      why: "A saw has lots of harmonics. A sub bass wants almost none: just the deep fundamental.",
      checks: [{ play: "low" }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "A sine is a single pure frequency, the note itself and nothing else. Deep and smooth, but it can vanish on small speakers.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Set Voice to mono.",
      why: "Two low notes at once turn to mud. Mono keeps the bass clean.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Set Osc 2's wave to Triangle.",
      why: "A triangle adds a few soft, odd harmonics: the bass starts to show on laptop speakers.",
      checks: [{ param: "osc2Wave", is: 1 }],
    },
    {
      text: "Mix in a little of Osc 2: Osc Mix to about 20%.",
      why: "Mostly sine, a little triangle. Turn it up and down to hear how much 'edge' it adds.",
      checks: [{ param: "oscMix", min: 0.1, max: 0.35, aim: 0.2 }],
    },
    {
      text: "Round it off: Cutoff down to about 900 Hz.",
      why: "The filter takes off any buzz the triangle brought, so the bass stays round.",
      checks: [{ param: "cutoff", max: 1500, aim: 900 }],
    },
    {
      text: "A touch of Drive: about 10%.",
      why: "A little saturation adds harmonics your ears use to 'hear' the low note, without making it gritty.",
      checks: [{ param: "drive", min: 0.05, max: 0.3, aim: 0.1 }],
    },
    {
      text: "A short slide: Glide to about 30 ms.",
      why: "Just enough to join overlapping notes smoothly.",
      checks: [{ param: "glide", min: 0.015, max: 0.1, aim: 0.03 }],
    },
    {
      text: "Play a few low notes.",
      why: "On headphones or big speakers you feel it. Compare with the Reese: same job, opposite approach.",
      checks: [{ play: "low" }],
    },
  ],
  outro: "That's a sub bass: a sine with a little triangle, filtered round, with a touch of drive so it carries on small speakers.",
};

const fmBass: Recipe = {
  id: "fmBass",
  name: "FM Bass",
  summary: "A punchy, metallic bass made by one oscillator wobbling another.",
  category: "Bass",
  color: [127, 40, 60],
  steps: [
    {
      text: "Play a low note.",
      why: "FM (frequency modulation) makes new harmonics without a filter: one wave bends the pitch of another, very fast.",
      checks: [{ play: "low" }],
    },
    {
      text: "Set Voice to mono.",
      why: "One bass note at a time.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "FM works best on pure sines: whatever harmonics you hear next come from the FM.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Set Osc 2's wave to Sine too.",
      why: "Osc 2 is the 'modulator': you won't hear it directly (Osc Mix stays on Osc 1), it only bends Osc 1.",
      checks: [{ param: "osc2Wave", is: 0 }],
    },
    {
      text: "Tune Osc 2 an octave up: Osc2 Pitch to +12.",
      why: "A modulator at twice the frequency gives harmonics that fit the note, so the bass stays in tune.",
      checks: [{ param: "osc2Semi", is: 12 }],
    },
    {
      text: "Raise FM Amount to about 35%.",
      why: "Osc 2 now wobbles Osc 1's pitch hundreds of times a second. Too fast to hear as a wobble, it turns into a bright, metallic growl. More amount, more growl.",
      checks: [{ param: "fmAmount", min: 0.2, max: 0.6, aim: 0.35 }],
    },
    {
      text: "Tame the top: Cutoff to about 1.5 kHz.",
      why: "FM can get very bright. The filter keeps the growl but takes off the fizz.",
      checks: [{ param: "cutoff", max: 2500, aim: 1500 }],
    },
    {
      text: "Add punch: Filt Env to about +2 octaves.",
      why: "Each note starts brighter and settles: a pluck on top of the growl.",
      checks: [{ param: "filterEnvAmt", min: 1.5, aim: 2 }],
    },
    {
      text: "Make the punch quick: F Decay to about 250 ms.",
      why: "A fast filter envelope makes each note hit hard.",
      checks: [{ param: "filterDecay", max: 0.35, aim: 0.25 }],
    },
    {
      text: "Play a low line.",
      why: "Turn FM Amount while you play: it's a great control to move live.",
      checks: [{ play: "low" }],
    },
  ],
  outro: "That's an FM bass: two sines, the second an octave up bending the first, with a quick filter envelope for punch.",
};

const syncLead: Recipe = {
  id: "syncLead",
  name: "Sync Lead",
  summary: "A screaming, tearing lead: hard sync with a pitch sweep on every note.",
  category: "Lead",
  color: [127, 80, 0],
  steps: [
    {
      text: "Play a note.",
      why: "Sync restarts one oscillator every time the other starts its cycle. It makes a bright, ripping tone.",
      checks: [{ play: "note" }],
    },
    {
      text: "Set Voice to mono.",
      why: "Leads are usually played one note at a time.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Listen to Osc 2: Osc Mix to about 75%.",
      why: "The sync sound happens in Osc 2, so it needs to be the louder one.",
      checks: [{ param: "oscMix", min: 0.6, aim: 0.75 }],
    },
    {
      text: "Turn Sync on.",
      why: "Osc 2's wave is now restarted by Osc 1 every cycle. You won't hear much yet: both are at the same pitch.",
      checks: [{ param: "oscSync", is: 1 }],
    },
    {
      text: "Raise Osc2 Pitch to about +7.",
      why: "With sync, Osc 2's pitch changes its tone, not the note you hear. Sweep it to hear the tearing sound, then leave it near +7.",
      checks: [{ param: "osc2Semi", min: 4, max: 19, aim: 7 }],
    },
    {
      text: "Point the pitch envelope at Osc 2 only: set P Env To to 'osc 2'.",
      why: "The pitch envelope will sweep only Osc 2, so the note stays put while its tone sweeps.",
      checks: [{ param: "pitchEnvTarget", is: 1 }],
    },
    {
      text: "Raise Pitch Env to about +24 semitones.",
      why: "Every note now starts with Osc 2 two octaves higher and sweeps down: the classic sync 'scream'.",
      checks: [{ param: "pitchEnvAmt", min: 12, aim: 24 }],
    },
    {
      text: "Slow the sweep: P Decay to about 700 ms.",
      why: "A longer sweep you can hear as a 'yow' on every note.",
      checks: [{ param: "pitchEnvDecay", min: 0.4, max: 1.5, aim: 0.7 }],
    },
    {
      text: "Take the harsh edge off: Cutoff to about 5 kHz.",
      why: "Sync makes a lot of high harmonics. A little filtering keeps it bright but not painful.",
      checks: [{ param: "cutoff", max: 7000, aim: 5000 }],
    },
    {
      text: "Add echoes: Delay to about 25%.",
      why: "Leads love a delay: the repeats fill the gaps between phrases.",
      checks: [{ param: "delayMix", min: 0.15, aim: 0.25 }],
    },
    {
      text: "Play a melody.",
      why: "Each note screams in. Try the pitch strip for bends.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's a sync lead: Osc 2 synced to Osc 1, its pitch swept by the pitch envelope on every note. It's the lead of 80s synth-pop and many video games.",
};

const vowelLead: Recipe = {
  id: "vowelLead",
  name: "Vowel Lead",
  summary: "A lead that sings 'ah-ee-oh' by sweeping through a wavetable of vowels.",
  category: "Lead",
  color: [127, 60, 127],
  steps: [
    {
      text: "Play a note.",
      why: "This recipe uses a wavetable: a stack of waves you can move through. One table here holds vowel sounds.",
      checks: [{ play: "note" }],
    },
    {
      text: "Set Osc 1's wave to Table.",
      why: "Osc 1 now plays a wavetable instead of a fixed wave shape.",
      checks: [{ param: "osc1Wave", is: 4 }],
    },
    {
      text: "Pick the Vowels table (the Wavetable menu in Oscillator 1).",
      why: "Each wave in this table is shaped like a sung vowel.",
      checks: [{ param: "wtTable", is: 5 }],
    },
    {
      text: "Turn WT Pos (wavetable position) to the middle.",
      why: "Position picks a place in the table. Sweep it slowly: the vowel changes. Leave it near the middle.",
      checks: [{ param: "wtPos", min: 0.3, max: 0.7, aim: 0.5 }],
    },
    {
      text: "Let an LFO move it: set LFO 2's To to WT Pos.",
      why: "LFO 2 will now sweep the position for you, so the vowels change by themselves.",
      checks: [{ param: "lfo2Target", is: 4 }],
    },
    {
      text: "Speed it up: LFO 2 Rate to about 1 Hz.",
      why: "About one vowel change per second: it starts to sound like talking.",
      checks: [{ param: "lfo2Rate", min: 0.7, max: 2.5, aim: 1 }],
    },
    {
      text: "Raise LFO 2 Depth to about 90%.",
      why: "Depth is how far the sweep goes: most of the table, through all the vowels.",
      checks: [{ param: "lfo2Depth", min: 0.6, aim: 0.9 }],
    },
    {
      text: "Set Voice to mono.",
      why: "A singing lead: one voice, one note at a time.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Add Glide: about 60 ms.",
      why: "Singers slide between notes; glide does the same.",
      checks: [{ param: "glide", min: 0.03, max: 0.2, aim: 0.06 }],
    },
    {
      text: "Add echoes: Delay to about 25%.",
      why: "The repeats keep singing while you play the next note.",
      checks: [{ param: "delayMix", min: 0.15, aim: 0.25 }],
    },
    {
      text: "Play a melody and hold some notes.",
      why: "Long notes sing through the vowels. Push the mod strip for vibrato.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's a vowel lead: a vowel wavetable, its position swept by an LFO, played mono with glide.",
};

const pwmStrings: Recipe = {
  id: "pwmStrings",
  name: "PWM Strings",
  summary: "Lush analog strings: square waves whose width slowly breathes.",
  category: "Pad",
  color: [0, 100, 127],
  steps: [
    {
      text: "Hold a chord.",
      why: "PWM (pulse width modulation) is the trick behind the warm string pads of the 70s and 80s.",
      checks: [{ play: "chord" }],
    },
    {
      text: "Bring in Osc 2: Osc Mix to the middle.",
      why: "Both oscillators will play pulse waves, slightly apart.",
      checks: [{ param: "oscMix", min: 0.35, max: 0.65, aim: 0.5 }],
    },
    {
      text: "Set Osc 1's wave to Square.",
      why: "A square wave: hollow and woody.",
      checks: [{ param: "osc1Wave", is: 3 }],
    },
    {
      text: "Set Osc 2's wave to Square too.",
      why: "Pulse Width works on the square wave of both oscillators.",
      checks: [{ param: "osc2Wave", is: 3 }],
    },
    {
      text: "Narrow the pulse: Pulse Width to about 30%.",
      why: "A narrower pulse sounds thinner and more nasal. Sweep it to hear the change, then leave it near 30%.",
      checks: [{ param: "pulseWidth", max: 0.38, aim: 0.3 }],
    },
    {
      text: "Let an LFO move the width: set LFO 2's To to Width.",
      why: "LFO 2 will sweep the pulse width for you. That movement is PWM.",
      checks: [{ param: "lfo2Target", is: 3 }],
    },
    {
      text: "Make it slow: LFO 2 Rate to about 0.35 Hz.",
      why: "About one sweep every three seconds: the sound breathes instead of wobbling.",
      checks: [{ param: "lfo2Rate", max: 0.45, aim: 0.35 }],
    },
    {
      text: "Raise LFO 2 Depth to about 45%.",
      why: "Hold a chord: the strings shimmer and move, like a whole section playing.",
      checks: [{ param: "lfo2Depth", min: 0.3, aim: 0.45 }],
    },
    {
      text: "Detune Osc 2 by about 9 cents.",
      why: "The two oscillators drift against each other: even more movement.",
      checks: [{ param: "osc2Detune", min: 5, max: 20, aim: 9 }],
    },
    {
      text: "Bow it in: Attack to about 450 ms (fader 1).",
      why: "Strings swell in rather than start with a hit.",
      checks: [{ param: "attack", min: 0.3, aim: 0.45 }],
    },
    {
      text: "Let it ring out: Release to about 1.3 s (fader 4).",
      why: "Chords now fade away after you let go.",
      checks: [{ param: "release", min: 0.9, aim: 1.3 }],
    },
    {
      text: "Warm it up: Cutoff to about 2.6 kHz.",
      why: "Taking off the top makes the strings soft and warm.",
      checks: [{ param: "cutoff", min: 1200, max: 4000, aim: 2600 }],
    },
    {
      text: "Add Chorus: about 50%.",
      why: "Chorus spreads the strings wide: the classic 'string machine' sound.",
      checks: [{ param: "chorus", min: 0.3, aim: 0.5 }],
    },
    {
      text: "Hold a chord, then play another.",
      why: "Listen to the slow breathing of the pulse width under the chorus.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's PWM strings: two detuned pulse waves whose width an LFO slowly sweeps, with a slow attack and chorus.",
};

const scanPad: Recipe = {
  id: "scanPad",
  name: "Wavetable Scan Pad",
  summary: "A pad that slowly changes colour as it scans through a wavetable.",
  category: "Pad",
  color: [40, 127, 90],
  steps: [
    {
      text: "Hold a chord.",
      why: "A wavetable is a stack of waves. This pad moves slowly through one, so the tone keeps changing while you hold.",
      checks: [{ play: "chord" }],
    },
    {
      text: "Set Osc 1's wave to Table.",
      why: "Osc 1 now plays a wavetable.",
      checks: [{ param: "osc1Wave", is: 4 }],
    },
    {
      text: "Pick the Formant Sweep table (the Wavetable menu in Oscillator 1).",
      why: "Its waves go from dark to bright with a vocal-like peak moving through them.",
      checks: [{ param: "wtTable", is: 4 }],
    },
    {
      text: "Set LFO 2's To to WT Pos.",
      why: "LFO 2 will move through the table for you.",
      checks: [{ param: "lfo2Target", is: 4 }],
    },
    {
      text: "Make it very slow: LFO 2 Rate to about 0.12 Hz.",
      why: "One trip through the table every eight seconds or so: the change is felt more than heard.",
      checks: [{ param: "lfo2Rate", max: 0.2, aim: 0.12 }],
    },
    {
      text: "Raise LFO 2 Depth to about 90%.",
      why: "The scan now covers most of the table: listen to the chord slowly change colour.",
      checks: [{ param: "lfo2Depth", min: 0.6, aim: 0.9 }],
    },
    {
      text: "Thicken it: Unison to 3 voices.",
      why: "Three slightly detuned copies of every note: wide and rich.",
      checks: [{ param: "unison", is: 3 }],
    },
    {
      text: "Swell in: Attack to about 800 ms (fader 1).",
      why: "Pads rise slowly.",
      checks: [{ param: "attack", min: 0.5, aim: 0.8 }],
    },
    {
      text: "Fade out slowly: Release to about 2.5 s (fader 4).",
      why: "Chords blur into each other.",
      checks: [{ param: "release", min: 1.5, aim: 2.5 }],
    },
    {
      text: "Add space: Reverb to about 50%.",
      why: "A big reverb turns it into a backdrop.",
      checks: [{ param: "reverbMix", min: 0.35, aim: 0.5 }],
    },
    {
      text: "Hold a chord for a while.",
      why: "Watch the Wavetable tab too: the lit wave moves through the stack as you hear it change.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's a wavetable scan pad: a slow LFO moving through a wavetable, with unison, a slow swell and reverb.",
};

const laser: Recipe = {
  id: "laser",
  name: "Laser",
  summary: "A sci-fi 'pew': each note dives from very high, with echoes.",
  category: "FX",
  color: [127, 20, 20],
  steps: [
    {
      text: "Play a note.",
      why: "A laser is a short note whose pitch falls fast. The pitch envelope does that.",
      checks: [{ play: "note" }],
    },
    {
      text: "Make it short: Sustain down to 0 (fader 3).",
      why: "Every note now fades out by itself.",
      checks: [{ param: "sustain", max: 0.05, aim: 0 }],
    },
    {
      text: "Shorten the fade: Decay to about 350 ms (fader 2).",
      why: "A quick zap, not a long tone.",
      checks: [{ param: "decay", max: 0.5, aim: 0.35 }],
    },
    {
      text: "Raise Pitch Env to about +40 semitones.",
      why: "Every note now starts more than three octaves higher and dives down to the note you played: pew!",
      checks: [{ param: "pitchEnvAmt", min: 24, aim: 40 }],
    },
    {
      text: "Set the dive's length: P Decay to about 300 ms.",
      why: "Shorter is a click, longer a falling whistle. Try both, then settle near 300 ms.",
      checks: [{ param: "pitchEnvDecay", min: 0.2, max: 0.6, aim: 0.3 }],
    },
    {
      text: "Add echoes: Delay to about 30%.",
      why: "The repeats make it sound like a shot across a big space.",
      checks: [{ param: "delayMix", min: 0.2, aim: 0.3 }],
    },
    {
      text: "More repeats: Feedback to about 50%.",
      why: "Feedback sends the echoes back into the delay, so each one repeats again.",
      checks: [{ param: "delayFeedback", min: 0.45, aim: 0.5 }],
    },
    {
      text: "Fire a few: play short notes, high and low.",
      why: "High notes give thin zaps, low notes heavy blasts.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's a laser: a short note with a big, fast pitch envelope, and a delay with feedback.",
};

const wind: Recipe = {
  id: "wind",
  name: "Wind",
  summary: "Gusts of wind made from filtered noise that rises and falls.",
  category: "FX",
  color: [60, 127, 127],
  steps: [
    {
      text: "Play a note and hold it.",
      why: "Wind has no pitch. It comes from noise, a random hiss, shaped by the filter.",
      checks: [{ play: "note" }],
    },
    {
      text: "Raise Noise all the way: about 100%.",
      why: "Hiss on top of the saw. The next step quiets the saw.",
      checks: [{ param: "noiseLevel", min: 0.8, aim: 1 }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "A sine is soft: under the noise it becomes a faint whistle in the wind.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Make the filter a band-pass: Filt Morph to the middle.",
      why: "A band-pass keeps only a band of frequencies around the cutoff: the hiss turns into a 'whoosh'.",
      checks: [{ param: "filterMorph", min: 0.4, max: 0.6, aim: 0.5 }],
    },
    {
      text: "Cutoff to about 900 Hz.",
      why: "The band sits lower: a deeper, softer wind. Sweep it to hear the wind rise and fall.",
      checks: [{ param: "cutoff", min: 400, max: 1600, aim: 900 }],
    },
    {
      text: "Key Track to 100%.",
      why: "The cutoff now follows the key you play: high keys whistle, low keys rumble.",
      checks: [{ param: "keyTrack", min: 0.9, aim: 1 }],
    },
    {
      text: "Let it gust: set LFO 1's To to Filter.",
      why: "LFO 1 will move the band up and down.",
      checks: [{ param: "lfoTarget", is: 1 }],
    },
    {
      text: "Slow the gusts: LFO Rate to about 0.15 Hz.",
      why: "One gust every few seconds.",
      checks: [{ param: "lfoRate", max: 0.3, aim: 0.15 }],
    },
    {
      text: "Raise LFO Depth to about 60%.",
      why: "The wind now swells and dies down by itself.",
      checks: [{ param: "lfoDepth", min: 0.4, aim: 0.6 }],
    },
    {
      text: "Fade it in and out: Attack to about 1.2 s (fader 1) and Release to about 3 s (fader 4).",
      why: "Wind doesn't start or stop suddenly.",
      checks: [
        { param: "attack", min: 0.8, aim: 1.2 },
        { param: "release", min: 2, aim: 3 },
      ],
    },
    {
      text: "Add a big space: Reverb to about 60%.",
      why: "Outdoors is a huge room.",
      checks: [{ param: "reverbMix", min: 0.45, aim: 0.6 }],
    },
    {
      text: "Hold a low note and a high note.",
      why: "Two winds at once: a rumble and a whistle, gusting on their own.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's wind: noise through a band-pass filter that follows the keys, moved by a slow LFO, with slow fades and reverb.",
};

const toms: Recipe = {
  id: "toms",
  name: "Synth Toms",
  summary: "The 'pew' drums of disco and 80s pop, from a sine and a pitch envelope.",
  category: "FX",
  color: [127, 60, 0],
  steps: [
    {
      text: "Play a low note.",
      why: "Synth drums are very short notes whose pitch drops fast.",
      checks: [{ play: "low" }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "A drum's body is close to a pure tone.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Make it a hit: Sustain down to 0 (fader 3).",
      why: "Every note fades out by itself, like a struck drum.",
      checks: [{ param: "sustain", max: 0.05, aim: 0 }],
    },
    {
      text: "Shorten it: Decay to about 450 ms (fader 2).",
      why: "A drum's ring is short.",
      checks: [{ param: "decay", max: 0.6, aim: 0.45 }],
    },
    {
      text: "Raise Pitch Env to about +14 semitones.",
      why: "Each hit starts higher and drops: a drum skin is tighter at the moment it's struck.",
      checks: [{ param: "pitchEnvAmt", min: 8, max: 30, aim: 14 }],
    },
    {
      text: "Set the drop: P Decay to about 250 ms.",
      why: "Shorter is a tight tom, longer the 'pew' of a disco tom.",
      checks: [{ param: "pitchEnvDecay", min: 0.2, max: 0.4, aim: 0.25 }],
    },
    {
      text: "Add a little stick: Noise to about 12%.",
      why: "A dash of noise at the start sounds like the stick hitting the skin.",
      checks: [{ param: "noiseLevel", min: 0.06, max: 0.3, aim: 0.12 }],
    },
    {
      text: "Add punch: Drive to about 30%.",
      why: "Saturation makes the hit thicker.",
      checks: [{ param: "drive", min: 0.2, aim: 0.3 }],
    },
    {
      text: "Play harder for louder: Velocity to about 90%.",
      why: "Drums respond to how hard you hit. Soft and hard key presses now sound very different.",
      checks: [{ param: "velocity", min: 0.8, aim: 0.9 }],
    },
    {
      text: "Play a fill: a few low notes, high to low.",
      why: "Each key is a different tom. Try them with the drum loop running.",
      checks: [{ play: "low" }],
    },
  ],
  outro: "That's a synth tom: a sine with a fast decay, a pitch drop, a bit of noise and drive, and velocity.",
};

const ePiano: Recipe = {
  id: "ePiano",
  name: "E-Piano",
  summary: "A soft electric piano with a gentle tremolo, like a Rhodes.",
  category: "Keys",
  color: [127, 80, 40],
  steps: [
    {
      text: "Play a chord.",
      why: "An electric piano is a struck tone that rings and slowly fades, round and bell-like.",
      checks: [{ play: "chord" }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "The body of the tone: soft and round.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Set Osc 2's wave to Triangle.",
      why: "Osc 2 will add a brighter 'tine' an octave above.",
      checks: [{ param: "osc2Wave", is: 1 }],
    },
    {
      text: "Tune Osc 2 an octave up: Osc2 Pitch to +12.",
      why: "Higher partials give the bell-like shine of a struck metal tine.",
      checks: [{ param: "osc2Semi", is: 12 }],
    },
    {
      text: "Mix it in a little: Osc Mix to about 30%.",
      why: "Mostly body, a little shine.",
      checks: [{ param: "oscMix", min: 0.2, max: 0.45, aim: 0.3 }],
    },
    {
      text: "Let notes fade while held: Sustain to about 25% (fader 3).",
      why: "A piano note dies away even if you hold the key, but not to silence straight away.",
      checks: [{ param: "sustain", min: 0.1, max: 0.4, aim: 0.25 }],
    },
    {
      text: "A long fade: Decay to about 1.6 s (fader 2).",
      why: "The note rings, then settles.",
      checks: [{ param: "decay", min: 1.2, aim: 1.6 }],
    },
    {
      text: "Play softer for quieter: Velocity to about 90%.",
      why: "A piano is all about touch: soft notes quiet, hard notes loud.",
      checks: [{ param: "velocity", min: 0.8, aim: 0.9 }],
    },
    {
      text: "Soften the top: Cutoff to about 2.2 kHz.",
      why: "Rounder and warmer.",
      checks: [{ param: "cutoff", min: 1000, max: 3500, aim: 2200 }],
    },
    {
      text: "Brighten each strike: Filt Env to about +1.5 octaves.",
      why: "Each note starts a little brighter, like the hammer hitting the tine.",
      checks: [{ param: "filterEnvAmt", min: 1, aim: 1.5 }],
    },
    {
      text: "Add tremolo: set LFO 1's To to Amp.",
      why: "LFO 1 will move the volume up and down: the famous Rhodes wobble.",
      checks: [{ param: "lfoTarget", is: 2 }],
    },
    {
      text: "Raise LFO Depth to about 25%.",
      why: "Gentle: you should feel it more than hear it.",
      checks: [{ param: "lfoDepth", min: 0.15, max: 0.45, aim: 0.25 }],
    },
    {
      text: "Add Chorus: about 45%.",
      why: "Chorus widens it, like the stereo effects players put on their pianos.",
      checks: [{ param: "chorus", min: 0.3, aim: 0.45 }],
    },
    {
      text: "Play some chords, soft and hard.",
      why: "Turn on Scale lock with 7ths for instant jazz chords.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's an e-piano: a sine with an octave-up triangle, a long decay, velocity, a gentle filter strike, tremolo and chorus.",
};

const bell: Recipe = {
  id: "bell",
  name: "Bell",
  summary: "A glassy, ringing bell made with FM at an odd ratio.",
  category: "Keys",
  color: [90, 110, 127],
  steps: [
    {
      text: "Play a note.",
      why: "Bells ring with partials that don't line up like an ordinary note's harmonics. FM at an odd tuning makes exactly that.",
      checks: [{ play: "note" }],
    },
    {
      text: "Set Osc 1's wave to Sine.",
      why: "FM starts from pure tones.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Set Osc 2's wave to Sine too.",
      why: "Osc 2 will bend Osc 1's pitch (it stays silent itself: Osc Mix is on Osc 1).",
      checks: [{ param: "osc2Wave", is: 0 }],
    },
    {
      text: "Tune Osc 2 to an odd interval: Osc2 Pitch to about +22.",
      why: "Not an octave or a fifth, so the new partials don't fit the note: that's what makes it sound metallic.",
      checks: [{ param: "osc2Semi", min: 20, max: 23, aim: 22 }],
    },
    {
      text: "Raise FM Amount to about 45%.",
      why: "Now you hear it: a clangy, bell-like tone. Turn it up and down to hear the partials appear.",
      checks: [{ param: "fmAmount", min: 0.3, max: 0.7, aim: 0.45 }],
    },
    {
      text: "Strike and ring: Sustain down to 0 (fader 3).",
      why: "A bell is struck once and rings out.",
      checks: [{ param: "sustain", max: 0.05, aim: 0 }],
    },
    {
      text: "A long ring: Decay to about 2.5 s (fader 2).",
      why: "Bells ring for a long time.",
      checks: [{ param: "decay", min: 1.8, aim: 2.5 }],
    },
    {
      text: "Keep ringing after you let go: Release to about 2 s (fader 4).",
      why: "A real bell doesn't stop when you lift your finger.",
      checks: [{ param: "release", min: 1.2, aim: 2 }],
    },
    {
      text: "Darken it: Cutoff to about 900 Hz.",
      why: "Dull for now. The filter envelope brings back the brightness, at the strike only.",
      checks: [{ param: "cutoff", max: 1500, aim: 900 }],
    },
    {
      text: "Raise Filt Env to about +4 octaves.",
      why: "Each strike is bright, then mellows.",
      checks: [{ param: "filterEnvAmt", min: 3, aim: 4 }],
    },
    {
      text: "Make the brightness fade slowly: F Decay to about 1.4 s.",
      why: "The high partials die away first, as in a real bell.",
      checks: [{ param: "filterDecay", min: 1, aim: 1.4 }],
    },
    {
      text: "Put it in a hall: Reverb to about 40% and Room Size to about 4 s.",
      why: "Bells live in big, echoing spaces.",
      checks: [
        { param: "reverbMix", min: 0.3, aim: 0.4 },
        { param: "reverbSize", min: 3, aim: 4 },
      ],
    },
    {
      text: "Play a few notes and let them ring.",
      why: "High notes sparkle, low notes boom like a church bell.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's an FM bell: two sines at an odd ratio, a long ring, and a filter envelope that lets the brightness fade first.",
};

// ---------------------------------------------------------------- Classics
// Famous sounds, built step by step. Each ends at about the matching preset in the Classics group.

const stadiumBrass: Recipe = {
  id: "stadium-brass",
  name: "Stadium Brass",
  summary: "The big 80s synth brass of the Oberheim OB-Xa, as on Van Halen's \"Jump\" (1983).",
  category: "Classics",
  color: [127, 70, 0],
  steps: [
    {
      text: "Hold a chord (3 notes or more).",
      why: "One plain saw per note. The OB-Xa's brass has two oscillators per note, slightly apart, and a filter that 'blows' open.",
      checks: [{ play: "chord" }],
    },
    {
      text: "Bring in Oscillator 2: turn Osc Mix to the middle.",
      why: "Two saws per note, at the same pitch for now.",
      checks: [{ param: "oscMix", min: 0.4, max: 0.6, aim: 0.5 }],
    },
    {
      text: "Detune Osc 2 by about 9 cents.",
      why: "The two saws now drift against each other: the chord gets thick and alive, like an analog polysynth.",
      checks: [{ param: "osc2Detune", min: 6, max: 20, aim: 9 }],
    },
    {
      text: "Set Unison to 2 voices.",
      why: "Each oscillator doubles up. More saws per note make it big enough for a stadium.",
      checks: [{ param: "unison", is: 2 }],
    },
    {
      text: "Close the filter: turn Cutoff down to about 700 Hz.",
      why: "The chord goes dull and muffled. The filter envelope will open it on every chord.",
      checks: [{ param: "cutoff", min: 400, max: 1100, aim: 700 }],
    },
    {
      text: "Raise Filt Env to about +2.8 octaves, and play a chord.",
      why: "Each chord now starts bright and darkens. That bright start is the 'blare' of brass.",
      checks: [{ param: "filterEnvAmt", min: 2, aim: 2.8 }],
    },
    {
      text: "Soften the blare: set the filter's Attack to about 60 ms.",
      why: "The brightness now swells in over a moment instead of clicking on, the way a horn player's breath builds.",
      checks: [{ param: "filterAttack", min: 0.03, max: 0.2, aim: 0.06 }],
    },
    {
      text: "Keep it bright while held: raise the filter's Sustain to about 55%.",
      why: "After the blare, held chords stay fairly open instead of going dull.",
      checks: [{ param: "filterSustain", min: 0.4, max: 0.7, aim: 0.55 }],
    },
    {
      text: "Let chords ring a little after you let go: Release to about 350 ms (fader 4).",
      why: "A short tail makes the stabs sound full instead of chopped off.",
      checks: [{ param: "release", min: 0.25, max: 0.8, aim: 0.35 }],
    },
    {
      text: "Add some chorus: about 35%.",
      why: "Chorus adds slightly moving copies: the brass gets wider and shinier, very 80s.",
      checks: [{ param: "chorus", min: 0.25, aim: 0.35 }],
    },
    {
      text: "Put it on a stage: Reverb to about 22%.",
      why: "A little room makes it sound like a band, not a box.",
      checks: [{ param: "reverbMix", min: 0.15, aim: 0.22 }],
    },
    {
      text: "Play big chords with a bouncy rhythm.",
      why: "Try the 'Jump' feel: short chords on and off the beat. Listen for the blare at each start.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's OB-Xa-style brass: two detuned saws per note, doubled, with a filter envelope that blares open and settles. Compare it with \"Jump\" and with the Stadium Brass preset.",
};

const hoover: Recipe = {
  id: "hoover",
  name: "Hoover",
  summary: "The rave \"Hoover\" of the Roland Alpha Juno, as on Joey Beltram's \"Mentasm\" (1991).",
  category: "Classics",
  color: [110, 0, 127],
  steps: [
    {
      text: "Play a low note and hold it.",
      why: "A plain saw. The Hoover is a saw and a moving pulse, detuned, spread wide and smeared by chorus, with a pitch that scoops up.",
      checks: [{ play: "low" }],
    },
    {
      text: "Bring in Oscillator 2: turn Osc Mix to just past the middle.",
      why: "Osc 2 will be the pulse wave half of the sound.",
      checks: [{ param: "oscMix", min: 0.45, max: 0.65, aim: 0.55 }],
    },
    {
      text: "Set Osc 2's wave to square.",
      why: "A square is a pulse wave: soon its width will move.",
      checks: [{ param: "osc2Wave", is: 3 }],
    },
    {
      text: "Drop Osc 2 an octave: Osc2 Pitch to -12 semitones.",
      why: "The pulse now sits under the saw, which gives the Hoover its weight.",
      checks: [{ param: "osc2Semi", is: -12 }],
    },
    {
      text: "Detune Osc 2 by about 15 cents.",
      why: "A wide detune makes the two waves rub hard: the start of the 'vacuum cleaner' roar.",
      checks: [{ param: "osc2Detune", min: 10, max: 30, aim: 15 }],
    },
    {
      text: "Narrow the pulse: Pulse Width to about 30%.",
      why: "A narrower pulse sounds thinner and more nasal.",
      checks: [{ param: "pulseWidth", min: 0.2, max: 0.4, aim: 0.3 }],
    },
    {
      text: "Let LFO 2 move the pulse: set LFO 2's To to Width.",
      why: "Moving the pulse width makes the sound churn by itself (PWM).",
      checks: [{ param: "lfo2Target", is: 3 }],
    },
    {
      text: "Raise LFO 2 Depth to about 50%.",
      why: "Now you can hear the pulse churning under the saw.",
      checks: [{ param: "lfo2Depth", min: 0.3, aim: 0.5 }],
    },
    {
      text: "Speed it up: LFO 2 Rate to about 2.5 Hz.",
      why: "A faster churn gives the Hoover its restless movement.",
      checks: [{ param: "lfo2Rate", min: 1.5, max: 5, aim: 2.5 }],
    },
    {
      text: "Set Unison to 3 voices.",
      why: "Three copies of each oscillator: the roar gets huge.",
      checks: [{ param: "unison", is: 3 }],
    },
    {
      text: "Spread them out: Stereo to 100%.",
      why: "The copies move left and right. Headphones help here.",
      checks: [{ param: "stereoWidth", min: 0.9, aim: 1 }],
    },
    {
      text: "Make each note scoop up: Pitch Env to about -5 semitones.",
      why: "Every note now starts below its pitch and swoops up into it: the Hoover's famous 'whoop'.",
      checks: [{ param: "pitchEnvAmt", max: -3, aim: -5 }],
    },
    {
      text: "Slow the scoop: P Decay to about 350 ms.",
      why: "A slower swoop is easier to hear and more dramatic.",
      checks: [{ param: "pitchEnvDecay", min: 0.25, max: 0.6, aim: 0.35 }],
    },
    {
      text: "Smear it with chorus: about 90%.",
      why: "Heavy chorus was always on in the Alpha Juno's Hoover: it melts everything into one roaring mass.",
      checks: [{ param: "chorus", min: 0.7, aim: 0.9 }],
    },
    {
      text: "Play low chords and short stabs.",
      why: "Listen for the scoop at each start and the churning, wide roar.",
      checks: [{ play: "chord" }],
    },
  ],
  outro: "That's the Hoover: a detuned saw and moving pulse, wide unison, a pitch scoop and heavy chorus. Compare it with \"Mentasm\" and with the Hoover preset.",
};

const gFunk: Recipe = {
  id: "g-funk",
  name: "G-Funk Whine",
  summary: "The high, sliding Minimoog lead of early-90s G-funk, as on Dr. Dre's \"The Chronic\" (1992).",
  category: "Classics",
  color: [127, 90, 0],
  steps: [
    {
      text: "Play a note high up and hold it.",
      why: "A bright saw. The G-funk lead is the opposite: soft and round, and it slides between notes.",
      checks: [{ play: "note" }],
    },
    {
      text: "Set Osc 1's wave to sine.",
      why: "A sine is the purest tone: no buzz at all. High up, it whistles.",
      checks: [{ param: "osc1Wave", is: 0 }],
    },
    {
      text: "Raise Osc 2 an octave: Osc2 Pitch to +12 semitones.",
      why: "Osc 2 will add a little edge an octave above.",
      checks: [{ param: "osc2Semi", is: 12 }],
    },
    {
      text: "Set Osc 2's wave to triangle.",
      why: "A triangle is soft too, but with a few more overtones than a sine.",
      checks: [{ param: "osc2Wave", is: 1 }],
    },
    {
      text: "Mix in a little of Osc 2: Osc Mix to about 25%.",
      why: "Just enough to give the tone a bit of a nasal 'whine'.",
      checks: [{ param: "oscMix", min: 0.15, max: 0.4, aim: 0.25 }],
    },
    {
      text: "Play one note at a time: set Voice to mono.",
      why: "The slide only works between notes on one voice.",
      checks: [{ param: "mono", is: 1 }],
    },
    {
      text: "Make it slide: Glide to about 180 ms.",
      why: "Now each note glides up or down to the next. Overlap the notes to hear it.",
      checks: [{ param: "glide", min: 0.1, max: 0.4, aim: 0.18 }],
    },
    {
      text: "Add vibrato: raise LFO 1 Depth to about 15%.",
      why: "LFO 1 already points at the pitch at about 5 Hz: a gentle wobble, like a singer's vibrato.",
      checks: [{ param: "lfoDepth", min: 0.08, max: 0.3, aim: 0.15 }],
    },
    {
      text: "Switch the filter to the Moog-style ladder: Filt Model to ladder.",
      why: "The ladder is a copy of the Minimoog's filter, the one these leads were played on.",
      checks: [{ param: "filterModel", is: 1 }],
    },
    {
      text: "Round off the top: Cutoff to about 3 kHz.",
      why: "The octave above gets softer, so the whine is smooth, not piercing.",
      checks: [{ param: "cutoff", min: 2000, max: 4500, aim: 3000 }],
    },
    {
      text: "Give the filter a little bite: Resonance to about 3.",
      why: "A touch of resonance adds a slight vocal quality.",
      checks: [{ param: "resonance", min: 2, max: 5, aim: 3 }],
    },
    {
      text: "Add an echo: Delay to about 20%.",
      why: "The echoes follow the slides and fill the space between phrases.",
      checks: [{ param: "delayMix", min: 0.12, aim: 0.2 }],
    },
    {
      text: "And a little room: Reverb to about 20%.",
      why: "It sits the lead back in the mix, like on the records.",
      checks: [{ param: "reverbMix", min: 0.12, aim: 0.2 }],
    },
    {
      text: "Play a slow melody high up, overlapping the notes so they slide.",
      why: "Listen for the soft whistle, the slides and the vibrato.",
      checks: [{ play: "note" }],
    },
  ],
  outro: "That's the G-funk whine: a sine and a soft octave above, gliding, with vibrato, rounded by a ladder filter. Compare it with \"The Chronic\" and with the G-Funk Whine preset.",
};

/** In the order the recipe browser shows them, group by group. */
export const RECIPES: Recipe[] = [reese, acid, sub, fmBass, syncLead, vowelLead, pluck, ePiano, bell, supersaw, pwmStrings, scanPad, laser, wind, toms, stadiumBrass, hoover, gFunk];
