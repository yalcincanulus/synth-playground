import { SvelteSet } from "svelte/reactivity";
import { DRUM_NAMES } from "../audio/drums";
import { Engine, type CpuLoad, type ListenTap } from "../audio/engine";
import type { NoteOwner } from "../audio/voice";
import { formatValue, fromControl, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, PARAMS, slotIds, toControl, type ParamId, type ParamValues } from "../audio/params";
import { WorkerClock } from "../audio/clock";
import { Sequencer, type Pattern, type SequencerTiming, basicBeat, emptyPattern } from "../audio/sequencer";
import {
  defaultNoteSeq,
  DIRECTIONS,
  NOTE_STEPS,
  NoteSequencer,
  RATES,
  STEP_NOTE_LOW,
  STEP_NOTE_RANGE,
  TRANSPOSE_ROOT,
  KEYS_MODES,
  SPLIT_NOTE,
  SPLIT_ROOT,
  type KeysMode,
  type NoteSeqSettings,
} from "../audio/stepSequencer";
import { TABLE_WAVE } from "../audio/oscCore";
import { addTable, BUILTIN_TABLES, idAfterRemoval, removeTable, renameTable, replaceFrames, tableDef, tableFrames, WAVETABLES, type WavetableDef } from "../audio/wavetables";
import { deleteImportedTable, saveImportedTable, storeTable, updateStoredTable } from "../audio/tableStore";
import { blendKeyframes, shapeWave } from "../audio/tableDraw";
import { TableEditor } from "./wavetable/tableEditor.svelte";
import { detectChord, type DetectedChord } from "../audio/chordDetect";
import { RecipeRun } from "./recipes/recipeRun.svelte";
import { RECIPES } from "../recipes/library";
import { blockOf, hardwareFor, initPreset, isPlay, stepParam } from "../recipes/recipe";
import { CHORD_MODE_NAMES, chordName, defaultScale, keyNotes, noteNameIn, ROOT_NAMES, scaleLabel, scaleNotes, SCALES, snapToScale, type ScaleSettings } from "../audio/scale";
import { cutIntoFrames, decodeSoundFile, type CutMode } from "../audio/wavImport";
import { findPorts, isMainPort, MiniLab, requestMidi } from "../minilab/device";
import { Freezes, Rolling } from "./timing";
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
import { BLOCK_TAPS, blockDest, blockSource, KNOB_PAGES, MOD_SHORT, pageOf, paramLabel, TAP_NAMES, usesTable, WAVETABLE_KNOBS, type BlockId } from "./synth/blocks";
import { FACTORY_PRESETS, FADERS, PAD_PRESETS, loadUserPresets, presetValues, saveUserPresets, type Preset, type Rgb } from "../presets/presets";

export type MidiStatus = "idle" | "unsupported" | "denied" | "not-found" | "connected";
export type VizMode = "scope" | "spectrum";
export type View = "playground" | "synth" | "wavetable" | "about";
/** What Shift + encoder cycles through: the playground's two visualisers, then the Synth and Wavetable views. */
const SCREENS = ["scope", "spectrum", "synth", "wavetable"] as const;
const SCREEN_NAMES: Record<(typeof SCREENS)[number], string> = { scope: "Waveform", spectrum: "Spectrum", synth: "Synth", wavetable: "Wavetable" };
const EXPLAIN_KEY = "minilab3.explain";
const SCALE_KEY = "minilab3.scale";

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
export const SEQ_FADERS = ["Length", "Gate", "Rate", "Direction"] as const;

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

/** The two parts: Keys (what you play) and Sequencer (what the step sequencer plays). */
export type PartId = NoteOwner;
export const PART_NAMES: Record<PartId, string> = { keys: "Keys", seq: "Sequencer" };
/** The Sequencer part starts on this preset, so a bass line plays under the Keys part's sound. */
const SEQ_START_PRESET = "Round Bass";

/** One part's sound: the preset it is on, its current settings, and whether they were edited since. */
class PartState {
  presetIndex = $state(0);
  values = $state<ParamValues>(presetValues(FACTORY_PRESETS[0]));
  dirty = $state(false);
  /** A rolled Dice patch. While set, it is the current preset (not in the list until saved). */
  dicePreset = $state<Preset | null>(null);

