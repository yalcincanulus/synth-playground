// "Make a song": the lessons, each with its practice song and steps. They teach everything the Song view
// does except live looping (it has a tutorial of its own), for someone who has never used a music app.
//
// Text marks: **word** is a glossary word, `Label` a button or control as the screen names it, [[cutoff]] a
// synth control, {{…}} an aside only shown with a MiniLab connected.

import type { Pattern } from "../../audio/sequencer";
import { HAT, KICK, OPEN_HAT, SNARE, TOM_HI, TOM_LO, beat, chord, drumClip, EXAMPLE_SONGS, noteClip, notes, place, song, synth } from "../../song/examples";
import type { Clip } from "../../song/clips";
import { defaultTracks, type Track } from "../../song/song";
import {
  clipNamed,
  clipOf,
  count,
  did,
  drumSteps,
  guideKey,
  hits,
  newClips,
  noteClips,
  noteCount,
  placementsOf,
  same,
  songBars,
  trackNamed,
  widestChord,
  type Check,
  type GuideState,
  type SongBody,
  type SongLesson,
} from "./guide";

// ------------------------------------------------------------------ the practice band: A minor, Am F C G

const groove = (): Pattern =>
  beat([
    [KICK, [0, 8, 10], 115],
    [SNARE, [4, 12], 105],
    [HAT, [0, 2, 4, 6, 8, 10, 12, 14], [90, 60, 85, 60, 90, 60, 85, 60]],
  ]);
const introBeat = (): Pattern =>
  beat([
    [KICK, [0, 4, 8, 12], 110],
    [HAT, [2, 6, 10, 14], 65],
  ]);
const fill = (): Pattern =>
  beat([
    [KICK, [0, 10], 115],
    [SNARE, [4, 12, 13, 14, 15], [100, 70, 80, 95, 110]],
    [TOM_HI, [8, 9], 95],
    [TOM_LO, [10, 11], 100],
    [OPEN_HAT, [2], 70],
  ]);

const ROOTS = [33, 29, 36, 31]; // A1, F1, C2, G1
const CHORDS = [
  [57, 60, 64], // Am
  [57, 60, 65], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
];
const bassLine = () =>
  ROOTS.flatMap((r, bar) =>
    notes(
      [
        [0, 1, r, 110],
        [1.5, 0.5, r, 90],
        [2, 1, r + 12, 100],
        [3, 0.5, r + 7, 95],
        [3.5, 0.5, r, 90],
      ],
      bar,
    ),
  );
const chordNotes = () => CHORDS.flatMap((c, bar) => notes(chord(0, 4, c, 70), bar));
const riff = () => [
  ...notes([[0, 1, 76], [1, 1, 72], [2, 2, 69]], 0),
  ...notes([[0, 1, 72], [1, 1, 74], [2, 2, 72]], 1),
  ...notes([[0, 1, 67], [1, 1, 72], [2, 2, 76]], 2),
  ...notes([[0, 1, 74], [1, 1, 71], [2, 2, 67]], 3),
];

const drums = (): Track => ({ ...defaultTracks()[0] });
const BAND_SOUNDS = { "track-1": "Round Bass", "track-2": "Juno Pad", "track-3": "Square Lead" };
const band = () => [drums(), synth("track-1", "Bass", 1), synth("track-2", "Chords", 2), synth("track-3", "Lead", 3)];

const practice = (title: string, tempo: number, tracks: Track[], sounds: Record<string, string>, clips: Clip[], placements: ReturnType<typeof place>[], loop?: [number, number]): SongBody => ({
  ...song(`Practice · ${title}`, tempo, tracks, sounds, clips, placements),
  ...(loop ? { loop: { start: loop[0], end: loop[1] }, loopOn: true } : {}),
});

// ------------------------------------------------------------------ check helpers for these lessons

const idOf = (s: GuideState, name: string) => trackNamed(s, name)?.id ?? "";
const trackClips = (s: GuideState, name: string) => s.clips.filter((c) => c.track === idOf(s, name));
const notesOn = (s: GuideState, name: string) => trackClips(s, name).reduce((n, c) => n + noteCount(c), 0);
const hitsOn = (s: GuideState, name: string) => trackClips(s, name).reduce((n, c) => n + hits(c), 0);
const launchedName = (s: GuideState, track: string) => clipOf(s, s.launched[idOf(s, track)])?.name;
const tookSince: Check = (now, base) => !now.recording && count(now, "take") > count(base, "take");
/** A setting of a named track that changed from the step's start and holds a condition. */
const trackNow = (s: GuideState, name: string) => trackNamed(s, name);
/** The `M` and `S` buttons that are on (to turn off again). */
const switchedOn = (s: GuideState) => s.tracks.flatMap((t) => [...(t.mute ? [guideKey("mute", t.name)] : []), ...(t.solo ? [guideKey("solo", t.name)] : [])]).join(" ");
/** A clip's ▶ in the launcher. */
const launchOf = (c: Clip | undefined) => (c ? guideKey("launch", c.name) : "");
/** The same note (start and pitch) in the step's start. */
const sameNote = <N extends { start: number; pitch: number }>(list: N[], n: N) => list.find((b) => b.start === n.start && b.pitch === n.pitch);
const notesOf = (s: GuideState, id: string | null) => {
  const c = clipOf(s, id);
  return c?.kind === "notes" ? c.notes : [];
};

// ------------------------------------------------------------------ the lessons

