// "Live looping": lessons on building music live, a layer at a time, from the MiniLab's pads (or the
// screen's). Performing, not composing: you play in time and don't stop to fix things. They end at Capture,
// where "Make a song" (its arrangement, mix and export lessons) takes over.
//
// Same marks as "Make a song". `{{…|…}}` is said one way with a MiniLab and another without: the pads are
// the MiniLab's pads 1–8 (bank A), or the square beside each track's M and S on screen.

import type { PadState } from "../../song/looper";
import { TICKS_PER_BEAT } from "../../song/clips";
import { drumClip, noteClip } from "../../song/examples";
import { count, did, guideKey, type Check, type GuideState, type SongLesson } from "./guide";
import { band, BAND_SOUNDS, bassLine, groove, hitsOn, idOf, notesOn, practice, switchedOn, trackNow } from "./lessons";

// ------------------------------------------------------------------ check helpers

const pad = (s: GuideState, name: string): PadState => s.looper.pads[idOf(s, name)] ?? "off";
const padIs = (name: string, ...states: PadState[]): Check => (now) => states.includes(pad(now, name));
/** The track has a loop of its own: something recorded, playing or stopped. */
const looped = (s: GuideState, name: string) => ["playing", "stopped"].includes(pad(s, name)) && notesOn(s, name) + hitsOn(s, name) > 0;
/** A track's loop recorded since the step began, the take over and the loop playing. */
const recorded =
  (name: string): Check =>
  (now, base) =>
    !now.recording && pad(now, name) === "playing" && notesOn(now, name) + hitsOn(now, name) > notesOn(base, name) + hitsOn(base, name);
/** A track's pad on screen glows (the MiniLab's can't). */
const padOf = (name: string) => guideKey("pad", name);

/** An empty band: drums, bass, chords and a lead, their sounds chosen, nothing recorded. */
const emptyBand = (title: string, tempo: number) => practice(title, tempo, band(), BAND_SOUNDS, [], []);

const BAR = 4 * TICKS_PER_BEAT;

// ------------------------------------------------------------------ the lessons

