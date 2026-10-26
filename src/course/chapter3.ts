// Chapter 3: filters. Cutoff, resonance, the filter types, key tracking, drive, and the ladder filter.
// Enum values: Filt Model 0 clean, 1 ladder. Filt Morph 0 low-pass, 0.5 band-pass, 1 high-pass.

import type { Chapter } from "./lesson";

/** The sawtooth: all the harmonics, so there is plenty for the filter to take away. */
const SAW = { osc1Wave: 2 };

export const CHAPTER_3: Chapter = {
  id: "filters",
  title: "Filters",
  recipes: ["acid", "wind"],
  lessons: [
    {
      id: "cutoff",
      title: "Cutoff",
      text: [
        "Most synths work by starting with a wave full of harmonics, like the sawtooth, and taking some away. This is called **subtractive synthesis**, and the part that takes them away is the **filter**.",
        "This filter is a **low-pass**: it lets the low frequencies pass and turns down everything above its **cutoff** frequency. Lower the cutoff and the sound gets darker and rounder, as the high harmonics go.",
        "The pictures are **spectrograms**: time runs from right to left, pitch goes up, and each harmonic is a bright line. The left one is what goes into the filter, the right one what comes out. The dashed line is the cutoff.",
      ],
      widget: { kind: "spectrogram", before: "drive", after: "filter" },
      blocks: ["osc1", "filter", "amp", "output"],
      knobs: ["cutoff"],
      sound: { ...SAW },
      steps: [
        {
          text: "Hold a note and turn knob 1 (Cutoff) down to about 300 Hz.",
          why: "The lines above the cutoff fade out of the right picture, and the buzz turns into a soft, muffled tone.",
          checks: [{ param: "cutoff", max: 450, aim: 300 }],
        },
        {
          text: "Now sweep it slowly up to about 5 kHz.",
          why: "The harmonics come back one by one, from the bottom up, and the sound opens out. This sweep is the most famous move in synth music.",
          checks: [{ param: "cutoff", min: 4000, aim: 5000 }],
        },
      ],
    },
    {
      id: "resonance",
      title: "Resonance",
      text: [
        "A filter can also boost the frequencies right at its cutoff, instead of passing them flat. This boost is **resonance**, and it gives the filter a voice of its own: a vowel-like, whistling edge.",
        "The picture shows the filter's **response**: how much of each frequency gets through, low on the left, high on the right. Raise the resonance and a peak grows at the cutoff.",
        "With a lot of resonance, moving the cutoff makes the classic 'wah' and 'yow' of synth leads and basses.",
      ],
      widget: { kind: "response" },
      blocks: ["osc1", "filter", "amp", "output"],
      knobs: ["cutoff", "resonance"],
      sound: { ...SAW, cutoff: 1200, resonance: 0.7 },
      steps: [
        {
          text: "Hold a note and raise knob 2 (Resonance) to about 8.",
          why: "A sharp peak grows at the cutoff, and you hear a whistle on top of the note.",
          checks: [{ param: "resonance", min: 6, aim: 8 }],
        },
        {
          text: "Now sweep the cutoff (knob 1) down to about 300 Hz.",
          why: "The whistle follows the cutoff down, through the harmonics: 'yow'.",
          checks: [{ param: "cutoff", max: 450, aim: 300 }],
        },
        {
          text: "And back up to about 3 kHz.",
          why: "On the way up it picks out each harmonic in turn. Resonance is what makes a filter sweep sing.",
          checks: [{ param: "cutoff", min: 2400, aim: 3000 }],
        },
      ],
    },
    {
      id: "filter-types",
      title: "Filter types",
      text: [
        "A low-pass is the most used filter, but not the only one. A **high-pass** does the opposite: it turns down everything below the cutoff, so the sound gets thin and airy. A **band-pass** keeps only a band around the cutoff and turns down both sides, which sounds nasal, like a telephone.",
        "Knob 3, **Filt Morph**, slides smoothly from low-pass, through band-pass, to high-pass. Watch the shape of the response change.",
      ],
      widget: { kind: "response" },
      blocks: ["osc1", "filter", "amp", "output"],
      knobs: ["cutoff", "resonance", "filterMorph"],
      sound: { ...SAW, cutoff: 900, resonance: 2, filterMorph: 0 },
      steps: [
        {
          text: "Hold a note and turn knob 3 (Filt Morph) all the way up, to high-pass.",
          why: "The bass is gone: only the bright upper harmonics are left. Thin, buzzy, and far away.",
          checks: [{ param: "filterMorph", min: 0.95, aim: 1 }],
        },
        {
          text: "Now to the middle: band-pass.",
          why: "Only the harmonics near the cutoff remain. Nasal and hollow, like a voice through a phone.",
          checks: [{ param: "filterMorph", min: 0.45, max: 0.55, aim: 0.5 }],
        },
        {
          text: "Keep the band-pass, and sweep the cutoff (knob 1) up to about 2.5 kHz.",
          why: "The band moves up through the harmonics: it sounds like someone saying 'ooh', then 'eeh'.",
          checks: [{ param: "cutoff", min: 2000, aim: 2500 }],
        },
      ],
    },
    {
      id: "key-tracking",
      title: "Key tracking",
      text: [
        "A filter's cutoff stays where you set it, but the notes you play don't. A high note's harmonics are all high, so a low cutoff takes away nearly all of them, while a low note keeps plenty. High notes end up dull and low notes buzzy.",
        "**Key Track** moves the cutoff with the note you play. At 100%, the cutoff goes up an octave when the note does, so every note keeps the same brightness. At 0% it stays put.",
      ],
      widget: { kind: "spectrogram", before: "drive", after: "filter" },
      blocks: ["osc1", "filter", "amp", "output"],
      knobs: ["cutoff", "keyTrack"],
      sound: { ...SAW, cutoff: 500, keyTrack: 0.5 },
      steps: [
        {
          text: "Turn knob 2 (Key Track) down to 0%.",
          why: "The cutoff now stays at 500 Hz whatever you play.",
          checks: [{ param: "keyTrack", max: 0.03, aim: 0 }],
        },
        {
          text: "Play a low note, then a high one.",
          why: "The low note buzzes; the high one is nearly a sine, because its harmonics are all above the cutoff. Watch the dashed line: it doesn't move.",
          checks: [{ play: "low" }, { play: "high" }],
        },
        {
          text: "Turn Key Track up to 100%, and play a high note again.",
          why: "The cutoff jumps up with the note, and the high note keeps its brightness.",
          checks: [{ param: "keyTrack", min: 0.95, aim: 1 }, { play: "high" }],
        },
      ],
    },
    {
      id: "drive",
      title: "Drive",
      text: [
        "Before the filter there is **Drive**. It pushes the wave harder than it can go, so its peaks get rounded off. A wave squashed like this has new harmonics that weren't there before: the sound gets warmer, then gritty.",
        "Here the oscillator plays a sine, which has no harmonics of its own, so you can see the new ones appear. The left picture is before the drive, the right one after the drive and the filter.",
        "Drive and filter work as a pair: the drive adds harmonics, and the filter decides how many of them you hear.",
      ],
      widget: { kind: "spectrogram", before: "mix", after: "filter" },
      blocks: ["osc1", "drive", "filter", "amp", "output"],
      knobs: ["drive", "cutoff"],
      sound: { osc1Wave: 0, drive: 0, cutoff: 18000 },
      steps: [
        {
          text: "Hold a note and turn knob 1 (Drive) up to about 70%.",
          why: "New lines appear above the sine in the right picture: the drive made harmonics. The pure tone turns buzzy.",
          checks: [{ param: "drive", min: 0.55, aim: 0.7 }],
        },
        {
          text: "Now bring the cutoff (knob 2) down to about 800 Hz.",
          why: "The filter takes the highest of the new harmonics away again: what is left is warm and thick, not harsh.",
          checks: [{ param: "cutoff", max: 1100, aim: 800 }],
        },
      ],
    },
    {
      id: "ladder",
      title: "Clean and ladder",
      text: [
        "Filters are built in different ways, and each has its own sound. The **clean** filter turns frequencies above the cutoff down gently and stays polite even with a lot of resonance.",
        "The **ladder** filter copies the circuit in Moog's synths from the 1960s. It cuts much more steeply, sounds fatter, and with high resonance it starts to ring on its own, like a sine wave at the cutoff. This is **self-oscillation**.",
        "Knob 1 switches between them (Filt Model). Compare the two at the same settings.",
      ],
      widget: {
        kind: "compare",
        picture: "response",
        a: { label: "Clean", text: "Gentle slope: smooth and polite.", values: { filterModel: 0 } },
        b: { label: "Ladder", text: "Steep slope: fat, and it can sing.", values: { filterModel: 1 } },
      },
      blocks: ["osc1", "filter", "amp", "output"],
      knobs: ["filterModel", "cutoff", "resonance"],
      sound: { ...SAW, filterModel: 0, cutoff: 800, resonance: 3 },
      steps: [
        {
          text: "Play a low note on A, then switch to B (click B, or click the encoder).",
          why: "The ladder takes more of the highs away at the same cutoff: deeper, rounder, heavier.",
          checks: [{ param: "filterModel", is: 1 }, { play: "low" }],
        },
        {
          text: "Turn Resonance (knob 3) almost all the way up, to about 19, and hold a note.",
          why: "Listen for a pure whistle at the cutoff: the filter is singing on its own, on top of the note. It only does this near the top of the knob.",
          checks: [{ param: "resonance", min: 17.5, aim: 19 }],
        },
        {
          text: "Sweep the cutoff (knob 2) up to about 2 kHz.",
          why: "The whistle slides up with it, squelching through the note: the sound of acid house.",
          checks: [{ param: "cutoff", min: 1600, aim: 2000 }],
        },
      ],
    },
  ],
};
