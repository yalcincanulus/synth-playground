import { Drums } from "./drums";
import { Fx } from "./fx";
import type { Lfo } from "./lfo";
import { DELAY_DIV_BEATS, DELAY_MODES, type ModSource, type ParamId, type ParamValues } from "./params";
import { Part, type PartTapId, type VoiceState } from "./part";
import workletUrl from "./synth.worklet.ts?worker&url";
import type { NoteOwner } from "./voice";
import { CpuGuard, pickVictim } from "./voiceLimit";
import { buildMips, FRAMES, tableFrames, WAVETABLES } from "./wavetables";

export { LFO_AMP, LFO_FILTER_CENTS, LFO_PITCH_CENTS, LFO_POSITION, LFO_WIDTH } from "./dsp/lfo";
export type { VoiceState } from "./part";

export const BEND_RANGE_CENTS = 200;

/** Points in the sound you can see and hear on their own: the selected part's stages, then the shared effects. */
export type TapId = PartTapId | "delay" | "reverb" | "out";

/** Taps you can listen to on their own ("out" is the normal full sound). */
export type ListenTap = Exclude<TapId, "out">;
const LISTEN_GAIN = 0.3;

/** CPU meter, from the audio thread: the voice processors (every note, the LFOs). The effects are the browser's own nodes. */
export interface CpuLoad {
  /** Share of the available time spent in our audio code, averaged over the last report (0..1+). */
  load: number;
  /**
   * The busiest single block in that time, as a share of one block's time (above 1 means a dropout).
   * Only meaningful with the "performance" clock: Chrome's worklets only have Date.now(), whole milliseconds.
   */
  peak: number;
  /** Most voices sounding at once in that time (both parts). */
  voices: number;
  /** Their average weight (see voiceWeight). */
  units: number;
  /** Notes cut so far because the CPU was close to its limit. */
  cuts: number;
  /** "performance" (precise) or "date" (whole milliseconds; `load` is still right on average, and smoothed). */
  clock: string;
}

/** With no report for this long, nothing is playing: the meter reads zero. */
const CPU_STALE_MS = 600;

export class Engine {
  readonly fx: Fx;
  readonly drums: Drums;
  readonly analyser: AnalyserNode;
  /** Resolves when the voice processors have loaded; notes before that are ignored. */
  readonly ready: Promise<void>;
  /** Receives prepared wavetables for the oscillators (see synth.worklet.ts). */
  private tableLoader: AudioWorkletNode | null = null;
  private tablesSent = new Set<number>();

  /** Two sounds at once: Keys (what you play) and Sequencer (what the step sequencer plays). */
  readonly parts: Record<NoteOwner, Part>;
  /** The part being edited and shown (the knobs, the Synth view, the presets). */
  selected: NoteOwner = "keys";

  private cpuReport: CpuLoad = { load: 0, peak: 0, voices: 0, units: 0, cuts: 0, clock: "" };
  private cpuGuard = new CpuGuard();
  private cpuCuts = 0;
  private cpuAt = 0;
  bpm = 120;

  private listenGain: GainNode;
  private listening: ListenTap | null = null;
  private listenNode: AudioNode | null = null;
  private bend = 0;
  private mod = 0;
  private sharedTaps: Record<"delay" | "reverb" | "out", AnalyserNode>;