  constructor(index: number) {
    this.presetIndex = index;
    this.values = presetValues(FACTORY_PRESETS[index]);
  }
}

export class Playground {
  readonly engine = new Engine();
  readonly seq = new Sequencer(this.engine, new WorkerClock());
  private midiWait = new Rolling(50);
  private freezes = new Freezes();

  presets = $state<Preset[]>([...FACTORY_PRESETS, ...loadUserPresets()]);
  /** Each part's sound. The knobs, faders, Synth view and preset browser edit the selected part. */
  readonly parts: Record<PartId, PartState> = {
    keys: new PartState(0),
    seq: new PartState(Math.max(0, FACTORY_PRESETS.findIndex((p) => p.name === SEQ_START_PRESET))),
  };
  part = $state<PartId>("keys");
  /** Preset highlighted by the encoder but not loaded yet. */
  browseIndex = $state<number | null>(null);

  /** Step mode: pads edit the drum loop (bank A = steps 1-8, bank B = 9-16) for one drum. */
  stepMode = $state(false);
  stepTrack = $state(0);
  /** Step under the playhead, as heard (not as scheduled). -1 when stopped. */
  playStep = $state(-1);
  /** Sequencer edit: knobs set step pitches, bank A pads switch steps, bank B pads set slides, faders set Length/Gate/Rate/Direction. */
  seqEdit = $state(false);
  noteSeq = $state<NoteSeqSettings>(defaultNoteSeq());
  /** Sequencer step under the playhead, as heard. -1 when stopped. */
  seqStep = $state(-1);
  /** Notes the sequencer is sounding right now, for the on-screen keyboard. */
  seqNotes = new SvelteSet<number>();
  /** While the sequencer plays: keys play notes (Play), move the sequence (Transpose), or both, split at C4 (Split). */
  keysMode = $state<KeysMode>("Play");
  /** Pad lights follow the audio spectrum instead of flashing on drum hits. */
  spectrumPads = $state(false);
  spectrumLevels = $state<number[]>(Array(8).fill(0));

  audioRunning = $state(false);
  /** CPU meter: the voice processor's share of the time available. */
  cpu = $state<CpuLoad>({ load: 0, peak: 0, voices: 0, units: 0, cuts: 0, clock: "" });
  timing = $state<TimingReport>({ midiAverage: null, midiWorst: null, longestFreeze: 0, sequencer: null });
  midiStatus = $state<MidiStatus>("idle");
  deviceName = $state("");
  program = $state<Program | null>(null);
  bank = $state<PadBank>("A");
  shift = $state(false);

  /** Notes sounding on the Keys part (with chord mode, every note of each chord). */
  notes = new SvelteSet<number>();
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
  explain = $state(localStorage.getItem(EXPLAIN_KEY) !== "off");

  /** Every wavetable, built-in then imported (a copy of WAVETABLES, replaced when it changes, for the UI). */
  tables = $state.raw<WavetableDef[]>([...WAVETABLES]);
  /** A WAV import in progress, and how the last one went. */
  importing = $state(false);
  importResult = $state<{ ok: boolean; text: string } | null>(null);
  /** The recipe being followed, if any, and whether the recipe list is open. */
  recipe = $state.raw<RecipeRun | null>(null);
  recipeList = $state(false);
  /** The "Draw a table" editor, while it is open. */
  tableEditor = $state.raw<TableEditor | null>(null);
  private draftTimer = 0;

  bpm = $state(120);
  drumsOn = $state(true);
  playing = $state(false);
  recording = $state(false);
  pattern = $state<Pattern>(basicBeat());

  private device: MiniLab | null = null;
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

