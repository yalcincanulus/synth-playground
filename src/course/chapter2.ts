// Chapter 2: envelopes. The amp envelope one stage at a time (each fader appears once it is explained),
// two classic shapes side by side, then the filter envelope.

import type { Chapter } from "./lesson";

/** Every page plays the sawtooth from chapter 1: its harmonics make the changes easy to hear. */
const SAW = { osc1Wave: 2 };

const PLUCK = { attack: 0.003, decay: 0.35, sustain: 0, release: 0.3 };
const PAD = { attack: 0.9, decay: 1, sustain: 0.9, release: 1.8 };

export const CHAPTER_2: Chapter = {
  id: "envelopes",
  title: "Shaping over time",
  recipes: ["pluck", "supersaw"],
  lessons: [
    {
      id: "attack",
      title: "Attack",
      text: [
        "So far every note jumped to full volume the moment you pressed a key, stayed there, and stopped when you let go. Real sounds have a shape in time: a piano note strikes and fades, a violin can swell in slowly.",
        "A synth shapes each note with an **envelope**: a line that rises and falls once per note. The **Amp Envelope** moves the note's volume. It has four stages, and this chapter takes them one at a time.",
        "The first is **Attack**: how long the note takes to rise from silence to full volume. A short attack starts at once, like a struck note; a long one fades in.",
      ],
      widget: {
        kind: "compare",
        picture: "amp",
        a: { label: "Short attack", text: "5 ms: starts at once, like a struck note.", values: { attack: 0.005 } },
        b: { label: "Long attack", text: "1.5 s: fades in, like a bowed string.", values: { attack: 1.5 } },
      },
      blocks: ["osc1", "amp", "output"],
      modulators: ["ampEnv"],
      knobs: [],
      faders: ["attack"],
      sound: { ...SAW, attack: 0.005 },
      steps: [
        {
          text: "Hold a note, then switch to B (click B{{, or click the encoder}}).",
          why: "The note now takes a second and a half to reach full volume. The dot in the picture shows where the note is.",
          checks: [{ param: "attack", min: 1, aim: 1.5 }],
        },
        {
          text: "Move [[attack]] to about 300 ms.",
          why: "A soft start, but still quick enough to play a tune.",
          checks: [{ param: "attack", min: 0.15, max: 0.6, aim: 0.3 }],
        },
        {
          text: "Play a few notes, one after another.",
          why: "Each note has its own envelope: every key you press starts it again from the beginning.",
          checks: [{ play: "note" }],
        },
      ],
    },
    {
      id: "decay-sustain",
      title: "Decay and Sustain",
      text: [
        "After the attack, the envelope can fall back. **Decay** is how long that fall takes, and **Sustain** is the level it falls to. The note then stays at that level for as long as you hold the key.",
        "With Sustain at full, as now, there is nothing to fall to, so Decay does nothing. That is why the notes so far sounded like an organ.",
        "Sustain is the one stage that is a level, not a time.",
      ],
      widget: { kind: "envelope", which: "amp" },
      blocks: ["osc1", "amp", "output"],
      modulators: ["ampEnv"],
      knobs: [],
      faders: ["attack", "decay", "sustain"],
      sound: { ...SAW, attack: 0.005, decay: 1, sustain: 1 },
      steps: [
        {
          text: "Hold a note and bring [[sustain]] all the way down.",
          why: "Now every note fades away, even while you hold the key. The fall takes as long as Decay says: about a second.",
          checks: [{ param: "sustain", max: 0.03, aim: 0 }],
        },
        {
          text: "Shorten [[decay]] to about 150 ms.",
          why: "A short blip: the shape of a plucked or struck sound.",
          checks: [{ param: "decay", max: 0.25, aim: 0.15 }],
        },
        {
          text: "Lengthen [[decay]] to about 2 seconds.",
          why: "A long, ringing fade, like a bell or a piano.",
          checks: [{ param: "decay", min: 1.5, aim: 2 }],
        },
        {
          text: "Raise [[sustain]] to about 50%, and hold a note.",
          why: "The note falls for 2 seconds, then holds at half volume until you let go.",
          checks: [{ param: "sustain", min: 0.35, max: 0.65, aim: 0.5 }],
        },
      ],
    },
    {
      id: "release",
      title: "Release",
      text: [
        "The last stage starts when you let go of the key. **Release** is how long the note takes to fade from its sustain level to silence.",
        "A short release stops the note dead, which suits a bass line or a clipped tune. A long one lets the note ring on, like a piano with the pedal down, and notes blur into each other.",
        "Now the whole envelope is yours: Attack, Decay, Sustain, Release, often written **ADSR**.",
      ],
      widget: { kind: "envelope", which: "amp" },
      blocks: ["osc1", "amp", "output"],
      modulators: ["ampEnv"],
      knobs: [],
      faders: ["attack", "decay", "sustain", "release"],
      sound: { ...SAW, attack: 0.005, decay: 0.4, sustain: 0.6, release: 0.1 },
      steps: [
        {
          text: "Move [[release]] up to about 2 seconds, then play a note and let go.",
          why: "The note keeps sounding after you let go, fading slowly. Watch the dot slide down the last slope.",
          checks: [{ param: "release", min: 1.5, aim: 2 }, { play: "note" }],
        },
        {
          text: "Play a chord, then let go.",
          why: "The notes ring on together and fade as one: a soft tail after every chord.",
          checks: [{ play: "chord" }],
        },
        {
          text: "Now bring [[release]] down to about 30 ms.",
          why: "Every note stops as soon as you let go: tight and clipped.",
          checks: [{ param: "release", max: 0.06, aim: 0.03 }],
        },
      ],
    },
    {
      id: "pluck-pad",
      title: "Pluck and pad",
      text: [
        "Two envelope shapes come up again and again. A **pluck** has no attack, a short decay and no sustain: a quick, percussive note, like a guitar string or a marimba.",
        "A **pad** is the opposite: a slow attack, a high sustain and a long release. Notes swell in and melt into each other, a soft background for chords.",
        "The same oscillator plays both. Only the envelope differs, and it changes what the sound is for.",
      ],
      widget: {
        kind: "compare",
        picture: "amp",
        a: { label: "Pluck", text: "Sharp and short: for melodies and rhythms.", values: PLUCK },
        b: { label: "Pad", text: "Slow and soft: for chords.", values: PAD },
      },
      blocks: ["osc1", "amp", "output"],
      modulators: ["ampEnv"],
      knobs: [],
      faders: ["attack", "decay", "sustain", "release"],
      sound: { ...SAW, ...PLUCK },
      steps: [
        {
          text: "Play a few notes on A, the pluck.",
          why: "Each note is over almost at once, so fast tunes stay clear.",
          checks: [{ play: "note" }],
        },
        {
          text: "Switch to B, the pad, and play a chord.",
          why: "The chord swells in, holds, and fades away slowly after you let go.",
          checks: [{ param: "attack", min: 0.6, aim: 0.9 }, { play: "chord" }],
        },
        {
          text: "Make it bigger: set [[release]] to about 4 seconds, and play another chord.",
          why: "Now each chord hangs in the air long after you let go: an ambient pad.",
          checks: [{ param: "release", min: 3, aim: 4 }],
        },
      ],
    },
    {
      id: "filter-envelope",
      title: "The filter envelope",
      text: [
        "An envelope can move more than the volume. The synth's **filter** takes away high harmonics and makes a sound darker; **Cutoff** sets how much it takes: the lower, the darker. The next chapter is all about filters.",
        "The **Filter Envelope** moves the cutoff once per note, with stages of its own. **Filt Env** sets how far it opens the filter, in octaves, and **F Decay** how long it takes to close again.",
        "A note that starts bright and turns dark is one of the most used sounds in synths: plucks, basses and brass are all made this way.",
      ],
      widget: { kind: "envelope", which: "filter" },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["filterEnv"],
      knobs: ["cutoff", "filterEnvAmt", "filterDecay"],
      sound: { ...SAW, filterEnvAmt: 0, filterAttack: 0.005, filterDecay: 0.6, filterSustain: 0 },
      steps: [
        {
          text: "Turn [[cutoff]] down to about 400 Hz.",
          why: "The saw goes dark and muffled: the filter has taken its high harmonics away.",
          checks: [{ param: "cutoff", max: 700, aim: 400 }],
        },
        {
          text: "Turn [[filterEnvAmt]] up to about +3 octaves, and play a note.",
          why: "Each note now starts bright and turns dark: the envelope opens the filter, then lets it fall back.",
          checks: [{ param: "filterEnvAmt", min: 2, aim: 3 }, { play: "note" }],
        },
        {
          text: "Turn [[filterDecay]] down to about 150 ms.",
          why: "The brightness is now just a flick at the start of each note: the 'pew' of a synth pluck or bass.",
          checks: [{ param: "filterDecay", max: 0.25, aim: 0.15 }],
        },
        {
          text: "Now turn [[filterDecay]] up to about 2 seconds, and hold a note.",
          why: "A slow 'wow' as the filter closes. The same envelope, only slower, gives a very different sound.",
          checks: [{ param: "filterDecay", min: 1.4, aim: 2 }],
        },
      ],
    },
  ],
};
