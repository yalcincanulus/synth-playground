import { SvelteSet } from "svelte/reactivity";
import { DRUM_NAMES } from "../audio/drums";
import { Engine } from "../audio/engine";
import { formatValue, fromControl, PARAMS, toControl, type ParamId, type ParamValues } from "../audio/params";
import { Sequencer, type Pattern, basicBeat, emptyPattern } from "../audio/sequencer";
import { findPorts, isMainPort, MiniLab, requestMidi } from "../minilab/device";
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
import { FACTORY_PRESETS, FADERS, loadUserPresets, presetValues, saveUserPresets, type Preset, type Rgb } from "../presets/presets";

export type MidiStatus = "idle" | "unsupported" | "denied" | "not-found" | "connected";
export type VizMode = "scope" | "spectrum";
const VIZ_MODES: VizMode[] = ["scope", "spectrum"];

const BROWSE_TIMEOUT_MS = 4000;
const LONG_PRESS_MS = 500;
const SPECTRUM_INTERVAL_MS = 50;
/** Spectrum pad bands: 8 log-spaced bands between these frequencies. */
const SPECTRUM_LOW_HZ = 40;
const SPECTRUM_HIGH_HZ = 14000;
const dim = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];

export class Playground {
  readonly engine = new Engine();
  readonly seq = new Sequencer(this.engine);

  presets = $state<Preset[]>([...FACTORY_PRESETS, ...loadUserPresets()]);
  presetIndex = $state(0);
  values = $state<ParamValues>(presetValues(FACTORY_PRESETS[0]));
  dirty = $state(false);
  /** Preset highlighted by the encoder but not loaded yet. */
  browseIndex = $state<number | null>(null);
  /** A rolled Dice patch. While set, it is the current preset (not in the list until saved). */
  dicePreset = $state<Preset | null>(null);

  /** Step mode: pads edit the drum loop (bank A = steps 1-8, bank B = 9-16) for one drum. */
  stepMode = $state(false);
  stepTrack = $state(0);
  /** Step under the playhead, as heard (not as scheduled). -1 when stopped. */
  playStep = $state(-1);
  /** Pad lights follow the audio spectrum instead of flashing on drum hits. */
  spectrumPads = $state(false);
  spectrumLevels = $state<number[]>(Array(8).fill(0));

  audioRunning = $state(false);
  midiStatus = $state<MidiStatus>("idle");
  deviceName = $state("");
  program = $state<Program | null>(null);
  bank = $state<PadBank>("A");
  shift = $state(false);

  notes = new SvelteSet<number>();
  padLevels = $state<number[]>(Array(8).fill(0));
  mod = $state(0);
  bend = $state(0);
  /** Last control touched, for highlighting in the UI. */
  touched = $state<{ param: ParamId; at: number } | null>(null);
  vizMode = $state<VizMode>("scope");

