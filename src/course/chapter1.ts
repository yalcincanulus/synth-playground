// Chapter 1: what sound is, pitch, loudness, wave shapes, harmonics, and detune.
// Enum values: Osc Wave 0 sine, 1 triangle, 2 sawtooth, 3 square.

import type { Chapter } from "./lesson";

/** Sine, triangle, sawtooth, square: the Osc 1 wave without "table" (wavetables come in chapter 5). */
const FOUR_WAVES = { osc1Wave: 4 };

export const CHAPTER_1: Chapter = {
  id: "sound",
  title: "Sound and Oscillators",
  recipes: ["reese", "sub"],
  lessons: [
    {
      id: "what-is-sound",
      title: "What sound is",
      text: [
        "Sound is air moving. Something pushes the air back and forth, and the push travels to your ears as a tiny change in pressure.",
        "A speaker does the pushing here. The synth tells it where to be, many thousands of times a second, and the line below is that path: up pushes the air out, down pulls it back. This picture of a sound is called its **wave**.",
        "Play a note and hold it. This wave is a **sine**, the simplest wave there is: one smooth swing, over and over. It sounds pure and soft, like a whistle or a tuning fork.",
      ],
      widget: { kind: "wave" },
      blocks: ["osc1", "output"],
      knobs: [],
      sound: {},
      steps: [
        {
          text: "Play a note and hold it: on the keys at the bottom of the page, or A to ' on your computer keyboard{{, or on the MiniLab's keys}}.",
          why: "The wave appears while the note sounds. Let go and it stops: no movement, no sound.",
          checks: [{ play: "note" }],
        },
      ],
    },
    {
      id: "pitch",
      title: "Pitch",
      text: [
        "A note's **pitch** is how high or low it sounds. It comes from how fast the wave repeats: the faster the air swings back and forth, the higher the note.",
        "That speed is the **frequency**, counted in **hertz** (Hz): swings per second. The A above middle C swings 440 times a second, so it is 440 Hz.",
        "The picture shows the note you play over one hundredth of a second. Go up an **octave** (12 keys) and the wave repeats exactly twice as fast; go down an octave and it is half as fast.",
      ],
      widget: { kind: "pitch" },
      blocks: ["osc1", "output"],
      knobs: [],
      sound: {},
      steps: [
        {
          text: "Play a low note, on the left of the keyboard.",
          why: "Count the swings in the picture: only a few. The air moves slowly, and the note sounds deep.",
          checks: [{ play: "low" }],
        },
        {
          text: "Now play a high note, on the right.",
          why: "The swings crowd together. The same wave, only faster, and it sounds high.",
          checks: [{ play: "high" }],
        },
      ],
    },
    {
      id: "loudness",
      title: "Loudness",
      text: [
        "How loud a sound is comes from how far the air moves: how tall the wave is. This height is the wave's **amplitude**.",
        "**Volume** sets how loud the synth is. The wave is drawn at a fixed size here, so you can see it shrink and grow. Its shape and its speed stay the same: only its height changes, so the pitch doesn't move.",
        "The keys change the loudness too: play softly, then hard. How hard you press is the note's **velocity**.",
      ],
      widget: { kind: "knob", param: "volume" },
      blocks: ["osc1", "output"],
      knobs: ["volume"],
      sound: { volume: 0.5 },
      steps: [
        {
          text: "Hold a note and turn [[volume]] down to about 25%.",
          why: "The wave gets much shorter and the note quieter, but it is still the same note.",
          checks: [{ param: "volume", max: 0.3, aim: 0.25 }],
        },
        {
          text: "Turn it back up, to about 90%.",
          why: "Taller wave, louder sound. Loudness and pitch are separate: one is height, the other speed.",
          checks: [{ param: "volume", min: 0.85, aim: 0.9 }],
        },
      ],
    },
    {
      id: "wave-shapes",
      title: "Wave shapes",
      text: [
        "The part of a synth that makes the wave is the **oscillator**. Besides the sine, it can make other shapes, and each has its own character, even at the same pitch and loudness.",
        "**Triangle**: straight lines up and down. Like a sine with a little edge, soft like a flute. **Sawtooth**: a slow ramp up, then a sudden drop. Bright and buzzy, like brass or strings. **Square**: up, flat, down, flat. Hollow, like a clarinet or an old video game.",
        "Osc1 Wave picks the wave. Hold a note while you switch, and hear how its colour changes while its pitch stays put.",
      ],
      widget: { kind: "wave" },
      blocks: ["osc1", "output"],
      knobs: ["osc1Wave"],
      choices: FOUR_WAVES,
      sound: {},
      steps: [
        {
          text: "Turn [[osc1Wave]] to Triangle.",
          why: "Almost as soft as the sine, with a slightly reedy edge.",
          checks: [{ param: "osc1Wave", is: 1 }],
        },
        {
          text: "Now Square.",
          why: "Hollow and woody. The flat tops are where its character comes from.",
          checks: [{ param: "osc1Wave", is: 3 }],
        },
        {
          text: "Now Sawtooth, and play a few notes.",
          why: "The brightest of the four: the sudden drop makes it buzz. Most classic synth sounds start from this one.",
          checks: [{ param: "osc1Wave", is: 2 }],
        },
      ],
    },
    {
      id: "harmonics",
      title: "Harmonics",
      text: [
        "Why do the shapes sound so different? Every wave, however jagged, can be built from sine waves stacked on top of each other.",
        "The lowest sine sets the pitch: the **fundamental**. The others swing exactly 2, 3, 4… times as fast. They are the **harmonics**, and the mix of them is what you hear as the sound's colour, or **timbre**.",
        "The bars show the harmonics in Osc 1's wave: bar 1 is the fundamental, bar 2 the harmonic twice as fast, and so on. More and taller bars to the right mean a brighter sound.",
      ],
      widget: { kind: "harmonics" },
      blocks: ["osc1", "output"],
      knobs: ["osc1Wave"],
      choices: FOUR_WAVES,
      sound: {},
      steps: [
        {
          text: "Turn [[osc1Wave]] to Sawtooth.",
          why: "Every harmonic is there, each a little weaker than the one before. That is why the saw is so bright.",
          checks: [{ param: "osc1Wave", is: 2 }],
        },
        {
          text: "Now Square.",
          why: "Only the odd harmonics: 1, 3, 5, 7… The missing even ones give the square its hollow sound.",
          checks: [{ param: "osc1Wave", is: 3 }],
        },
        {
          text: "Now Triangle.",
          why: "Odd harmonics again, but they fade away fast: nearly a sine, with a hint of brightness.",
          checks: [{ param: "osc1Wave", is: 1 }],
        },
        {
          text: "And back to Sine.",
          why: "One bar only. A sine has no harmonics at all: it is the building block the others are made of.",
          checks: [{ param: "osc1Wave", is: 0 }],
        },
      ],
    },
    {
      id: "detune",
      title: "Detune and beating",
      text: [
        "The synth has a second oscillator. Two oscillators at exactly the same pitch just sound like one, a bit louder. Pull one slightly out of tune and something happens.",
        "Their waves drift in and out of step: one moment they push the air together and add up, the next they work against each other and cancel. You hear a slow, regular pulse in the sound. This is called **beating**, and the further apart they are, the faster it beats.",
        "Pitch differences this small are counted in **cents**: a hundredth of a key. **Detune** sets how many cents Oscillator 2 is above Oscillator 1. A little detune makes a sound wide and alive, which is why synths are full of it.",
      ],
      widget: {
        kind: "compare",
        a: { label: "One oscillator", text: "Oscillator 1 alone: steady.", values: { oscMix: 0, osc2Detune: 0 } },
        b: { label: "Two, detuned", text: "Both, 12 cents apart: listen for the pulse.", values: { oscMix: 0.5, osc2Detune: 12 } },
      },
      blocks: ["osc1", "osc2", "mixer", "output"],
      knobs: ["oscMix", "osc2Detune"],
      sound: { osc1Wave: 2, osc2Wave: 2, oscMix: 0, osc2Detune: 0 },
      steps: [
        {
          text: "Hold a low note, and switch to B (click B{{, or click the encoder}}).",
          why: "Two sawtooth waves, 12 cents apart. Hear the slow swirl? That is the beating.",
          checks: [{ param: "oscMix", min: 0.35, max: 0.65, aim: 0.5 }, { param: "osc2Detune", min: 8, aim: 12 }],
        },
        {
          text: "Turn [[osc2Detune]] down to 0.",
          why: "In tune, the beating stops: the two oscillators sound like one again.",
          checks: [{ param: "osc2Detune", max: 0.5, aim: 0 }],
        },
        {
          text: "Now turn it slowly up, to about 30 cents.",
          why: "The pulse speeds up as they move apart, until it becomes a thick, buzzing chorus.",
          checks: [{ param: "osc2Detune", min: 25, aim: 30 }],
        },
        {
          text: "Play a chord with the detune on.",
          why: "Every note beats on its own, and together they shimmer. This is the start of a big synth pad.",
          checks: [{ play: "chord" }],
        },
      ],
    },
  ],
};