  constructor() {
    this.seq.pattern = this.pattern;
    this.seq.onTrigger = (track, velocity, time) => {
      const delay = Math.max(0, (time - this.engine.ctx.currentTime) * 1000);
      setTimeout(() => this.flashPad(track, velocity), delay);
      setTimeout(() => this.flashPad(track, 0), delay + 90);
    };
    this.seq.onStep = (step, time) => {
      const delay = Math.max(0, (time - this.engine.ctx.currentTime) * 1000);
      setTimeout(() => this.movePlayhead(step), delay);
    };
    this.noteSequencer = new NoteSequencer(this.noteSeq, {
      noteOn: (note, velocity, time, slide) => {
        this.engine.noteOn(note, velocity, time, slide, "seq");
        this.atAudioTime(time, () => this.seqNotes.add(note));
      },
      noteOff: (note, time) => {
        this.engine.noteOff(note, time, "seq");
        this.atAudioTime(time, () => this.seqNotes.delete(note));
      },
    });
    this.noteSequencer.onStep = (step, time) => this.atAudioTime(time, () => this.moveSeqHead(step));
    this.noteSequencer.pitch = (note) => snapToScale(note, this.scale);
    this.seq.notes = this.noteSequencer;
    this.engine.setParams(this.parts.keys.values, "keys");
    this.engine.setParams(this.parts.seq.values, "seq");
    setInterval(() => (this.cpu = this.engine.cpu), 250);
    this.freezes.observe();
    setInterval(() => this.updateTiming(), 1000);
    this.engine.ctx.onstatechange = () => (this.audioRunning = this.engine.ctx.state === "running");
  }

  private updateTiming() {
    this.timing = {
      midiAverage: this.midiWait.average,
      midiWorst: this.midiWait.max,
      longestFreeze: this.freezes.longest(performance.now()),
      sequencer: this.playing ? this.seq.timing : null,
    };
  }

  // The selected part's sound: everything below reads and writes these.
  get presetIndex() {
    return this.parts[this.part].presetIndex;
  }
  set presetIndex(i: number) {
    this.parts[this.part].presetIndex = i;
  }
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
  get dicePreset() {
    return this.parts[this.part].dicePreset;
  }
  set dicePreset(p: Preset | null) {
    this.parts[this.part].dicePreset = p;
  }

  get preset(): Preset {
    return this.presetOf(this.part);
  }

  /** The preset a part is on. */
  presetOf(part: PartId): Preset {
    const s = this.parts[part];
    return s.dicePreset ?? this.presets[s.presetIndex];
  }

  /** Edit and show another part: the knobs, faders, Synth view and preset browser follow it. */
  selectPart(part: PartId) {
    if (part === this.part) return;
    this.part = part;
    this.engine.select(part);
    this.browseIndex = null;
    this.faderLive.fill(false);
    this.syncHardware();
    this.showMessage("Part", `${PART_NAMES[part]}: ${this.preset.name}`);
  }

  togglePart() {
    this.selectPart(this.part === "keys" ? "seq" : "keys");
  }

  async startAudio() {
    await Promise.all([this.engine.resume(), this.engine.ready]);
    this.audioRunning = this.engine.ctx.state === "running";
  }

  // ------------------------------------------------------------------ presets

  loadPreset(index: number) {
    const n = this.presets.length;
    this.presetIndex = ((index % n) + n) % n;
    this.browseIndex = null;
    this.dicePreset = null;
    this.values = presetValues(this.preset);
    this.dirty = false;
    this.engine.setParams(this.values);
    // Another sound on the Keys part: the recipe building it is over.
    if (this.part === "keys") this.stopRecipe();
    this.syncHardware();
  }

  saveAsUserPreset(name: string) {
    const preset: Preset = {
      ...$state.snapshot(this.preset),
      name: name.slice(0, 18),
      values: $state.snapshot(this.values),
    };
    delete preset.from;
    const user = [...loadUserPresets(), preset];
    saveUserPresets(user);
    this.presets = [...FACTORY_PRESETS, ...user];
    this.presetIndex = this.presets.length - 1;
    this.dicePreset = null;
    this.dirty = false;
    this.syncHardware();
  }

  isUserPreset(index?: number) {
    if (index === undefined) {
      if (this.dicePreset) return false;
      index = this.presetIndex;
    }
    return index >= FACTORY_PRESETS.length;
  }

  /** Roll a random patch and make it the current sound. */
  dice() {
    this.dicePreset = rollDice();
    this.browseIndex = null;
    this.values = presetValues(this.dicePreset);
    this.dirty = false;
    this.engine.setParams(this.values);
    if (this.part === "keys") this.stopRecipe();
    this.syncHardware();
  }