  bpm = $state(120);
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
    this.engine.setParams(this.values);
    this.engine.ctx.onstatechange = () => (this.audioRunning = this.engine.ctx.state === "running");
  }

  get preset(): Preset {
    return this.dicePreset ?? this.presets[this.presetIndex];
  }

  async startAudio() {
    await this.engine.resume();
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
    this.syncHardware();
  }

  saveAsUserPreset(name: string) {
    const preset: Preset = {
      ...$state.snapshot(this.preset),
      name: name.slice(0, 18),
      values: $state.snapshot(this.values),
    };
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
    this.syncHardware();
  }

  deleteUserPreset() {
    if (!this.isUserPreset()) return;
    const user = loadUserPresets();
    user.splice(this.presetIndex - FACTORY_PRESETS.length, 1);
    saveUserPresets(user);
    this.presets = [...FACTORY_PRESETS, ...user];
    this.loadPreset(Math.min(this.presetIndex, this.presets.length - 1));
  }

  // ------------------------------------------------------------------ parameters

  setParam(id: ParamId, value: number) {
    this.values[id] = value;
    this.engine.setParam(id, value);
    this.dirty = true;
    this.touched = { param: id, at: performance.now() };
  }

  /** Knob i to control position t (0..1). `cc` is set when it came from the hardware. */
  setKnob(i: number, t: number, cc?: number) {
    const id = this.preset.knobs[i];
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
    this.engine.noteOn(note, velocity);
    this.notes.add(note);
  }

  noteOff(note: number) {
    this.engine.noteOff(note);
    this.notes.delete(note);
  }

  hitPad(i: number, velocity: number) {
    if (this.stepMode) return this.tapStep(i + (this.bank === "B" ? 8 : 0), velocity);
    this.engine.drums.trigger(i, velocity);
    this.seq.record(i, velocity);
    this.flashPad(i, velocity);
  }

  releasePad(i: number) {
    if (this.stepMode) return;
    this.flashPad(i, 0);
  }

  // ------------------------------------------------------------------ step mode

  toggleStepMode() {
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
    if (!this.device || this.stepMode) return;
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

  cycleViz(delta: number) {
    const i = VIZ_MODES.indexOf(this.vizMode);
    this.vizMode = VIZ_MODES[(i + delta + VIZ_MODES.length) % VIZ_MODES.length];
    this.showMessage("View", this.vizMode);
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
        return e.on ? this.noteOn(e.note, e.velocity) : this.noteOff(e.note);
      case "knob":
        this.notePrgm(e.program);
        return this.setKnob(e.index, e.value / 127, CC_MAPS[e.program].knobs[e.index]);
      case "fader":
        this.notePrgm(e.program);
        return this.setFader(e.index, e.value / 127, CC_MAPS[e.program].faders[e.index]);
      case "pitchBend":
        return this.setBend(e.value);
      case "mod":
        return this.setMod(e.value / 127);
      case "pad":
        if (e.bank !== this.bank) {
          this.bank = e.bank;
          this.syncPadLeds();
        }
        if (e.bank === "B" && !this.stepMode) {
          if (e.on && e.index < this.presets.length) this.loadPreset(e.index);
          return;
        }
        return e.on ? this.hitPad(e.index, e.velocity) : this.releasePad(e.index);
      case "encoder":
        if (e.shifted || this.shift) return this.cycleViz(e.delta);
        return this.stepMode ? this.selectTrack(this.stepTrack + e.delta) : this.browse(e.delta);
      case "encoderClick":
        return this.encoderClick(e.pressed, e.shifted || this.shift);
      case "shift":
        this.shift = e.pressed;
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
        return this.toggleStepMode();
      }
      clearTimeout(this.longPressTimer);
      this.longPressTimer = window.setTimeout(() => {
        this.longPressFired = true;
        this.dice();
      }, LONG_PRESS_MS);
      return;
    }
    clearTimeout(this.longPressTimer);
    if (!this.longPressFired) this.confirmBrowse();
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
    // Move the device's stored knob values to the preset, so the next turn doesn't jump.
    this.preset.knobs.forEach((id, i) => {
      this.device!.send(knobValueMessage(i, Math.round(toControl(id, this.values[id]) * 127)), `knob-${i}`);
    });
  }

  private syncPadLeds() {
    if (!this.device) return;
    if (this.stepMode) {
      for (let step = 0; step < 16; step++) this.paintStep(step);
      return;
    }
    this.spectrumSent.fill(-1);
    LED_IDS.padsA.forEach((id, i) => this.sendLed(id, this.spectrumPads ? [0, 0, 0] : this.drumColor(i)));
    LED_IDS.padsB.forEach((id, i) => {
      const p = this.presets[i];
      this.sendLed(id, p ? dim(p.color, i === this.presetIndex && !this.dicePreset ? 1 : 0.15) : [0, 0, 0]);
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
    if (this.bank !== "A" || this.stepMode || this.spectrumPads) return;
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
    const n = this.presets.length;
    const where = this.dicePreset ? "Dice" : `${this.presetIndex + 1}/${n}`;
    this.sendDisplay(`${where} ${this.preset.category}`, this.preset.name);
  }

  private messageTimer = 0;
  private showMessage(line1: string, line2: string) {
    this.sendDisplay(line1, line2);
    clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.showHome(), 1500);
  }

  private popup(id: ParamId, cc?: number) {
    if (cc === undefined || !this.device) return;
    this.device.send(parameterMessage(cc, PARAMS[id].label, formatValue(id, this.values[id])), "display");
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
