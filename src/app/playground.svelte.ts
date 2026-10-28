import { SvelteSet } from "svelte/reactivity";
import { DRUM_NAMES } from "../audio/drums";
import { Engine, type CpuLoad, type DrumTrack, type ListenTap } from "../audio/engine";
import type { Strip } from "../audio/fx";
import type { NoteOwner } from "../audio/voice";
import { EFFECT_ON, effectOrder, formatValue, fromControl, fxSlotId, EFFECTS, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, PARAMS, slotIds, toControl, type Effect, type ParamId, type ParamValues } from "../audio/params";
import { WorkerClock } from "../audio/clock";
import { Sequencer, type Pattern, type SequencerTiming, basicBeat } from "../audio/sequencer";
import {
  defaultNoteSeq,
  DIRECTIONS,
  NOTE_STEPS,
  NoteSequencer,
  RATES,
  clampHz,
  freeHzAt,
  freeHzPosition,
  isLegato,
  LEGATO_HZ,
  STEP_NOTE_LOW,
  STEP_NOTE_RANGE,
  TRANSPOSE_ROOT,
  KEYS_MODES,
  SPLIT_NOTE,
  SPLIT_ROOT,
  type KeysMode,
  type NoteSeqSettings,
} from "../audio/stepSequencer";
import { ARP_MAX_OCTAVES, ARP_PATTERNS, Arpeggiator, defaultArp, type ArpSettings } from "../audio/arpeggiator";
import { TABLE_WAVE } from "../audio/oscCore";
import { addTable, BUILTIN_TABLES, idAfterRemoval, removeTable, renameTable, replaceFrames, tableDef, tableFrames, WAVETABLES, type WavetableDef } from "../audio/wavetables";
import { deleteImportedTable, saveImportedTable, storeTable, updateStoredTable } from "../audio/tableStore";
import { blendKeyframes, shapeWave } from "../audio/tableDraw";
import { TableEditor } from "./wavetable/tableEditor.svelte";
import { detectChord, type DetectedChord } from "../audio/chordDetect";
import { RecipeRun } from "./recipes/recipeRun.svelte";
import { Course } from "./course/course.svelte";
import type { Lesson } from "../course/lesson";
import { RECIPES } from "../recipes/library";
import { blockOf, hardwareFor, INIT_VALUES, initPreset, isPlay, stepParam, type PlayCheck } from "../recipes/recipe";
import {
  CHORD_MODE_NAMES,
  CHORD_MODES,
  chordName,
  defaultScale,
  keyNotes,
  noteNameIn,
  ROOT_NAMES,
  SCALE_IDS,
  scaleLabel,
  scaleNotes,
  SCALES,
  snapToScale,
  type ScaleId,
  type ScaleSettings,
} from "../audio/scale";
import { cutIntoFrames, decodeSoundFile, type CutMode } from "../audio/wavImport";
import { findPorts, isMainPort, MiniLab, requestMidi } from "../minilab/device";
import { Freezes, Rolling } from "./timing";
import { diffValues, History, type Change } from "./history";
import {
  CC_MAPS,
  displayMessage,
  knobValueMessage,
  LED_IDS,
  ledColorMessage,
  parameterMessage,
  type ControlEvent,
  type PadBank,
  type Program,
} from "../minilab/protocol";
import { rollDice } from "../presets/dice";
import { BLOCK_TAPS, BLOCKS, blockDest, blockSource, KNOB_PAGES, MOD_SHORT, pageOf, paramLabel, routeStartAmount, TAP_NAMES, usesTable, WAVETABLE_KNOBS, type BlockId } from "./synth/blocks";
import { DEFAULT_FAVOURITES, FACTORY_PRESETS, factoryId, FADERS, loadUserPresets, presetValues, saveUserPresets, userId, type Preset, type Rgb } from "../presets/presets";
import { emptyFilter, filterPresets, isUserPresetId, presetFile, readPresetFile, readValues, type PresetFilter } from "../presets/browser";
import {
  audible,
  canAddTrack,
  cleanName,
  DEFAULT_TRACK_PRESETS,
  DRUM_TRACK_ID,
  moveTrack,
  newSynthTrack,
  readTracks,
  TRACK_COLORS,
  type Track,
} from "../song/song";
import { barsForSteps, cleanNotes, drumClip, duplicateClip, fitsTrack, noteClip, stepClip, withBars, readClips, BEATS_PER_BAR, type Clip, type ClipKind, type Note } from "../song/clips";
import { stepsToNotes } from "../song/noteEdit";
import { ClipPlayer } from "../song/clipPlayer";

export type MidiStatus = "idle" | "unsupported" | "denied" | "not-found" | "connected";
export type VizMode = "scope" | "spectrum" | "spectrogram";
export type View = "playground" | "synth" | "wavetable" | "song" | "course" | "about";
/** What Shift + encoder cycles through: the playground's three visualisers, then the Synth, Wavetable and Song views. */
const SCREENS = ["scope", "spectrum", "spectrogram", "synth", "wavetable", "song"] as const;
const SCREEN_NAMES: Record<(typeof SCREENS)[number], string> = { scope: "Waveform", spectrum: "Spectrum", spectrogram: "Spectrogram", synth: "Synth", wavetable: "Wavetable", song: "Song" };
const EXPLAIN_KEY = "minilab3.explain";
const SCALE_KEY = "minilab3.scale";
/** The scale the Scale lock switch brings back (Major the first time). */
const LAST_SCALE_KEY = "minilab3.lastScale";
const ARP_KEY = "minilab3.arp";
const RECIPES_DONE_KEY = "minilab3.recipesDone";
const FAVOURITES_KEY = "minilab3.favourites";
/** The Song view's tracks and their sounds (until songs are saved properly, as files of their own). */
const SONG_KEY = "minilab3.song";

/** Your favourite presets' ids, in the order you starred them (pad bank B loads the first 8). */
function loadFavourites(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? "null");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [...DEFAULT_FAVOURITES];
  } catch {
    return [...DEFAULT_FAVOURITES];
  }
}

/** The ids of the recipes finished so far. */
function loadRecipesDone(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(RECIPES_DONE_KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id) => RECIPES.some((r) => r.id === id)) : [];
  } catch {
    return [];
  }
}

function loadScale(): ScaleSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SCALE_KEY) ?? "null");
    const s = { ...defaultScale(), ...saved };
    if (s.scale !== "off" && !(s.scale in SCALES)) s.scale = "off";
    if (!(s.chords in CHORD_MODE_NAMES)) s.chords = "off";
    s.root = ((Math.round(+s.root || 0) % 12) + 12) % 12;
    return s;
  } catch {
    return defaultScale();
  }
}

function loadArp(): ArpSettings {
  const d = defaultArp();
  try {
    const s = { ...d, ...JSON.parse(localStorage.getItem(ARP_KEY) ?? "null") };
    const int = (v: unknown, lo: number, hi: number, fallback: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback);
    return {
      on: s.on === true,
      pattern: int(s.pattern, 0, ARP_PATTERNS.length - 1, d.pattern),
      octaves: int(s.octaves, 1, ARP_MAX_OCTAVES, d.octaves),
      rate: int(s.rate, 0, RATES.length - 1, d.rate),
      gate: typeof s.gate === "number" ? Math.max(0.05, Math.min(1, s.gate)) : d.gate,
      latch: s.latch === true,
    };
  } catch {
    return d;
  }
}

/** Shift + a fader on the MiniLab: what each one picks. The fader's travel is cut into equal zones, one per choice. */
export const SHIFT_FADERS = ["Arp", "Arp range", "Scale", "Chords"] as const;
const zone = (t: number, n: number) => Math.min(n - 1, Math.floor(t * n));

const BROWSE_TIMEOUT_MS = 4000;
const LONG_PRESS_MS = 500;
const SPECTRUM_INTERVAL_MS = 50;
/** Spectrum pad bands: 8 log-spaced bands between these frequencies. */
const SPECTRUM_LOW_HZ = 40;
const SPECTRUM_HIGH_HZ = 14000;
const dim = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];
/** How close (0..1) a hardware fader must come to its new value before it takes over. */
const PICKUP_WINDOW = 0.04;
/** How long a step's note sounds when you change it while the transport is stopped. */
const AUDITION_S = 0.2;
const SLIDE_COLOR: Rgb = [70, 0, 127];
/** Knob value used while Shift is held, so a knob can turn the tempo up or down from anywhere. */
const KNOB_PARK = 64;