export const SONG_LESSONS: SongLesson[] = [
  {
    id: "song-parts",
    title: "What a song is made of",
    summary: "Beats, bars and tempo; tracks as players in a band; a tour of the Song view.",
    intro: [
      "Most music rests on a steady pulse: the **beat**, the thing you tap your foot to. Here the beats are counted in fours, 1, 2, 3, 4, and each group of four is a **bar**. A song is measured in bars, like a road in kilometres.",
      "Each row of the Song view is a **track**: one sound, like one player in a band. Under it are its **clips**, short patterns that repeat. The wide picture lower down is the **timeline**: the bars of the song from left to right, showing which clip plays when.",
      "This lesson opens a practice song, Night Drive. Nothing you do here touches your own songs. (Building a song live from the MiniLab, layer by layer, has a tutorial of its own: Live looping.)",
    ],
    practice: () => ({ ...EXAMPLE_SONGS[0].make(), name: "Practice · Night Drive" }),
    steps: [
      {
        id: "play",
        text: "Press ▶ at the top of the page{{, or ▶ on the MiniLab}}. The song plays from bar 1, and a line, the **playhead**, runs along the timeline.",
        more: [
          "Count along with the drums: 1, 2, 3, 4, 1, 2, 3, 4. Each count is a beat; each 1 starts a new bar. The numbers along the top of the timeline are the bars.",
          "Music that repeats a short piece over and over is built from a **loop**: when the piece ends, it starts again. Most of this song is loops of 1 or 4 bars.",
        ],
        diagram: "beats",
        target: "play",
        done: (now) => now.playing,
      },
      {
        id: "tempo",
        text: "The **tempo** is how fast the beats come, in **BPM** (beats per minute). Type 80 in the `BPM` box at the top and press Enter.",
        more: ["Everything plays slower, but nothing else changes: the same notes, in the same places, in the same bars. The tempo belongs to the song: it is saved with it."],
        target: "tempo",
        done: (now, base) => now.tempo <= 90 && now.tempo < base.tempo,
      },
      {
        id: "tempo-back",
        text: "Put it back to 100.",
        target: "tempo",
        done: (now) => now.tempo >= 95 && now.tempo <= 105,
      },
      {
        id: "mute",
        text: "Press `M` on the Lead track to **mute** it. The tune goes; everything else plays on.",
        more: ["Muting changes nothing in the track: press `M` again and it is back. It is the quickest way to hear what a track adds."],
        target: "mute:Lead",
        done: (now, base) => now.tracks.some((t) => t.mute && !base.tracks.find((b) => b.id === t.id)?.mute),
      },
      {
        id: "solo",
        text: "Press `S` on the Bass track to **solo** it: only soloed tracks play.",
        more: ["Solo is the other way round from mute: instead of taking one track away, it keeps only the ones you pick. Try soloing two tracks at once, the Bass and the Drums."],
        target: "solo:Bass",
        done: (now) => now.tracks.some((t) => t.solo),
      },
      {
        id: "unsolo",
        text: "Turn every `M` and `S` off again, so the whole band plays.",
        target: switchedOn,
        done: (now) => now.tracks.every((t) => !t.mute && !t.solo),
      },
      {
        id: "stop",
        text: "Press ■ to stop{{ (■ on the MiniLab too)}}. ▶ starts again from bar 1.",
        target: "play",
        done: (now) => !now.playing,
      },
    ],
    outro: "That's the whole idea: tracks play clips, bar by bar, at the song's tempo. The next lessons take each piece in turn.",
  },

  {
    id: "song-tracks",
    title: "Tracks and sounds",
    summary: "Select a track, give it a sound, add, name, colour and remove tracks; volume, pan, mute and solo.",
    intro: [
      "Each track has a sound of its own, made with the same synth as the rest of the app. It starts from a **preset**, a ready-made sound, and you can change it like any other: in the Synth view, with Dice, or on the MiniLab's knobs.",
      "The practice song has a short loop on its tracks. Press ▶ whenever you want to hear what you changed.",
    ],
    practice: () =>
      practice(
        "Tracks",
        100,
        band(),
        BAND_SOUNDS,
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-1", "Bass line", 4, bassLine()), noteClip("clip-3", "track-2", "Chords", 4, chordNotes()), noteClip("clip-4", "track-3", "Riff", 4, riff())],
        [place("clip-1", 0, 4), place("clip-2", 0, 4), place("clip-3", 0, 4), place("clip-4", 0, 4)],
        [0, 4],
      ),
    steps: [
      {
        id: "select",
        text: "Click ○ at the left of the Chords track to select it (it turns into ●).",
        more: ["The selected track is the one you are working on: the keys play its sound, and the Synth view, the presets and the MiniLab's knobs edit it. Its name also appears beside Keys and Sequencer at the top."],
        target: "select:Chords",
        done: (now) => now.selectedTrack === trackNamed(now, "Chords")?.id,
      },
      {
        id: "keys",
        text: "Play a few notes on the keys at the bottom, or on your computer keyboard (A to '){{, or on the MiniLab}}. You hear the Chords' sound.",
        target: "keys",
        done: (now, base) => did("note")(now, base) && now.selectedTrack !== null && trackNamed(now, "Chords")?.id === now.selectedTrack,
      },
      {
        id: "sound",
        text: "Give the Chords another sound: press ◀ or ▶ beside its sound's name, or click the name to browse the presets.",
        more: ["A track keeps its own copy of its sound, so changing a preset later doesn't change your song. The name gets a * when you have changed the sound from its preset."],
        target: "sound:Chords",
        done: (now, base) => {
          const id = idOf(now, "Chords");
          return !!now.sounds[id] && now.sounds[id].preset !== base.sounds[id]?.preset;
        },
      },
      {
        id: "add",
        text: "Press `+ Synth track` to add a track with a sound of its own.",
        target: "add-track",
        done: (now, base) => now.tracks.length > base.tracks.length,
      },
      {
        id: "rename",
        text: "Click the new track's name, type a name of your own (say, Strings) and press Enter.",
        target: (s) => guideKey("track-name", s.tracks.at(-1)!.name),
        done: (now, base) => now.tracks.some((t) => base.tracks.some((b) => b.id === t.id && b.name !== t.name)),
      },
      {
        id: "colour",
        text: "Click the coloured strip at the new track's left edge: it takes the next colour. Colours only help you find a track.",
        target: (s) => guideKey("swatch", s.tracks.at(-1)!.name),
        done: (now, base) => now.tracks.some((t) => base.tracks.some((b) => b.id === t.id && b.color !== t.color)),
      },
      {
        id: "volume",
        text: "Each track has its own **volume**. Drag the Lead's volume slider down to about −10 dB.",
        more: ["Volume is in decibels (dB). 0 dB leaves the track as loud as its sound is; −6 dB is about half as loud to the ear, and the far left is off. Double-click the slider to go back to 0 dB."],
        target: "volume:Lead",
        hold: true,
        done: (now) => (trackNow(now, "Lead")?.volume ?? 0) <= -6,
      },
      {
        id: "pan",
        text: "**Pan** places a track between your left and right speaker. Drag the Chords' pan slider to the left.",
        more: ["With headphones it is easy to hear: the Chords move to your left ear. Double-click the slider to bring it back to the centre (C)."],
        target: "pan:Chords",
        hold: true,
        done: (now) => (trackNow(now, "Chords")?.pan ?? 0) <= -0.3,
      },
      {
        id: "remove",
        text: "Remove the track you added with its ✕ (the browser asks first).",
        more: ["A song has one drum track and up to 7 synth tracks. Removing one takes its clips with it; Ctrl+Z (or ↶ beside Tracks) brings it all back."],
        target: (s) => guideKey("remove", s.tracks.at(-1)!.name),
        done: (now, base) => now.tracks.length < base.tracks.length,
      },
    ],
    outro: "Tracks are your band. Next: give the drummer something to play.",
  },

  {
    id: "song-beat",
    title: "A beat",
    summary: "A drum clip as a grid of 16 steps: kick, snare and hats; Edit in Play; Send to song.",
    intro: [
      "A **drum clip** is a grid: one row per drum, 16 squares across for each bar. Each square is a **step**, a sixteenth of the bar, so 4 steps make a beat. A lit step plays its drum.",
      "Three drums do most of the work in pop, rock and dance music: the **kick**, the low thump; the **snare**, the sharp crack; and the **hi-hat**, a short tick that keeps time between them.",
      "The practice song has a bass line on the timeline, waiting for drums.",
    ],
    practice: () => practice("A beat", 100, [drums(), synth("track-1", "Bass", 1)], { "track-1": "Round Bass" }, [noteClip("clip-1", "track-1", "Bass line", 4, bassLine())], [place("clip-1", 0, 8)], [0, 4]),
    steps: [
      {
        id: "add",
        text: "On the Drums track, press `+ Drum clip`.",
        target: "add-drum-clip",
        done: (now, base) => newClips(now, base).some((c) => c.kind === "drums"),
      },
      {
        id: "launch",
        text: "Press ▶ beside the new clip. It plays, empty for now, with the bass; leave it playing.",
        target: (s) => launchOf(s.clips.filter((c) => c.kind === "drums").at(-1)),
        done: (now) => now.playing && clipOf(now, now.launched.drums)?.kind === "drums",
      },
      {
        id: "edit",
        text: "In the clip's panel, press `Edit in Play`. The Play view opens with its drum grid showing your clip.",
        more: ["Drum clips are edited with the Play view's drum grid, and with the MiniLab's pads. A banner in the clip's colour shows which clip you are editing."],
        target: "edit-in-play",
        done: (now) => now.view === "playground" && clipOf(now, now.editClip)?.kind === "drums",
      },
      {
        id: "kick",
        text: "Click the Kick row on steps 1, 5, 9 and 13: a kick on every beat.",
        more: ["Steps 1, 5, 9 and 13 are the four beats of the bar. A kick on each is the \"four on the floor\" of dance music."],
        target: "drum-grid",
        done: (now) => [0, 4, 8, 12].every((s) => drumSteps(clipOf(now, now.editClip), KICK).includes(s)),
      },
      {
        id: "snare",
        text: "Add a Snare on steps 5 and 13: beats 2 and 4, the backbeat.",
        target: "drum-grid",
        done: (now) => [4, 12].every((s) => drumSteps(clipOf(now, now.editClip), SNARE).includes(s)),
      },
      {
        id: "hats",
        text: "Add a Hat on every other step (1, 3, 5 … 15). Then change anything you like: move a kick, add a clap.",
        more: [
          "Hats between the beats make the beat move forward. Try them on every step, or only between the beats (3, 7, 11, 15), and hear the difference.",
          "Each hit also has a **velocity**: how hard it is played. Clicked steps all play at one velocity; hits recorded from the pads{{ (the MiniLab's are touch-sensitive)}} keep how hard you hit them. Recording comes in lesson 7.",
        ],
        target: "drum-grid",
        done: (now) => drumSteps(clipOf(now, now.editClip), HAT).length >= 6,
      },
      {
        id: "back",
        text: "Your beat is in the clip. Press `Song` at the top to go back to the Song view.",
        target: "view-song",
        done: (now) => now.view === "song",
      },
      {
        id: "own",
        text: "The Play view's drum loop is a toy of its own. Open the Play view, and press `Back to my pattern` in the banner: the grid shows the drum loop again.",
        target: "back-to-pattern",
        done: (now) => now.view === "playground" && !now.editClip,
      },
      {
        id: "send",
        text: "Under the `Drums` tab, press `Send to song`: the drum loop becomes a new clip on the Drums track.",
        more: ["Send to song copies: changing the drum loop afterwards doesn't change the clip. It is a good way to keep a beat you made while jamming in the Play view."],
        target: "send-drums",
        done: did("sendDrums"),
      },
    ],
    outro: "That's a beat. With a kick, a snare and a hat you can make most rhythms; the rest is taste.",
  },

  {
    id: "song-launcher",
    title: "Clips and the clip launcher",
    summary: "Loops that start on the next bar, stopping them, clip length, Duplicate for a variation.",
    intro: [
      "Before a song is laid out on the timeline, it helps to try clips together, the way a band jams. The ▶ beside each clip is the **clip launcher**: it plays that clip in a loop on its track.",
      "The practice song has clips on every track and nothing on the timeline yet.",
    ],
    practice: () =>
      practice(
        "Clips",
        100,
        band(),
        BAND_SOUNDS,
        [
          drumClip("clip-1", "Groove", [groove()]),
          drumClip("clip-2", "Fill", [fill()]),
          noteClip("clip-3", "track-1", "Bass A", 4, bassLine()),
          noteClip("clip-4", "track-1", "Bass B", 4, bassLine().filter((_, i) => i % 5 < 3)),
          noteClip("clip-5", "track-2", "Chords", 4, chordNotes()),
          noteClip("clip-6", "track-3", "Riff", 2, riff().filter((n) => n.start < 2 * 384)),
        ],
        [],
      ),
    steps: [
      {
        id: "groove",
        text: "Press ▶ beside the Groove clip on the Drums track. A clip loops until you stop it.",
        target: "launch:Groove",
        done: (now) => now.playing && launchedName(now, "Drums") === "Groove",
      },
      {
        id: "bass",
        text: "While it plays, press ▶ beside Bass A. It blinks, and starts on the next bar, so it comes in exactly in time.",
        more: ["Starting on a bar line is what keeps the clips together: they all count bars from the same 1."],
        target: "launch:Bass_A",
        done: (now) => launchedName(now, "Bass") === "Bass A",
      },
      {
        id: "chords",
        text: "Start the Chords too.",
        target: "launch:Chords",
        done: (now) => launchedName(now, "Chords") === "Chords",
      },
      {
        id: "fill",
        text: "Press ▶ beside Fill. On the next bar it takes the Groove's place: a track plays one clip at a time.",
        target: "launch:Fill",
        done: (now) => launchedName(now, "Drums") === "Fill",
      },
      {
        id: "groove-back",
        text: "Back to the Groove.",
        target: "launch:Groove",
        done: (now) => launchedName(now, "Drums") === "Groove",
      },
      {
        id: "stop-bass",
        text: "Press ■ beside Bass A: the bass stops at the next bar, and the rest plays on.",
        target: "launch:Bass_A",
        done: (now, base) => now.playing && !!base.launched[idOf(base, "Bass")] && !now.launched[idOf(now, "Bass")],
      },
      {
        id: "length",
        text: "Click the Riff's name to open it, and set its `Length` to 4 bars. It now plays for 4 bars before it starts again.",
        more: ["A clip can be 1 to 8 bars long (drum clips up to 4). Notes past the end are kept but not played; a longer clip is silent where it has no notes."],
        target: "clip-length",
        done: (now, base) => now.clips.some((c) => base.clips.some((b) => b.id === c.id && b.bars !== c.bars)),
      },
      {
        id: "duplicate",
        text: "Press `Duplicate` in the clip's panel: a copy of the clip, to change into a **variation**.",
        more: ["Songs repeat, but rarely exactly. A copy with a few notes changed, or a fill in place of the groove every fourth bar, keeps the ear interested."],
        target: "duplicate",
        done: did("duplicate"),
      },
      {
        id: "stop",
        text: "Press ■ at the top to stop everything. Next time you press ▶, the clips you chose start again together.",
        target: "play",
        done: (now) => !now.playing,
      },
    ],
    outro: "The launcher is for trying ideas. Once you like a combination, lesson 8 puts it on the timeline.",
  },

  {
    id: "song-notes",
    title: "Notes in the piano roll",
    summary: "Pitch and time, the grid and snap, note length and velocity, scale lock, and the tools.",
    intro: [
      "A note clip opens in the **piano roll**, named after the paper rolls of old player pianos. Each note is a bar: up and down is its **pitch** (the keyboard at the left tells which note), left to right is time, and its length is how long it is held.",
      "The practice song plays drums and chords round and round. Your job: a bass line.",
    ],
    practice: () =>
      practice(
        "Notes",
        100,
        [drums(), synth("track-1", "Bass", 1), synth("track-2", "Chords", 2)],
        { "track-1": "Round Bass", "track-2": "Juno Pad" },
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-1", "My bass", 2, []), noteClip("clip-3", "track-2", "Chords", 4, chordNotes())],
        [place("clip-1", 0, 8), place("clip-3", 0, 8)],
        [0, 4],
      ),
    steps: [
      {
        id: "open",
        text: "Click My bass on the Bass track to open it in the piano roll.",
        target: "clips:Bass",
        done: (now) => clipOf(now, now.selectedClip)?.name === "My bass",
      },
      {
        id: "listen",
        text: "Press ▶ beside My bass: the clip loops with the drums and chords while you work.",
        target: "launch:My_bass",
        done: (now) => now.playing && launchedName(now, "Bass") === "My bass",
      },
      {
        id: "draw",
        text: "Click in the grid to draw a note. Higher rows are higher notes; further right is later. Click a key at the left to hear its note.",
        more: ["Drag while drawing to make the note longer. Double-click a note (or right-click it) to delete it."],
        target: "roll",
        done: (now, base) => notesOf(now, now.selectedClip).length > notesOf(base, now.selectedClip).length,
      },
      {
        id: "grid",
        text: "Set `Grid` to 1/8. Notes now **snap** to eighth notes: two to a beat.",
        more: [
          "The **grid** is the set of lines notes land on. 1/4 is one line a beat, 1/8 two, 1/16 four. Snapping makes notes start exactly in time, even if your click is a little off.",
          "Hold Alt while you drag to place a note between the lines. `Snap` turns snapping off altogether.",
        ],
        diagram: "grid",
        target: "grid",
        done: (now) => now.grid === 1,
      },
      {
        id: "line",
        text: "Draw at least 8 notes: a bass line. Low notes on A, F, C and G fit the chords; let your ear decide the rest.",
        target: "roll",
        done: (now) => notesOf(now, now.selectedClip).length >= 8,
      },
      {
        id: "length",
        text: "Drag the right end of a note to make it longer.",
        target: "roll",
        done: (now, base) => notesOf(now, now.selectedClip).some((n) => (sameNote(notesOf(base, now.selectedClip), n)?.length ?? Infinity) < n.length),
      },
      {
        id: "velocity",
        text: "Under the notes, each one has a bar for its **velocity**: how hard it is played. Drag one down to play that note softer.",
        more: ["Soft and loud notes in turn make a line feel played by a person. Select several notes first to change them together."],
        target: "roll",
        done: (now, base) => notesOf(now, now.selectedClip).some((n) => (sameNote(notesOf(base, now.selectedClip), n)?.velocity ?? 0) > n.velocity),
      },
      {
        id: "scale",
        text: "Turn on **scale lock** (`Scale lock`, by the keyboard). Rows outside the scale go dim, and new notes snap into it.",
        more: ["A scale is a set of notes that sound good together. With scale lock on, every note you draw or play is one of them: a safety net while you learn. The scale and its key are set beside the switch."],
        target: "scale",
        done: (now) => now.scaleOn,
      },
      {
        id: "transpose",
        text: "Press `+12` in the piano roll's tools: the whole line moves up an octave. Press `−12` to bring it back.",
        more: ["To **transpose** is to move notes up or down together. With notes selected, the tools work on those only; with none, on the whole clip."],
        target: "roll-tools",
        done: (now, base) => count(now, "transpose") >= count(base, "transpose") + 2,
      },
      {
        id: "quantize",
        text: "Press `Quantize`: every note's start is pulled onto the grid.",
        more: [
          "To **quantize** is to pull notes into time. It matters most for recorded notes, which are never exactly on the beat. The strength beside it pulls only part of the way, which keeps some feel.",
          "`Legato` holds each note until the next one starts; `Reverse` plays the notes backwards.",
        ],
        target: "roll-tools",
        done: did("quantize"),
      },
      {
        id: "double",
        text: "Press `Double`: the clip becomes twice as long, its notes played twice. Change a few notes in the second half.",
        target: "roll-tools",
        done: did("double"),
      },
      {
        id: "undo",
        text: "Press Ctrl+Z (or ↶ beside Tracks) to undo your last change. Every edit can be undone.",
        target: "song-undo",
        done: did("undo"),
      },
    ],
    outro: "That's a bass line from nothing. Everything in a piano roll is these few moves: draw, move, lengthen, soften.",
  },

  {
    id: "song-steps",
    title: "Step clips",
    summary: "The step sequencer as a clip: notes, rests and slides; Convert to notes; Send to song.",
    intro: [
      "A **step clip** works like the Play view's step sequencer: 8 steps, each with one note, played one after another in time. It is a quick way to make a repeating line, like the acid basslines of the 1980s.",
    ],
    practice: () =>
      practice(
        "Steps",
        118,
        [drums(), synth("track-1", "Acid", 4), synth("track-2", "Chords", 2)],
        { "track-1": "Acid 303", "track-2": "Juno Pad" },
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-2", "Chords", 4, chordNotes())],
        [place("clip-1", 0, 8), place("clip-2", 0, 8)],
        [0, 4],
      ),
    steps: [
      {
        id: "add",
        text: "On the Acid track, press `+ Step clip`. Its panel opens below: 8 steps.",
        target: "add-step-clip:Acid",
        done: (now, base) => newClips(now, base).some((c) => c.kind === "steps"),
      },
      {
        id: "launch",
        text: "Press ▶ beside it to hear it loop with the drums.",
        target: (s) => launchOf(s.clips.filter((c) => c.kind === "steps" && c.track === idOf(s, "Acid")).at(-1)),
        done: (now) => now.playing && clipOf(now, now.launched[idOf(now, "Acid")])?.kind === "steps",
      },
      {
        id: "note",
        text: "Change a step's note with its slider{{ (or a MiniLab fader)}}.",
        target: "step-panel",
        done: (now, base) => now.clips.some((c) => c.kind === "steps" && base.clips.some((b) => b.id === c.id && b.kind === "steps" && b.seq.steps.some((s, i) => s.note !== c.seq.steps[i].note))),
      },
      {
        id: "rest",
        text: "Turn a step off: it becomes a rest, a gap in the line.",
        target: "step-panel",
        done: (now, base) => now.clips.some((c) => c.kind === "steps" && base.clips.some((b) => b.id === c.id && b.kind === "steps" && b.seq.steps.some((s, i) => s.on && !c.seq.steps[i].on))),
      },
      {
        id: "slide",
        text: "Turn on a **slide** on a step: its note glides into the next one.",
        more: ["Slides are what make an acid line squelch and wander. They sound best between notes that are a few keys apart."],
        target: "step-panel",
        done: (now, base) => now.clips.some((c) => c.kind === "steps" && base.clips.some((b) => b.id === c.id && b.kind === "steps" && b.seq.steps.some((s, i) => !s.slide && c.seq.steps[i].slide))),
      },
      {
        id: "convert",
        text: "Press `Convert to notes`: the clip becomes a note clip that sounds the same, to change in the piano roll.",
        more: ["There is no way back except undo: a piano roll can hold things 8 steps can't."],
        target: "convert",
        done: did("convert"),
      },
      {
        id: "send",
        text: "The Play view's step sequencer can become a clip too: open the Play view, and under `Step sequencer` choose `Send to song…` and a track.",
        more: ["The Sequencer part's sound goes with it, so the track sounds the way the toy did."],
        target: "send-steps",
        done: did("sendSteps"),
      },
    ],
    outro: "Step clips for quick repeating lines, note clips for everything else; and Convert when a step line needs more.",
  },

  {
    id: "song-record",
    title: "Recording",
    summary: "Arm a track, count-in and metronome, overdub or replace, quantize, the arpeggiator and the pads, undo a take.",
    intro: [
      "Instead of drawing notes, you can play them: recording writes what you play into a clip, at the moment you played it. It works from the computer keys, the screen's keys{{, and the MiniLab}}.",
      "The practice song has drums and chords to play along to, and an empty Bass and Lead.",
    ],
    practice: () =>
      practice(
        "Recording",
        92,
        band(),
        BAND_SOUNDS,
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-2", "Chords", 4, chordNotes())],
        [place("clip-1", 0, 16), place("clip-2", 0, 16)],
      ),
    steps: [
      {
        id: "arm",
        text: "Press the red ● on the Bass track to **arm** it: it is selected, and recording goes into it.",
        target: "arm:Bass",
        done: (now) => now.armed === idOf(now, "Bass"),
      },
      {
        id: "quantize",
        text: "Set the record bar's `Quantize` to 1/16: notes you play a little early or late are pulled onto the grid.",
        target: "rec-quantize",
        done: (now) => now.rec.quantize === 2,
      },
      {
        id: "take",
        text: "Press `● Record`. After a bar of clicks, the **count-in**, the song plays: play a few low notes, then press ● again to stop.",
        more: [
          "The count-in lets you feel the tempo before you play. While you record, the **metronome** clicks every beat to keep you in time. Neither is in the song; `Count-in` and `Click` in the record bar turn them off.",
          "One go at recording is a **take**. The music plays on after you stop recording; press ■ to stop it too. A new clip is made for the take (`New clips` sets its length), and it loops: each time round you can add more.",
        ],
        target: "record",
        done: (now, base) => tookSince(now, base) && notesOn(now, "Bass") > notesOn(base, "Bass"),
      },
      {
        id: "undo",
        text: "Not happy with it? Press Ctrl+Z (or ↶ beside Tracks): the whole take goes in one step.",
        target: "song-undo",
        done: did("undo"),
      },
      {
        id: "again",
        text: "Record the bass again until you like it.",
        target: "record",
        done: (now, base) => tookSince(now, base) && notesOn(now, "Bass") > 0,
      },
      {
        id: "replace",
        text: "Set the record bar to `Replace`, and record once more over the same clip.",
        more: [
          "With **overdub** each take adds to the clip, which is how you build up a part in passes (the low notes first, then the high ones). With **replace** the clip is cleared when the take starts.",
          "To record into a clip you already have, open it (click its name) before you press ● Record.",
        ],
        target: "rec-mode",
        done: (now, base) => now.rec.mode === "replace" && tookSince(now, base),
      },
      {
        id: "arp",
        text: "Arm the Lead, turn on the **arpeggiator** (`Arp`, by the keyboard), and record holding a chord: the arp's notes are written down.",
        more: ["The arpeggiator plays held notes one after another in time. What it plays is recorded as notes, so you can change them afterwards."],
        target: "arp",
        done: (now, base) => tookSince(now, base) && now.arpOn && notesOn(now, "Lead") > 0,
      },
      {
        id: "arp-off",
        text: "Turn the arpeggiator off again.",
        target: "arp",
        done: (now) => !now.arpOn,
      },
      {
        id: "drums",
        text: "Arm the Drums and record a take: the keys from C to G play the drums{{, and so do the MiniLab's pads}}.",
        more: ["Drum hits recorded this way land on the nearest step of a drum clip, and keep how hard you played them."],
        target: "arm:Drums",
        done: (now, base) => tookSince(now, base) && hitsOn(now, "Drums") > hitsOn(base, "Drums"),
      },
    ],
    outro: "Recording and drawing work together: play it in, then fix it in the piano roll.",
  },

  {
    id: "song-arrange",
    title: "From loops to a song",
    summary: "Song sections; placing, repeating and copying clips; linked copies; transpose; the start, the loop region.",
    intro: [
      "Loops alone go round forever. A song goes somewhere: it is built from **sections**, each with a job. An **intro** lets the listener in, a **verse** moves the song along, the **chorus** is the high point that comes back, and an ending closes it.",
      "The **arrangement** is where you build that: you put clips on the timeline, at the bar where each should play. A clip on the timeline is a **placement**.",
      "The practice song has clips and an empty timeline.",
    ],
    practice: () =>
      practice(
        "Arrangement",
        100,
        band(),
        BAND_SOUNDS,
        [
          drumClip("clip-1", "Intro", [introBeat()]),
          drumClip("clip-2", "Groove", [groove()]),
          drumClip("clip-3", "Fill", [fill()]),
          noteClip("clip-4", "track-1", "Bass line", 4, bassLine()),
          noteClip("clip-5", "track-2", "Chords", 4, chordNotes()),
          noteClip("clip-6", "track-3", "Riff", 4, riff()),
        ],
        [],
      ),
    steps: [
      {
        id: "place",
        text: "Drag the Chords clip from its track's list down onto the timeline, at bar 1.",
        more: ["You can also select a clip (click its name) and then click its track's row on the timeline, at the bar where it should go."],
        diagram: "placements",
        target: "timeline",
        done: (now, base) => placementsOf(now, clipNamed(now, "Chords")?.id ?? "").length > placementsOf(base, clipNamed(base, "Chords")?.id ?? "").length,
      },
      {
        id: "repeat",
        text: "Drag the right end of the placement out to bar 9: the clip repeats to fill 8 bars.",
        target: "timeline",
        done: (now) => now.placements.some((p) => p.bars >= 8),
      },
      {
        id: "drums",
        text: "Place the Intro beat at bar 1, and the Groove from bar 5.",
        target: "timeline",
        done: (now) => placementsOf(now, clipNamed(now, "Intro")?.id ?? "").length > 0 && placementsOf(now, clipNamed(now, "Groove")?.id ?? "").some((p) => p.bar >= 4),
      },
      {
        id: "bass",
        text: "Place the Bass line from bar 5, so the bass comes in with the groove.",
        target: "timeline",
        done: (now) => placementsOf(now, clipNamed(now, "Bass line")?.id ?? "").some((p) => p.bar >= 4),
      },
      {
        id: "copy",
        text: "Copy a placement: select it and press `Copy after`, or drag it with Alt held. The copy is **linked**: ∞ marks it.",
        more: ["A placement doesn't hold notes: it points at its clip. So copies share the clip's notes, like a chorus that comes back the same each time."],
        target: "copy-after",
        done: (now, base) => now.clips.some((c) => placementsOf(now, c.id).length >= 2 && placementsOf(now, c.id).length > placementsOf(base, c.id).length),
      },
      {
        id: "change",
        text: "Click one of the linked placements: its clip opens below. Change a note, and listen: every placement of that clip changed.",
        target: "roll",
        done: (now, base) => now.clips.some((c) => placementsOf(now, c.id).length >= 2 && !same(c, base.clips.find((b) => b.id === c.id))),
      },
      {
        id: "unique",
        text: "To change one placement on its own, select it and press `Make unique`: it gets its own copy of the clip.",
        target: "make-unique",
        done: did("makeUnique"),
      },
      {
        id: "transpose",
        text: "Select a placement and press + beside `Transpose`: it plays its clip higher, without changing the clip.",
        more: ["Moving a section up a few semitones near the end is an old trick to lift a song (the \"truck driver's gear change\")."],
        target: "place-transpose",
        done: (now, base) => now.placements.some((p) => p.transpose !== 0 && (base.placements.find((b) => b.id === p.id)?.transpose ?? 0) !== p.transpose),
      },
      {
        id: "length",
        text: "Fill the song out to 16 bars or more: an intro, a verse, a chorus with the Riff, an ending.",
        target: "timeline",
        done: (now) => songBars(now) >= 16,
      },
      {
        id: "start",
        text: "Click the ruler (the bar numbers) at bar 5: the orange marker moves there, and ▶ plays from there.",
        target: "timeline",
        done: (now, base) => now.start > 0 && now.start !== base.start,
      },
      {
        id: "loop",
        text: "Drag along the ruler from bar 5 to bar 9: a **loop region**. Press ▶: those bars play round and round.",
        more: ["Looping a few bars is how you work on one part of the song without starting from the top each time. `Loop` turns it off and on; `Follow` keeps the playhead in sight."],
        target: "timeline",
        done: (now) => now.playing && now.loopOn && !!now.loop,
      },
      {
        id: "back",
        text: "While it plays, press ▶ beside any clip in a track's list: the launcher takes that track over (dimmed on the timeline). Then press `Back to arrangement`.",
        target: "back-arr",
        done: did("backToArrangement"),
      },
      {
        id: "stop",
        text: "Press ■. Turn `Loop` off and press ▶ to hear the whole song from your start marker.",
        target: "play",
        done: (now) => !now.playing,
      },
    ],
    outro: "That's an arrangement: the same few clips, placed in a shape with a beginning, a middle and an end.",
  },

  {
    id: "song-automation",
    title: "Movement (automation)",
    summary: "Automation lanes and their tools: a filter sweep, a fade-out, recording a knob, the A mark.",
    intro: [
      "Turning a knob while music plays is half the fun of a synth. **Automation** lets a clip do it for you, the same way every time: a setting follows a line you draw.",
      "The practice song has a pad chord clip, looping its four bars.",
    ],
    practice: () =>
      practice(
        "Automation",
        100,
        [drums(), synth("track-1", "Bass", 1), synth("track-2", "Pad", 2)],
        { "track-1": "Round Bass", "track-2": "Juno Pad" },
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-1", "Bass line", 4, bassLine()), noteClip("clip-3", "track-2", "Pad chords", 4, chordNotes())],
        [place("clip-1", 0, 8), place("clip-2", 0, 8), place("clip-3", 0, 8)],
        [0, 4],
      ),
    steps: [
      {
        id: "open",
        text: "Click Pad chords on the Pad track. Under its piano roll is the automation **lane**.",
        target: "clips:Pad",
        done: (now) => clipOf(now, now.selectedClip)?.name === "Pad chords",
      },
      {
        id: "points",
        text: "In the lane, pick `Cutoff` in the list, choose `Points`, and click a few points: low at the start, high in the middle, low at the end.",
        more: ["The line is where the knob goes over time: high is the knob turned up, low turned down. Between the points, it moves in straight lines."],
        diagram: "automation",
        target: "auto-lane",
        done: (now) => {
          const c = clipOf(now, now.selectedClip);
          return c?.kind === "notes" && (c.lanes ?? []).some((l) => l.target === "cutoff" && l.points.length >= 2);
        },
      },
      {
        id: "play",
        text: "Press ▶: the filter opens and closes with your line, every time round.",
        target: "play",
        done: (now) => now.playing,
      },
      {
        id: "fade",
        text: "Pick `Track Volume`, choose `Line`, and drag from the start of bar 3, high, to the end of bar 4, low: a **fade-out**.",
        target: "auto-lane",
        done: (now) => noteClips(now).some((c) => (c.lanes ?? []).some((l) => l.target === "trackVolume" && l.points.length >= 2)),
      },
      {
        id: "synth",
        text: "While it plays, open the `Synth` view: the Cutoff knob turns by itself, with a small A beside it.",
        more: ["The A means a clip is moving that setting right now. When the music stops, the setting goes back to where you left it."],
        target: "view-synth",
        done: (now) => now.view === "synth" && now.playing,
      },
      {
        id: "back",
        text: "Go back to the `Song` view.",
        target: "view-song",
        done: (now) => now.view === "song",
      },
      {
        id: "record",
        text: "Record a knob: arm the Pad (●), press `● Record`, and turn the MiniLab knob for [[cutoff]] while it plays. Press ● to stop.",
        more: ["What the knob passes over replaces the line there; let go and the line takes over again. You can redraw it afterwards like any other."],
        miniLab: true,
        target: "record",
        done: (now, base) => tookSince(now, base) && noteClips(now).some((c) => !same(c.lanes, noteClips(base).find((b) => b.id === c.id)?.lanes)),
      },
      {
        id: "clear",
        text: "Pick `Cutoff` in the lane again and press `Clear`: the line is gone, and the Pad keeps its own cutoff.",
        target: "auto-lane",
        done: (now) => noteClips(now).every((c) => !(c.lanes ?? []).some((l) => l.target === "cutoff")),
      },
    ],
    outro: "Slow sweeps, fades, a filter that opens for the chorus: automation is how a loop keeps changing.",
  },

  {
    id: "song-mix",
    title: "A simple mix",
    summary: "Balance with the volumes, space with pan, checking with solo, the meters, each sound's reverb.",
    intro: [
      "To **mix** is to set how loud each track is and where it sits, so that every part can be heard and none buries another. It isn't magic: mostly it is turning things down.",
      "The practice song is badly mixed on purpose: the chords are too loud and the bass too quiet.",
    ],
    practice: () => {
      const tracks = band();
      tracks[1].volume = -14;
      tracks[2].volume = 5;
      return practice(
        "Mix",
        100,
        tracks,
        BAND_SOUNDS,
        [drumClip("clip-1", "Groove", [groove()]), noteClip("clip-2", "track-1", "Bass line", 4, bassLine()), noteClip("clip-3", "track-2", "Chords", 4, chordNotes()), noteClip("clip-4", "track-3", "Riff", 4, riff())],
        [place("clip-1", 0, 8), place("clip-2", 0, 8), place("clip-3", 0, 8), place("clip-4", 0, 8)],
        [0, 4],
      );
    },
    steps: [
      {
        id: "play",
        text: "Press ▶ and listen. Each track's **meter**, at the right of its row, shows how loud it is right now.",
        more: ["A meter that reaches red is too loud: the sound gets harsh. If the whole song is too loud, turn everything down a little rather than one track up."],
        target: "meter",
        done: (now) => now.playing,
      },
      {
        id: "solo",
        text: "Solo the Drums and the Bass (`S` on both), to hear the low end on its own.",
        target: "solo:Drums solo:Bass",
        done: (now) => !!trackNow(now, "Drums")?.solo && !!trackNow(now, "Bass")?.solo,
      },
      {
        id: "bass",
        text: "The bass is hard to hear. Raise its volume to about −3 dB.",
        target: "volume:Bass",
        hold: true,
        done: (now) => (trackNow(now, "Bass")?.volume ?? -99) >= -5,
      },
      {
        id: "unsolo",
        text: "Turn solo off: the whole band again.",
        target: switchedOn,
        done: (now) => now.tracks.every((t) => !t.solo),
      },
      {
        id: "chords",
        text: "The chords cover the rest. Turn them down until the tune and the bass come through: about −4 dB.",
        target: "volume:Chords",
        hold: true,
        done: (now) => (trackNow(now, "Chords")?.volume ?? 99) <= -2,
      },
      {
        id: "pan",
        text: "Give two tracks their own place: pan the Chords a little left, and the Lead a little right.",
        more: ["Keep the drums' kick and the bass in the middle: low sounds carry the song and belong in both speakers."],
        target: "pan:Chords pan:Lead",
        hold: true,
        done: (now) => (trackNow(now, "Chords")?.pan ?? 0) <= -0.15 && (trackNow(now, "Lead")?.pan ?? 0) >= 0.15,
      },
      {
        id: "reverb",
        text: "Select the Lead, open the `Synth` view, and turn up its **reverb** ([[reverbMix]], in the effects): the tune moves back into a room.",
        more: ["Each track's sound has its own effects. A little reverb on a lead or a pad makes space around it; on a bass it usually just muddies the low end."],
        target: "view-synth",
        done: (now, base) => {
          const id = idOf(now, "Lead");
          return (now.sounds[id]?.reverb ?? 0) > (base.sounds[id]?.reverb ?? 0) + 0.08;
        },
      },
      {
        id: "back",
        text: "Back to the `Song` view: listen to the whole mix once more.",
        target: "view-song",
        done: (now) => now.view === "song",
      },
    ],
    outro: "Balance, place, a little space: that's a mix. Check it quietly too; a good mix still works at low volume.",
  },

  {
    id: "song-finish",
    title: "Finishing and sharing",
    summary: "Your songs and saving, Export as WAV, recording what you hear, song files and links.",
    intro: [
      "Your songs are saved in this browser as you work. To play one anywhere else, or to send it to someone, you **export** it: as audio, as a song file, or as a link.",
      "The practice song is a finished little piece. Practice songs aren't kept, unless you choose to keep one.",
    ],
    practice: () =>
      practice(
        "Finishing",
        100,
        band(),
        BAND_SOUNDS,
        [drumClip("clip-1", "Intro", [introBeat()]), drumClip("clip-2", "Groove", [groove()]), noteClip("clip-3", "track-1", "Bass line", 4, bassLine()), noteClip("clip-4", "track-2", "Chords", 4, chordNotes()), noteClip("clip-5", "track-3", "Riff", 4, riff())],
        [place("clip-1", 0, 4), place("clip-2", 4, 8), place("clip-3", 4, 8), place("clip-4", 0, 12), place("clip-5", 8, 4)],
      ),
    steps: [
      {
        id: "save",
        text: "Press `Save to my songs` at the top of the Song view: from now on it is kept, and saved as you work.",
        more: ["`Songs ▾` lists your songs (and the three examples): open one, or ✕ to delete it. `New` starts an empty song; `Duplicate` keeps the song as it is and goes on in a copy."],
        target: "save-song",
        done: (now, base) => did("saved")(now, base) || (base.practice && !now.practice),
      },
      {
        id: "rename",
        text: "Click the song's name at the top left, give it a name of your own, and press Enter.",
        target: "song-name",
        done: (now, base) => now.songName !== base.songName,
      },
      {
        id: "wav",
        text: "Press `WAV ▾`, choose 44.1 kHz and 16 bit, and press `Export`. A **WAV** file is saved: it plays in any music player, on any device.",
        more: [
          "The song is played into the file faster than real time, with the reverb and delay ringing out at the end. The Play view's toys aren't in it.",
          "The **sample rate** is how many times a second the sound is measured: 44.1 kHz (44,100 times) is CD quality. The **bit depth** is how finely: 16 bit is CD quality, 24 bit leaves more room if you will work on the file in other software.",
        ],
        target: "wav",
        done: did("wav"),
      },
      {
        id: "record",
        text: "In the same panel, press `● Record`, play something on the keys over the song, then `Stop`. Everything you heard is in the recording; `Save` keeps it.",
        target: "wav-record",
        done: did("recordOut"),
      },
      {
        id: "file",
        text: "Press `Export` in the song bar: a song file, with its sounds. On another computer, `Import…` opens it as it was.",
        target: "song-export",
        done: did("songFile"),
      },
      {
        id: "link",
        text: "Press `Copy link`: a link that opens this song in any browser. Nothing is uploaded: the song is inside the link.",
        target: "copy-link",
        done: did("link"),
      },
    ],
    outro: "That's the whole path: from an empty song to a file you can play anywhere. The last lesson is yours.",
  },

  {
    id: "song-project",
    title: "Your own song",
    summary: "From an empty song to an exported WAV, with milestones to tick along the way.",
    intro: [
      "Time to make a song of your own, from an empty song to a WAV. There are no right answers: the milestones below tick themselves as you reach them, in any order. They check that a part is there, never whether it is good: that's for your ears.",
      "This is a real song, kept among yours as you work. Come back to it whenever you like: the lesson picks up where you left it.",
    ],
    practice: null,
    milestones: true,
    steps: [
      {
        id: "beat",
        text: "A beat: a drum clip with at least 6 hits.",
        more: ["A drum clip on the Drums track, then `Edit in Play` (lesson 3); or send the Play view's drum loop (`Send to song`)."],
        done: (now) => now.clips.some((c) => hits(c) >= 6),
      },
      {
        id: "bass",
        text: "A bass line: a clip with at least 4 low notes (below middle C).",
        more: ["Draw it in the piano roll (lesson 5), record it (lesson 7), or make a step clip (lesson 6) and convert it."],
        done: (now) => noteClips(now).some((c) => c.notes.filter((n) => n.pitch < 60).length >= 4),
      },
      {
        id: "chords",
        text: "Chords: a clip with 3 notes or more starting together.",
        more: ["Scale lock (lesson 5) helps: any three notes from the scale, two keys apart (say C, E and G), make a chord."],
        done: (now) => noteClips(now).some((c) => widestChord(c) >= 3),
      },
      {
        id: "arranged",
        text: "16 bars or more arranged on the timeline.",
        more: ["An intro, then the parts coming in one by one, a chorus that comes back, an ending (lesson 8)."],
        done: (now) => songBars(now) >= 16,
      },
      {
        id: "mix",
        text: "A mix: a track's volume or pan changed.",
        done: (now, base) => now.tracks.some((t) => base.tracks.some((b) => b.id === t.id && (b.volume !== t.volume || b.pan !== t.pan))),
      },
      {
        id: "wav",
        text: "A WAV exported.",
        done: did("wav"),
      },
    ],
    outro: "You made a song. Play it to someone.",
  },
];

/** A lesson's index by id (-1: none). */
export const songLessonIndex = (id: string) => SONG_LESSONS.findIndex((l) => l.id === id);
