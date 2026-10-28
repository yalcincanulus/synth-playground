// "Make a song"'s words: everything a music app takes for granted, explained for someone who has never used
// one. A lesson marks a word in **bold** where it explains it; the guide shows its meaning on hover and lists
// the lesson's words at its end.

import type { Term } from "../glossary";
import { SONG_LESSONS } from "./lessons";

export const SONG_GLOSSARY: Term[] = [
  // What a song is made of
  { term: "beat", also: ["beats"], text: "The steady pulse you tap your foot to. Most songs count four beats over and over: 1, 2, 3, 4." },
  { term: "bar", also: ["bars"], text: "A group of beats, four here: one count of 1, 2, 3, 4. Songs are measured in bars." },
  { term: "tempo", text: "How fast the beats come, in beats per minute (BPM). 120 BPM is two beats a second." },
  { term: "BPM", text: "Beats per minute: the tempo. A higher number plays the whole song faster." },
  { term: "loop", also: ["loops"], text: "A short piece of music that plays again from its start as soon as it ends." },
  { term: "track", also: ["tracks"], text: "One row of the song with one sound of its own, like one player in a band." },
  { term: "clip", also: ["clips"], text: "A short pattern of notes or drum hits, 1 to 8 bars long, that belongs to a track." },
  { term: "arrangement", text: "The whole song laid out in time: which clips play on which track, from which bar to which bar." },
  { term: "timeline", text: "The arrangement's picture: bars from left to right, one row per track." },
  { term: "playhead", text: "The line that moves along while the music plays: where you are in the song now." },
  { term: "mute", also: ["muted"], text: "Silence one track, without changing anything in it." },
  { term: "solo", also: ["soloed"], text: "Hear only this track (and other soloed ones). Handy for checking one part." },
  // Tracks and sounds
  { term: "preset", also: ["presets"], text: "A saved sound with a name, ready to use. A track starts from one, and you can change it." },
  { term: "volume", text: "How loud a track is in the song, in decibels (dB). 0 dB leaves it as it is; minus is quieter." },
  { term: "pan", text: "Where a track sits between the left and right speakers." },
  // A beat
  { term: "drum clip", text: "A clip for the drum track: a grid of 16 steps a bar, one row per drum." },
  { term: "kick", text: "The big, low drum. It usually marks beat 1 and holds the song up." },
  { term: "snare", text: "The sharp crack, usually on beats 2 and 4: the backbeat." },
  { term: "hi-hat", also: ["hat", "hats"], text: "A short, bright tick. Hats fill the space between the kicks and snares." },
  { term: "step", also: ["steps"], text: "One square of a grid: a sixteenth of a bar here. A hit or a note goes on a step." },
  // Clips and the clip launcher
  { term: "clip launcher", also: ["launcher"], text: "The ▶ beside each clip in a track's list: it plays that clip in a loop, starting on the next bar." },
  { term: "variation", text: "A copy of a clip with a few changes, so the song doesn't repeat exactly." },
  // Notes in the piano roll
  { term: "piano roll", text: "The editor for a note clip: pitch from bottom to top, time from left to right, each note a bar." },
  { term: "pitch", text: "How high or low a note is. In the piano roll, higher rows are higher notes." },
  { term: "grid", text: "The lines notes snap to: quarter notes (1/4), eighths (1/8), sixteenths (1/16)…" },
  { term: "snap", text: "Notes jump onto the grid when you draw or move them, so they land exactly in time." },
  { term: "velocity", text: "How hard a note is played: soft or loud. Each note in the piano roll has its own." },
  { term: "scale lock", text: "Only the notes of one scale can be played or drawn, so nothing sounds wrong." },
  { term: "quantize", also: ["quantized"], text: "Pull notes onto the grid, so notes played a little early or late land in time." },
  { term: "transpose", also: ["transposed"], text: "Move notes up or down by the same amount: +12 is an octave higher." },
  // Step clips
  { term: "step clip", also: ["step clips"], text: "A clip played like the Play view's step sequencer: 8 steps, each with a note." },
  { term: "slide", text: "A note that glides into the next one instead of starting it fresh." },
  // Recording
  { term: "arm", also: ["armed"], text: "Mark a track for recording: what you play goes into its clip." },
  { term: "count-in", text: "A bar of clicks before recording starts, so you can feel the tempo first." },
  { term: "metronome", text: "A click on every beat while you record, to play in time to. It isn't in the song." },
  { term: "take", also: ["takes"], text: "One go at recording, from ● Record until you stop. Undo removes a whole take at once." },
  { term: "overdub", text: "Recording that adds to what the clip has, each time round." },
  { term: "replace", text: "Recording that clears the clip first, so only the new take stays." },
  { term: "arpeggiator", also: ["arp"], text: "Plays the notes you hold one after another, in time. Its notes can be recorded." },
  // From loops to a song
  { term: "section", also: ["sections"], text: "A part of a song with its own job: the intro, a verse, the chorus, the ending." },
  { term: "intro", text: "How a song begins: often fewer tracks, to let the listener in." },
  { term: "verse", text: "The part that moves the song along. It comes back a few times, often a little different." },
  { term: "chorus", text: "The high point that comes back: usually the fullest, catchiest part." },
  { term: "placement", also: ["placements"], text: "A clip put on the timeline at a bar, for some bars. One clip can have many." },
  { term: "linked", text: "Placements of the same clip are linked: change the clip once, and all of them change." },
  { term: "loop region", text: "Bars marked on the ruler that play round and round, to work on one part of the song." },
  // Movement
  { term: "automation", text: "A setting that moves by itself while a clip plays, along a line you draw or record." },
  { term: "lane", also: ["lanes"], text: "One setting's line under the piano roll: high is more, low is less." },
  { term: "fade-out", text: "The music getting quieter and quieter until it is gone: a common ending." },
  // A simple mix
  { term: "mix", also: ["mixing"], text: "Setting how loud each track is and where it sits, so every part can be heard." },
  { term: "meter", also: ["meters"], text: "The bar showing how loud a track is right now. Red means too loud." },
  { term: "reverb", text: "The sound of a room: echoes so close together they blur into a tail." },
  // Finishing and sharing
  { term: "export", also: ["exported"], text: "Turn the song into a file that other apps and people can use." },
  { term: "WAV", text: "An audio file that any music player opens: the sound itself, not the notes." },
  { term: "sample rate", text: "How many times a second the sound is measured: 44.1 kHz is CD quality." },
  { term: "bit depth", text: "How finely each measurement is stored. 16 bit is CD quality; 24 bit leaves more room." },
];

/** A word's entry (any of its spellings, any case). */
export function songTerm(word: string): Term | undefined {
  const w = word.toLowerCase();
  return SONG_GLOSSARY.find((t) => [t.term, ...(t.also ?? [])].some((s) => s.toLowerCase() === w));
}

/** Every bold word in a lesson's text: its intro, its steps and their "tell me more". */
export function boldWords(texts: string[]): string[] {
  return texts.flatMap((t) => [...t.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]));
}

export const lessonTexts = (i: number) => {
  const l = SONG_LESSONS[i];
  return [...l.intro, ...l.steps.flatMap((s) => [s.text, ...(s.more ?? [])]), l.outro];
};

/** The lesson that first explains a word (-1: none). */
export const songTermLesson = (t: Term) => SONG_LESSONS.findIndex((_, i) => boldWords(lessonTexts(i)).some((w) => songTerm(w) === t));

/** A lesson's words, in the order it explains them. */
export function lessonTerms(i: number): Term[] {
  const terms: Term[] = [];
  for (const w of boldWords(lessonTexts(i))) {
    const t = songTerm(w);
    if (t && !terms.includes(t)) terms.push(t);
  }
  return terms;
}