/** What the 4 faders do in sequencer edit mode. */
export const SEQ_FADERS = ["Length", "Gate", "Clock", "Direction"] as const;
/** Shift + knob 1, Sync clock: clicks per division, so a small turn doesn't skip past one. */
const CLOCK_CLICKS_PER_DIVISION = 4;
const formatHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(hz < 10 ? 1 : 0)} Hz`);
const hzToNote = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
/** The SEQ_FADERS entry that is the clock: drawn on screen as the Clock knob instead of a fader. */
export const SEQ_CLOCK_FADER = 2;

/** Timing figures for the About page (see timing.ts). Times in ms. */
export interface TimingReport {
  /** How long MIDI note-ons waited before the page handled them, over the last 50 notes. */
  midiAverage: number | null;
  midiWorst: number | null;
  /** The page's longest freeze in the last minute (0: none over 50 ms). */
  longestFreeze: number;
  /** The sequencer since its last Play, or null while stopped. */
  sequencer: SequencerTiming | null;
}

/** The parts: Keys (what you play), Sequencer (what the step sequencer plays), and each song synth track (its id). */
export type PartId = NoteOwner;
export const PART_NAMES: Record<"keys" | "seq", string> = { keys: "Keys", seq: "Sequencer" };
/** Whether a part is a song synth track's (not Keys or Sequencer). */
export const isTrackPart = (id: PartId) => id.startsWith("track-");
/** The Sequencer part starts on this preset, so a bass line plays under the Keys part's sound. */
const SEQ_START_PRESET = "Round Bass";

/**
 * One part's sound: the preset it is on, its current settings, and whether they were edited since. The
 * preset may be one that isn't in the list: a rolled Dice patch, a recipe's sound, or a deleted preset.
 */
class PartState {
  preset = $state.raw<Preset>(FACTORY_PRESETS[0]);
  values = $state<ParamValues>(presetValues(FACTORY_PRESETS[0]));
  dirty = $state(false);

  /** Undo and redo for this part's sound (not reactive: Playground.historyVersion says when it changed). */
  readonly history = new History<PartSnapshot>();

  constructor(preset: Preset) {
    this.preset = preset;
    this.values = presetValues(preset);
  }
}

/** The colour of the course's pages (the accent on screen). */
const COURSE_COLOR: Rgb = [40, 90, 127];

/** A course page's sound: not in the preset list, and never saved. */
function coursePreset(lesson: Lesson, values: ParamValues): Preset {
  return { id: `course:${lesson.id}`, name: lesson.title, category: "Test", color: COURSE_COLOR, knobs: [...FACTORY_PRESETS[0].knobs], values, from: "course" };
}

/** The course's "build your own" sound: Init, not in the preset list until you save it. */
function buildPreset(): Preset {
  return { id: "course:build", name: "Init", category: "Test", color: COURSE_COLOR, knobs: [...FACTORY_PRESETS[0].knobs], values: { ...INIT_VALUES }, from: "course" };
}

/** The undo step that starts a recipe is named this, then the recipe. */
const RECIPE_STEP = "Recipe ";

/** A part's sound at one moment, for undo. */
interface PartSnapshot {
  preset: Preset;
  values: ParamValues;
  dirty: boolean;
}

/** The song at one moment, for its undo: the tracks, the clips, and the tracks' sounds (to bring back a removed track). */
interface SongSnapshot {
  tracks: Track[];
  clips: Clip[];
  sounds: Record<string, PartSnapshot>;
}

/** What a song track's change is called in its undo step. */
const TRACK_CHANGE_LABELS: Record<string, string> = { name: "Rename", color: "Colour", volume: "Volume", pan: "Pan", mute: "Mute", solo: "Solo", voices: "Voices" };

/** The drums' names on the keys (DRUM_NAMES, short enough for a black key). */
const DRUM_KEY_LABELS = ["Kick", "Snare", "Clap", "Hat", "O.Hat", "Tom L", "Tom H", "Cow"];

/** The OLED's line for a step about playing. */
const PLAY_SCREEN: Record<PlayCheck["play"], string> = { note: "Play a note", low: "Play a low note", high: "Play a high note", chord: "Play a chord" };

export class Playground {
  readonly engine = new Engine();
  readonly seq = new Sequencer(this.engine, new WorkerClock());
  private midiWait = new Rolling(50);
  private freezes = new Freezes();

  /** The factory presets, then yours. */
  presets = $state.raw<Preset[]>([...FACTORY_PRESETS, ...loadUserPresets()]);
  /** Each part's sound (the song's synth tracks too). The knobs, faders, Synth view and preset browser edit the selected part. */
  readonly parts: { keys: PartState; seq: PartState; [id: string]: PartState } = {
    keys: new PartState(FACTORY_PRESETS[0]),
    seq: new PartState(FACTORY_PRESETS.find((p) => p.id === factoryId(SEQ_START_PRESET)) ?? FACTORY_PRESETS[0]),
  };
  part = $state<PartId>("keys");
  /** The Song view's tracks, in order: the drums and the synth tracks (each with its part in `parts`). */
  songTracks = $state<Track[]>([]);
  /** The song's drum track selected in the Song view: your keys play its kit (it has no sound to edit). */
  drumsSelected = $state(false);
  /** The song synth track selected last, for its button beside Keys and Sequencer. */
  lastTrack = $state<PartId | null>(null);
  /** The song's clips, each on one track. */
  songClips = $state<Clip[]>([]);
  /** Each track's clip as heard (the clip launcher), and the one waiting to start on the next bar. */
  clipLaunch = $state<Record<string, { clip: string | null; next?: string | null }>>({});
  /** The clip shown under the tracks, to rename, lengthen or edit. */
  selectedClip = $state<string | null>(null);
  /** "Edit in Play": the clip the Play view's drum loop or step sequencer edits instead of its own pattern. */
  editClipId = $state<string | null>(null);
  /** The bar of a drum clip the drum loop shows while it is edited. */
  editBar = $state(0);
  /** Undo and redo for the song (tracks and clips), apart from each part's sound. */
  readonly songHistory = new History<SongSnapshot>();
  readonly clipPlayer: ClipPlayer;
  private drumTrack: DrumTrack;
  /** Preset highlighted by the encoder but not loaded yet. */
  browseId = $state<string | null>(null);
  /** The preset browser: whether it is open, and what it shows (◀ ▶ and the encoder step through that list too). */
  browserOpen = $state(false);
  presetFilter = $state<PresetFilter>(emptyFilter());
  /** Starred presets' ids; pad bank B loads the first 8. */
  favourites = $state<string[]>(loadFavourites());

  /** Step mode: pads edit the drum loop (bank A = steps 1-8, bank B = 9-16) for one drum. */
  stepMode = $state(false);
  stepTrack = $state(0);
  /** Step under the playhead, as heard (not as scheduled). -1 when stopped. */
  playStep = $state(-1);
  /** Sequencer edit: knobs set step pitches, bank A pads switch steps, bank B pads set slides, faders set Length/Gate/Rate/Direction. */
  seqEdit = $state(false);
  /** The step sequencer's own settings (the toy's); `noteSeq` is what its panel edits. */
  ownNoteSeq = $state<NoteSeqSettings>(defaultNoteSeq());
  /** Sequencer step under the playhead, as heard. -1 when stopped. */
  seqStep = $state(-1);
  /** Notes the sequencer is sounding right now, for the on-screen keyboard. */
  seqNotes = new SvelteSet<number>();
  /** The sequencer is at legato speed and the keyboard lights all its notes at once. */
  private seqBlur = false;
  /** While the sequencer plays: keys play notes (Play), move the sequence (Transpose), or both, split at C4 (Split). */
  keysMode = $state<KeysMode>("Play");
  /** Pad lights follow the audio spectrum instead of flashing on drum hits. */
  spectrumPads = $state(false);
  spectrumLevels = $state<number[]>(Array(8).fill(0));

  audioRunning = $state(false);
  /** CPU meter: the voice processor's share of the time available. */
  cpu = $state<CpuLoad>({ load: 0, fx: 0, peak: 0, voices: 0, units: 0, cuts: 0, clock: "" });
  timing = $state<TimingReport>({ midiAverage: null, midiWorst: null, longestFreeze: 0, sequencer: null });
  midiStatus = $state<MidiStatus>("idle");
  deviceName = $state("");
  /** A MiniLab is connected right now. Hardware hints (knob numbers, Shift combinations, the encoder) show only then. */
  get hasDevice() {
    return this.midiStatus === "connected";
  }
  /** A hardware hint: `text` while a MiniLab is connected, nothing without one. */
  hw(text: string) {
    return this.hasDevice ? text : "";
  }
  program = $state<Program | null>(null);
  bank = $state<PadBank>("A");
  shift = $state(false);

  /** Notes held on the Keys part (with chord mode, every note of each chord). Without the arpeggiator, these are the notes sounding. */
  notes = new SvelteSet<number>();
  /** The arpeggiator (on the Keys part): its settings, kept across reloads, and the note it is sounding. */
  arp = $state<ArpSettings>(loadArp());
  arpNotes = new SvelteSet<number>();
  /** Scale lock and chord mode: shared by both parts, kept across reloads. */
  scale = $state<ScaleSettings>(loadScale());
  /** The chord in the notes played on the keys (chord detection), kept after they are released. */
  chord = $state.raw<DetectedChord | null>(null);
  /** Whether every note of `chord` is still held (the UI dims it once they are released). */
  chordHeld = $state(false);
  padLevels = $state<number[]>(Array(8).fill(0));
  mod = $state(0);
  bend = $state(0);
  /** Last control touched, for highlighting in the UI. */
  touched = $state<{ param: ParamId; at: number } | null>(null);
  vizMode = $state<VizMode>("scope");
  view = $state<View>("playground");
  /** Synth view: the block the hardware knobs are focused on. */
  focusBlock = $state<BlockId>("filter");
  /** Synth view: the signal heard on its own ("Listen here"), or null for the full sound. */
  listening = $state<ListenTap | null>(null);
  /** Synth view patching: null when off, "source" while picking a source block, or the picked source. */
  patch = $state<null | "source" | number>(null);
  /** Synth view: show plain-English explanations on each block. */
  /** Off until switched on: the views are short, and the explanations are there when wanted. */
  explain = $state(localStorage.getItem(EXPLAIN_KEY) === "on");

  /** Every wavetable, built-in then imported (a copy of WAVETABLES, replaced when it changes, for the UI). */
  tables = $state.raw<WavetableDef[]>([...WAVETABLES]);
  /** A WAV import in progress, and how the last one went. */
  importing = $state(false);
  importResult = $state<{ ok: boolean; text: string } | null>(null);
  /** The recipe being followed, if any, and whether the recipe list is open. */
  recipe = $state.raw<RecipeRun | null>(null);
  recipeList = $state(false);
  /** Recipes you have finished (kept across reloads), for the ticks in the recipe list. */
  recipesDone = $state<string[]>(loadRecipesDone());
  /** The learning course (the Learn view). */
  readonly course = new Course(
    () => this.parts.keys.values,
    (id, v) => {
      this.setParam(id, v);
      // A/B moved a fader's control: the fader waits until it reaches the new value.
      const f = FADERS.indexOf(id);
      if (f >= 0) this.faderLive[f] = false;
    },
    (values) => this.coursePage(values),
  );
  /** What the course put aside while it runs, and gives back when you leave: the Keys part's sound, the arpeggiator and scale lock. */
  private beforeCourse: { sound: PartSnapshot; arp: boolean; scale: ScaleId } | null = null;
  /** The "Draw a table" editor, while it is open. */
  tableEditor = $state.raw<TableEditor | null>(null);
  private draftTimer = 0;

  bpm = $state(120);
  /** The drum loop starts off: ▶ plays nothing until the drums or the step sequencer is switched on. */
  drumsOn = $state(false);
  playing = $state(false);
  recording = $state(false);
  /** The drum loop's own pattern (the toy's); `pattern` is what its grid edits. */
  ownPattern = $state<Pattern>(basicBeat());

  private device: MiniLab | null = null;
  private midiAccess: MIDIAccess | null = null;
  private intervals: number[] = [];
  private browseTimer = 0;
  private taps: number[] = [];
  private longPressTimer = 0;
  private longPressFired = false;
  private spectrumTimer = 0;
  private spectrumSent: number[] = Array(8).fill(-1);
  /** Sequencer edit: the step pad held down (a key pressed meanwhile sets its note), and whether a key was. */
  private heldStep: number | null = null;
  private heldStepKeyed = false;
  private auditionNote: number | null = null;
  private auditionPart: PartId = "seq";
  /** Keys pressed with Shift to switch part: their release must not stop a note. */
  private partKeys = new Set<number>();
  /** Keys used to transpose: their release must not stop a note. */
  private transposeKeys = new Set<number>();
  /** What each held key plays (scale lock and chords can turn one key into other notes, or several). */
  private keyPlays = new Map<number, number[]>();
  /** How many held keys play each note: two keys can snap to the same one, and it stops with the last. */
  private noteHolds = new Map<number, number>();
  /** The notes `chord` was found in, to name them again when the scale changes. */
  private chordNotes: number[] = [];
  private chordTimer = 0;
  /** A key went down since the chord was last found. */
  private chordPressed = false;
  /** Fader pickup after the faders change job: a fader only takes over once it reaches the value it now controls. */
  private faderLive: boolean[] = Array(FADERS.length).fill(true);
  private faderLast: (number | null)[] = Array(FADERS.length).fill(null);
  readonly noteSequencer: NoteSequencer;
  readonly arpeggiator: Arpeggiator;

  constructor() {
    this.seq.pattern = this.ownPattern;
    this.seq.onTrigger = (track, velocity, time) => {
      const delay = Math.max(0, (time - this.engine.ctx.currentTime) * 1000);
      setTimeout(() => this.flashPad(track, velocity), delay);
      setTimeout(() => this.flashPad(track, 0), delay + 90);
    };
    this.seq.onStep = (step, time) => {
      const delay = Math.max(0, (time - this.engine.ctx.currentTime) * 1000);
      setTimeout(() => this.movePlayhead(step), delay);
    };
    this.noteSequencer = new NoteSequencer(this.ownNoteSeq, {
      noteOn: (note, velocity, time, slide) => {
        this.engine.noteOn(note, velocity, time, slide, "seq");
        this.atAudioTime(time, () => this.seqNotes.add(note));
      },
      noteOff: (note, time) => {
        this.engine.noteOff(note, time, "seq");
        // The end of a legato-speed note puts out the whole blur of lights (see pitchTo).
        const blur = this.seqBlur;
        this.seqBlur = false;
        this.atAudioTime(time, () => (blur ? this.seqNotes.clear() : this.seqNotes.delete(note)));
      },
      pitchTo: (from, to, time) => {
        this.engine.pitchTo(from, to, time, "seq");
        // Too fast to light each note: light every note of the line while it blurs.
        if (this.seqBlur) return;
        this.seqBlur = true;
        this.atAudioTime(time, () => this.lightSeqBlur());
      },
    });
    // While a step clip is edited, the lamps follow the clip instead (see clipPlayer.onStep).
    this.noteSequencer.onStep = (step, time) => this.atAudioTime(time, () => this.editClip?.kind !== "steps" && this.moveSeqHead(step));
    this.noteSequencer.pitch = (note) => snapToScale(note, this.scale);
    this.seq.notes = this.noteSequencer;
    this.seq.drumsOn = this.drumsOn;
    // The arpeggiator plays the part your keys play (Keys, or a song track).
    this.arpeggiator = new Arpeggiator(this.arp, {
      noteOn: (note, velocity, time) => this.engine.noteOn(note, velocity, time),
      noteOff: (note, time) => this.engine.noteOff(note, time),
    });
    this.arpeggiator.onNote = (note, time, end) => {
      this.atAudioTime(time, () => this.arpNotes.add(note));
      this.atAudioTime(end, () => this.arpNotes.delete(note));
    };
    this.seq.arp = this.arpeggiator;
    this.engine.setParams(this.parts.keys.values, "keys");
    this.engine.setParams(this.parts.seq.values, "seq");
    this.drumTrack = this.engine.addDrumTrack();
    this.clipPlayer = new ClipPlayer(
      {
        noteOn: (track, note, velocity, time, slide) => this.engine.noteOn(note, velocity, time, slide, track),
        noteOff: (track, note, time) => this.engine.noteOff(note, time, track),
        pitchTo: (track, from, to, time) => this.engine.pitchTo(from, to, time, track),
        drum: (pad, velocity, time) => this.drumTrack.drums.trigger(pad, velocity, time),
      },
      (id) => this.songClips.find((c) => c.id === id),
    );
    this.clipPlayer.pitch = (note) => snapToScale(note, this.scale);
    this.clipPlayer.onChange = (track, _clip, time) => this.atAudioTime(time, () => this.syncLaunch(track));
    this.clipPlayer.onStep = (_track, clip, step, time) => this.atAudioTime(time, () => this.editClipId === clip && this.moveSeqHead(step));
    this.seq.clips = this.clipPlayer;
    this.loadSong();
    window.addEventListener("pagehide", this.saveSongNow);
    document.addEventListener("visibilitychange", this.saveSongNow);
    this.intervals.push(window.setInterval(() => (this.cpu = this.engine.cpu), 250));
    this.freezes.observe();
    this.intervals.push(window.setInterval(() => this.updateTiming(), 1000));
    this.engine.ctx.onstatechange = () => (this.audioRunning = this.engine.ctx.state === "running");
  }

  /**
   * Fall silent for good. The page makes one Playground, but in development a hot reload makes a new one:
   * the old one would keep its audio running and keep playing the MiniLab's keys on its own preset.
   */
  dispose() {
    this.saveSongNow();
    window.removeEventListener("pagehide", this.saveSongNow);
    document.removeEventListener("visibilitychange", this.saveSongNow);
    this.intervals.forEach(clearInterval);
    clearInterval(this.spectrumTimer);
    this.seq.stop();
    this.seq.setFree(false);
    if (this.midiAccess) this.midiAccess.onstatechange = null;
    this.device?.close();
    this.device = null;
    void this.engine.ctx.close();
  }

  private updateTiming() {
    this.timing = {
      midiAverage: this.midiWait.average,
      midiWorst: this.midiWait.max,
      longestFreeze: this.freezes.longest(performance.now()),
      sequencer: this.playing ? this.seq.timing : null,
    };
  }

  /** The step settings the step sequencer's panel edits: a step clip's in "Edit in Play", its own otherwise. */
  get noteSeq(): NoteSeqSettings {
    const c = this.editClip;
    return c?.kind === "steps" ? c.seq : this.ownNoteSeq;
  }

  /** The drum pattern the drum loop's grid and the pads edit: a bar of a drum clip in "Edit in Play", its own otherwise. */
  get pattern(): Pattern {
    const c = this.editClip;
    return c?.kind === "drums" ? c.patterns[Math.min(this.editBar, c.bars - 1)] : this.ownPattern;
  }

  // The selected part's sound: everything below reads and writes these.
  get values() {
    return this.parts[this.part].values;
  }
  set values(v: ParamValues) {
    this.parts[this.part].values = v;
  }
  get dirty() {
    return this.parts[this.part].dirty;
  }
  set dirty(d: boolean) {
    this.parts[this.part].dirty = d;
  }
  get preset(): Preset {
    return this.parts[this.part].preset;
  }
  set preset(p: Preset) {
    this.parts[this.part].preset = p;
  }

  /** The preset a part is on. */
  presetOf(part: PartId): Preset {
    return this.parts[part].preset;
  }

  /** A part's name: Keys, Sequencer, or the song track's. */
  partName(part: PartId): string {
    if (part === "keys" || part === "seq") return PART_NAMES[part];
    return this.songTracks.find((t) => t.id === part)?.name ?? "Track";
  }

  /**
   * Edit and show another part: the knobs, faders, Synth view and preset browser follow it. A song track's
   * part is also the one your keys play (it has nothing else to play it yet).
   */
  selectPart(part: PartId) {
    if (part === this.part && !this.drumsSelected) return;
    this.drumsSelected = false;
    if (part === this.part) return this.syncPlayer();
    if (!this.parts[part]) return;
    this.endCompare();
    this.part = part;
    if (isTrackPart(part)) this.lastTrack = part;
    this.engine.select(part);
    this.browseId = null;
    this.faderLive.fill(false);
    this.syncPlayer();
    this.syncHardware();
    this.showMessage("Part", `${this.partName(part)}: ${this.preset.name}`);
  }

  /** Shift + a key on the MiniLab: Keys, Sequencer, then (in the Song view) each synth track in turn. */
  togglePart() {
    const order: PartId[] = ["keys", "seq", ...(this.view === "song" ? this.songTracks.filter((t) => t.kind === "synth").map((t) => t.id) : [])];
    this.selectPart(order[(order.indexOf(this.part) + 1) % order.length]);
  }

  /** The part your keys play: the selected part when it is a song synth track, the Keys part otherwise. */
  get playerPart(): PartId {
    return isTrackPart(this.part) && !this.drumsSelected ? this.part : "keys";
  }

  /**
   * Where your keys go: the selected part when it is a song track, the Keys part otherwise. Changing it lets
   * go of the keys held (their notes would otherwise hang on the part they started on).
   */
  private syncPlayer() {
    const player = this.playerPart;
    const drums = this.keysToDrums;
    if (player === this.engine.player && drums === this.keysWereDrums) return;
    this.releaseKeys();
    this.engine.setPlayer(player);
    this.keysWereDrums = drums;
  }

  /** In the Song view with the drum track selected, the keys play its kit. */
  private get keysToDrums() {
    return this.drumsSelected && this.view === "song";
  }
  private keysWereDrums = false;

  /** Let go of every held key now (their notes stop, the arpeggiator forgets them). */
  private releaseKeys() {
    const now = this.engine.ctx.currentTime;
    for (const n of this.noteHolds.keys()) this.engine.noteOff(n, now);
    if (this.arp.on) {
      this.arpeggiator.clear();
      this.arpNotes.clear();
    }
    this.keyPlays.clear();
    this.noteHolds.clear();
    this.notes.clear();
  }

  // ------------------------------------------------------------------ song tracks

  /** The track shown as selected in the Song view: the drums, the selected part's track, or none. */
  get selectedSongTrack(): string | null {
    if (this.drumsSelected) return DRUM_TRACK_ID;
    return isTrackPart(this.part) ? this.part : null;
  }

  /** Select a track: a synth track's sound is edited and played; the drum track's kit is played by the keys. */
  selectSongTrack(id: string) {
    const t = this.songTracks.find((x) => x.id === id);
    if (!t) return;
    if (t.kind === "synth") return this.selectPart(id);
    this.drumsSelected = true;
    this.syncPlayer();
    this.showMessage("Track", t.name);
  }

  get canAddSongTrack() {
    return canAddTrack(this.songTracks);
  }

  /** A new synth track at the end, on the first factory sound, selected. */
  addSongTrack() {
    if (!this.canAddSongTrack) return;
    this.recordSong("Add track");
    const t = this.newSongTrack();
    this.selectSongTrack(t.id);
    this.saveSong();
  }

  private newSongTrack(): Track {
    const t = newSynthTrack(this.songTracks);
    this.addTrackPart(t.id, new PartState(FACTORY_PRESETS[0]));
    this.songTracks = [...this.songTracks, t];
    this.applyMix();
    return t;
  }

  /** Remove a synth track, its sound and its clips (the drum track stays). */
  removeSongTrack(id: string) {
    const t = this.songTracks.find((x) => x.id === id);
    if (!t || t.kind !== "synth") return;
    this.recordSong(`Remove ${t.name}`);
    this.dropTrackPart(id);
    this.songTracks = this.songTracks.filter((x) => x !== t);
    this.songClips = this.songClips.filter((c) => c.track !== id);
    this.forgetMissingClips();
    this.applyMix();
    this.saveSong();
  }

  /** A synth track's part goes: the selection moves to the track above (or below, for the first), else Keys. */
  private dropTrackPart(id: string) {
    if (this.part === id) {
      const synth = this.songTracks.filter((x) => x.kind === "synth");
      const i = synth.findIndex((x) => x.id === id);
      this.selectPart((synth[i - 1] ?? synth[i + 1])?.id ?? "keys");
    }
    if (this.lastTrack === id) this.lastTrack = null;
    this.clipPlayer.removeTrack(id, this.engine.ctx.currentTime);
    delete this.clipLaunch[id];
    delete this.parts[id];
    this.engine.removePart(id);
  }

  /** Change a track's name, colour or mix (volume, pan, mute, solo, voices). */
  setSongTrack(id: string, change: Partial<Omit<Track, "id" | "kind">>) {
    const name = change.name === undefined ? undefined : cleanName(change.name);
    if (name === "") delete change.name;
    else if (name !== undefined) change.name = name;
    const t = this.songTracks.find((x) => x.id === id);
    const keys = Object.keys(change) as (keyof typeof change)[];
    if (!t || keys.every((k) => t[k] === change[k])) return;
    this.recordSong(`${TRACK_CHANGE_LABELS[keys[0]] ?? "Change"} ${t.name}`, `${id}:${keys.join()}`);
    this.songTracks = this.songTracks.map((x) => (x.id === id ? { ...x, ...change } : x));
    this.applyMix();
    this.saveSong();
  }

  /** The next colour for a track. */
  cycleSongTrackColor(id: string) {
    const t = this.songTracks.find((x) => x.id === id);
    if (t) this.setSongTrack(id, { color: (t.color + 1) % TRACK_COLORS.length });
  }

  moveSongTrack(id: string, delta: number) {
    const t = this.songTracks.find((x) => x.id === id);
    if (!t) return;
    this.recordSong(`Move ${t.name}`);
    this.songTracks = moveTrack(this.songTracks, id, delta);
    this.saveSong();
  }

  /** A track's mixer strip (its level meter is `.meter`). */
  songTrackStrip(id: string): Strip | null {
    if (id === DRUM_TRACK_ID) return this.drumTrack.strip;
    return this.engine.parts[id]?.fx.strip ?? null;
  }

  /** Every track's volume, pan and mute (solo mutes the others), and each synth track's voices. */
  private applyMix() {
    for (const t of this.songTracks) {
      this.songTrackStrip(t.id)?.set(t.volume, t.pan, !audible(t, this.songTracks));
      const part = this.engine.parts[t.id];
      if (part) part.voiceCap = t.voices;
    }
  }

  private addTrackPart(id: string, state: PartState) {
    this.parts[id] = state;
    this.engine.addPart(id, state.values);
  }

  // ------------------------------------------------------------------ clips

  /** A track's clips, in the order they were made. */
  clipsOf(track: string): Clip[] {
    return this.songClips.filter((c) => c.track === track);
  }

  get selectedClipData(): Clip | null {
    return this.songClips.find((c) => c.id === this.selectedClip) ?? null;
  }

  selectClip(id: string | null) {
    this.selectedClip = id;
    this.syncSongClipEdit();
  }

  /** The step clip being edited in the Song view's clip panel ("Edit in Play" without leaving the view; it ends with the view). */
  private editInSong = false;

  /** In the Song view a selected step clip is edited in place, with the step sequencer's panel; selecting another clip lets it go. */
  private syncSongClipEdit() {
    const clip = this.selectedClipData;
    if (this.view === "song" && clip?.kind === "steps") {
      if (this.editClipId !== clip.id) this.startClipEdit(clip.id);
      this.editInSong = true;
    } else if (this.editInSong) {
      this.flushClipEdit();
      this.closeClipEdit();
    }
  }

  /**
   * The clip launcher: play a clip on its track, from the next bar while playing (stopped, the transport
   * starts). The clip already playing stops its track at the next bar; one waiting to start stops waiting.
   */
  launchClip(id: string) {
    const clip = this.songClips.find((c) => c.id === id);
    if (!clip) return;
    const st = this.clipPlayer.state(clip.track);
    if (!this.playing) this.clipPlayer.launch(clip.track, id);
    else if (st.next === id) this.clipPlayer.launch(clip.track, st.clip);
    else if (st.next === undefined && st.clip === id) this.clipPlayer.launch(clip.track, null);
    else this.clipPlayer.launch(clip.track, id);
    this.syncLaunch(clip.track);
    this.saveSong();
    if (!this.playing) this.play();
  }

  /** Stop a track's clip (at the next bar while playing). */
  stopTrackClip(track: string) {
    this.clipPlayer.launch(track, null);
    this.syncLaunch(track);
    this.saveSong();
  }

  /** Show what the clip player has for a track (as heard: called at the audio time a change happens). */
  private syncLaunch(track: string) {
    this.clipLaunch[track] = this.clipPlayer.state(track);
  }

  /** Clips that no longer exist are no longer chosen, the clip panel and "Edit in Play" let go of them. */
  private forgetMissingClips() {
    const has = (id: string | null | undefined) => !!id && this.songClips.some((c) => c.id === id);
    if (!has(this.selectedClip)) this.selectedClip = null;
    if (this.editClipId && !has(this.editClipId)) this.closeClipEdit();
    for (const t of this.songTracks) {
      const st = this.clipPlayer.state(t.id);
      // While playing, the player lets go of a deleted clip itself, at the time it reaches it.
      if (!this.playing && st.clip && !has(st.clip)) this.clipPlayer.launch(t.id, null);
      this.syncLaunch(t.id);
    }
  }

  /** Beats into a clip at the moment heard, or -1 when it isn't playing. */
  clipBeatNow(id: string): number {
    const clip = this.songClips.find((c) => c.id === id);
    if (!clip) return -1;
    return this.clipPlayer.position(clip.track, id, this.seq.beatNow);
  }

  /**
   * A new clip on a track: an empty drum clip on the drum track; on a synth track an empty note clip (2 bars,
   * for the piano roll) or a step clip (the step sequencer's start).
   */
  addClip(track: string, kind: ClipKind = "notes") {
    const t = this.songTracks.find((x) => x.id === track);
    if (!t) return;
    this.recordSong("New clip");
    const clip = t.kind === "drums" ? drumClip(this.songClips, t) : kind === "steps" ? stepClip(this.songClips, t) : noteClip(this.songClips, t, [], 2);
    this.songClips = [...this.songClips, clip];
    this.selectClip(clip.id);
    this.saveSong();
  }

  /**
   * A note clip's notes (and length, for tools that change it), from the piano roll: one undo step called
   * `label`. With a `key`, edits close together join one step (a note nudged with the arrow keys).
   */
  setClipNotes(id: string, notes: Note[], label: string, key: string | null = null, bars?: number) {
    const i = this.songClips.findIndex((c) => c.id === id);
    const clip = this.songClips[i];
    if (clip?.kind !== "notes") return;
    this.recordSong(label, key && `${id}:${key}`);
    const b = bars ?? clip.bars;
    this.songClips[i] = { ...($state.snapshot(clip) as Clip), bars: b, notes: cleanNotes(notes, b) } as Clip;
    this.saveSong();
  }

  /** Turn a step clip into a note clip that sounds the same (with scale lock's notes, at the tempo now). There is no way back but undo. */
  convertToNotes(id: string) {
    const i = this.songClips.findIndex((c) => c.id === id);
    const clip = this.songClips[i];
    if (clip?.kind !== "steps") return;
    this.recordSong(`Convert ${clip.name}`);
    if (this.editClipId === id) this.closeClipEdit();
    const notes = stepsToNotes($state.snapshot(clip.seq), clip.bars, 60 / this.bpm, (n) => snapToScale(n, this.scale));
    this.songClips[i] = { id: clip.id, track: clip.track, name: clip.name, bars: clip.bars, kind: "notes", notes };
    this.saveSong();
    this.showMessage("Converted to notes", clip.name);
  }

  /** Hear a note on a track's sound (the piano roll's keys and drawn notes): for `seconds`, or until trackNoteOff when null. */
  trackNoteOn(track: string, note: number, velocity = 100, seconds: number | null = AUDITION_S) {
    if (!this.parts[track]) return;
    const now = this.engine.ctx.currentTime;
    this.engine.noteOn(note, velocity, now, false, track);
    if (seconds !== null) this.engine.noteOff(note, now + seconds, track);
  }

  trackNoteOff(track: string, note: number) {
    if (this.parts[track]) this.engine.noteOff(note, this.engine.ctx.currentTime, track);
  }

  removeClip(id: string) {
    const clip = this.songClips.find((c) => c.id === id);
    if (!clip) return;
    this.recordSong(`Delete ${clip.name}`);
    this.songClips = this.songClips.filter((c) => c !== clip);
    this.forgetMissingClips();
    this.saveSong();
  }

  duplicateClip(id: string) {
    const clip = this.songClips.find((c) => c.id === id);
    const t = this.songTracks.find((x) => x.id === clip?.track);
    if (!clip || !t) return;
    this.recordSong(`Duplicate ${clip.name}`);
    const copy = duplicateClip(this.songClips, $state.snapshot(clip) as Clip, t);
    this.songClips = [...this.songClips, copy];
    this.selectClip(copy.id);
    this.saveSong();
  }

  renameClip(id: string, name: string) {
    const clip = this.songClips.find((c) => c.id === id);
    const clean = cleanName(name);
    if (!clip || !clean || clean === clip.name) return;
    this.recordSong("Rename clip", `clip-name:${id}`);
    clip.name = clean;
    this.saveSong();
  }

  /** A clip's length in bars (a drum clip made longer repeats its bars). */
  setClipBars(id: string, bars: number) {
    const i = this.songClips.findIndex((c) => c.id === id);
    if (i < 0 || this.songClips[i].bars === bars) return;
    this.recordSong(`Length of ${this.songClips[i].name}`);
    this.songClips[i] = withBars($state.snapshot(this.songClips[i]) as Clip, bars);
    if (this.editClipId === id) this.editBar = Math.min(this.editBar, bars - 1);
    this.saveSong();
  }

  /** The clip "Edit in Play" works on, if any. */
  get editClip(): Clip | null {
    return this.editClipId ? (this.songClips.find((c) => c.id === this.editClipId) ?? null) : null;
  }

  /** The song before the edits made in Play since they were last made an undo step (see flushClipEdit). */
  private editStart: SongSnapshot | null = null;

  /** "Edit in Play": the Play view's drum loop or step sequencer edits this clip (and the MiniLab's pads with them). */
  editInPlay(id: string) {
    const clip = this.songClips.find((c) => c.id === id);
    if (!clip || clip.kind === "notes") return;
    if (this.editClipId !== id) this.startClipEdit(id);
    this.editInSong = false;
    this.setView("playground");
    this.showMessage("Editing clip", clip.name);
  }

  private startClipEdit(id: string) {
    this.flushClipEdit();
    this.endHeldStep();
    this.editClipId = id;
    this.editBar = 0;
    this.editStart = this.songSnapshot();
    this.moveSeqHead(-1);
    if (this.stepMode || this.seqEdit) this.syncPadLeds();
  }

  /** Back to my pattern: the drum loop and the step sequencer edit their own again. */
  endClipEdit() {
    if (!this.editClipId) return;
    this.flushClipEdit();
    this.closeClipEdit();
    this.showMessage("Play", "your own pattern");
  }

  private closeClipEdit() {
    this.endHeldStep();
    this.editClipId = null;
    this.editInSong = false;
    this.editStart = null;
    this.moveSeqHead(-1);
    if (this.stepMode || this.seqEdit) this.syncPadLeds();
  }

  setEditBar(bar: number) {
    const c = this.editClip;
    if (c?.kind !== "drums") return;
    this.editBar = Math.max(0, Math.min(c.bars - 1, bar));
    if (this.stepMode) this.syncPadLeds();
  }

  /** The step under the drum grid's playhead: the edited drum clip's (in the bar shown), else the drum loop's. */
  gridStep(): number {
    const c = this.editClip;
    if (c?.kind !== "drums") return this.seq.currentStep;
    const beat = this.clipBeatNow(c.id);
    if (beat < 0 || Math.floor(beat / BEATS_PER_BAR) !== this.editBar) return -1;
    return Math.floor((beat % BEATS_PER_BAR) * 4);
  }

  /** The part a step's note is heard on when set: the edited step clip's track, else the Sequencer part. */
  private get stepPart(): PartId {
    const c = this.editClip;
    return c?.kind === "steps" && this.parts[c.track] ? c.track : "seq";
  }

  /** The kit a drum step is heard on when set: the song's in "Edit in Play", the drum loop's otherwise. */
  private get stepDrums() {
    return this.editClip?.kind === "drums" ? this.drumTrack.drums : this.engine.drums;
  }

  /** Send the drum loop to the song: a new drum clip with its pattern, on the drum track. */
  sendDrumsToSong() {
    const t = this.songTracks.find((x) => x.kind === "drums");
    if (!t) return;
    this.recordSong("Send the drum loop");
    const clip = drumClip(this.songClips, t, [$state.snapshot(this.ownPattern)]);
    this.songClips = [...this.songClips, clip];
    this.selectedClip = clip.id;
    this.saveSong();
    this.showMessage("Sent to song", `${t.name}: ${clip.name}`);
  }

  /**
   * Send the step sequencer to the song: a new step clip with its settings on a synth track (null: a new
   * track), and the Sequencer part's sound goes to the track (an undo step of the track's sound too).
   */
  sendStepsToSong(track: string | null) {
    let t = track === null ? null : this.songTracks.find((x) => x.id === track && x.kind === "synth");
    if (track !== null && !t) return;
    if (track === null && !this.canAddSongTrack) return;
    this.recordSong("Send the step sequencer");
    t ??= this.newSongTrack();
    const target = this.parts[t.id];
    const seq = this.parts.seq;
    target.history.record(() => ({ preset: target.preset, values: $state.snapshot(target.values), dirty: target.dirty }), "Sound from Sequencer");
    this.historyVersion++;
    target.preset = seq.preset;
    target.values = { ...$state.snapshot(seq.values) };
    target.dirty = seq.dirty;
    this.engine.setParams(target.values, t.id);
    const clip = stepClip(this.songClips, t, $state.snapshot(this.ownNoteSeq), barsForSteps(this.ownNoteSeq));
    this.songClips = [...this.songClips, clip];
    this.selectedClip = clip.id;
    this.saveSong();
    this.showMessage("Sent to song", `${t.name}: ${clip.name}`);
  }

  // ------------------------------------------------------------------ song undo

  private songSnapshot(): SongSnapshot {
    const sounds: Record<string, PartSnapshot> = {};
    for (const t of this.songTracks) {
      const p = this.parts[t.id];
      if (t.kind === "synth" && p) sounds[t.id] = { preset: p.preset, values: $state.snapshot(p.values), dirty: p.dirty };
    }
    return { tracks: $state.snapshot(this.songTracks), clips: $state.snapshot(this.songClips) as Clip[], sounds };
  }

  /** Keep the song as it is now, before a change. Changes with the same key close together are one step. */
  private recordSong(label: string, key: string | null = null) {
    this.flushClipEdit();
    this.songHistory.record(() => this.songSnapshot(), label, key);
    this.historyVersion++;
  }

  /**
   * Edits made in Play to a clip become one undo step ("Edit Bass 2"), taken when anything else happens to the
   * song, when undo is asked for, and when the editing ends. (The step sequencer's and drum loop's controls
   * don't each make undo steps of their own.)
   */
  private flushClipEdit() {
    const start = this.editStart;
    const clip = this.editClip;
    if (!start || !clip) return;
    const before = start.clips.find((c) => c.id === clip.id);
    const now = $state.snapshot(clip);
    if (JSON.stringify(before) === JSON.stringify(now)) return;
    this.songHistory.record(() => start, `Edit ${clip.name}`);
    this.historyVersion++;
    this.editStart = this.songSnapshot();
    this.saveSong();
  }

  get canUndoSong() {
    return this.historyVersion >= 0 && this.songHistory.canUndo;
  }
  get canRedoSong() {
    return this.historyVersion >= 0 && this.songHistory.canRedo;
  }
  get songUndoLabel() {
    return this.historyVersion >= 0 ? this.songHistory.undoLabel : null;
  }
  get songRedoLabel() {
    return this.historyVersion >= 0 ? this.songHistory.redoLabel : null;
  }

  undoSong() {
    this.songStep("undo");
  }
  redoSong() {
    this.songStep("redo");
  }

  private songStep(way: "undo" | "redo") {
    this.flushClipEdit();
    const step = way === "undo" ? this.songHistory.undo(this.songSnapshot()) : this.songHistory.redo(this.songSnapshot());
    this.historyVersion++;
    const what = way === "undo" ? "Undo" : "Redo";
    if (!step) return this.showMessage(what, "nothing to do");
    this.restoreSong(step.state);
    if (this.editStart) this.editStart = this.songSnapshot();
    this.showMessage(what, step.label);
  }

  /** Put the song back as it was: removed tracks come back with their sounds, added ones go. Sounds of tracks kept stay as they are (they have their own undo). */
  private restoreSong(s: SongSnapshot) {
    const keep = new Set(s.tracks.map((t) => t.id));
    for (const t of this.songTracks) if (t.kind === "synth" && !keep.has(t.id)) this.dropTrackPart(t.id);
    for (const t of s.tracks) {
      const sound = s.sounds[t.id];
      if (t.kind !== "synth" || this.parts[t.id] || !sound) continue;
      const state = new PartState(this.presets.find((p) => p.id === sound.preset.id) ?? sound.preset);
      state.values = { ...sound.values };
      state.dirty = sound.dirty;
      this.addTrackPart(t.id, state);
    }
    this.songTracks = structuredClone(s.tracks);
    this.songClips = structuredClone(s.clips);
    this.forgetMissingClips();
    // A converted clip brought back as a step clip is edited in place again (or let go, the other way).
    this.syncSongClipEdit();
    this.applyMix();
    this.saveSong();
  }

  // ------------------------------------------------------------------ keeping the song

  /** The tracks, their sounds and clips from the last visit (a new song's the first time). */
  private loadSong() {
    let saved: { tracks?: unknown; sounds?: Record<string, { preset?: unknown; values?: unknown; dirty?: unknown }>; clips?: unknown; chosen?: Record<string, unknown> } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(SONG_KEY) ?? "null");
    } catch {
      saved = null;
    }
    const tracks = readTracks(saved?.tracks);
    for (const t of tracks) {
      if (t.kind !== "synth") continue;
      this.addTrackPart(t.id, this.readSound(saved?.sounds?.[t.id], DEFAULT_TRACK_PRESETS[t.id]));
    }
    this.songTracks = tracks;
    this.songClips = readClips(saved?.clips, tracks);
    for (const t of tracks) {
      const id = saved?.chosen?.[t.id];
      const clip = this.songClips.find((c) => c.id === id);
      if (clip && fitsTrack(clip.kind, t) && clip.track === t.id) this.clipPlayer.launch(t.id, clip.id);
      this.syncLaunch(t.id);
    }
    this.applyMix();
  }

  /**
   * A track's saved sound: a preset in the list is taken from the list (it may have changed since); another
   * (a Dice patch, a deleted preset) from what was saved. Unreadable: the start preset.
   */
  private readSound(raw: { preset?: unknown; values?: unknown; dirty?: unknown } | undefined, start = "First Saw"): PartState {
    const fallback = FACTORY_PRESETS.find((p) => p.id === factoryId(start)) ?? FACTORY_PRESETS[0];
    const stored = raw?.preset as Partial<Preset> | undefined;
    if (!raw || !stored || typeof stored.id !== "string") return new PartState(fallback);
    const listed = this.presets.find((p) => p.id === stored.id);
    const preset: Preset = listed ?? {
      ...fallback,
      id: stored.id,
      name: typeof stored.name === "string" ? stored.name.slice(0, 18) : fallback.name,
      color: Array.isArray(stored.color) && stored.color.length === 3 ? (stored.color as Rgb) : fallback.color,
      knobs: Array.isArray(stored.knobs) && stored.knobs.length === 8 && stored.knobs.every((k) => k in PARAMS) ? (stored.knobs as Preset["knobs"]) : fallback.knobs,
      values: readValues(stored.values, WAVETABLES.length),
      from: stored.from === "dice" ? "dice" : undefined,
    };
    const state = new PartState(preset);
    state.values = { ...presetValues(preset), ...readValues(raw.values, WAVETABLES.length) };
    state.dirty = raw.dirty === true;
    return state;
  }

  private songTimer = 0;
  /** Keep the tracks, their sounds and clips soon (a burst of changes is saved once). */
  private saveSong() {
    clearTimeout(this.songTimer);
    this.songTimer = window.setTimeout(this.saveSongNow, 300);
  }

  private saveSongNow = () => {
    clearTimeout(this.songTimer);
    const sounds = Object.fromEntries(
      this.songTracks.filter((t) => t.kind === "synth" && this.parts[t.id]).map((t) => {
        const p = this.parts[t.id];
        return [t.id, { preset: $state.snapshot(p.preset), values: $state.snapshot(p.values), dirty: p.dirty }];
      }),
    );
    try {
      const song = { tracks: $state.snapshot(this.songTracks), sounds, clips: $state.snapshot(this.songClips), chosen: this.clipPlayer.chosen };
      localStorage.setItem(SONG_KEY, JSON.stringify(song));
    } catch {
      // Not saved (private window, or full): the tracks last until the page closes.
    }
  };

  async startAudio() {
    await Promise.all([this.engine.resume(), this.engine.ready]);
    this.audioRunning = this.engine.ctx.state === "running";
  }

  // ------------------------------------------------------------------ presets

  /** Whether a preset is in the list (not a Dice patch, a recipe's sound, or a preset since deleted). */
  isListed(p: Preset = this.preset) {
    return this.presets.some((q) => q.id === p.id);
  }

  /** Whether a preset is one of yours, and still in the list. */
  isUserPreset(p: Preset = this.preset) {
    return isUserPresetId(p.id) && this.isListed(p);
  }

  loadPreset(id: string) {
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) return;
    this.remember(`Preset ${preset.name}`);
    this.preset = preset;
    this.browseId = null;
    this.values = presetValues(preset);
    this.dirty = false;
    this.engine.setParams(this.values);
    // Another sound on the Keys part: the recipe building it is over.
    if (this.part === "keys") this.stopRecipe();
    this.syncHardware();
  }

  /** The list ◀ ▶ and the encoder step through: what the browser shows (every preset when that is empty). */
  get browseList(): Preset[] {
    const list = filterPresets(this.presets, this.presetFilter, this.favourites);
    return list.length ? list : this.presets;
  }

  /** ◀ ▶: the previous or next preset in the browser's list. From a sound not in it, ▶ goes to the first. */
  presetAfter(from: string, delta: number): Preset {
    const list = this.browseList;
    const i = list.findIndex((p) => p.id === from);
    if (i < 0) return list[delta > 0 ? 0 : list.length - 1];
    return list[(((i + delta) % list.length) + list.length) % list.length];
  }

  stepPreset(delta: number) {
    this.loadPreset(this.presetAfter(this.preset.id, delta).id);
  }

  setPresetFilter(change: Partial<PresetFilter>) {
    this.presetFilter = { ...this.presetFilter, ...change };
  }

  /** Keep the current sound as a preset of your own, and switch to it. */
  saveAsUserPreset(name: string) {
    const { from: _, ...current } = $state.snapshot(this.preset) as Preset;
    const preset: Preset = { ...current, id: userId(), name: name.slice(0, 18), values: $state.snapshot(this.values) };
    this.setUserPresets([...this.userPresets, preset]);
    this.preset = preset;
    this.dirty = false;
    this.syncHardware();
  }

  get userPresets(): Preset[] {
    return this.presets.filter((p) => isUserPresetId(p.id));
  }

  /** Store your presets and put them in the list. A part on one of them follows its new version. */
  private setUserPresets(user: Preset[]) {
    saveUserPresets(user);
    this.presets = [...FACTORY_PRESETS, ...user];
    for (const part of Object.values(this.parts)) {
      const now = user.find((p) => p.id === part.preset.id);
      if (now) part.preset = now;
    }
  }

  /** Roll a random patch and make it the current sound. */
  dice() {
    this.remember("Dice");
    this.preset = rollDice();
    this.browseId = null;
    this.values = presetValues(this.preset);
    this.dirty = false;
    this.engine.setParams(this.values);
    if (this.part === "keys") this.stopRecipe();
    this.syncHardware();
  }

  /**
   * Delete one of your presets. A part playing it keeps the sound (it is no longer in the list, like a
   * Dice patch), and undo can still bring it back as a sound to save again.
   */
  deleteUserPreset(id = this.preset.id) {
    if (!isUserPresetId(id)) return;
    this.setUserPresets(this.userPresets.filter((p) => p.id !== id));
    if (this.favourites.includes(id)) this.setFavourites(this.favourites.filter((f) => f !== id));
    this.syncHardware();
  }

  renameUserPreset(id: string, name: string) {
    name = name.trim().slice(0, 18);
    if (!name) return;
    this.setUserPresets(this.userPresets.map((p) => (p.id === id ? { ...p, name } : p)));
    this.syncHardware();
  }

  isFavourite(id: string) {
    return this.favourites.includes(id);
  }

  toggleFavourite(id: string) {
    this.setFavourites(this.isFavourite(id) ? this.favourites.filter((f) => f !== id) : [...this.favourites, id]);
  }

  private setFavourites(ids: string[]) {
    this.favourites = ids;
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
    } catch {
      // Not saved (private window): it still works until the page closes.
    }
    this.syncPadLeds();
  }

  /** The favourites pad bank B loads (only the ones still in the list). */
  get padPresets(): Preset[] {
    return this.favourites.map((id) => this.presets.find((p) => p.id === id)).filter((p): p is Preset => !!p).slice(0, 8);
  }

  /** Hear a preset without loading it: a short note (a chord for pads, keys and brass), on its own voice. */
  previewPreset(id: string) {
    const p = this.presets.find((q) => q.id === id);
    if (!p) return;
    const values = presetValues(p);
    const chord = (p.category === "Pad" || p.category === "Keys" || p.category === "Brass") && !values.mono;
    const root = p.category === "Bass" ? 36 : 60;
    // Long enough to hear a slow attack come in, short enough to stay a preview.
    const seconds = Math.min(2.5, Math.max(0.6, values.attack + 0.6));
    this.engine.preview(values, chord ? [root, root + 4, root + 7] : [root], seconds);
  }

  /** A file with your presets (or the ones given), for the Export button. */
  exportPresets(presets: Preset[] = this.userPresets): string {
    return presetFile(presets);
  }

  /** Add the presets from a file to yours. Returns what happened, in words. */
  async importPresets(file: File): Promise<string> {
    const result = readPresetFile(await file.text(), this.userPresets, WAVETABLES.length);
    if (result.added.length) this.setUserPresets([...this.userPresets, ...result.added]);
    const parts = [`${result.added.length} preset${result.added.length === 1 ? "" : "s"} added`];
    if (result.skipped) parts.push(`${result.skipped} already here`);
    if (result.invalid) parts.push(`${result.invalid} not readable`);
    return parts.join(", ");
  }

  // ------------------------------------------------------------------ undo, redo and compare

  /** Bumped whenever a part's history changes, so the undo buttons follow it. */
  historyVersion = $state(0);
  /** Inside edit(): the steps it takes are one undo step. */
  private editing = false;
  /** Hearing the saved preset instead of the edited sound (A/B). */
  comparing = $state(false);

  private snapshot(): PartSnapshot {
    const p = this.parts[this.part];
    return { preset: p.preset, values: $state.snapshot(p.values), dirty: p.dirty };
  }

  /** Keep the sound as it is now, before a change. Changes of the same control close together are one step. */
  private remember(label: string, key: string | null = null) {
    this.endCompare();
    if (this.editing) return;
    this.parts[this.part].history.record(() => this.snapshot(), label, key);
    this.historyVersion++;
  }

  /** Several changes as one undo step. */
  private edit(label: string, fn: () => void) {
    if (this.editing) return fn();
    this.remember(label);
    this.editing = true;
    try {
      fn();
    } finally {
      this.editing = false;
    }
  }

  private clearHistory() {
    for (const part of Object.values(this.parts)) part.history.clear();
    this.historyVersion++;
  }

  get canUndo() {
    return this.historyVersion >= 0 && this.parts[this.part].history.canUndo;
  }
  get canRedo() {
    return this.historyVersion >= 0 && this.parts[this.part].history.canRedo;
  }
  get undoLabel() {
    return this.historyVersion >= 0 ? this.parts[this.part].history.undoLabel : null;
  }
  get redoLabel() {
    return this.historyVersion >= 0 ? this.parts[this.part].history.redoLabel : null;
  }

  /** Undo on the keyboard and the MiniLab acts on the view you are in: the song in the Song view, the sound elsewhere. */
  undo() {
    if (this.view === "song") this.songStep("undo");
    else this.step("undo");
  }
  redo() {
    if (this.view === "song") this.songStep("redo");
    else this.step("redo");
  }
  /** The sound bar's undo buttons: always the selected part's sound. */
  undoSound() {
    this.step("undo");
  }
  redoSound() {
    this.step("redo");
  }

  private step(way: "undo" | "redo") {
    if (this.view === "course") return this.showMessage(way === "undo" ? "Undo" : "Redo", "not in the course");
    this.endCompare();
    const history = this.parts[this.part].history;
    const step = way === "undo" ? history.undo(this.snapshot()) : history.redo(this.snapshot());
    this.historyVersion++;
    if (!step) return this.showMessage(way === "undo" ? "Undo" : "Redo", "nothing to do");
    const s = step.state;
    // A user preset may have been renamed since: the list's version of it.
    this.preset = this.presets.find((p) => p.id === s.preset.id) ?? s.preset;
    this.values = { ...s.values };
    this.dirty = s.dirty;
    this.browseId = null;
    this.engine.setParams(this.values);
    // Undoing the start of a recipe goes back to the sound before it: the recipe is over.
    if (way === "undo" && step.label.startsWith(RECIPE_STEP)) this.stopRecipe();
    else this.recipe?.changed();
    this.syncHardware();
    this.showMessage(way === "undo" ? "Undo" : "Redo", step.label);
  }

  /** What differs from the saved preset, in words. */
  get changes(): Change[] {
    return this.dirty ? diffValues(presetValues(this.preset), this.values) : [];
  }

  /** A/B: hear the saved preset, then your edit again. The screen keeps showing your edit. */
  toggleCompare() {
    if (this.comparing) return this.endCompare();
    if (!this.dirty) return;
    this.comparing = true;
    this.engine.setParams(presetValues(this.preset));
    this.showMessage("Compare", "saved preset");
  }

  private endCompare() {
    if (!this.comparing) return;
    this.comparing = false;
    this.engine.setParams(this.values);
    this.showMessage("Compare", "your edit");
  }

  /** Put one control back to its saved value. */
  revertParam(id: ParamId) {
    this.setParam(id, presetValues(this.preset)[id]);
    // The last change put back: the sound is the preset again.
    if (this.changes.length === 0) this.dirty = false;
  }

  // ------------------------------------------------------------------ parameters

  setParam(id: ParamId, value: number) {
    // The course's pages each start from their own sound, so their changes aren't undo steps.
    if (this.view !== "course") this.remember(PARAMS[id].label, id);
    this.values[id] = value;
    this.engine.setParam(id, value);
    this.dirty = true;
    this.touched = { param: id, at: performance.now() };
    this.recipe?.changed();
    if (this.view === "course") this.course.changed();
  }

  /** Knob i to control position t (0..1). `cc` is set when it came from the hardware. */
  setKnob(i: number, t: number, cc?: number) {
    // Drawing a table: knobs 1-8 are harmonics 1-8 of the keyframe being drawn.
    if (this.tableEditor && this.view === "wavetable") {
      this.tableEditor.setHarmonic(i, t);
      if (cc !== undefined) this.device?.send(parameterMessage(cc, `Harmonic ${i + 1}`, `${Math.round(t * 100)}%`), "display");
      return;
    }
    const id = this.knobParams[i];
    if (!id) {
      if (this.view === "course" && cc !== undefined) this.showMessage(`Knob ${i + 1}`, "not on this page");
      return;
    }
    this.setParam(id, this.view === "course" ? this.course.fromKnob(id, t) : fromControl(id, t));
    this.popup(id, cc);
  }

  setFader(i: number, t: number, cc?: number) {
    const id = FADERS[i];
    // The course only lets you touch what the page explains.
    if (this.view === "course" && !this.course.allows(id)) return this.showMessage(`Fader ${i + 1}`, "not on this page");
    this.setParam(id, fromControl(id, t));
    this.popup(id, cc);
  }

  // ------------------------------------------------------------------ playing

  noteOn(note: number, velocity: number) {
    if (this.keysToDrums) return this.drumKey(note, velocity, true);
    if (this.seqEdit && this.heldStep !== null) {
      // Hold a step pad and press a key: that key becomes the step's note (and you hear it).
      this.stopAudition();
      this.heldStepKeyed = true;
      this.setStepNote(this.heldStep, note, { on: true, audition: false });
    } else {
      const root = this.transposeRoot(note);
      if (root !== null) {
        this.transposeKeys.add(note);
        return this.setTranspose(note - root);
      }
    }
    if (this.keyPlays.has(note)) this.noteOff(note);
    const plays = keyNotes(note, this.scale);
    this.keyPlays.set(note, plays);
    for (const n of plays) {
      this.noteHolds.set(n, (this.noteHolds.get(n) ?? 0) + 1);
      if (this.arp.on) this.arpeggiator.press(n, velocity);
      else this.engine.noteOn(n, velocity);
      this.notes.add(n);
    }
    if (this.arp.on) this.syncArpClock();
    if (plays.length > 1) {
      const name = chordName(plays, this.scale);
      if (name) this.showMessage("Chord", name);
    }
    this.notesChanged(true);
    this.recipe?.notePlayed(note, this.notes.size);
    if (this.view === "course") this.course.notePlayed(note, this.notes.size);
  }

  noteOff(note: number) {
    if (this.keysToDrums) return this.drumKey(note, 0, false);
    if (this.transposeKeys.delete(note)) return;
    const plays = this.keyPlays.get(note) ?? [note];
    this.keyPlays.delete(note);
    for (const n of plays) {
      const holds = (this.noteHolds.get(n) ?? 1) - 1;
      if (holds > 0) {
        this.noteHolds.set(n, holds);
        continue;
      }
      this.noteHolds.delete(n);
      if (this.arp.on) this.arpeggiator.release(n);
      else this.engine.noteOff(n);
      this.notes.delete(n);
    }
    if (this.arp.on) this.syncArpClock();
    this.notesChanged(false);
  }

  /**
   * The drum track selected in the Song view: from C in every octave, the keys play its kit, one drum a
   * semitone (C kick, C♯ snare, D clap, D♯ closed hat, E open hat, F and F♯ toms, G cowbell).
   */
  private drumKey(note: number, velocity: number, down: boolean) {
    const drum = ((note % 12) + 12) % 12;
    if (drum >= DRUM_NAMES.length) return;
    if (!down) return void this.notes.delete(note);
    this.drumTrack.drums.trigger(drum, velocity);
    this.notes.add(note);
  }

  /** What a key plays while the drum track is selected (null: nothing), short enough for a key. */
  drumOfKey(note: number): string | null {
    if (!this.keysToDrums) return null;
    return DRUM_KEY_LABELS[((note % 12) + 12) % 12] ?? null;
  }

  /**
   * Name the chord in the held notes, 40 ms after they stop changing: fingers never land together, so
   * naming every note as it arrives would flicker (C, C5, C). A key press names what is held then. A
   * release only does while 3 or more notes are left, so letting go of a chord one finger at a time
   * leaves its name showing (dimmed) instead of walking down through its parts.
   */
  private notesChanged(pressed: boolean) {
    this.chordPressed ||= pressed;
    clearTimeout(this.chordTimer);
    this.chordTimer = window.setTimeout(() => {
      const held = [...this.notes];
      if (held.length && (this.chordPressed || held.length >= 3)) {
        this.chordNotes = held;
        this.chord = detectChord(held, this.scale);
      }
      this.chordPressed = false;
      this.chordHeld = this.chordNotes.length > 0 && this.chordNotes.every((n) => this.notes.has(n));
    }, 40);
  }

  /** Change the scale lock or chord mode. Held keys keep the notes they started; the next press uses the new scale. */
  setScale(change: Partial<ScaleSettings>) {
    this.scale = { ...this.scale, ...change };
    if (change.scale && change.scale !== "off") {
      try {
        localStorage.setItem(LAST_SCALE_KEY, change.scale);
      } catch {
        // Not saved (private window): Major next time.
      }
    }
    // The same notes, named for the new key (spelling and numbers change).
    if (this.chord) this.chord = detectChord(this.chordNotes, this.scale);
    try {
      localStorage.setItem(SCALE_KEY, JSON.stringify(this.scale));
    } catch {
      // Not saved (private window): it still works until the page closes.
    }
    const s = this.scale;
    if ("chords" in change && s.scale !== "off") this.showMessage("Chords", CHORD_MODE_NAMES[s.chords]);
    else if ("root" in change && s.scale === "off") this.showMessage("Scale root", `${ROOT_NAMES[s.root]} (scale off)`);
    else this.showMessage("Scale", s.scale === "off" ? "off" : `${ROOT_NAMES[s.root]} ${SCALES[s.scale].name}`);
    this.realignKnobs();
  }

  /** The Scale lock switch: off, or back to the scale used last (Major the first time). */
  toggleScaleLock() {
    this.setScale({ scale: this.scale.scale === "off" ? this.lastScale() : "off" });
  }

  private lastScale(): Exclude<ScaleId, "off"> {
    try {
      const saved = localStorage.getItem(LAST_SCALE_KEY);
      return saved && saved in SCALES ? (saved as Exclude<ScaleId, "off">) : "major";
    } catch {
      return "major";
    }
  }

  // ------------------------------------------------------------------ arpeggiator

  /** Change the arpeggiator. Keys held when it is switched on are taken over by it. */
  setArp(change: Partial<ArpSettings>) {
    const was = this.arp.on;
    const { latch, ...rest } = change;
    Object.assign(this.arp, rest);
    if (latch !== undefined) this.arpeggiator.setLatch(latch);
    if (this.arp.on !== was) {
      const now = this.engine.ctx.currentTime;
      if (this.arp.on) {
        for (const n of this.noteHolds.keys()) {
          this.engine.noteOff(n, now);
          this.arpeggiator.press(n, 100);
        }
      } else {
        // Keys still held go quiet until they are pressed again.
        this.arpeggiator.clear();
        this.arpNotes.clear();
      }
    }
    this.syncArpClock();
    try {
      localStorage.setItem(ARP_KEY, JSON.stringify(this.arp));
    } catch {
      // Not saved (private window): it still works until the page closes.
    }
    this.showMessage("Arp", this.arpLabel);
  }

  /** What the arpeggiator does, short enough for the OLED: "Up 2 oct 1/16", or "off". */
  get arpLabel() {
    const a = this.arp;
    if (!a.on) return "off";
    return `${ARP_PATTERNS[a.pattern]} ${a.octaves} oct ${RATES[a.rate].name}${a.latch ? " L" : ""}`;
  }

  /** The clock runs while the arpeggiator has notes, even with the transport stopped. */
  private syncArpClock() {
    this.seq.setFree(this.arpeggiator.active);
  }

  get scaleName() {
    return scaleLabel(this.scale);
  }

  /** A note's name, spelled for the scale (Eb in C minor, D# with the scale off). */
  noteName(note: number) {
    return noteNameIn(note, this.scale);
  }

  /** If this key should transpose the running sequence, the key that means "no change"; otherwise null. */
  private transposeRoot(note: number): number | null {
    if (!this.noteSeq.enabled || !this.playing) return null;
    if (this.keysMode === "Transpose") return TRANSPOSE_ROOT;
    if (this.keysMode === "Split" && note < SPLIT_NOTE) return SPLIT_ROOT;
    return null;
  }

  setKeysMode(mode: KeysMode) {
    this.keysMode = mode;
    const what = { Play: "play notes", Transpose: "transpose", Split: "low transposes" }[mode];
    this.showMessage("Keys", what);
  }

  cycleKeysMode() {
    this.setKeysMode(KEYS_MODES[(KEYS_MODES.indexOf(this.keysMode) + 1) % KEYS_MODES.length]);
  }

  hitPad(i: number, velocity: number) {
    if (this.seqEdit) return this.seqPadDown(i);
    if (this.stepMode) return this.tapStep(i + (this.bank === "B" ? 8 : 0), velocity);
    this.engine.drums.trigger(i, velocity);
    this.seq.record(i, velocity);
    this.flashPad(i, velocity);
  }

  releasePad(i: number) {
    if (this.seqEdit) return this.seqPadUp(i);
    if (this.stepMode) return;
    this.flashPad(i, 0);
  }

  // ------------------------------------------------------------------ step mode

  toggleStepMode() {
    if (this.seqEdit) this.setSeqEdit(false);
    this.stepMode = !this.stepMode;
    this.browseId = null;
    if (this.stepMode) this.showMessage("Step edit", `${DRUM_NAMES[this.stepTrack]}: turn encoder`);
    else this.showMessage("Step edit", "off");
    this.syncPadLeds();
  }

  selectTrack(track: number) {
    this.stepTrack = ((track % 8) + 8) % 8;
    if (this.stepMode) {
      this.showMessage("Step edit", DRUM_NAMES[this.stepTrack]);
      this.syncPadLeds();
    }
  }

  /** Pad press in step mode: toggle that step for the selected drum, and let you hear it. */
  private tapStep(step: number, velocity: number) {
    const row = this.pattern[this.stepTrack];
    row[step] = row[step] ? 0 : Math.max(60, velocity);
    if (row[step]) this.stepDrums.trigger(this.stepTrack, row[step]);
    this.paintStep(step);
  }

  private movePlayhead(step: number) {
    const prev = this.playStep;
    this.playStep = this.playing ? step : -1;
    if (!this.stepMode) return;
    if (prev >= 0) this.paintStep(prev);
    if (this.playStep >= 0) this.paintStep(this.playStep);
  }

  private stepLedId(step: number) {
    return step < 8 ? LED_IDS.padsA[step] : LED_IDS.padsB[step - 8];
  }

  private stepColor(step: number): Rgb {
    const vel = this.pattern[this.stepTrack][step];
    if (step === this.playStep) return vel ? [127, 127, 127] : [35, 35, 35];
    if (vel) return dim(this.preset.color, 0.35 + 0.65 * (vel / 127));
    // Faint markers on each beat, so the 16 steps are easy to count.
    return step % 4 === 0 ? [10, 10, 10] : [0, 0, 0];
  }

  private paintStep(step: number) {
    this.sendLed(this.stepLedId(step), this.stepColor(step));
  }

  /** Shift + encoder click: off -> drum step edit -> sequencer edit -> off. */
  cyclePadMode() {
    if (this.stepMode) {
      this.toggleStepMode();
      this.setSeqEdit(true);
    } else if (this.seqEdit) this.setSeqEdit(false);
    else this.toggleStepMode();
  }

  // ------------------------------------------------------------------ step sequencer

  setSeqEdit(on: boolean) {
    if (on === this.seqEdit) return;
    if (on && this.stepMode) this.toggleStepMode();
    this.seqEdit = on;
    this.browseId = null;
    this.endHeldStep();
    if (on) this.noteSeq.enabled = true;
    this.faderLive.fill(false);
    this.realignKnobs();
    this.syncPadLeds();
    this.showMessage("Sequencer", on ? "knobs = notes" : "edit off");
  }

  setSeqEnabled(on: boolean) {
    this.noteSeq.enabled = on;
    if (!on) this.seqNotes.clear();
    if (this.seqEdit) this.syncPadLeds();
  }

  toggleSeqStep(i: number) {
    this.noteSeq.steps[i].on = !this.noteSeq.steps[i].on;
    this.paintSeqStep(i);
  }

  toggleSlide(i: number) {
    this.noteSeq.steps[i].slide = !this.noteSeq.steps[i].slide;
    this.paintSeqStep(i);
  }

  /** The notes a step knob reaches: two octaves from STEP_NOTE_LOW, only the scale's with scale lock. */
  private stepKnobNotes() {
    return scaleNotes(STEP_NOTE_LOW, STEP_NOTE_LOW + STEP_NOTE_RANGE, this.scale);
  }

  /** Step knob position (0..1) for a step's note. */
  stepKnobPosition(i: number) {
    const notes = this.stepKnobNotes();
    const note = snapToScale(this.noteSeq.steps[i].note, this.scale);
    let k = notes.findIndex((n) => n >= note);
    if (k < 0) k = notes.length - 1;
    return k / (notes.length - 1);
  }

  /** The note a step plays (before transpose): with scale lock, its note moved into the scale. */
  stepNote(i: number) {
    return snapToScale(this.noteSeq.steps[i].note, this.scale);
  }

  /** Knob i in sequencer edit: the pitch of step i (each knob step is a semitone, or a scale note). `cc` is set when it came from the hardware. */
  setStepKnob(i: number, t: number, cc?: number) {
    const notes = this.stepKnobNotes();
    const note = notes[Math.round(t * (notes.length - 1))];
    if (note === this.noteSeq.steps[i].note) return;
    this.setStepNote(i, note, { on: false, audition: true, realign: false });
    if (cc !== undefined) this.device?.send(parameterMessage(cc, `Step ${i + 1}`, this.noteName(note)), "display");
  }

  setStepNote(i: number, note: number, { on = false, audition = false, realign = true } = {}) {
    const step = this.noteSeq.steps[i];
    step.note = snapToScale(Math.max(12, Math.min(108, note)), this.scale);
    if (on) step.on = true;
    if (audition && !this.playing) {
      const n = snapToScale(step.note + this.noteSeq.transpose, this.scale);
      const now = this.engine.ctx.currentTime;
      this.engine.noteOn(n, 100, now, false, this.stepPart);
      this.engine.noteOff(n, now + AUDITION_S, this.stepPart);
    }
    if (realign && this.seqEdit) this.device?.send(knobValueMessage(i, Math.round(this.stepKnobPosition(i) * 127)), `knob-${i}`);
    if (!audition || on) this.showMessage(`Step ${i + 1}`, this.noteName(step.note));
    this.paintSeqStep(i);
  }

  setTranspose(semitones: number) {
    this.noteSeq.transpose = Math.max(-24, Math.min(24, semitones));
    const t = this.noteSeq.transpose;
    this.showMessage("Transpose", t === 0 ? "none" : `${t > 0 ? "+" : ""}${t} semitones`);
  }

  seqFaderPosition(i: number) {
    const s = this.noteSeq;
    return [(s.length - 1) / (NOTE_STEPS - 1), (s.gate - 0.05) / 0.95, this.clockPosition, s.direction / (DIRECTIONS.length - 1)][i];
  }

  seqFaderDisplay(i: number) {
    const s = this.noteSeq;
    return [`${s.length} steps`, `${Math.round(s.gate * 100)}%`, this.clockDisplay, DIRECTIONS[s.direction]][i];
  }

  /** Clock knob position (0..1): the division in Sync, the speed (exponential) in Free. */
  get clockPosition() {
    const s = this.noteSeq;
    return s.free ? freeHzPosition(s.hz) : s.rate / (RATES.length - 1);
  }

  get clockDisplay() {
    const s = this.noteSeq;
    return s.free ? formatHz(s.hz) : RATES[s.rate].name;
  }

  /** The clock is fast enough that one note is held and its pitch steps (see stepSequencer.ts). */
  get clockLegato() {
    return isLegato(this.noteSeq);
  }

  /** Whether step i's lamp is lit: the step playing now, or, while the line blurs, every step in the length. */
  seqLamp(i: number) {
    if (this.seqStep < 0) return false;
    return this.clockLegato ? i < this.noteSeq.length : i === this.seqStep;
  }

  /** Steps per second the Sync clock gives at the current tempo. */
  private get syncHz() {
    return this.bpm / 60 / RATES[this.noteSeq.rate].beats;
  }

  /** The other mode's speed in the other mode's terms, so you can match one to the other by ear or by eye. */
  get clockHint() {
    const s = this.noteSeq;
    if (!s.free) return `${this.syncHz.toFixed(1)} steps/s`;
    // As a tempo, if each step were a 16th note.
    if (s.hz < LEGATO_HZ) return `16ths at ${Math.round(s.hz * 15)} BPM`;
    // At legato speed: how often the whole line repeats. From 20 Hz up that is a pitch you hear.
    const loop = s.hz / s.length;
    return `loop ${formatHz(loop)}${loop >= 20 ? ` ≈ ${this.noteName(hzToNote(loop))}` : ""}`;
  }

  setClockKnob(t: number) {
    const s = this.noteSeq;
    if (s.free) s.hz = freeHzAt(t);
    else s.rate = Math.round(t * (RATES.length - 1));
  }

  /** Shift + knob 1 on the MiniLab: turn the clock. Free: each click is an eighth of an octave; Sync: every few clicks, the next division. */
  private clockShiftKnob(delta: number, cc: number) {
    const s = this.noteSeq;
    if (s.free) s.hz = clampHz(s.hz * 2 ** (delta / 8));
    else {
      this.clockClicks += delta;
      const move = Math.trunc(this.clockClicks / CLOCK_CLICKS_PER_DIVISION);
      if (move === 0) return this.device?.send(knobValueMessage(0, KNOB_PARK), "knob-0");
      this.clockClicks -= move * CLOCK_CLICKS_PER_DIVISION;
      s.rate = Math.max(0, Math.min(RATES.length - 1, s.rate + move));
    }
    this.device?.send(knobValueMessage(0, KNOB_PARK), "knob-0");
    this.device?.send(parameterMessage(cc, s.free ? "Seq clock (Free)" : "Seq clock (Sync)", this.clockDisplay), "display");
  }
  private clockClicks = 0;

  setClockFree(free: boolean) {
    if (free === this.noteSeq.free) return;
    this.noteSeq.free = free;
    this.showMessage("Seq clock", free ? `Free ${this.clockDisplay}` : `Sync ${this.clockDisplay}`);
  }

  /** Set the Free clock to the speed the Sync clock has at the current tempo. */
  matchClockToTempo() {
    this.noteSeq.hz = clampHz(this.syncHz);
    this.showMessage("Seq clock", this.clockDisplay);
  }

  setSeqFader(i: number, t: number, cc?: number) {
    const s = this.noteSeq;
    if (i === 0) {
      s.length = 1 + Math.round(t * (NOTE_STEPS - 1));
      if (this.seqEdit) this.syncPadLeds();
    } else if (i === 1) s.gate = 0.05 + t * 0.95;
    else if (i === SEQ_CLOCK_FADER) this.setClockKnob(t);
    else s.direction = Math.round(t * (DIRECTIONS.length - 1));
    if (cc !== undefined) this.device?.send(parameterMessage(cc, SEQ_FADERS[i], this.seqFaderDisplay(i)), "display");
  }

  /** Bank A: hold for keyboard note entry, release to switch the step on/off. Bank B: switch its slide. */
  private seqPadDown(i: number) {
    if (this.bank === "B") return this.toggleSlide(i);
    this.endHeldStep();
    this.heldStep = i;
    this.heldStepKeyed = false;
    if (!this.playing) {
      // Stopped: hear the step's note while the pad is held.
      this.auditionNote = snapToScale(this.noteSeq.steps[i].note + this.noteSeq.transpose, this.scale);
      this.auditionPart = this.stepPart;
      this.engine.noteOn(this.auditionNote, 100, undefined, false, this.auditionPart);
    }
    this.showMessage(`Step ${i + 1}`, `${this.noteName(this.stepNote(i))}: press a key`);
  }

  private seqPadUp(i: number) {
    if (this.bank === "B" || this.heldStep !== i) return;
    const keyed = this.heldStepKeyed;
    this.endHeldStep();
    if (!keyed) this.toggleSeqStep(i);
  }

  private endHeldStep() {
    this.stopAudition();
    this.heldStep = null;
    this.heldStepKeyed = false;
  }

  private stopAudition() {
    if (this.auditionNote !== null) this.engine.noteOff(this.auditionNote, undefined, this.auditionPart);
    this.auditionNote = null;
  }

  /** Legato speed: light every note the line plays, since they all sound at once. */
  private lightSeqBlur() {
    if (!this.seqBlur) return;
    const s = this.noteSeq;
    for (let i = 0; i < s.length; i++) if (s.steps[i].on) this.seqNotes.add(snapToScale(s.steps[i].note + s.transpose, this.scale));
  }

  private moveSeqHead(step: number) {
    const prev = this.seqStep;
    this.seqStep = this.playing && this.noteSeq.enabled ? step : -1;
    if (!this.seqEdit) return;
    if (prev >= 0) this.paintSeqStep(prev);
    if (this.seqStep >= 0) this.paintSeqStep(this.seqStep);
  }

  private paintSeqStep(i: number) {
    if (!this.seqEdit) return;
    const step = this.noteSeq.steps[i];
    const inLength = i < this.noteSeq.length;
    const now = i === this.seqStep;
    // Bank A lights only the note playing now, in the preset colour; rests stay dark.
    const a: Rgb = inLength && now && step.on ? this.preset.color : [0, 0, 0];
    let b: Rgb = [0, 0, 0];
    if (inLength) b = step.slide ? dim(SLIDE_COLOR, now ? 1 : 0.6) : now ? [25, 25, 25] : [0, 0, 0];
    this.sendLed(LED_IDS.padsA[i], a);
    this.sendLed(LED_IDS.padsB[i], b);
  }

  /** Run `fn` when the audio clock reaches `time` (for lights and the screen, which can't be scheduled ahead). */
  private atAudioTime(time: number, fn: () => void) {
    setTimeout(fn, Math.max(0, (time - this.engine.ctx.currentTime) * 1000));
  }

  /**
   * Hardware fader pickup: after the faders change job, a fader is ignored until it reaches (or crosses)
   * the value of what it now controls, so the sound doesn't jump.
   */
  private pickedUp(i: number, t: number, target: number, cc: number, label: string): boolean {
    if (this.faderLive[i]) return true;
    const last = this.faderLast[i];
    this.faderLast[i] = t;
    if (Math.abs(t - target) <= PICKUP_WINDOW || (last !== null && (last - target) * (t - target) <= 0)) {
      this.faderLive[i] = true;
      this.faderLast[i] = null;
      return true;
    }
    this.device?.send(parameterMessage(cc, label, `move ${t < target ? "up" : "down"} to ${Math.round(target * 100)}%`), "display");
    return false;
  }

  // ------------------------------------------------------------------ spectrum pads

  setSpectrumPads(on: boolean) {
    this.spectrumPads = on;
    clearInterval(this.spectrumTimer);
    this.spectrumSent.fill(-1);
    this.spectrumLevels = Array(8).fill(0);
    if (on) this.spectrumTimer = window.setInterval(() => this.updateSpectrum(), SPECTRUM_INTERVAL_MS);
    this.syncPadLeds();
  }

  private spectrumBins: Float32Array<ArrayBuffer> | null = null;
  private updateSpectrum() {
    const analyser = this.engine.analyser;
    this.spectrumBins ??= new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(this.spectrumBins);
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const ratio = Math.pow(SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ, 1 / 8);
    for (let band = 0; band < 8; band++) {
      const lo = Math.floor((SPECTRUM_LOW_HZ * Math.pow(ratio, band)) / binHz);
      const hi = Math.max(lo + 1, Math.floor((SPECTRUM_LOW_HZ * Math.pow(ratio, band + 1)) / binHz));
      let peak = -Infinity;
      for (let b = lo; b < hi; b++) peak = Math.max(peak, this.spectrumBins[b]);
      const level = Math.max(0, Math.min(1, (peak + 85) / 60)); // -85 dB..-25 dB
      // Fast attack, slower fall, so the lights read as a meter rather than flicker.
      const prev = this.spectrumLevels[band];
      this.spectrumLevels[band] = level > prev ? level : prev * 0.82 + level * 0.18;
    }
    if (!this.device || this.stepMode || this.seqEdit) return;
    this.spectrumLevels.forEach((level, i) => {
      // Only send when the visible brightness changes, to keep MIDI traffic low.
      const q = Math.round(level * 12);
      if (q === this.spectrumSent[i]) return;
      this.spectrumSent[i] = q;
      this.sendLed(LED_IDS.padsA[i], spectrumColor(i, q / 12));
    });
  }

  setBend(v: number) {
    this.bend = v;
    this.engine.setBend(v);
  }

  setMod(v: number) {
    this.mod = v;
    this.engine.setMod(v);
  }

  togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  play() {
    this.seq.start();
    this.playing = true;
    this.syncTransportLeds();
    this.showHome();
  }

  stop() {
    this.seq.stop();
    this.seqBlur = false;
    this.playing = false;
    this.recording = false;
    this.movePlayhead(-1);
    this.moveSeqHead(-1);
    this.seqNotes.clear();
    this.syncTransportLeds();
    this.showHome();
  }

  toggleRecord() {
    this.recording = !this.recording;
    // Recording pad hits into a loop you can't hear makes no sense: switch the drums on.
    if (this.recording && !this.drumsOn) this.setDrumsOn(true);
    this.seq.recording = this.recording;
    if (this.recording && !this.playing) this.play();
    this.syncTransportLeds();
    this.showHome();
  }

  clearPattern() {
    for (const row of this.pattern) row.fill(0);
    this.showMessage("Pattern", "cleared");
    if (this.stepMode) this.syncPadLeds();
  }

  toggleStep(track: number, step: number) {
    this.pattern[track][step] = this.pattern[track][step] ? 0 : 100;
    if (this.stepMode && track === this.stepTrack) this.paintStep(step);
  }

  setDrumsOn(on: boolean) {
    this.drumsOn = on;
    this.seq.drumsOn = on;
    this.showMessage("Drum loop", on ? "on" : "off");
  }

  setBpm(bpm: number) {
    this.bpm = Math.round(Math.max(40, Math.min(240, bpm)));
    this.engine.setBpm(this.bpm);
  }

  tap() {
    const now = performance.now();
    this.taps = this.taps.filter((t) => now - t < 2500);
    this.taps.push(now);
    if (this.taps.length >= 2) {
      const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      this.setBpm(60000 / avg);
    }
    this.showMessage("Tempo", `${this.bpm} BPM`);
  }

  /** Shift + knob 2–8: each click of the knob is 1 BPM, measured from the parked middle position (knob 1 is the sequencer clock). */
  private tempoKnob(i: number, value: number, cc: number) {
    const delta = value - KNOB_PARK;
    if (delta === 0) return;
    if (i === 0) return this.clockShiftKnob(delta, cc);
    this.setBpm(this.bpm + delta);
    this.device?.send(knobValueMessage(i, KNOB_PARK), `knob-${i}`);
    this.device?.send(parameterMessage(cc, "Tempo", `${this.bpm} BPM`), "display");
  }

  private parkKnobs() {
    for (let i = 0; i < 8; i++) this.device?.send(knobValueMessage(i, KNOB_PARK), `knob-${i}`);
  }

  /** Shift + encoder: Waveform -> Spectrum -> Spectrogram -> Synth -> Wavetable -> Song. */
  cycleScreen(delta: number) {
    // The About page and the course aren't among the screens: from there, Shift + encoder starts over from the playground.
    const current = this.view === "playground" || this.view === "about" || this.view === "course" ? this.vizMode : this.view;
    const next = SCREENS[(SCREENS.indexOf(current) + delta + SCREENS.length) % SCREENS.length];
    if (next === "synth" || next === "wavetable" || next === "song") this.setView(next);
    else {
      this.vizMode = next;
      this.setView("playground");
    }
    this.showMessage("View", SCREEN_NAMES[next]);
  }

  /** Wavetable tab encoder: step through the tables. Picking a table switches Osc 1 to it if no oscillator plays one. */
  stepTable(delta: number) {
    const n = this.tables.length;
    this.selectTable((((this.values.wtTable + delta) % n) + n) % n);
  }

  selectTable(id: number) {
    this.edit(`Wavetable ${tableDef(id).name}`, () => {
      if (!usesTable(this.values)) this.setParam("osc1Wave", TABLE_WAVE);
      this.setParam("wtTable", id);
    });
    this.showMessage("Wavetable", tableDef(id).name);
    this.realignKnobs();
  }

  /** Read a sound file, cut it into frames, save it as a new table and play it. */
  async importTable(file: File, mode: CutMode = "auto") {
    this.importing = true;
    try {
      const sound = await decodeSoundFile(await file.arrayBuffer(), this.engine.ctx);
      const { frames, how } = cutIntoFrames(sound, mode);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "Imported";
      const explain = `Imported from ${file.name}. ${how}`;
      const id = await saveImportedTable({ name, short: name.slice(0, 8), explain }, frames);
      this.tables = [...WAVETABLES];
      this.engine.tablesChanged(id, id);
      this.selectTable(id);
      this.importResult = { ok: true, text: `${name}: ${how}` };
    } catch (e) {
      this.importResult = { ok: false, text: `${file.name}: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      this.importing = false;
    }
  }

  /** Delete an imported or drawn table (from the browser's storage too). */
  async deleteTable(id: number) {
    const def = WAVETABLES[id];
    if (id < BUILTIN_TABLES || def?.storeKey === undefined) return;
    if (this.tableEditor?.original === def) this.cancelTableEditor();
    await deleteImportedTable(def.storeKey);
    this.dropTable(WAVETABLES.indexOf(def));
    this.importResult = { ok: true, text: `Deleted ${def.name}.` };
  }

  /**
   * Take a table out of the list. The tables after it move down one place, so both parts, the Dice patches
   * and the saved user presets are updated to match; whatever used the removed table gets the first one.
   */
  private dropTable(id: number) {
    if (id < BUILTIN_TABLES) return;
    const oldCount = WAVETABLES.length;
    removeTable(id);
    this.tables = [...WAVETABLES];
    // Table numbers after it move down one, so older undo steps would point at the wrong tables.
    this.clearHistory();
    this.engine.tablesChanged(id, oldCount);
    for (const [owner, part] of Object.entries(this.parts)) {
      if (part.values.wtTable === id) part.dirty = true;
      const next = idAfterRemoval(part.values.wtTable, id);
      if (next !== part.values.wtTable) {
        part.values.wtTable = next;
        this.engine.setParam("wtTable", next, owner);
      }
      const wt = part.preset.values.wtTable;
      if (wt !== undefined && wt >= id && !this.isListed(part.preset)) part.preset = { ...part.preset, values: { ...part.preset.values, wtTable: idAfterRemoval(wt, id) } };
    }
    const user = this.userPresets;
    const moved = (p: Preset) => p.values.wtTable !== undefined && p.values.wtTable >= id;
    if (user.some(moved)) this.setUserPresets(user.map((p) => (moved(p) ? { ...p, values: { ...p.values, wtTable: idAfterRemoval(p.values.wtTable!, id) } } : p)));
    this.realignKnobs();
  }

  // ------------------------------------------------------------------ drawing a table

  /**
   * Open the table editor: a new drawing (sine to saw), or `editId`, a saved drawing, again. While it is
   * open the synth plays a draft table at the end of the list, rebuilt as you draw.
   */
  openTableEditor(editId?: number) {
    if (this.tableEditor) return;
    const original = editId !== undefined && WAVETABLES[editId]?.drawn ? WAVETABLES[editId] : null;
    const keys = original ? original.drawn!.keys.map((k) => Float32Array.from(k)) : [shapeWave("sine"), shapeWave("saw")];
    const blend = original?.drawn!.blend ?? "harmonics";
    const draft: WavetableDef = {
      name: "Drawing…",
      short: "Drawing",
      explain: original ? `Editing ${original.name}. Not saved yet.` : "The table you are drawing. Not saved yet.",
      frames: blendKeyframes(keys, blend),
    };
    const previous = tableDef(this.values.wtTable);
    const id = addTable(draft);
    this.tables = [...WAVETABLES];
    this.engine.tablesChanged(id, id);
    const editor = new TableEditor(original, draft, previous, keys, blend, (fromKnob) => this.draftChanged(fromKnob));
    const drawings = WAVETABLES.filter((t) => t.drawn).length;
    editor.name = original?.name ?? `Drawing ${drawings + 1}`;
    this.tableEditor = editor;
    this.setView("wavetable");
    this.selectTable(id);
  }

  /** Rebuild the draft table from the keyframes, at most every 40 ms (it takes a few ms). */
  private draftChanged(fromKnob: boolean) {
    if (!fromKnob) this.realignKnobs();
    if (this.draftTimer) return;
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = 0;
      const editor = this.tableEditor;
      const id = editor ? WAVETABLES.indexOf(editor.draft) : -1;
      if (!editor || id < 0) return;
      replaceFrames(id, editor.frames());
      this.engine.tableUpdated(id);
      editor.built++;
    }, 40);
  }

  /** Play the drawing (after another table was picked while drawing). */
  playDraft() {
    const editor = this.tableEditor;
    if (editor) this.selectTable(WAVETABLES.indexOf(editor.draft));
  }

  /** Save the drawing: as a new table, or over the drawing that was opened. */
  async saveTableEditor() {
    const editor = this.tableEditor;
    if (!editor) return;
    clearTimeout(this.draftTimer);
    this.draftTimer = 0;
    const frames = editor.frames();
    const name = editor.name.trim().slice(0, 24) || "Drawing";
    const target = editor.original ?? editor.draft;
    target.explain = `Drawn by you: ${editor.keys.length} keyframes, blended by ${editor.blend === "harmonics" ? "harmonics (each one's strength moves smoothly)" : "crossfade (the waves are mixed)"}.`;
    target.drawn = { keys: editor.keys.map((k) => Float32Array.from(k)), blend: editor.blend };
    const id = WAVETABLES.indexOf(target);
    renameTable(id, name, name.slice(0, 8));
    replaceFrames(id, frames);
    try {
      if (editor.original) await updateStoredTable(editor.original);
      else await storeTable(editor.draft);
    } catch (e) {
      this.importResult = { ok: false, text: `Couldn't save ${name}: ${e instanceof Error ? e.message : String(e)}` };
      return;
    }
    this.tableEditor = null;
    this.engine.tableUpdated(id);
    // Editing a saved drawing: the draft was only for listening.
    if (editor.original) this.dropTable(WAVETABLES.indexOf(editor.draft));
    this.tables = [...WAVETABLES];
    this.selectTable(WAVETABLES.indexOf(target));
    this.importResult = { ok: true, text: `Saved ${name}.` };
  }

  /** Close the editor without saving: the draft goes, and the table that played before comes back. */
  cancelTableEditor() {
    const editor = this.tableEditor;
    if (!editor) return;
    clearTimeout(this.draftTimer);
    this.draftTimer = 0;
    this.tableEditor = null;
    this.dropTable(WAVETABLES.indexOf(editor.draft));
    this.selectTable(Math.max(0, WAVETABLES.indexOf(editor.previous)));
  }

  /** The frames of the table that played before the editor opened (to copy a keyframe from). */
  previousFrames(): Float32Array[] {
    const editor = this.tableEditor;
    return tableFrames(editor ? Math.max(0, WAVETABLES.indexOf(editor.previous)) : 0);
  }

  // ------------------------------------------------------------------ recipes

  /**
   * Follow a recipe: the Keys part gets the blank Init sound (not in the preset list until you save
   * it), and the Synth view opens with the recipe on top of it.
   */
  startRecipe(id: string) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    this.recipe?.stop();
    this.selectPart("keys");
    this.remember(`${RECIPE_STEP}${recipe.name}`);
    this.preset = initPreset(recipe);
    this.browseId = null;
    this.values = presetValues(this.preset);
    this.dirty = false;
    this.engine.setParams(this.values);
    this.patch = null;
    if (this.listening) this.listenTo(null);
    this.recipeList = false;
    this.setView("synth");
    this.recipe = new RecipeRun(recipe, () => this.parts.keys.values, () => this.recipeStepChanged());
    this.recipeStepChanged();
    this.syncHardware();
  }

  /** Show the recipe list (in the Synth view, where recipes run). */
  openRecipes() {
    this.setView("synth");
    this.recipeList = true;
  }

  /** Forget which recipes were finished. */
  resetRecipeProgress() {
    this.saveRecipesDone([]);
  }

  private saveRecipesDone(ids: string[]) {
    this.recipesDone = ids;
    try {
      localStorage.setItem(RECIPES_DONE_KEY, JSON.stringify(ids));
    } catch {
      // Not kept (private window): the ticks last until the page closes.
    }
  }

  /** Start the recipe again from Init. */
  restartRecipe() {
    if (this.recipe) this.startRecipe(this.recipe.recipe.id);
  }

  /** Leave the recipe; the sound you built stays. */
  stopRecipe() {
    if (!this.recipe) return;
    this.recipe.stop();
    this.recipe = null;
    this.showHome();
  }

  /** The controls the current step asks for (highlighted in the Synth view). */
  get recipeParams(): ParamId[] {
    return (this.recipe?.step?.checks ?? []).flatMap((c) => (isPlay(c) ? [] : [c.param]));
  }

  /** The block the current step's control is on. */
  get recipeBlock(): BlockId | null {
    const param = this.recipeParams[0];
    return param ? blockOf(param) : null;
  }

  /** Where the current step's control is on the MiniLab, or null (a step about playing, or none). */
  get recipeHardware() {
    const step = this.recipe?.step;
    const param = step && stepParam(step);
    return param ? hardwareFor(param) : null;
  }

  /** A new step: put the MiniLab knobs on the page with its control, and show the step on the OLED. */
  private recipeStepChanged() {
    // Finished: the sound is named after the recipe (still unsaved).
    const run = this.recipe;
    const keys = this.parts.keys;
    if (run?.done && keys.preset.from === "recipe") keys.preset = { ...keys.preset, name: run.recipe.name };
    if (run?.done && !this.recipesDone.includes(run.recipe.id)) this.saveRecipesDone([...this.recipesDone, run.recipe.id]);
    const hw = this.recipeHardware;
    if (hw && this.view === "synth") this.focus(hw.focus);
    this.showHome();
  }

  /** The OLED's two lines for the current step: "Step 3/11" and what to touch. */
  private recipeScreen(): [string, string] {
    const run = this.recipe!;
    if (run.done) return ["Recipe", `${run.recipe.name} done!`];
    const step = run.step!;
    const param = stepParam(step);
    const hw = this.recipeHardware;
    let what: string;
    if (param && hw) what = `${hw.kind === "fader" ? "Fader" : "Knob"} ${hw.index + 1}: ${PARAMS[param].label}`;
    else if (param) what = `Set ${PARAMS[param].label}`;
    else {
      const play = step.checks.find(isPlay)!.play;
      what = PLAY_SCREEN[play];
    }
    return [`Step ${run.index + 1}/${run.total}`, what];
  }

  setView(view: View) {
    if (this.view === view) return;
    this.flushClipEdit();
    if (this.editInSong) this.closeClipEdit();
    const wasCourse = this.view === "course";
    if (wasCourse) this.leaveCourse();
    if (view === "course") this.prepareCourse();
    this.view = view;
    if (view === "course") this.course.open();
    else if (wasCourse) this.showHome();
    this.patch = null;
    if (view !== "synth") this.listenTo(null);
    // The drum track is only picked in the Song view.
    if (view !== "song") this.drumsSelected = false;
    this.syncPlayer();
    this.syncTaps();
    this.realignKnobs();
    if (view === "song") this.syncSongClipEdit();
  }

  // ------------------------------------------------------------------ course

  /** Before the Learn view opens: the Keys part plays the course alone, with nothing else changing the notes. */
  private prepareCourse() {
    this.stopRecipe();
    this.recipeList = false;
    if (this.playing) this.stop();
    if (this.seqEdit) this.setSeqEdit(false);
    if (this.stepMode) this.toggleStepMode();
    this.selectPart("keys");
    this.beforeCourse = { sound: this.snapshot(), arp: this.arp.on, scale: this.scale.scale };
    if (this.arp.on) this.setArp({ on: false });
    if (this.scale.scale !== "off") this.setScale({ scale: "off" });
  }

  /** Leaving the Learn view: your sound, the arpeggiator and scale lock come back as they were. */
  private leaveCourse() {
    this.stopPageDrums();
    this.course.close();
    const before = this.beforeCourse;
    this.beforeCourse = null;
    if (!before) return;
    const keys = this.parts.keys;
    keys.preset = this.presets.find((p) => p.id === before.sound.preset.id) ?? before.sound.preset;
    keys.values = { ...before.sound.values };
    keys.dirty = before.sound.dirty;
    this.engine.setParams(keys.values, "keys");
    if (before.arp) this.setArp({ on: true });
    if (before.scale !== "off") this.setScale({ scale: before.scale });
  }

  /**
   * The course's last page: leave for the Synth view, with your own sound back, or with Init over it (one
   * undo step, so undo gives your sound back).
   */
  buildYourOwn(init: boolean) {
    this.setView("synth");
    if (!init) return;
    this.remember("Init");
    this.preset = buildPreset();
    this.browseId = null;
    this.values = presetValues(this.preset);
    this.dirty = false;
    this.engine.setParams(this.values);
    this.syncHardware();
  }

  /**
   * A recipe offered at a chapter's end: leave the course (your sound comes back first), then follow it. Its
   * start is an undo step, so undo gives your sound back; Learn keeps its page for when you come back.
   */
  courseRecipe(id: string) {
    this.setView("synth");
    this.startRecipe(id);
  }

  /** A course page opened (with its starting sound), or its step changed. */
  private coursePage(values: ParamValues | null) {
    if (values) {
      // The drums belong to the page that starts them (tempo sync): another page starts in silence.
      if (this.playing) this.stop();
      const keys = this.parts.keys;
      keys.preset = coursePreset(this.course.lesson, values);
      keys.values = values;
      keys.dirty = false;
      this.engine.setParams(values, "keys");
      this.realignKnobs();
      // The faders pick up the page's envelope: each waits until it reaches its new value.
      this.faderLive.fill(false);
    }
    this.showHome();
  }

  /** Leaving a page that offers the drums (tempo sync) stops them. */
  private stopPageDrums() {
    const w = this.course.lesson.widget;
    if (this.playing && w.kind === "lfo" && w.transport) this.stop();
  }

  /** The encoder in the Learn view: the next or previous page. */
  private turnPage(delta: number) {
    if (!this.course.goTo(this.course.index + Math.sign(delta))) this.showMessage("Learn", delta > 0 ? "last page" : "first page");
  }

  /** The OLED's two lines on a course page: where you are, and what to do now. */
  private courseScreen(): [string, string] {
    const c = this.course;
    const head = `Learn ${c.index + 1}/${c.total}`;
    const run = c.run;
    const step = run?.step;
    if (!run || !step) return [head, `${c.lesson.title}: done`];
    const param = stepParam(step);
    if (param) {
      const k = c.lesson.knobs.indexOf(param);
      const f = FADERS.indexOf(param);
      return [head, k >= 0 ? `Knob ${k + 1}: ${PARAMS[param].label}` : f >= 0 ? `Fader ${f + 1}: ${PARAMS[param].label}` : `Set ${PARAMS[param].label}`];
    }
    return [head, PLAY_SCREEN[step.checks.find(isPlay)!.play]];
  }

  /** The controls the current recipe step or course step asks for (outlined on screen). */
  get targetParams(): ParamId[] {
    const step = this.view === "course" ? this.course.run?.step : this.recipe?.step;
    return (step?.checks ?? []).flatMap((c) => (isPlay(c) ? [] : [c.param]));
  }

  /** The stage taps cost every voice extra work: only the Synth view and the course draw them, and "Listen here" plays them. */
  private syncTaps() {
    this.engine.setTaps(this.view === "synth" || this.view === "course" || this.listening !== null);
  }

  /** Hear one stage on its own; the same stage again (or null) returns to the full sound. */
  listenTo(tap: ListenTap | null) {
    this.listening = tap === this.listening ? null : tap;
    this.engine.listen(this.listening);
    this.syncTaps();
    this.showMessage("Listen", this.listening ? TAP_NAMES[this.listening] : "full sound");
  }

  setExplain(on: boolean) {
    this.explain = on;
    localStorage.setItem(EXPLAIN_KEY, on ? "on" : "off");
  }

  /** What the 8 hardware knobs control right now. */
  get knobParams(): (ParamId | null)[] {
    if (this.view === "wavetable") return WAVETABLE_KNOBS;
    if (this.view === "course") return this.course.knobs;
    return this.view === "synth" ? KNOB_PAGES[this.focusPage].knobs : this.preset.knobs;
  }

  get focusPage() {
    return pageOf(this.focusBlock);
  }

  focus(block: BlockId) {
    const before = this.focusPage;
    this.focusBlock = block;
    if (this.focusPage !== before) this.announcePage();
  }

  /** A click on a block: focus its knob page, or, while patching, pick it as a source or destination. */
  blockClick(block: BlockId) {
    if (this.patch === null) return this.focus(block);
    if (this.patch === "source") {
      const src = blockSource(block);
      if (src > 0) this.patch = src;
      return;
    }
    const dst = blockDest(block, this.values);
    if (dst < 0) return;
    this.addRoute(this.patch, dst);
    this.patch = null;
  }

  togglePatch() {
    this.patch = this.patch === null ? "source" : null;
  }

  /** Put a route in the first empty slot (or the last one if all are used) and point the knobs at it. */
  addRoute(src = MOD_SOURCES.indexOf("velocity"), dst = MOD_DESTS.indexOf("cutoff"), amount = routeStartAmount(dst)) {
    let n = 1;
    while (n < MOD_SLOTS && MOD_SOURCES[this.values[slotIds(n).src]] !== "off") n++;
    const ids = slotIds(n);
    this.edit(`Add route ${n}`, () => {
      this.setParam(ids.src, src);
      this.setParam(ids.dst, dst);
      this.setParam(ids.amt, amount);
    });
    this.focus("matrix");
    this.showMessage(`Route ${n}`, `${MOD_SHORT[MOD_SOURCES[src]]}>${MOD_SHORT[MOD_DESTS[dst]]}`);
    this.realignKnobs();
    return n;
  }

  /** Move route n to another destination (dragging its cable's end), keeping its source and amount. */
  moveRoute(n: number, dst: number) {
    const ids = slotIds(n);
    if (this.values[ids.dst] === dst) return;
    this.edit(`Move route ${n}`, () => this.setParam(ids.dst, dst));
    this.showMessage(`Route ${n}`, `${MOD_SHORT[MOD_SOURCES[this.values[ids.src]]]}>${MOD_SHORT[MOD_DESTS[dst]]}`);
    this.realignKnobs();
  }

  removeRoute(n: number) {
    const ids = slotIds(n);
    this.edit(`Remove route ${n}`, () => {
      this.setParam(ids.src, 0);
      this.setParam(ids.amt, 0);
    });
    this.realignKnobs();
  }

  /** Switch an effect on or off (and point the knobs at it). */
  toggleEffect(fx: Effect) {
    const on = this.values[EFFECT_ON[fx]] ? 0 : 1;
    this.edit(`${BLOCKS[fx].title} ${on ? "on" : "off"}`, () => this.setParam(EFFECT_ON[fx], on));
    this.focus(fx);
    this.showMessage(BLOCKS[fx].title, on ? "on" : "off");
  }

  /** Move an effect to position `to` (0 = first) in the chain; the others keep their order. */
  moveEffect(fx: Effect, to: number) {
    const order = effectOrder(this.values).filter((f) => f !== fx);
    to = Math.max(0, Math.min(order.length, to));
    order.splice(to, 0, fx);
    if (order.every((f, i) => this.values[fxSlotId(i + 1)] === EFFECTS.indexOf(f))) return;
    this.edit(`Move ${BLOCKS[fx].title}`, () => order.forEach((f, i) => this.setParam(fxSlotId(i + 1), EFFECTS.indexOf(f))));
    this.showMessage(BLOCKS[fx].title, `now ${to + 1} of ${order.length}`);
  }

  /** Slots with a route in them. */
  get routes(): number[] {
    return Array.from({ length: MOD_SLOTS }, (_, i) => i + 1).filter((n) => MOD_SOURCES[this.values[slotIds(n).src]] !== "off");
  }

  /** Synth view encoder: step through the knob pages. */
  cycleFocus(delta: number) {
    const n = KNOB_PAGES.length;
    this.focusBlock = KNOB_PAGES[(((this.focusPage + delta) % n) + n) % n].blocks[0];
    this.announcePage();
  }

  private announcePage() {
    const page = KNOB_PAGES[this.focusPage];
    this.showMessage(page.name, "knobs follow");
    this.realignKnobs();
  }

  /** Encoder turn: browse presets without loading. Click loads. */
  /** Encoder turn: browse the browser's list without loading. Click loads. */
  browse(delta: number) {
    const list = this.browseList;
    const p = this.presetAfter(this.browseId ?? this.preset.id, delta);
    this.browseId = p.id;
    this.sendDisplay(`${list.indexOf(p) + 1}/${list.length} ${p.category}`, `> ${p.name}`);
    clearTimeout(this.browseTimer);
    this.browseTimer = window.setTimeout(() => {
      this.browseId = null;
      this.showHome();
    }, BROWSE_TIMEOUT_MS);
  }

  confirmBrowse() {
    clearTimeout(this.browseTimer);
    if (this.browseId !== null) this.loadPreset(this.browseId);
  }

  // ------------------------------------------------------------------ QWERTY fallback

  private static KEYMAP = "awsedftgyhujkolp;'";
  /** The computer keyboard's octave, -3..3: its A key plays C4 at 0. */
  keyOctave = $state(0);

  /** Z / X: the computer keyboard an octave down or up. */
  shiftKeyOctave(delta: number) {
    this.keyOctave = Math.max(-3, Math.min(3, this.keyOctave + delta));
  }

  handleKey(e: KeyboardEvent, down: boolean) {
    if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
    // Ctrl+Z undo; Ctrl+Shift+Z or Ctrl+Y redo (Cmd on a Mac).
    if (down && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" || k === "y") {
        e.preventDefault();
        if (k === "y" || e.shiftKey) this.redo();
        else this.undo();
      }
      return;
    }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (down && (k === "z" || k === "x")) {
      this.shiftKeyOctave(k === "z" ? -1 : 1);
      return;
    }
    const i = Playground.KEYMAP.indexOf(k);
    if (i < 0) return;
    const note = 60 + this.keyOctave * 12 + i;
    if (down) this.noteOn(note, 100);
    else this.noteOff(note);
    e.preventDefault();
  }

  // ------------------------------------------------------------------ MIDI

  async connectMidi() {
    let access: MIDIAccess;
    try {
      access = await requestMidi();
    } catch (err) {
      this.midiStatus = (err as Error).message.includes("not supported") ? "unsupported" : "denied";
      return;
    }
    const open = () => {
      const { input, output } = findPorts(access);
      if (!input || !output) {
        this.device?.close();
        this.device = null;
        this.midiStatus = "not-found";
        // Unplugged: Shift can't be released any more, and sequencer edit only works on the device.
        this.shift = false;
        if (this.seqEdit) this.setSeqEdit(false);
        return;
      }
      if (this.device?.input.id === input.id && this.midiStatus === "connected") return;
      this.device?.close();
      this.device = new MiniLab(input, output);
      this.device.onEvent((e) => this.handle(e));
      // How long each note-on waited (its timestamp is when it arrived from the device).
      this.device.onRaw((m) => {
        if (m.direction === "in" && (m.bytes[0] & 0xf0) === 0x90 && m.bytes[2] > 0) this.midiWait.add(Math.max(0, performance.now() - m.time));
      });
      this.device.hello();
      this.deviceName = input.name ?? "MiniLab 3";
      this.midiStatus = "connected";
      // Give the device a moment after the handshake before painting.
      setTimeout(() => this.syncHardware(), 150);
    };
    this.midiAccess = access;
    access.onstatechange = (e) => {
      const port = (e as MIDIConnectionEvent).port;
      if (port && isMainPort(port)) open();
    };
    open();
    window.addEventListener("beforeunload", () => this.device?.goodbye());
  }

  private handle(e: ControlEvent) {
    switch (e.type) {
      case "key":
        // Shift + a key switches part; that key doesn't play (nor does its release).
        if (e.on && this.shift && this.view !== "course") {
          this.partKeys.add(e.note);
          return this.togglePart();
        }
        if (!e.on && this.partKeys.delete(e.note)) return;
        return e.on ? this.noteOn(e.note, e.velocity) : this.noteOff(e.note);
      case "knob": {
        this.notePrgm(e.program);
        const cc = CC_MAPS[e.program].knobs[e.index];
        if (this.shift) return this.tempoKnob(e.index, e.value, cc);
        if (this.seqEdit) return this.setStepKnob(e.index, e.value / 127, cc);
        return this.setKnob(e.index, e.value / 127, cc);
      }
      case "fader": {
        this.notePrgm(e.program);
        const cc = CC_MAPS[e.program].faders[e.index];
        const t = e.value / 127;
        if (this.shift) return this.setShiftFader(e.index, t);
        if (this.seqEdit) {
          if (this.pickedUp(e.index, t, this.seqFaderPosition(e.index), cc, SEQ_FADERS[e.index])) this.setSeqFader(e.index, t, cc);
          return;
        }
        const id = FADERS[e.index];
        if (this.pickedUp(e.index, t, toControl(id, this.values[id]), cc, PARAMS[id].label)) this.setFader(e.index, t, cc);
        return;
      }
      case "pitchBend":
        if (this.shift) return this.shiftStrip(e.value);
        this.stripArmed = true;
        return this.setBend(e.value);
      case "mod":
        if (this.shift) return this.shiftModStrip(e.value / 127);
        return this.setMod(e.value / 127);
      case "pad":
        if (e.bank !== this.bank) {
          this.bank = e.bank;
          this.syncPadLeds();
        }
        if (e.bank === "B" && !this.stepMode && !this.seqEdit) {
          // The course keeps its page's sound: no preset loads.
          if (this.view === "course") return;
          const fav = this.padPresets[e.index];
          if (e.on && fav) this.loadPreset(fav.id);
          return;
        }
        return e.on ? this.hitPad(e.index, e.velocity) : this.releasePad(e.index);
      case "encoder":
        if (e.shifted || this.shift) return this.cycleScreen(e.delta);
        if (this.view === "course") return this.turnPage(e.delta);
        if (this.stepMode) return this.selectTrack(this.stepTrack + e.delta);
        if (this.view === "wavetable") return this.stepTable(e.delta);
        return this.view === "synth" ? this.cycleFocus(e.delta) : this.browse(e.delta);
      case "encoderClick":
        return this.encoderClick(e.pressed, e.shifted || this.shift);
      case "shift":
        this.shift = e.pressed;
        // Shift + knob 1 turns the sequencer clock, Shift + knobs 2–8 the tempo. The knobs are parked in the middle so they can turn either way
        // without hitting an end, then given back their real values on release.
        if (e.pressed) this.parkKnobs();
        else this.realignKnobs();
        return;
      case "transport":
        if (!e.pressed) return;
        if (e.button === "play") return this.togglePlay();
        if (e.button === "stop") return this.stop();
        if (e.button === "record") return this.toggleRecord();
        if (e.button === "loop") return this.clearPattern();
        if (e.button === "tap") return this.tap();
        return;
      case "program":
        this.program = e.program;
        if (e.program === "daw") setTimeout(() => this.syncHardware(), 150);
        return;
      case "padBank":
        this.bank = e.bank;
        this.syncPadLeds();
        return;
    }
  }

  /** Shift + pitch strip: down undoes, up redoes, once per push (let it spring back to do it again). */
  private stripArmed = true;
  private shiftStrip(v: number) {
    if (this.bend !== 0) this.setBend(0);
    if (Math.abs(v) < 0.2) this.stripArmed = true;
    else if (this.stripArmed && Math.abs(v) > 0.5) {
      this.stripArmed = false;
      if (v < 0) this.undo();
      else this.redo();
    }
  }

  /**
   * Shift + a fader picks from a list by where the fader is: 1 the arpeggio pattern (bottom = off),
   * 2 its range in octaves, 3 the scale (bottom = off), 4 what one key plays (notes, triads, 7ths).
   * Afterwards the fader picks up its own job again only when it gets back to that value.
   */
  setShiftFader(i: number, t: number) {
    this.faderLive[i] = false;
    if (i === 0) {
      const z = zone(t, ARP_PATTERNS.length + 1);
      if (z !== (this.arp.on ? this.arp.pattern + 1 : 0)) this.setArp(z === 0 ? { on: false } : { on: true, pattern: z - 1 });
    } else if (i === 1) {
      const octaves = 1 + zone(t, ARP_MAX_OCTAVES);
      if (octaves !== this.arp.octaves) this.setArp({ octaves });
    } else if (i === 2) {
      const scale = SCALE_IDS[zone(t, SCALE_IDS.length)];
      if (scale !== this.scale.scale) this.setScale({ scale });
    } else {
      const chords = CHORD_MODES[zone(t, CHORD_MODES.length)];
      if (chords === this.scale.chords) return;
      // Chords are built from a scale: with the scale off, the last one used comes back.
      if (this.scale.scale === "off" && chords !== "off") this.setScale({ scale: this.lastScale(), chords });
      else this.setScale({ chords });
    }
  }

  /** What Shift + fader i is set to now: its choice, and the middle of that choice's zone (0..1). */
  shiftFaderState(i: number): { display: string; position: number } {
    const at = (k: number, n: number) => (k + 0.5) / n;
    const a = this.arp;
    const s = this.scale;
    if (i === 0) return { display: a.on ? ARP_PATTERNS[a.pattern] : "Off", position: at(a.on ? a.pattern + 1 : 0, ARP_PATTERNS.length + 1) };
    if (i === 1) return { display: `${a.octaves} oct`, position: at(a.octaves - 1, ARP_MAX_OCTAVES) };
    if (i === 2) return { display: s.scale === "off" ? "Off" : `${ROOT_NAMES[s.root]} ${SCALES[s.scale].name}`, position: at(SCALE_IDS.indexOf(s.scale), SCALE_IDS.length) };
    return { display: s.chords === "off" ? "Notes" : s.chords === "triads" ? "Triads" : "7ths", position: at(CHORD_MODES.indexOf(s.chords), CHORD_MODES.length) };
  }

  /** Shift + mod strip: the scale's root, C at the left end to B at the right. */
  private shiftModStrip(t: number) {
    const root = zone(t, 12);
    if (root !== this.scale.root) this.setScale({ root });
  }

  /** Click: load the browsed preset. Long press: Dice. Shift + click: step mode. */
  private encoderClick(pressed: boolean, shifted: boolean) {
    // The course: a click switches A/B on a comparison page (and never rolls Dice over the page's sound).
    if (this.view === "course" && !shifted) {
      if (!pressed) this.course.click();
      return;
    }
    if (pressed) {
      this.longPressFired = false;
      if (shifted) {
        this.longPressFired = true; // consume the release
        return this.cyclePadMode();
      }
      clearTimeout(this.longPressTimer);
      this.longPressTimer = window.setTimeout(() => {
        this.longPressFired = true;
        this.dice();
      }, LONG_PRESS_MS);
      return;
    }
    clearTimeout(this.longPressTimer);
    if (this.longPressFired) return;
    // In sequencer edit, a click switches what the keys do: play, transpose, split.
    if (this.seqEdit && this.browseId === null) return this.cycleKeysMode();
    // In the Synth view, a click listens to the selected block (if it has a signal to hear).
    if (this.view === "synth" && this.browseId === null) {
      this.listenTo(this.listening ? null : (BLOCK_TAPS[this.focusBlock] ?? null));
      return;
    }
    this.confirmBrowse();
  }

  private notePrgm(p: Program) {
    if (this.program !== p) this.program = p;
  }

  // ------------------------------------------------------------------ hardware feedback

  /** Repaint everything on the device: screen, LEDs, knob positions. */
  syncHardware() {
    if (!this.device) return;
    this.showHome();
    this.syncPadLeds();
    this.syncTransportLeds();
    this.realignKnobs();
  }

  /** Move the device's stored knob values to what they now control, so the next turn doesn't jump. */
  private realignKnobs() {
    if (this.tableEditor && this.view === "wavetable") {
      const amps = this.tableEditor.amps();
      for (let i = 0; i < 8; i++) this.device?.send(knobValueMessage(i, Math.round(Math.min(1, amps[i]) * 127)), `knob-${i}`);
      return;
    }
    if (this.seqEdit) {
      for (let i = 0; i < NOTE_STEPS; i++) this.device?.send(knobValueMessage(i, Math.round(this.stepKnobPosition(i) * 127)), `knob-${i}`);
      return;
    }
    this.knobParams.forEach((id, i) => {
      const position = !id ? 0 : this.view === "course" ? this.course.knobPosition(id, this.values[id]) : toControl(id, this.values[id]);
      const value = Math.round(position * 127);
      this.device?.send(knobValueMessage(i, value), `knob-${i}`);
    });
  }

  private syncPadLeds() {
    if (!this.device) return;
    if (this.stepMode) {
      for (let step = 0; step < 16; step++) this.paintStep(step);
      return;
    }
    if (this.seqEdit) {
      for (let i = 0; i < NOTE_STEPS; i++) this.paintSeqStep(i);
      return;
    }
    this.spectrumSent.fill(-1);
    LED_IDS.padsA.forEach((id, i) => this.sendLed(id, this.spectrumPads ? [0, 0, 0] : this.drumColor(i)));
    const favs = this.padPresets;
    LED_IDS.padsB.forEach((id, i) => {
      const p = favs[i];
      this.sendLed(id, p ? dim(p.color, p.id === this.preset.id ? 1 : 0.15) : [0, 0, 0]);
    });
  }

  private syncTransportLeds() {
    const t = LED_IDS.transport;
    this.sendLed(t.play, this.playing ? [0, 127, 0] : [0, 20, 0]);
    this.sendLed(t.record, this.recording ? [127, 0, 0] : [20, 0, 0]);
  }

  private drumColor(i: number): Rgb {
    return dim(this.preset.color, i === 0 ? 0.6 : 0.3);
  }

  private flashPad(i: number, velocity: number) {
    this.padLevels[i] = velocity / 127;
    if (this.bank !== "A" || this.stepMode || this.seqEdit || this.spectrumPads) return;
    const id = LED_IDS.padsA[i];
    if (velocity > 0) {
      const k = 0.4 + 0.6 * (velocity / 127);
      const [r, g, b] = this.preset.color;
      this.sendLed(id, [Math.max(r, 90) * k, Math.max(g, 90) * k, Math.max(b, 90) * k]);
    } else {
      this.sendLed(id, this.drumColor(i));
    }
  }

  private sendLed(id: number, rgb: Rgb) {
    this.device?.send(ledColorMessage(id, ...rgb), `led-${id}`);
  }

  private sendDisplay(line1: string, line2: string) {
    this.device?.send(
      displayMessage(line1, line2, { transport: this.recording ? "record" : this.playing ? "play" : "none", arp: this.arp.on }),
      "display",
    );
  }

  showHome() {
    if (this.view === "course") return this.sendDisplay(...this.courseScreen());
    if (this.recipe) return this.sendDisplay(...this.recipeScreen());
    const p = this.preset;
    const list = this.browseList;
    const at = list.findIndex((q) => q.id === p.id);
    const where = p.from === "recipe" ? "Recipe" : p.from === "dice" ? "Dice" : at >= 0 ? `${at + 1}/${list.length}` : this.isListed(p) ? p.category : "Unsaved";
    const part = this.part === "keys" ? "Keys" : this.part === "seq" ? "Seq" : this.partName(this.part).slice(0, 8);
    this.sendDisplay(`${part} ${where}`, this.preset.name);
  }

  private messageTimer = 0;
  private showMessage(line1: string, line2: string) {
    this.sendDisplay(line1, line2);
    clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.showHome(), 1500);
  }

  private popup(id: ParamId, cc?: number) {
    if (cc === undefined || !this.device) return;
    this.device.send(parameterMessage(cc, paramLabel(id, this.values, PARAMS[id].label), formatValue(id, this.values[id])), "display");
  }

  drumName(i: number) {
    return DRUM_NAMES[i];
  }
}

/** Spectrum pad colour: a rainbow from red (bass) to violet (treble), brightness by level. */
function spectrumColor(band: number, level: number): Rgb {
  const hue = (band / 8) * 5; // 0..5 of the 6 hue sectors: red -> magenta-ish violet
  const x = 1 - Math.abs((hue % 2) - 1);
  const sectors: [number, number, number][] = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]];
  const k = level * level * 127; // squared: LEDs look linear-ish to the eye
  return sectors[Math.floor(hue)].map((c) => c * k) as Rgb;
}