  deleteUserPreset() {
    if (!this.isUserPreset()) return;
    const deleted = this.presetIndex;
    const user = loadUserPresets();
    user.splice(deleted - FACTORY_PRESETS.length, 1);
    saveUserPresets(user);
    this.presets = [...FACTORY_PRESETS, ...user];
    // The other part keeps its sound; if it was on the deleted preset, it now counts as edited.
    const other = this.parts[this.part === "keys" ? "seq" : "keys"];
    if (other.presetIndex === deleted) other.dirty = true;
    if (other.presetIndex >= deleted) other.presetIndex = Math.max(0, Math.min(other.presetIndex - (other.presetIndex > deleted ? 1 : 0), this.presets.length - 1));
    this.loadPreset(Math.min(this.presetIndex, this.presets.length - 1));
  }

  // ------------------------------------------------------------------ parameters

  setParam(id: ParamId, value: number) {
    this.values[id] = value;
    this.engine.setParam(id, value);
    this.dirty = true;
    this.touched = { param: id, at: performance.now() };
    this.recipe?.changed();
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
    if (!id) return;
    this.setParam(id, fromControl(id, t));
    this.popup(id, cc);
  }

  setFader(i: number, t: number, cc?: number) {
    const id = FADERS[i];
    this.setParam(id, fromControl(id, t));
    this.popup(id, cc);
  }

  // ------------------------------------------------------------------ playing