export const LOOP_LESSONS: SongLesson[] = [
  {
    id: "loop-pads",
    title: "The pads are your tracks",
    summary: "A looper's pads: one per track, and what each light means. Select, get ready, and leave ready without recording.",
    intro: [
      "A **looper** builds music live: you record a short phrase, it repeats, and you record the next part on top while it plays. Each part is a **layer**. Musicians use loop pedals this way on stage.",
      "Here each track has a **pad**{{: pad 1 on the MiniLab is the top track, pad 2 the next, and so on (bank A)| (the square beside each track's M and S; on a MiniLab, its pads 1 to 8)}}. The pad's light shows what its track is doing.",
      "The practice song has four tracks, their sounds chosen, nothing recorded yet: Drums, Bass, Chords and Lead, from the top.",
    ],
    practice: () => emptyBand("Pads", 90),
    steps: [
      {
        id: "select",
        text: "Tap {{pad 3|the Chords' pad}}: it lights faint red. The Chords are selected: your keys play their sound.",
        more: ["Selected only means \"this is the track I'm working on\". Nothing is recorded yet."],
        diagram: "pads",
        target: padOf("Chords"),
        done: padIs("Chords", "selected"),
      },
      {
        id: "keys",
        text: "Play a few notes on the keys{{| at the bottom, or on your computer keyboard (A to ')}}. You hear the Chords.",
        target: "keys",
        done: (now, base) => did("note")(now, base) && now.selectedTrack === idOf(now, "Chords"),
      },
      {
        id: "ready",
        text: "Tap the same pad again: brighter red. The Chords are ready: the first note you play now would start recording. Don't play yet.",
        target: padOf("Chords"),
        done: padIs("Chords", "ready"),
      },
      {
        id: "unready",
        text: "Changed your mind? Tap the pad once more: back to faint red, ready no more, and nothing recorded.",
        target: padOf("Chords"),
        done: (now) => pad(now, "Chords") === "selected" && notesOn(now, "Chords") === 0,
      },
      {
        id: "other",
        text: "Tap {{pad 2|the Bass's pad}}: the Bass is selected now, and the Chords' pad goes dark. One track is selected at a time.",
        target: padOf("Bass"),
        done: padIs("Bass", "selected"),
      },
    ],
    outro: "Dark, faint red, brighter red: empty, selected, ready. Full red and green come next, with your first loop.",
  },

  {
    id: "loop-first",
    title: "Your first loop",
    summary: "Record one bar of bass: the first note starts it, a tap ends it, and its length is rounded to whole bars. Then choose the length beforehand.",
    intro: [
      "A loop is measured in **bars**: groups of four beats, counted 1, 2, 3, 4. You will hear a click on every beat while you record, to play along with.",
      "You don't press a record button. Get the track ready, and your first note starts the recording, and the music with it. A tap on the pad ends it, and the loop plays straight away.",
    ],
    practice: () => emptyBand("First loop", 90),
    steps: [
      {
        id: "ready",
        text: "Get the Bass ready: tap {{pad 2|its pad}} until it is brighter red (twice, or once if it is faint red already).",
        target: padOf("Bass"),
        done: padIs("Bass", "ready"),
      },
      {
        id: "record",
        text: "Play a note: the click starts, and the pad turns full red. You are recording. Count 1, 2, 3, 4 with the clicks and play a few low notes.",
        more: ["Low notes suit a bass: the left end of the keys. Simple is good: one note on each 1 already makes a bass line."],
        target: padOf("Bass"),
        done: (now) => now.recording && pad(now, "Bass") === "recording",
      },
      {
        id: "tap",
        text: "On the next 1, tap the pad: the take ends, the pad turns green, and your bass plays round and round.",
        more: [
          "The length is rounded to whole bars: to the nearest bar line, then up to 1, 2, 4 or 8 bars. A tap a little late or early still gives a clean loop.",
          "The `Loops` box in the Looper bar now shows the length. Every loop you record next keeps to it, so they all fit together.",
        ],
        diagram: "loop",
        target: padOf("Bass"),
        done: (now) => !now.recording && pad(now, "Bass") === "playing" && now.looper.bars !== null && notesOn(now, "Bass") > 0,
      },
      {
        id: "undo",
        text: "Start again: {{click the encoder (the big knob)|hold Shift and click the Bass's pad}}. The take is undone, and the length with it.",
        target: padOf("Bass"),
        done: (now, base) => did("undoLayer")(now, base) && now.looper.bars === null,
      },
      {
        id: "length",
        text: "This time, choose the length first: set `Loops` in the Looper bar to `2 bars`.",
        target: "loop-length",
        done: (now) => now.looper.bars === 2 && !looped(now, "Bass"),
      },
      {
        id: "again",
        text: "Record the bass again: get it ready, play, and tap anywhere in the second bar. The take goes on to the end of bar 2, then loops.",
        more: ["With the length set, a tap ends the take at the end of the loop, not at once, so an early tap doesn't cut your phrase short. The big number in the Looper bar counts the beats left."],
        target: padOf("Bass"),
        done: (now) => looped(now, "Bass") && pad(now, "Bass") === "playing" && !now.recording && now.looper.bars === 2,
      },
    ],
    outro: "That's a loop: ready, play, tap. Next, layers on top of it.",
  },

  {
    id: "loop-layers",
    title: "Building layers",
    summary: "Drums, then chords, then a lead, each on top of the others; later takes keep in time by themselves. Drop a part out and bring it back.",
    intro: [
      "The first loop sets the length; every **layer** after it fits into the same length. While the loops play, you can start a layer any time: it records with the loops' current **time round** and ends at the end of one.",
      "With the Drums selected, the keys play drums: {{C is the kick, C♯ the snare, D♯ the hi-hat (the screen's keys show the names)|A is the kick, W the snare, E the hi-hat, on your computer keyboard (the screen's keys show the names)}}.",
    ],
    practice: () => emptyBand("Layers", 95),
    steps: [
      {
        id: "drums-ready",
        text: "Get the Drums ready: tap {{pad 1|the Drums' pad}} until it is brighter red.",
        target: padOf("Drums"),
        done: padIs("Drums", "ready"),
      },
      {
        id: "drums",
        text: "Play a one-bar beat: kick on 1 and 3, snare on 2 and 4 is plenty. Tap the pad on the next 1: your drums loop.",
        more: ["Missed a hit? Keep going: on the next time round, play it again. This is a first loop, so its tap sets the length: tap on a 1."],
        target: padOf("Drums"),
        done: recorded("Drums"),
      },
      {
        id: "chords-ready",
        text: "While the drums play, get the Chords ready ({{pad 3|their pad}}, until brighter red).",
        target: padOf("Chords"),
        done: padIs("Chords", "ready"),
      },
      {
        id: "chords",
        text: "Play a chord (three keys at once) and hold it; change it now and then. Tap the pad when you have played enough: the take ends at the end of the time round.",
        more: [
          "Your first note can come anywhere: the take records with the loops' time round, so it lines up with the drums by itself.",
          "A tap ends a layer at the end of its time round, not at once. The big number in the Looper bar counts the beats until then, and the pad blinks.",
        ],
        diagram: "round",
        target: padOf("Chords"),
        done: recorded("Chords"),
      },
      {
        id: "lead",
        text: "Now a lead on {{pad 4|the Lead's pad}}: ready, a few high notes, tap. That's three layers.",
        target: padOf("Lead"),
        done: recorded("Lead"),
      },
      {
        id: "drop",
        text: "Drop the drums out: tap their green pad. They stop at the next bar, and the pad turns faint green. The others play on.",
        more: ["A loop that is stopped is still there: faint green. Dropping parts out and back in is how a live loop becomes music that goes somewhere."],
        target: padOf("Drums"),
        done: padIs("Drums", "stopped"),
      },
      {
        id: "back",
        text: "Bring them back: tap the faint green pad. The drums come in again at the start of the next time round (the pad blinks until then).",
        target: padOf("Drums"),
        done: (now, base) => pad(base, "Drums") === "stopped" && pad(now, "Drums") === "playing",
      },
    ],
    outro: "Layers, and parts that come and go. Next: fixing a take that went wrong, without stopping.",
  },

  {
    id: "loop-fixing",
    title: "Fixing things",
    summary: "Hold a pad to record more onto its loop, undo a take, mute and solo, and the faders as volumes.",
    intro: [
      "Live, nothing stops: a wrong note is fixed while the music plays. The practice song has drums and a bass already looping, ready to play.",
      "Hold a pad to add to its loop (an **overdub**), and undo to take your last take away again.",
    ],
    practice: () => ({
      ...practice(
        "Fixing",
        95,
        band(),
        BAND_SOUNDS,
        [drumClip("clip-1", "Beat", [groove()]), noteClip("clip-2", "track-1", "Bass loop", 2, bassLine().filter((n) => n.start < 2 * BAR))],
        [],
      ),
      chosen: { drums: "clip-1", "track-1": "clip-2" },
    }),
    steps: [
      {
        id: "play",
        text: "Press ▶ (or the space bar{{, or ▶ on the MiniLab}}): the drums and bass loop.",
        target: "play",
        done: (now) => now.playing,
      },
      {
        id: "hold",
        text: "Hold the Bass's pad ({{pad 2|on screen}}) for half a second, until it turns brighter red: ready to record onto its loop.",
        more: ["A tap on a green pad would stop the loop instead (tap again to bring it back). A hold means \"record more onto this\"."],
        target: padOf("Bass"),
        done: padIs("Bass", "ready"),
      },
      {
        id: "overdub",
        text: "Play a few notes over the bass, then tap the pad. Your notes are added to the loop at the end of the time round.",
        target: padOf("Bass"),
        done: (now, base) => did("overdub")(now, base) && !now.recording && count(now, "take") > count(base, "take"),
      },
      {
        id: "undo",
        text: "Didn't like it? {{Click the encoder|Hold Shift and click the Bass's pad}}: the overdub goes, and the bass is as it was.",
        more: ["{{The encoder undoes the last take on any track, like a loop pedal's undo button; click again for the one before.|Again undoes the take before, and so on, back to an empty track.}}"],
        target: padOf("Bass"),
        done: did("undoLayer"),
      },
      {
        id: "mute",
        text: "{{Switch the pads to bank B, where a tap mutes a track and a hold solos it. Tap pad 2: the Bass is **muted** (orange).|Mute the Bass with its `M`: it goes silent, its loop still running.}}",
        target: guideKey("mute", "Bass"),
        done: (now) => !!trackNow(now, "Bass")?.mute,
      },
      {
        id: "solo",
        text: "{{Hold pad 1 of bank B: the Drums are **soloed** (cyan), the only track you hear.|Solo the Drums with their `S`: they are the only track you hear.}}",
        target: guideKey("solo", "Drums"),
        done: (now) => !!trackNow(now, "Drums")?.solo,
      },
      {
        id: "unsolo",
        text: "Turn mute and solo off again{{ (the same pads, then back to bank A)}}: the whole band.",
        target: switchedOn,
        done: (now) => now.tracks.every((t) => !t.mute && !t.solo),
      },
      {
        id: "fader",
        text: "Move fader 2 on the MiniLab: it is the Bass's volume. It takes over once it passes the slider's value on screen.",
        more: ["Faders 1 to 4 are the volumes of the top four tracks. Turning a loud part down a little is often all a live mix needs."],
        target: guideKey("volume", "Bass"),
        hold: true,
        miniLab: true,
        done: (now, base) => Math.abs((trackNow(now, "Bass")?.volume ?? 0) - (trackNow(base, "Bass")?.volume ?? 0)) >= 2,
      },
    ],
    outro: "Overdub, undo, mute, solo, volume: all while the music plays. Last: a jam that becomes a song.",
  },

  {
    id: "loop-jam",
    title: "From jam to song",
    summary: "Build a loop of three layers, perform with it, capture it to the timeline as a song, and export it.",
    intro: [
      "A performance is gone when it's over, unless you keep it. **Capture** writes what the loops played onto the timeline, as it happened: the drums alone for the first bars, then the bass joining, a break…",
      "Then it's a song like any other: you can play it from the start, change it, and save it as an audio file.",
    ],
    practice: () => emptyBand("Jam", 100),
    steps: [
      {
        id: "layers",
        text: "Build a loop of three layers or more: drums, bass and chords, say. Ready, play, tap, next pad.",
        more: ["Start with the part that sets the groove: drums, or the bass. Its length is every loop's length."],
        target: (s) => s.tracks.filter((t) => !looped(s, t.name)).map((t) => padOf(t.name)).join(" "),
        done: (now) => now.tracks.filter((t) => looped(now, t.name)).length >= 3,
      },
      {
        id: "perform",
        text: "Perform: let it play, drop a part out, bring it back. Take your time; everything is remembered.",
        target: (s) => s.tracks.filter((t) => looped(s, t.name)).map((t) => padOf(t.name)).join(" "),
        done: (now, base) => did("loopOut")(now, base) && did("loopIn")(now, base),
      },
      {
        id: "stop",
        text: "Stop the music{{ (■ on the MiniLab, or the space bar)| (■, or the space bar)}}.",
        target: "play",
        done: (now) => !now.playing,
      },
      {
        id: "capture",
        text: "Press `Capture to arrangement`{{ (or the ⟲ button on the MiniLab)}}: your performance goes onto the timeline.",
        more: ["Each stretch a loop played becomes a placement on its track's row, from the bar it started to the bar it stopped. The loops go back to the arrangement, so ▶ now plays the song."],
        target: "capture",
        done: (now, base) => did("capture")(now, base) && now.placements.length > base.placements.length,
      },
      {
        id: "listen",
        text: "Press ▶: the song plays from bar 1, as you performed it. The timeline shows each part where it played.",
        target: "play",
        done: (now) => now.playing && now.placements.length > 0 && Object.values(now.launched).every((c) => c === null),
      },
      {
        id: "wav",
        text: "Keep it as a sound file: open `WAV ▾` and press `Export`.",
        more: ["Lessons 8 to 11 of \"Make a song\" go on from here: changing the arrangement, the mix, and saving and sharing the song."],
        target: "wav",
        done: did("wav"),
      },
    ],
    outro: "You performed a song and kept it. To keep the song itself, press `Save to my songs`; \"Make a song\" shows what else you can do with it.",
  },
];