  /**
   * `ctx` is normally a live AudioContext. The render check passes an OfflineAudioContext (cast):
   * the engine uses nothing an offline context lacks, apart from resume().
   */
  constructor(readonly ctx: AudioContext = new AudioContext({ latencyHint: "interactive" })) {
    this.fx = new Fx(ctx);
    this.analyser = this.fx.analyser;
    const engine = this;
    const host = {
      ctx,
      get bpm() {
        return engine.bpm;
      },
      makeRoom: (part: Part, weight: number, t: number) => this.makeRoom(part, weight, t),
      changed: (part: Part) => this.partChanged(part),
    };
    this.parts = { keys: new Part(host, "keys", this.fx.addPart()), seq: new Part(host, "seq", this.fx.addPart()) };

    this.ready = ctx.audioWorklet.addModule(workletUrl).then(() => {
      this.tableLoader = new AudioWorkletNode(ctx, "table-loader", { numberOfInputs: 0, numberOfOutputs: 1 });
      this.tableLoader.port.onmessage = (e) => e.data.cpu && this.cpuReported(e.data.cpu);
      for (const part of this.allParts) this.loadTable(part.params.wtTable);
      // One seed for both parts' random LFOs, picked here so a seeded render (render check) repeats them.
      const seed = Math.floor(Math.random() * 2 ** 32);
      this.parts.keys.start(seed);
      this.parts.seq.start(seed ^ 0x5eed);
      // The rest in the background (about 15 ms each), so switching tables later is instant.
      WAVETABLES.forEach((_, i) => setTimeout(() => this.loadTable(i), 300 + i * 80));
    });

    // The drums' noise.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const tap = () => new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.6 });
    this.sharedTaps = { delay: tap(), reverb: tap(), out: this.fx.analyser };
    this.fx.delayOut.connect(this.sharedTaps.delay);
    this.fx.reverbOut.connect(this.sharedTaps.reverb);

    // "Listen here": a tap is routed to its own quiet, limited output while the main output is muted.
    this.listenGain = new GainNode(ctx, { gain: LISTEN_GAIN });
    const listenLimiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.15 });
    this.listenGain.connect(listenLimiter).connect(ctx.destination);

    this.drums = new Drums(ctx, this.fx.drumIn, noise);
    for (const part of this.allParts) part.apply();
  }

  resume() {
    return this.ctx.resume();
  }

  private get allParts() {
    return [this.parts.keys, this.parts.seq];
  }

  /** The selected part. */
  get part(): Part {
    return this.parts[this.selected];
  }

  /** Edit and show another part. */
  select(owner: NoteOwner) {
    this.selected = owner;
    // Keep listening to the same stage, now of this part.
    if (this.listening) this.listen(this.listening);
  }

  /**
   * Resolves once both voice processors have every message sent so far (or after `timeoutMs`).
   * The render check waits for this before rendering, since notes are messages, not automation.
   */
  async flush(timeoutMs = 500): Promise<void> {
    await Promise.all(this.allParts.map((p) => p.flush(timeoutMs)));
  }

  get cpu(): CpuLoad {
    if (performance.now() - this.cpuAt > CPU_STALE_MS) return { ...this.cpuReport, load: 0, peak: 0, voices: 0, units: 0, cuts: this.cpuCuts };
    return { ...this.cpuReport, cuts: this.cpuCuts };
  }

  private cpuReported(cpu: Omit<CpuLoad, "cuts">) {
    const fresh = performance.now() - this.cpuAt < CPU_STALE_MS;
    const load = fresh ? this.cpuReport.load * 0.6 + cpu.load * 0.4 : cpu.load;
    this.cpuReport = { ...cpu, load, cuts: this.cpuCuts };
    this.cpuAt = performance.now();
    this.cpuGuard.report(cpu.load, cpu.units);
    // Over the limit despite the budget (say a route was added to held notes): cut a note now.
    if (this.cpuGuard.overloaded(cpu.load)) this.cutForCpu(this.ctx.currentTime);
  }

  /** Send every wavetable to the audio thread now (the render check needs them before rendering starts). */
  loadAllTables() {
    WAVETABLES.forEach((_, i) => this.loadTable(i));
  }

  // --- parameters (of the selected part unless another is named)

  /** The selected part's settings. */
  get params(): ParamValues {
    return this.part.params;
  }

  setParams(values: ParamValues, owner = this.selected) {
    this.parts[owner].setParams(values);
  }

  setParam(id: ParamId, value: number, owner = this.selected) {
    this.parts[owner].setParam(id, value);
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    for (const part of this.allParts) part.applyLfo();
    this.partChanged(this.parts.keys);
  }

  /** Pitch bend, -1..1. Your playing controls (bend, mod strip) move the Keys part. */
  setBend(value: number) {
    this.bend = value * BEND_RANGE_CENTS;
    this.parts.keys.setControls(this.bend, this.mod);
  }

  /** The mod strip, 0..1. */
  setMod(value: number) {
    this.mod = value;
    this.parts.keys.setControls(this.bend, this.mod);
  }

  /** A part's settings changed. The shared effects (delay time and feedback, room size) follow the Keys part. */
  private partChanged(part: Part) {
    this.loadTable(part.params.wtTable);
    if (part !== this.parts.keys) return;
    const p = part.params;
    this.fx.setShared({
      delaySeconds: (60 / this.bpm) * DELAY_DIV_BEATS[p.delayDiv],
      delayFeedback: p.delayFeedback,
      pingPong: DELAY_MODES[p.delayMode] === "ping-pong",
      reverbMix: p.reverbMix,
      reverbSize: p.reverbSize,
      reverbDamping: p.reverbDamping,
    });
  }

  /** Prepare a wavetable's mipmaps and hand them to the audio thread, once per table. */
  private loadTable(id: number) {
    if (!this.tableLoader || this.tablesSent.has(id)) return;
    this.tablesSent.add(id);
    const levels = buildMips(tableFrames(id));
    this.tableLoader.port.postMessage({ id, frames: FRAMES, levels }, levels.map((l) => l.buffer));
  }

  // --- live state of the selected part, for visualisation

  get lfos(): [Lfo, Lfo] {
    return this.part.lfos;
  }

  /** The selected part's stages and the shared effects. */
  get taps(): Record<TapId, AnalyserNode> {
    return { ...this.part.taps, ...this.sharedTaps };
  }

  lfoRate(i: number) {
    return this.part.lfoRate(i);
  }

  lfoDepths(i: number) {
    return this.part.lfoDepths(i);
  }

  modSourceValue(source: ModSource): number | null {
    return this.part.modSourceValue(source);
  }

  livePosition() {
    return this.part.livePosition();
  }

  voiceStates(): VoiceState[] {
    return this.part.voiceStates();
  }

  get modAmount() {
    return this.part.modAmount;
  }

  /** Where audio is going: null is the normal output, otherwise one tap on its own. */
  get listeningTo() {
    return this.listening;
  }

  listen(tap: ListenTap | null) {
    this.listenNode?.disconnect(this.listenGain);
    this.listening = tap;
    this.listenNode = tap ? this.taps[tap] : null;
    this.listenNode?.connect(this.listenGain);
    this.fx.setMuted(tap !== null);
  }

  // --- notes

  /**
   * `at` schedules the note ahead (the step sequencer does this); it defaults to now.
   * `slide` glides into the note on mono presets even when the preset's Glide is 0.
   * `owner` is the part that plays it: your keys, or the step sequencer.
   */
  noteOn(note: number, velocity: number, at?: number, slide = false, owner: NoteOwner = "keys") {
    this.parts[owner].noteOn(note, velocity, Math.max(at ?? 0, this.ctx.currentTime), slide);
  }

  noteOff(note: number, at?: number, owner: NoteOwner = "keys") {
    this.parts[owner].noteOff(note, Math.max(at ?? 0, this.ctx.currentTime));
  }

  allNotesOff() {
    for (const part of this.allParts) part.allNotesOff();
  }

  get activeVoices() {
    return this.parts.keys.activeVoices + this.parts.seq.activeVoices;
  }

  /** Total weight of every sounding voice, both parts. */
  private weight() {
    return this.allParts.reduce((sum, part) => sum + part.voices.reduce((s, v) => s + v.weight, 0), 0);
  }

  /**
   * Before a part starts a voice: keep within its Max Voices (cutting its own notes), and within what
   * the CPU can make without crackling (cutting from either part).
   */
  private makeRoom(part: Part, weight: number, t: number) {
    const max = Math.round(part.params.maxVoices);
    while (part.voices.length >= max) if (!this.cutFrom([part], t)) break;
    while (this.weight() + weight > this.cpuGuard.budget) {
      if (!this.cutForCpu(t)) break;
    }
  }

  /** Cut one note to save CPU. A mono part's single voice is cut only when nothing else is left. */
  private cutForCpu(t: number) {
    const poly = this.allParts.filter((p) => !p.mono && p.voices.length);
    const cut = this.cutFrom(poly.length ? poly : this.allParts, t);
    if (cut) this.cpuCuts++;
    return cut;
  }

  /** Fade out the voice pickVictim chooses among these parts' voices. */
  private cutFrom(parts: Part[], t: number): boolean {
    const voices = parts.flatMap((p) => p.voices);
    const victim = pickVictim(voices, (v) => this.parts[v.owner].level(v, t));
    if (!victim) return false;
    this.parts[victim.owner].cut(victim, t);
    return true;
  }
}
