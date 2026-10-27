// Chapter 5: beyond subtractive. Other ways to make a tone: pulse width (and PWM), hard sync, FM and
// wavetables, then a page that opens the full Synth view.
// Enum values: Osc Wave 0 sine, 2 sawtooth, 3 square, 4 table. Sync 1 = on. LFO2 To 3 width, 4 position.
// Wavetables: 0 Shapes, 4 Formant, 5 Vowels (the first 8 are the built-in ones).

import type { Chapter } from "./lesson";

/** The built-in tables only: imported ones join the list after them. */
const BUILT_IN_TABLES = { wtTable: 8 };

export const CHAPTER_5: Chapter = {
  id: "beyond",
  title: "Beyond subtractive",
  recipes: ["pwmStrings", "syncLead", "bell", "vowelLead"],
  lessons: [
    {
      id: "pulse-width",
      title: "Pulse width",
      text: [
        "So far the filter changed the tone after the oscillator. But the oscillator itself can make far more than four waves, and this chapter is about the ways it can.",
        "The square spends half of each cycle up and half down. That share, the time spent up, is its **pulse width**, and it can change. At 50% it is a square; narrower, it is a **pulse wave**.",
        "A square has only odd harmonics. As the pulse gets narrower the others join in, and the sound gets thinner and more nasal, like an oboe, then a buzzing reed.",
      ],
      widget: { kind: "oscillator", which: 0 },
      blocks: ["osc1", "output"],
      knobs: ["pulseWidth"],
      sound: { osc1Wave: 3, pulseWidth: 0.5 },
      steps: [
        {
          text: "Hold a note and turn [[pulseWidth]] down to about 25%.",
          why: "Less hollow, more nasal. In the spectrogram, new harmonics fill the gaps between the old ones.",
          checks: [{ param: "pulseWidth", max: 0.3, aim: 0.25 }],
        },
        {
          text: "Now as narrow as it goes, below 10%.",
          why: "A thin, buzzy pulse: a short spike once a cycle, with lots of high harmonics and little body.",
          checks: [{ param: "pulseWidth", max: 0.1, aim: 0.07 }],
        },
      ],
    },
    {
      id: "pwm",
      title: "PWM",
      text: [
        "A pulse width that stands still is one tone. Move it, and the tone keeps shifting while the note plays. Moving the pulse width with an LFO is **pulse-width modulation**, or **PWM**.",
        "LFO 1 can't reach the pulse width, but **LFO 2** can: it works like LFO 1, and here it is set to move the width. Its Depth starts at 0.",
        "PWM sounds like several oscillators drifting against each other, though only one is playing. It is the lush, moving sound of classic analog strings and pads.",
      ],
      widget: { kind: "oscillator", which: 0 },
      blocks: ["osc1", "output"],
      modulators: ["lfo2"],
      knobs: ["pulseWidth", "lfo2Depth", "lfo2Rate"],
      sound: { osc1Wave: 3, pulseWidth: 0.3, lfo2Target: 3, lfo2Wave: 0, lfo2Rate: 0.8, lfo2Depth: 0 },
      steps: [
        {
          text: "Hold a note and turn [[lfo2Depth]] up to about 50%.",
          why: "The pulse in the picture widens and narrows by itself, and the note starts to shimmer.",
          checks: [{ param: "lfo2Depth", min: 0.35, aim: 0.5 }],
        },
        {
          text: "Speed it up: turn [[lfo2Rate]] to about 4 Hz.",
          why: "A fast, watery warble, close to the chorus effect.",
          checks: [{ param: "lfo2Rate", min: 3, aim: 4 }],
        },
        {
          text: "Now slow it right down, to about 0.3 Hz, and play a chord.",
          why: "A slow, wide movement: the warm string sound of 1980s synths like the Juno.",
          checks: [{ param: "lfo2Rate", max: 0.45, aim: 0.3 }],
        },
      ],
    },
    {
      id: "sync",
      title: "Hard sync",
      text: [
        "Two oscillators can be tied together. With **hard sync**, Osc 1 is the boss: each time it starts a new cycle, it forces Osc 2 to start its cycle again, wherever Osc 2 was.",
        "So Osc 2 can no longer play its own note: its wave repeats at Osc 1's pitch. Raise Osc 2's pitch and it squeezes more of its wave into each cycle before it is cut off. The cut adds sharp edges: you hear a new tone, not a new note.",
        "Here you hear only Osc 2. Osc 1 is silent: it only sets the beat. The dashed lines in the picture are its restarts.",
      ],
      widget: { kind: "oscillator", which: 1 },
      blocks: ["osc1", "osc2", "output"],
      knobs: ["oscSync", "osc2Semi"],
      sound: { osc1Wave: 2, osc2Wave: 2, oscMix: 1, osc2Semi: 0, osc2Detune: 0, oscSync: 0 },
      steps: [
        {
          text: "Turn [[oscSync]] on.",
          why: "Nothing changes yet: at the same pitch, Osc 2 finishes each cycle just as it is restarted.",
          checks: [{ param: "oscSync", is: 1 }],
        },
        {
          text: "Hold a note and turn [[osc2Semi]] up to +7 st.",
          why: "The note stays where it was, but its tone changes: Osc 2 now fits one and a half of its cycles into each of Osc 1's.",
          checks: [{ param: "osc2Semi", min: 5, max: 9, aim: 7 }],
        },
        {
          text: "Go on up to about +16 st, sweeping it while you hold the note.",
          why: "The tearing 'sync scream'. Swept by an envelope at every note, it is the lead sound of many 1980s records, like The Cars' 'Let's Go'. At exactly +12 or +19, Osc 2 finishes whole cycles before each restart: nothing is cut, and you only hear a higher note.",
          checks: [{ param: "osc2Semi", min: 14, max: 18, aim: 16 }],
        },
      ],
    },
    {
      id: "fm",
      title: "FM",
      text: [
        "Vibrato moved the pitch a few times a second. With **FM**, **frequency modulation**, Osc 2 moves Osc 1's pitch hundreds of times a second, as fast as a note. Far too fast to hear as a wobble, the movement turns into new harmonics.",
        "**FM Amount** sets how far Osc 2 pushes: the more, the brighter. The two pitches decide which harmonics appear. Osc 2 at the same pitch or an octave up gives tones that fit the note; in between, they don't: metallic and clangy, like a bell.",
        "Here you hear only Osc 1; Osc 2 just pushes. Both are sines. FM made the glassy sounds of the 1980s: the Yamaha DX7's electric piano and bells.",
      ],
      widget: { kind: "oscillator", which: 0 },
      blocks: ["osc1", "osc2", "output"],
      knobs: ["fmAmount", "osc2Semi"],
      sound: { osc1Wave: 0, osc2Wave: 0, oscMix: 0, osc2Semi: 0, osc2Detune: 0, fmAmount: 0 },
      steps: [
        {
          text: "Hold a note and turn [[fmAmount]] up to about 40%.",
          why: "The sine bends and gets brighter, though only two sines are playing.",
          checks: [{ param: "fmAmount", min: 0.3, aim: 0.4 }],
        },
        {
          text: "Turn [[osc2Semi]] up to +12 st, an octave.",
          why: "Osc 2 now swings twice for each of Osc 1's cycles: other harmonics, a hollower tone, still in tune.",
          checks: [{ param: "osc2Semi", is: 12 }],
        },
        {
          text: "Now +6 st, and play a few notes.",
          why: "Between octaves, the new tones don't fit the note any more: a cold, metallic clang, like a bell or a gong.",
          checks: [{ param: "osc2Semi", is: 6 }],
        },
      ],
    },
    {
      id: "wavetables",
      title: "Wavetables",
      text: [
        "A **wavetable** is a row of waves, stored one after another like the frames of a film. **WT Pos** (position) picks where in the row the oscillator plays, and turning it morphs smoothly from one wave to the next.",
        "A table can hold almost anything: a pulse getting narrower, a sync sweep, an organ pulling in harmonics, a voice saying vowels. Wavetable synths, from the PPG Wave of 1981 to today's Serum, are built on this.",
        "The picture shows the table's waves from front to back; the lit one is playing. In the Wavetable tab you can draw or import your own.",
      ],
      widget: { kind: "table" },
      blocks: ["osc1", "output"],
      knobs: ["wtPos", "wtTable"],
      choices: BUILT_IN_TABLES,
      sound: { osc1Wave: 4, wtTable: 0, wtPos: 0 },
      steps: [
        {
          text: "Hold a note and turn [[wtPos]] slowly up to about 50%.",
          why: "This table holds the four basic waves: the sine morphs into a triangle, then on toward a sawtooth.",
          checks: [{ param: "wtPos", min: 0.4, max: 0.6, aim: 0.5 }],
        },
        {
          text: "Turn [[wtTable]] to Vowels.",
          why: "Another table, another row of waves. These are made from the peaks a voice makes for each vowel.",
          checks: [{ param: "wtTable", is: 5 }],
        },
        {
          text: "Hold a note and sweep [[wtPos]] all the way up.",
          why: "The synth talks: the vowel changes as you turn.",
          checks: [{ param: "wtPos", min: 0.9, aim: 1 }],
        },
      ],
    },
    {
      id: "table-scan",
      title: "Moving through a table",
      text: [
        "A wavetable comes alive when something moves the position for you. As with PWM, **LFO 2** can do it: here it is set to move WT Pos, and its Depth starts at 0.",
        "This table is a band of loud harmonics that climbs as the position rises, so moving through it sounds like a filter sweep, without a filter.",
        "Sounds that keep changing while you hold a note are what wavetable synths are loved for. An envelope can do the moving too, through the mod matrix: a sweep at each note.",
      ],
      widget: { kind: "table" },
      blocks: ["osc1", "output"],
      modulators: ["lfo2"],
      knobs: ["wtPos", "lfo2Depth", "lfo2Rate"],
      sound: { osc1Wave: 4, wtTable: 4, wtPos: 0.5, lfo2Target: 4, lfo2Wave: 0, lfo2Rate: 1.5, lfo2Depth: 0 },
      steps: [
        {
          text: "Hold a note and turn [[lfo2Depth]] up to about 70%.",
          why: "The lit wave travels back and forth through the table, and the sound rises and falls with it.",
          checks: [{ param: "lfo2Depth", min: 0.5, aim: 0.7 }],
        },
        {
          text: "Slow it down: turn [[lfo2Rate]] to about 0.2 Hz.",
          why: "One trip every five seconds: the sound evolves slowly while you hold it, like a wavetable pad.",
          checks: [{ param: "lfo2Rate", max: 0.3, aim: 0.2 }],
        },
        {
          text: "Turn [[wtPos]] down to about 20%.",
          why: "The knob sets the middle of the movement, and the LFO swings around it: now it stays in the darker, lower part of the table.",
          checks: [{ param: "wtPos", max: 0.3, aim: 0.2 }],
        },
      ],
    },
    {
      id: "build",
      title: "Build your own",
      text: [
        "That is every idea this synth is built on. **Oscillators** make a tone, the **filter** takes some of it away, **envelopes** shape each note in time, and **LFOs** and the **mod matrix** keep it moving.",
        "The **Synth view** shows all of it at once, in the order of these pages: from the oscillators at the top down to the output. Click a block for its explanation, and 'Listen here' plays the sound at that point.",
        "Start from **Init**, the plainest sound there is: one sawtooth through an open filter. Pick a sound you like on a record, and try to get close to it.",
      ],
      widget: { kind: "build" },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["ampEnv", "lfo", "matrix"],
      knobs: [],
      sound: { osc1Wave: 2 },
      steps: [
        {
          text: "Play a note: this is Init.",
          why: "One plain sawtooth, nothing moving. Every sound in this app could start from here.",
          checks: [{ play: "note" }],
        },
      ],
    },
  ],
};
