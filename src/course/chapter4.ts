// Chapter 4: movement. LFO 1 (rate, depth, targets, shapes, tempo sync), then the mod matrix through
// patching route 1 with three knobs: From, To and Amount.
// Enum values: LFO To 0 pitch, 1 filter, 2 volume. LFO Shape 0 sine, 1 triangle, 2 saw, 3 square, 4 random.
// LFO Sync 4 = 1/4, 5 = 1/8. Mod sources: 7 velocity, 11 LFO 3. Mod destinations: 2 cutoff, 11 pan.

import type { Chapter } from "./lesson";

const SAW = { osc1Wave: 2 };

export const CHAPTER_4: Chapter = {
  id: "movement",
  title: "Movement",
  recipes: ["ePiano", "g-funk"],
  lessons: [
    {
      id: "lfo",
      title: "The LFO",
      text: [
        "Real instruments never hold perfectly still: a singer's voice wavers, a violinist rocks the string. A synth gets this movement from an **LFO**, a **low-frequency oscillator**.",
        "An LFO is an oscillator like the ones that make the sound, but far too slow to hear: a few swings a second. Instead of playing it, the synth uses it to move a setting up and down by itself.",
        "This LFO moves the pitch. **Depth** sets how far it moves it, and **Rate** how fast. A gentle pitch wobble is called **vibrato**.",
      ],
      widget: { kind: "lfo", index: 0 },
      blocks: ["osc1", "amp", "output"],
      modulators: ["lfo"],
      knobs: ["lfoDepth", "lfoRate"],
      sound: { lfoTarget: 0, lfoWave: 0, lfoRate: 5, lfoDepth: 0 },
      steps: [
        {
          text: "Hold a note and turn [[lfoDepth]] up to about 25%.",
          why: "The pitch starts to waver up and down, like a singer's vibrato. The dot in the picture is where the LFO is now.",
          checks: [{ param: "lfoDepth", min: 0.15, max: 0.5, aim: 0.25 }],
        },
        {
          text: "Slow it down: turn [[lfoRate]] to about 1 Hz.",
          why: "One swing a second: no longer vibrato, but a slow, seasick drift.",
          checks: [{ param: "lfoRate", max: 1.5, aim: 1 }],
        },
        {
          text: "Now speed it up, to about 10 Hz.",
          why: "Fast and nervous. Around 5 to 7 Hz is where vibrato sounds most natural.",
          checks: [{ param: "lfoRate", min: 8, aim: 10 }],
        },
      ],
    },
    {
      id: "lfo-targets",
      title: "What it moves",
      text: [
        "The same LFO can move other settings, and each gives a well-known effect. On the pitch it is vibrato. On the filter's cutoff, the brightness swells and fades: a **wah** or a **wobble**. On the volume, the note pulses louder and softer: **tremolo**.",
        "**LFO To** picks the target. The LFO's swing stays the same; only what it moves changes.",
      ],
      widget: { kind: "lfo", index: 0 },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["lfo"],
      knobs: ["lfoTarget", "lfoDepth", "lfoRate"],
      choices: { lfoTarget: 3 },
      sound: { ...SAW, cutoff: 800, lfoTarget: 0, lfoWave: 0, lfoRate: 4, lfoDepth: 0.3 },
      steps: [
        {
          text: "Hold a note and turn [[lfoTarget]] to Filter.",
          why: "Now the brightness swings instead of the pitch: wah, wah, wah.",
          checks: [{ param: "lfoTarget", is: 1 }],
        },
        {
          text: "Turn it on to Volume (amp).",
          why: "The note pulses in level: tremolo, the effect on an old guitar amp or an electric piano.",
          checks: [{ param: "lfoTarget", is: 2 }],
        },
        {
          text: "Turn [[lfoDepth]] up to about 70%.",
          why: "Deep tremolo chops the note into pulses. Depth turns a subtle shimmer into a rhythm.",
          checks: [{ param: "lfoDepth", min: 0.55, aim: 0.7 }],
        },
      ],
    },
    {
      id: "lfo-shapes",
      title: "LFO shapes",
      text: [
        "An LFO has wave shapes too, and here you can hear them, because each moves the setting in its own way. The **sine** glides smoothly. The **triangle** moves at a steady speed and turns sharply.",
        "The **saw** rises slowly, then drops at once. The **square** jumps between two values, like a trill. **Random** jumps to a new value each step and holds it: the bubbling 'computer' sound of old science-fiction films, often called **sample and hold**.",
        "Here the LFO moves the filter, so you hear each shape as a pattern of brightness.",
      ],
      widget: { kind: "lfo", index: 0 },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["lfo"],
      knobs: ["lfoWave", "lfoRate", "lfoDepth"],
      sound: { ...SAW, cutoff: 600, resonance: 4, lfoTarget: 1, lfoWave: 0, lfoRate: 2.5, lfoDepth: 0.5 },
      steps: [
        {
          text: "Hold a note and turn [[lfoWave]] to Square.",
          why: "The filter now jumps between two settings: bright, dark, bright, dark.",
          checks: [{ param: "lfoWave", is: 3 }],
        },
        {
          text: "Now Saw.",
          why: "A slow rise and a sudden fall: each cycle opens up, then snaps shut.",
          checks: [{ param: "lfoWave", is: 2 }],
        },
        {
          text: "Now Random, and turn [[lfoRate]] up to about 8 Hz.",
          why: "A new random brightness eight times a second: the burbling computer of a 1970s film.",
          checks: [{ param: "lfoWave", is: 4 }, { param: "lfoRate", min: 6, aim: 8 }],
        },
      ],
    },
    {
      id: "lfo-sync",
      title: "Tempo sync",
      text: [
        "An LFO set in hertz runs at its own speed, and drifts against the beat of a song. With **tempo sync**, its speed is a note length instead: one swing per bar, per beat (1/4), per half beat (1/8)… It then stays locked to the tempo, whatever the tempo is.",
        "Start the drums with the ▶ button, then use **LFO Sync**. A synced LFO on a resonant filter is the 'wobble' of dubstep and drum and bass.",
      ],
      widget: { kind: "lfo", index: 0, transport: true },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["lfo"],
      knobs: ["lfoSync", "lfoDepth"],
      sound: { ...SAW, cutoff: 300, resonance: 6, mono: 1, lfoTarget: 1, lfoWave: 0, lfoRate: 1.3, lfoDepth: 0.6, lfoSync: 0 },
      steps: [
        {
          text: "Start the drums with ▶{{ (on the page or the MiniLab)}}, hold a low note, and turn [[lfoSync]] to 1/4.",
          why: "One wobble per beat, in time with the drums.",
          checks: [{ param: "lfoSync", is: 4 }],
        },
        {
          text: "Now 1/8.",
          why: "Two wobbles per beat: twice as fast, and still on the beat.",
          checks: [{ param: "lfoSync", is: 5 }],
        },
        {
          text: "Play a low note and hold it for a few bars.",
          why: "However long you hold it, the wobble never drifts away from the beat. Stop the drums with ■ when you're done.",
          checks: [{ play: "low" }],
        },
      ],
    },
    {
      id: "mod-matrix",
      title: "The mod matrix",
      text: [
        "LFO 1 has a target knob, but the idea goes much further. Anything that changes can move anything you can set: an LFO, an envelope, how hard you play, which key you press. The thing that moves is the **source**, the setting it moves is the **destination**.",
        "A connection from one to the other is a **route**, and a **mod matrix** is a list of routes: From, To, and an **Amount**, how far and in which direction. Old modular synths made the same connections with patch cables, so making a route is called **patching**.",
        "Here are route 1's three settings: From, To and Amount. Its To is already Cutoff.",
      ],
      widget: { kind: "route", n: 1, picture: "spectrogram" },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["matrix"],
      knobs: ["mod1Src", "mod1Dst", "mod1Amt"],
      sound: { ...SAW, cutoff: 300, resonance: 2, mod1Src: 0, mod1Dst: 2, mod1Amt: 0 },
      steps: [
        {
          text: "Turn [[mod1Src]] to Velocity.",
          why: "Velocity is how hard you press a key. Nothing happens yet: the Amount is 0.",
          checks: [{ param: "mod1Src", is: 7 }],
        },
        {
          text: "Turn [[mod1Amt]] up to about +60%.",
          why: "The harder you play, the further the filter opens: +100% would be 4 octaves.",
          checks: [{ param: "mod1Amt", min: 0.4, aim: 0.6 }],
        },
        {
          text: "Play some notes softly, then some hard.",
          why: "Soft notes are dark, hard ones bright, like a real instrument. You patched that yourself.",
          checks: [{ play: "note" }],
        },
      ],
    },
    {
      id: "patching",
      title: "Patching LFO 3",
      text: [
        "Some sources only reach anything through the matrix. **LFO 3** has no target of its own, so until you patch it, it does nothing.",
        "Patch it to **Pan**, the sound's place between the left and the right speaker. Use headphones or two speakers to hear it. The picture shows the stereo sound: a line leaning left or right is a sound coming from that side.",
        "In the Synth view you can make the same routes by dragging a cable from a source to a destination.",
      ],
      widget: { kind: "route", n: 1, picture: "stereo" },
      blocks: ["osc1", "filter", "amp", "output"],
      modulators: ["lfo3", "matrix"],
      knobs: ["mod1Src", "mod1Dst", "mod1Amt", "lfo3Rate"],
      sound: { ...SAW, cutoff: 2500, mod1Src: 0, mod1Dst: 2, mod1Amt: 0, lfo3Rate: 2 },
      steps: [
        {
          text: "Turn [[mod1Src]] to LFO 3.",
          why: "LFO 3 is now connected to the cutoff (route 1's To), but by nothing yet.",
          checks: [{ param: "mod1Src", is: 11 }],
        },
        {
          text: "Turn [[mod1Dst]] to Pan.",
          why: "The route now goes from LFO 3 to the sound's place between the speakers.",
          checks: [{ param: "mod1Dst", is: 11 }],
        },
        {
          text: "Hold a note and turn [[mod1Amt]] to about 100%.",
          why: "The note swings from one speaker to the other, twice a second.",
          checks: [{ param: "mod1Amt", min: 0.8, aim: 1 }],
        },
        {
          text: "Slow it down: turn [[lfo3Rate]] to about 0.3 Hz.",
          why: "A slow drift from side to side, one trip every three seconds: wide and calm.",
          checks: [{ param: "lfo3Rate", max: 0.5, aim: 0.3 }],
        },
      ],
    },
  ],
};