  noteOn(note: number, velocity: number) {
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
      this.engine.noteOn(n, velocity);
      this.notes.add(n);
    }
    if (plays.length > 1) {
      const name = chordName(plays, this.scale);
      if (name) this.showMessage("Chord", name);
    }
    this.notesChanged(true);
    this.recipe?.notePlayed(note, this.notes.size);
  }

  noteOff(note: number) {
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
      this.engine.noteOff(n);
      this.notes.delete(n);
    }
    this.notesChanged(false);
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
    // The same notes, named for the new key (spelling and numbers change).
    if (this.chord) this.chord = detectChord(this.chordNotes, this.scale);
    try {
      localStorage.setItem(SCALE_KEY, JSON.stringify(this.scale));
    } catch {
      // Not saved (private window): it still works until the page closes.
    }
    const s = this.scale;
    if ("chords" in change && s.scale !== "off") this.showMessage("Chords", CHORD_MODE_NAMES[s.chords]);
    else this.showMessage("Scale", s.scale === "off" ? "off" : `${ROOT_NAMES[s.root]} ${SCALES[s.scale].name}`);
    this.realignKnobs();
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
    this.browseIndex = null;
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
    if (row[step]) this.engine.drums.trigger(this.stepTrack, row[step]);
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
    this.browseIndex = null;
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
      this.engine.noteOn(n, 100, now, false, "seq");
      this.engine.noteOff(n, now + AUDITION_S, "seq");
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
    return [(s.length - 1) / (NOTE_STEPS - 1), (s.gate - 0.05) / 0.95, s.rate / (RATES.length - 1), s.direction / (DIRECTIONS.length - 1)][i];
  }

  seqFaderDisplay(i: number) {
    const s = this.noteSeq;
    return [`${s.length} steps`, `${Math.round(s.gate * 100)}%`, RATES[s.rate].name, DIRECTIONS[s.direction]][i];
  }

  setSeqFader(i: number, t: number, cc?: number) {
    const s = this.noteSeq;
    if (i === 0) {
      s.length = 1 + Math.round(t * (NOTE_STEPS - 1));
      if (this.seqEdit) this.syncPadLeds();
    } else if (i === 1) s.gate = 0.05 + t * 0.95;
    else if (i === 2) s.rate = Math.round(t * (RATES.length - 1));
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
      this.engine.noteOn(this.auditionNote, 100, undefined, false, "seq");
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
    if (this.auditionNote !== null) this.engine.noteOff(this.auditionNote, undefined, "seq");
    this.auditionNote = null;
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
    this.seq.recording = this.recording;
    if (this.recording && !this.playing) this.play();
    this.syncTransportLeds();
    this.showHome();
  }

  clearPattern() {
    this.pattern = emptyPattern();
    this.seq.pattern = this.pattern;
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

  /** Shift + knob: each click of the knob is 1 BPM, measured from the parked middle position. */
  private tempoKnob(i: number, value: number, cc: number) {
    const delta = value - KNOB_PARK;
    if (delta === 0) return;
    this.setBpm(this.bpm + delta);
    this.device?.send(knobValueMessage(i, KNOB_PARK), `knob-${i}`);
    this.device?.send(parameterMessage(cc, "Tempo", `${this.bpm} BPM`), "display");
  }

  private parkKnobs() {
    for (let i = 0; i < 8; i++) this.device?.send(knobValueMessage(i, KNOB_PARK), `knob-${i}`);
  }

  /** Shift + encoder: Waveform -> Spectrum -> Synth -> Wavetable. */
  cycleScreen(delta: number) {
    // The About page isn't one of the screens: from there, Shift + encoder starts over from the playground.
    const current = this.view === "playground" || this.view === "about" ? this.vizMode : this.view;
    const next = SCREENS[(SCREENS.indexOf(current) + delta + SCREENS.length) % SCREENS.length];
    if (next === "synth" || next === "wavetable") this.setView(next);
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
    if (!usesTable(this.values)) this.setParam("osc1Wave", TABLE_WAVE);
    this.setParam("wtTable", id);
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
    this.engine.tablesChanged(id, oldCount);
    for (const owner of ["keys", "seq"] as const) {
      const part = this.parts[owner];
      if (part.values.wtTable === id) part.dirty = true;
      const next = idAfterRemoval(part.values.wtTable, id);
      if (next !== part.values.wtTable) {
        part.values.wtTable = next;
        this.engine.setParam("wtTable", next, owner);
      }
      if (part.dicePreset?.values.wtTable !== undefined) part.dicePreset.values.wtTable = idAfterRemoval(part.dicePreset.values.wtTable, id);
    }
    const user = loadUserPresets();
    const changed = user.filter((p) => p.values.wtTable !== undefined && p.values.wtTable >= id);
    for (const p of changed) p.values.wtTable = idAfterRemoval(p.values.wtTable!, id);
    if (changed.length) {
      saveUserPresets(user);
      this.presets = [...FACTORY_PRESETS, ...user];
    }
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
    this.dicePreset = initPreset(recipe);
    this.browseIndex = null;
    this.values = presetValues(this.dicePreset);
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
    if (run?.done && this.parts.keys.dicePreset?.from === "recipe") this.parts.keys.dicePreset = { ...this.parts.keys.dicePreset, name: run.recipe.name };
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
      what = { note: "Play a note", low: "Play a low note", chord: "Play a chord" }[play];
    }
    return [`Step ${run.index + 1}/${run.total}`, what];
  }

  setView(view: View) {
    if (this.view === view) return;
    this.view = view;
    this.patch = null;
    if (view !== "synth") this.listenTo(null);
    this.realignKnobs();
  }

  /** Hear one stage on its own; the same stage again (or null) returns to the full sound. */
  listenTo(tap: ListenTap | null) {
    this.listening = tap === this.listening ? null : tap;
    this.engine.listen(this.listening);
    this.showMessage("Listen", this.listening ? TAP_NAMES[this.listening] : "full sound");
  }

  setExplain(on: boolean) {
    this.explain = on;
    localStorage.setItem(EXPLAIN_KEY, on ? "on" : "off");
  }

  /** What the 8 hardware knobs control right now. */
  get knobParams(): (ParamId | null)[] {
    if (this.view === "wavetable") return WAVETABLE_KNOBS;
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
  addRoute(src = MOD_SOURCES.indexOf("velocity"), dst = MOD_DESTS.indexOf("cutoff"), amount = 0.5) {
    let n = 1;
    while (n < MOD_SLOTS && MOD_SOURCES[this.values[slotIds(n).src]] !== "off") n++;
    const ids = slotIds(n);
    this.setParam(ids.src, src);
    this.setParam(ids.dst, dst);
    this.setParam(ids.amt, amount);
    this.focus("matrix");
    this.showMessage(`Route ${n}`, `${MOD_SHORT[MOD_SOURCES[src]]}>${MOD_SHORT[MOD_DESTS[dst]]}`);
    this.realignKnobs();
    return n;
  }

  removeRoute(n: number) {
    const ids = slotIds(n);
    this.setParam(ids.src, 0);
    this.setParam(ids.amt, 0);
    this.realignKnobs();
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
  browse(delta: number) {
    const n = this.presets.length;
    const from = this.browseIndex ?? this.presetIndex;
    this.browseIndex = (((from + delta) % n) + n) % n;
    const p = this.presets[this.browseIndex];
    this.sendDisplay(`${this.browseIndex + 1}/${n} ${p.category}`, `> ${p.name}`);
    clearTimeout(this.browseTimer);
    this.browseTimer = window.setTimeout(() => {
      this.browseIndex = null;
      this.showHome();
    }, BROWSE_TIMEOUT_MS);
  }

  confirmBrowse() {
    clearTimeout(this.browseTimer);
    if (this.browseIndex !== null) this.loadPreset(this.browseIndex);
  }

  // ------------------------------------------------------------------ QWERTY fallback

  private static KEYMAP = "awsedftgyhujkolp;'";
  private keyOctave = 0;

  handleKey(e: KeyboardEvent, down: boolean) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (down && (k === "z" || k === "x")) {
      this.keyOctave = Math.max(-3, Math.min(3, this.keyOctave + (k === "z" ? -1 : 1)));
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
        if (e.on && this.shift) {
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
        if (this.seqEdit) {
          if (this.pickedUp(e.index, t, this.seqFaderPosition(e.index), cc, SEQ_FADERS[e.index])) this.setSeqFader(e.index, t, cc);
          return;
        }
        const id = FADERS[e.index];
        if (this.pickedUp(e.index, t, toControl(id, this.values[id]), cc, PARAMS[id].label)) this.setFader(e.index, t, cc);
        return;
      }
      case "pitchBend":
        return this.setBend(e.value);
      case "mod":
        return this.setMod(e.value / 127);
      case "pad":
        if (e.bank !== this.bank) {
          this.bank = e.bank;
          this.syncPadLeds();
        }
        if (e.bank === "B" && !this.stepMode && !this.seqEdit) {
          if (e.on) this.loadPreset(PAD_PRESETS[e.index]);
          return;
        }
        return e.on ? this.hitPad(e.index, e.velocity) : this.releasePad(e.index);
      case "encoder":
        if (e.shifted || this.shift) return this.cycleScreen(e.delta);
        if (this.stepMode) return this.selectTrack(this.stepTrack + e.delta);
        if (this.view === "wavetable") return this.stepTable(e.delta);
        return this.view === "synth" ? this.cycleFocus(e.delta) : this.browse(e.delta);
      case "encoderClick":
        return this.encoderClick(e.pressed, e.shifted || this.shift);
      case "shift":
        this.shift = e.pressed;
        // Shift + any knob turns the tempo. The knobs are parked in the middle so they can turn either way
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

  /** Click: load the browsed preset. Long press: Dice. Shift + click: step mode. */
  private encoderClick(pressed: boolean, shifted: boolean) {
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
    if (this.seqEdit && this.browseIndex === null) return this.cycleKeysMode();
    // In the Synth view, a click listens to the selected block (if it has a signal to hear).
    if (this.view === "synth" && this.browseIndex === null) {
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
      const value = id ? Math.round(toControl(id, this.values[id]) * 127) : 0;
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
    LED_IDS.padsB.forEach((id, i) => {
      const p = this.presets[PAD_PRESETS[i]];
      this.sendLed(id, dim(p.color, PAD_PRESETS[i] === this.presetIndex && !this.dicePreset ? 1 : 0.15));
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
      displayMessage(line1, line2, { transport: this.recording ? "record" : this.playing ? "play" : "none" }),
      "display",
    );
  }

  showHome() {
    if (this.recipe) return this.sendDisplay(...this.recipeScreen());
    const n = this.presets.length;
    const where = this.dicePreset ? (this.dicePreset.from === "recipe" ? "Recipe" : "Dice") : `${this.presetIndex + 1}/${n}`;
    this.sendDisplay(`${this.part === "keys" ? "Keys" : "Seq"} ${where}`, this.preset.name);
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
