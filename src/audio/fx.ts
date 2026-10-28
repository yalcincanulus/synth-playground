import type { SlotKind } from "./dsp/effects";
import { CHORUS_DELAY, CHORUS_DEPTH, CHORUS_LINES, CHORUS_RATE, reverbImpulse, triangleWave } from "./fxShapes";
import { DELAY_DIV_BEATS, DELAY_MODES, effectChain, EFFECTS, type Effect, type ParamValues } from "./params";
import { CLIP_RANGE, softClipCurve } from "./softClip";

/**
 * Effects and master chain. Each part (see part.ts) has its own effects, in its own order (PartFx), and a
 * mixer strip (Strip: the Song view's volume, pan and mute; it does nothing on the Play view's parts):
 *
 *   part -> volume -> effect -> effect -> ... -> strip --+--> master -> limiter -> soft clipper -> analyser -> destination
 *   drumIn ----------------------------------------------+   (and a little of the Keys part's reverb)
 *   drum track -> strip ---------------------------------+
 */
export class Fx {
  readonly drumIn: GainNode;
  readonly analyser: AnalyserNode;
  /** The final sound's left and right channels, for the stereo meter. */
  readonly meters: { left: AnalyserNode; right: AnalyserNode };

  private master: GainNode;
  private mute: GainNode;
  private drumReverbSend: GainNode;
  private drumReverbPart: PartFx | null = null;
  private parts: PartFx[] = [];

  constructor(private ctx: AudioContext) {
    this.master = new GainNode(ctx);
    // The drums play at the level the old shared master gave them at the default volume (0.7, squared).
    this.drumIn = new GainNode(ctx, { gain: 0.49 });
    this.drumIn.connect(this.master);
    this.drumReverbSend = new GainNode(ctx, { gain: 0 });
    this.drumIn.connect(this.drumReverbSend);

    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.15 });
    this.analyser = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0.75 });
    // The soft clipper (softClip.ts): its curve covers ±CLIP_RANGE, so the signal is scaled into the
    // shaper's -1..1 input range. Oversampled, because bending peaks makes new high harmonics.
    const clipIn = new GainNode(ctx, { gain: 1 / CLIP_RANGE });
    const clipper = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: "4x" });
    this.mute = new GainNode(ctx);
    this.master.connect(limiter).connect(clipIn).connect(clipper).connect(this.analyser).connect(this.mute).connect(ctx.destination);
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const meter = () => new AnalyserNode(ctx, { fftSize: 2048, channelCount: 1, channelCountMode: "explicit" });
    this.meters = { left: meter(), right: meter() };
    clipper.connect(split);
    split.connect(this.meters.left, 0);
    split.connect(this.meters.right, 1);
  }

  /** The final sound, as it goes to the speakers (silent while "Listen here" mutes it). */
  get output(): AudioNode {
    return this.mute;
  }

  /** A new part's effects. */
  addPart(): PartFx {
    const part = new PartFx(this.ctx, this.master);
    this.parts.push(part);
    return part;
  }

  /** A removed part's effects: disconnected, and our own effects' processors stopped for good. */
  removePart(part: PartFx) {
    part.close();
    this.parts = this.parts.filter((p) => p !== part);
    if (this.drumReverbPart === part) {
      this.drumReverbSend.disconnect(part.reverbIn);
      this.drumReverbPart = null;
    }
  }

  /**
   * A drum kit's own way to the master, for the Song view's drum track: the same level as the Play view's
   * drums (and a little of the Keys part's reverb), through its own strip.
   */
  addDrumBus(): { input: GainNode; strip: Strip } {
    const strip = new Strip(this.ctx, this.master);
    const input = new GainNode(this.ctx, { gain: this.drumIn.gain.value });
    input.connect(strip.input);
    strip.output.connect(this.drumReverbSend);
    return { input, strip };
  }

  /** Silence the main output (the output analyser still sees the signal). */
  setMuted(muted: boolean) {
    this.mute.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  /** The drums' reverb: `level` of `part`'s reverb (the Keys part's; 0 when its reverb is off). */
  setDrumReverb(part: PartFx, level: number) {
    if (this.drumReverbPart !== part) {
      if (this.drumReverbPart) this.drumReverbSend.disconnect(this.drumReverbPart.reverbIn);
      this.drumReverbSend.connect(part.reverbIn);
      this.drumReverbPart = part;
    }
    this.drumReverbSend.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
  }

  /** Apply debounced reverb changes now (the render check needs the preset's reverb from the first sample). */
  settle() {
    for (const part of this.parts) part.settle();
  }
}

/** One effect in a part's chain. */
interface Unit {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** What "Listen here" hears: the effect's output, or for the delay and reverb only what they add. */
  readonly tapFrom: AudioNode;
  /** The settings, from audio time `at` (now when not given; automation plans them ahead). */
  set(p: ParamValues, bpm: number, at?: number): void;
}

const gain = (ctx: BaseAudioContext, g: number) => new GainNode(ctx, { gain: g });

/** The quietest a strip's volume goes before it is off, in dB. */
export const STRIP_MIN_DB = -40;

/** A mixer strip: volume (dB), pan and mute, with a level meter made when first asked for. */
export class Strip {
  readonly input: GainNode;
  readonly output: StereoPannerNode;
  private meterNode: AnalyserNode | null = null;
  private volume = 0;
  private pan = 0;
  private muted = false;
  /** Automation: the volume (dB) and pan a playing clip sets in place of the strip's own (null: none). */
  private auto: { volume: number | null; pan: number | null } = { volume: null, pan: null };
  /** The automation as planned, with the audio time each value applies from (for the mixer to show it as heard). */
  private planned: { at: number; what: "volume" | "pan"; value: number | null }[] = [];

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.input = new GainNode(ctx);
    this.output = new StereoPannerNode(ctx);
    this.input.connect(this.output).connect(out);
  }

  /** `volume` in dB (STRIP_MIN_DB and below: off), `pan` -1..1 (a stereo sound is balanced, not folded to mono). */
  set(volume: number, pan: number, muted: boolean) {
    this.volume = volume;
    this.pan = pan;
    this.muted = muted;
    this.apply(this.ctx.currentTime);
  }

  /** Automation from audio time `at`: the volume (dB) or pan a playing clip sets, or (null) the strip's own again. */
  automate(what: "volume" | "pan", value: number | null, at: number) {
    this.auto[what] = value;
    this.apply(at);
    this.planned.push({ at, what, value });
    // Keep what is still ahead, and the last of each before now.
    const now = this.ctx.currentTime;
    if (this.planned.length > 64) this.planned = this.planned.filter((p, i) => p.at > now || !this.planned.slice(i + 1).some((q) => q.what === p.what && q.at <= now));
  }

  /** The automated volume (dB) and pan heard at audio time `t` (null: the strip's own). */
  automatedAt(t: number): { volume: number | null; pan: number | null } {
    const out: { volume: number | null; pan: number | null } = { volume: null, pan: null };
    for (const p of this.planned) if (p.at <= t) out[p.what] = p.value;
    return out;
  }

  private apply(t: number) {
    const volume = this.auto.volume ?? this.volume;
    const g = this.muted || volume <= STRIP_MIN_DB ? 0 : 10 ** (volume / 20);
    this.input.gain.setTargetAtTime(g, t, 0.01);
    this.output.pan.setTargetAtTime(Math.max(-1, Math.min(1, this.auto.pan ?? this.pan)), t, 0.01);
  }

  /** The strip's output, for a level meter. */
  get meter(): AnalyserNode {
    if (!this.meterNode) {
      this.meterNode = new AnalyserNode(this.ctx, { fftSize: 512 });
      this.output.connect(this.meterNode);
    }
    return this.meterNode;
  }

  close() {
    this.input.disconnect();
    this.output.disconnect();
  }
}

/**
 * One part's effects, run in the order and on/off the part's settings say (effectChain). Effects that are
 * off are taken out of the chain, so they cost nothing. The distortion, phaser and flanger are our own
 * code (an "fx-slot" processor each, made the first time they are turned on); the others are the
 * browser's own nodes.
 *
 * The chorus amount and the delay and reverb levels follow `amounts`, a signal from the part's voice
 * processor (the settings plus any mod matrix routes, sample by sample), so an LFO can sweep them.
 */
export class PartFx {
  /** The part's voices go in here (its Volume). */
  readonly input: GainNode;
  /** The voice processor's effect amounts go in here: chorus, delay, reverb (0..1, one channel each). */
  readonly amounts: ChannelSplitterNode;
  /** After each effect (the delay and reverb: what they add), for the Synth view. */
  readonly taps: Record<Effect, AnalyserNode>;
  /** Into the reverb itself (the drums send here). */
  readonly reverbIn: AudioNode;
  /** After the effects: the Song view's volume, pan and mute. */
  readonly strip: Strip;
  readonly eq: EqUnit;
  readonly compressor: CompressorUnit;
  private units: Partial<Record<Effect, Unit>>;
  private slots: Partial<Record<SlotKind, SlotUnit>> = {};
  private reverb: ReverbUnit;
  private out: GainNode;
  private chainKey: string | null = null;
  /** Effects whose tap is connected (only those in the chain, so the others aren't pulled along). */
  private tapped = new Set<Effect>();
  private started = false;
  private values: ParamValues | null = null;
  private bpm = 120;

  constructor(
    private ctx: AudioContext,
    master: AudioNode,
  ) {
    this.input = new GainNode(ctx);
    this.out = new GainNode(ctx);
    this.strip = new Strip(ctx, master);
    this.out.connect(this.strip.input);
    this.amounts = new ChannelSplitterNode(ctx, { numberOfOutputs: 3 });
    const tap = () => new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.6 });
    this.taps = Object.fromEntries(EFFECTS.map((fx) => [fx, tap()])) as Record<Effect, AnalyserNode>;
    this.eq = new EqUnit(ctx);
    this.compressor = new CompressorUnit(ctx);
    this.reverb = new ReverbUnit(ctx, this.amounts);
    this.reverbIn = this.reverb.reverbIn;
    this.units = {
      chorus: new ChorusUnit(ctx, this.amounts),
      delay: new DelayUnit(ctx, this.amounts),
      reverb: this.reverb,
      eq: this.eq,
      compressor: this.compressor,
    };
    this.input.connect(this.out);
  }

  /** The audio worklet module has loaded: our own effects can be made. */
  start() {
    this.started = true;
    if (this.values) this.set(this.values, this.bpm);
  }

  /** The part's settings: its Volume, each effect's settings, and which effects run in what order. */
  set(p: ParamValues, bpm: number) {
    this.values = p;
    this.bpm = bpm;
    this.input.gain.setTargetAtTime(p.volume * p.volume, this.ctx.currentTime, 0.02);
    const chain = effectChain(p).filter((fx) => this.unit(fx, p));
    for (const fx of chain) this.units[fx]!.set(p, bpm);
    this.wire(chain);
  }

  /**
   * Automation: the settings from audio time `at` (planned ahead by a playing clip). Only the amounts that
   * move smoothly change; which effects run, and in what order, stays as it is.
   */
  automate(p: ParamValues, at: number) {
    this.values = p;
    this.input.gain.setTargetAtTime(p.volume * p.volume, at, 0.02);
    for (const fx of effectChain(p)) this.units[fx]?.set(p, this.bpm, at);
  }

  /** The effect's unit; our own are made when first needed (once the worklet module has loaded). */
  private unit(fx: Effect, p: ParamValues): Unit | undefined {
    if (this.units[fx]) return this.units[fx];
    if (!this.started || (fx !== "distortion" && fx !== "phaser" && fx !== "flanger")) return undefined;
    const unit = new SlotUnit(this.ctx, fx, p);
    this.slots[fx] = unit;
    this.units[fx] = unit;
    return unit;
  }

  /** Connect the effects in this order (when it changed). */
  private wire(chain: Effect[]) {
    const key = chain.join(" ");
    if (key === this.chainKey) return;
    this.chainKey = key;
    this.input.disconnect();
    for (const [fx, unit] of Object.entries(this.units) as [Effect, Unit][]) {
      unit.output.disconnect();
      if (unit.tapFrom !== unit.output && this.tapped.has(fx)) unit.tapFrom.disconnect(this.taps[fx]);
    }
    this.tapped.clear();
    let prev: AudioNode = this.input;
    for (const fx of chain) {
      const unit = this.units[fx]!;
      prev.connect(unit.input);
      prev = unit.output;
      unit.tapFrom.connect(this.taps[fx]);
      this.tapped.add(fx);
    }
    prev.connect(this.out);
    for (const [fx, slot] of Object.entries(this.slots)) slot.setOn(chain.includes(fx as Effect));
  }

  /** Build a changed reverb now rather than after the debounce. */
  settle() {
    this.reverb.settle();
  }

  /** The part is gone: let go of everything, and stop our own effects' processors. */
  close() {
    this.input.disconnect();
    for (const unit of Object.values(this.units)) unit.output.disconnect();
    for (const slot of Object.values(this.slots)) slot.close();
    this.out.disconnect();
    this.strip.close();
  }

  /** The phaser's or flanger's LFO phase (cycles) right now, for the drawings; null until it has run. */
  lfoPhase(fx: "phaser" | "flanger"): number | null {
    return this.slots[fx]?.phaseAt(this.ctx.currentTime) ?? null;
  }
}

// ---------------------------------------------------------------- the browser's own nodes

/**
 * Chorus: three delay lines, each swept by a triangle LFO a third of a cycle apart, placed left, centre
 * and right. When one line's pitch rises, another's falls, so the wobble mostly cancels out: a wide,
 * steady shimmer rather than a seasick one. They take the sound in mono, so the chorus sounds the same
 * at any Stereo Width. Wet = chorus x 0.8, dry = 1 - chorus x 0.3.
 */
class ChorusUnit implements Unit {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly tapFrom: GainNode;

  constructor(ctx: AudioContext, amounts: AudioNode) {
    this.input = new GainNode(ctx);
    this.output = this.tapFrom = new GainNode(ctx);
    const dry = gain(ctx, 1);
    const wet = gain(ctx, 0);
    this.input.connect(dry).connect(this.output);
    const mono = new GainNode(ctx, { channelCount: 1, channelCountMode: "explicit" });
    this.input.connect(mono);
    for (const { pan, phase } of CHORUS_LINES) {
      const d = new DelayNode(ctx, { delayTime: CHORUS_DELAY, maxDelayTime: 0.05 });
      const { real, imag } = triangleWave(phase);
      const lfo = new OscillatorNode(ctx, { frequency: CHORUS_RATE, periodicWave: new PeriodicWave(ctx, { real, imag, disableNormalization: true }) });
      lfo.connect(gain(ctx, CHORUS_DEPTH)).connect(d.delayTime);
      lfo.start();
      // Three lines at 2/3 each: about the level of the old two-line chorus.
      mono.connect(d).connect(gain(ctx, 2 / 3)).connect(new StereoPannerNode(ctx, { pan })).connect(wet);
    }
    wet.connect(this.output);
    // A signal into an AudioParam adds to its own value.
    amounts.connect(gain(ctx, 0.8), 0).connect(wet.gain);
    amounts.connect(gain(ctx, -0.3), 0).connect(dry.gain);
  }

  set() {}
}

/**
 * Delay: one line per side, each with a darkening filter in its feedback loop. Stereo: each side feeds
 * back into itself. Ping-pong: both sides go into the left line and the feedback crosses over, so the
 * echoes bounce left, right, left... The echoes are added to the sound at Delay x 0.7.
 */
class DelayUnit implements Unit {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly tapFrom: AudioNode;
  private lines: [DelayNode, DelayNode];
  /** The routing: input to each side, each side's feedback to itself and across (see set). */
  private routes: Record<"inL" | "inR" | "inRtoL" | "fbL" | "fbR" | "fbLtoR" | "fbRtoL", GainNode>;

  constructor(
    private ctx: AudioContext,
    amounts: AudioNode,
  ) {
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);
    this.input.connect(this.output);
    const send = gain(ctx, 0);
    this.input.connect(send);
    amounts.connect(gain(ctx, 0.7), 1).connect(send.gain);
    const sides = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    send.connect(sides);
    const line = () => new DelayNode(ctx, { maxDelayTime: 4 });
    const tone = () => new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3500 });
    this.lines = [line(), line()];
    const [toneL, toneR] = [tone(), tone()];
    const r = (this.routes = { inL: gain(ctx, 1), inR: gain(ctx, 1), inRtoL: gain(ctx, 0), fbL: gain(ctx, 0.35), fbR: gain(ctx, 0.35), fbLtoR: gain(ctx, 0), fbRtoL: gain(ctx, 0) });
    const [dL, dR] = this.lines;
    sides.connect(r.inL, 0).connect(dL);
    sides.connect(r.inR, 1).connect(dR);
    sides.connect(r.inRtoL, 1).connect(dL);
    dL.connect(toneL);
    dR.connect(toneR);
    toneL.connect(r.fbL).connect(dL);
    toneR.connect(r.fbR).connect(dR);
    toneL.connect(r.fbLtoR).connect(dR);
    toneR.connect(r.fbRtoL).connect(dL);
    toneL.connect(merge, 0, 0);
    toneR.connect(merge, 0, 1);
    merge.connect(this.output);
    this.tapFrom = merge;
  }

  set(p: ParamValues, bpm: number, at?: number) {
    const t = at ?? this.ctx.currentTime;
    const seconds = (60 / bpm) * DELAY_DIV_BEATS[p.delayDiv];
    for (const d of this.lines) d.delayTime.setTargetAtTime(seconds, t, 0.05);
    const fb = p.delayFeedback;
    const pp = DELAY_MODES[p.delayMode] === "ping-pong";
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.02);
    const r = this.routes;
    set(r.inL, pp ? 0.5 : 1);
    set(r.inRtoL, pp ? 0.5 : 0);
    set(r.inR, pp ? 0 : 1);
    set(r.fbL, pp ? 0 : fb);
    set(r.fbR, pp ? 0 : fb);
    set(r.fbLtoR, pp ? fb : 0);
    set(r.fbRtoL, pp ? fb : 0);
  }
}

/**
 * Reverb: convolution with a generated noise-decay impulse (fxShapes.ts), added to the sound at Reverb.
 * It takes the sound in mono (it reverberates each side on its own, so a wide input would change how it
 * sounds in mono); its output is stereo.
 */
class ReverbUnit implements Unit {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly tapFrom: ConvolverNode;
  readonly reverbIn: GainNode;
  private seconds = 0;
  private damping = -1;
  private timer = 0;
  private pending: (() => void) | null = null;

  constructor(
    private ctx: AudioContext,
    amounts: AudioNode,
  ) {
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);
    this.input.connect(this.output);
    const send = new GainNode(ctx, { gain: 0, channelCount: 1, channelCountMode: "explicit" });
    amounts.connect(gain(ctx, 1), 2).connect(send.gain);
    this.reverbIn = new GainNode(ctx);
    this.tapFrom = new ConvolverNode(ctx);
    this.input.connect(send).connect(this.reverbIn).connect(this.tapFrom).connect(this.output);
  }

  set(p: ParamValues) {
    const { reverbSize: seconds, reverbDamping: damping } = p;
    if (Math.abs(seconds - this.seconds) < 0.05 && Math.abs(damping - this.damping) < 0.01) return;
    // Building an impulse is expensive: debounce while a knob is turning.
    clearTimeout(this.timer);
    const build = () => {
      this.pending = null;
      this.seconds = seconds;
      this.damping = damping;
      this.tapFrom.buffer = makeImpulse(this.ctx, seconds, damping);
    };
    this.pending = build;
    if (this.seconds === 0) build();
    else this.timer = window.setTimeout(build, 120);
  }

  settle() {
    clearTimeout(this.timer);
    this.pending?.();
  }
}

/** EQ: a low shelf, a peak you can move, and a high shelf (the browser's biquad filters). */
export const EQ_LOW_HZ = 150;
export const EQ_HIGH_HZ = 5000;
export const EQ_MID_Q = 0.8;

class EqUnit implements Unit {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;
  readonly tapFrom: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private bands: BiquadFilterNode[];
  private scratch: { mag: Float32Array<ArrayBuffer>; phase: Float32Array<ArrayBuffer> } | null = null;

  constructor(private ctx: AudioContext) {
    this.input = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: EQ_LOW_HZ, gain: 0 });
    this.mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 1000, Q: EQ_MID_Q, gain: 0 });
    this.output = this.tapFrom = new BiquadFilterNode(ctx, { type: "highshelf", frequency: EQ_HIGH_HZ, gain: 0 });
    this.input.connect(this.mid).connect(this.output);
    this.bands = [this.input, this.mid, this.output];
  }

  set(p: ParamValues, _bpm?: number, at?: number) {
    const t = at ?? this.ctx.currentTime;
    this.input.gain.setTargetAtTime(p.eqLow, t, 0.02);
    this.mid.gain.setTargetAtTime(p.eqMid, t, 0.02);
    this.mid.frequency.setTargetAtTime(p.eqMidFreq, t, 0.02);
    this.output.gain.setTargetAtTime(p.eqHigh, t, 0.02);
  }

  /** The EQ's level (x, not dB) at each frequency, for the drawing. */
  response(hz: Float32Array<ArrayBuffer>, out: Float32Array<ArrayBuffer>) {
    if (this.scratch?.mag.length !== hz.length) this.scratch = { mag: new Float32Array(hz.length), phase: new Float32Array(hz.length) };
    out.fill(1);
    for (const band of this.bands) {
      band.getFrequencyResponse(hz, this.scratch.mag, this.scratch.phase);
      for (let i = 0; i < hz.length; i++) out[i] *= this.scratch.mag[i];
    }
  }
}

/**
 * Compressor: the browser's. Above Threshold, the level rises only 1/Ratio as fast; it turns the whole
 * sound up again by itself afterwards (make-up gain), so the quiet parts come up.
 */
export const COMP_KNEE_DB = 6;

class CompressorUnit implements Unit {
  readonly input: DynamicsCompressorNode;
  readonly output: DynamicsCompressorNode;
  readonly tapFrom: DynamicsCompressorNode;

  constructor(private ctx: AudioContext) {
    this.input = this.output = this.tapFrom = new DynamicsCompressorNode(ctx, { knee: COMP_KNEE_DB });
  }

  set(p: ParamValues, _bpm?: number, at?: number) {
    const t = at ?? this.ctx.currentTime;
    const c = this.input;
    c.threshold.setTargetAtTime(p.compThreshold, t, 0.02);
    c.ratio.setTargetAtTime(p.compRatio, t, 0.02);
    c.attack.setTargetAtTime(p.compAttack, t, 0.02);
    c.release.setTargetAtTime(p.compRelease, t, 0.02);
  }

  /** How far it is turning the sound down right now, in dB (0 or less). */
  get reduction() {
    return this.input.reduction;
  }
}

// ---------------------------------------------------------------- our own effects

/**
 * The settings of the effects the browser's nodes and our own effects run on the main thread's side (the
 * part's voice processor has the rest, the chorus, delay and reverb amounts included).
 */
export const FX_SIDE_PARAMS = new Set<keyof ParamValues>([
  "volume", "delayFeedback", "eqLow", "eqMid", "eqMidFreq", "eqHigh", "compThreshold", "compRatio", "compAttack", "compRelease",
  "distDrive", "distTone", "distMix", "phaserRate", "phaserDepth", "phaserFeedback", "phaserMix", "flangerRate", "flangerDepth", "flangerFeedback", "flangerMix",
]);

/** The settings each of our own effects uses (only these are sent when they change). */
const SLOT_PARAMS: Record<SlotKind, (keyof ParamValues)[]> = {
  distortion: ["distType", "distDrive", "distTone", "distMix"],
  phaser: ["phaserRate", "phaserDepth", "phaserFeedback", "phaserMix"],
  flanger: ["flangerRate", "flangerDepth", "flangerFeedback", "flangerMix"],
};

/** The distortion, phaser or flanger, in an "fx-slot" processor (dsp/effects.ts). */
class SlotUnit implements Unit {
  readonly input: AudioWorkletNode;
  readonly output: AudioWorkletNode;
  readonly tapFrom: AudioWorkletNode;
  private key: string;
  private on = true;
  /** The LFO's last reported phase, the time it was at, and its rate. */
  private report: { time: number; phase: number } | null = null;
  private rate = 0;

  constructor(
    ctx: AudioContext,
    private kind: SlotKind,
    p: ParamValues,
  ) {
    const node = new AudioWorkletNode(ctx, "fx-slot", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      processorOptions: { kind, values: p },
    });
    this.input = this.output = this.tapFrom = node;
    this.key = this.keyOf(p);
    this.rate = this.rateOf(p);
    node.port.onmessage = (e) => {
      if (e.data.type === "phase") this.report = { time: e.data.time, phase: e.data.phase };
    };
  }

  private keyOf(p: ParamValues) {
    return SLOT_PARAMS[this.kind].map((id) => p[id]).join(" ");
  }

  private rateOf(p: ParamValues) {
    return this.kind === "phaser" ? p.phaserRate : this.kind === "flanger" ? p.flangerRate : 0;
  }

  set(p: ParamValues, _bpm?: number, at?: number) {
    const key = this.keyOf(p);
    if (key === this.key) return;
    this.key = key;
    this.rate = this.rateOf(p);
    this.input.port.postMessage({ type: "params", values: p, t: at });
  }

  /** In the chain or not: out of it, the processor does nothing. */
  setOn(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.input.port.postMessage({ type: "on", on });
  }

  /** Stop the processor for good (its part was removed). */
  close() {
    this.input.disconnect();
    this.input.port.postMessage({ type: "close" });
  }

  phaseAt(time: number): number | null {
    if (!this.report) return null;
    const phase = this.report.phase + this.rate * (time - this.report.time);
    return phase - Math.floor(phase);
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, damping: number): AudioBuffer {
  const sides = reverbImpulse(ctx.sampleRate, seconds, damping);
  const buffer = ctx.createBuffer(2, sides[0].length, ctx.sampleRate);
  sides.forEach((data, ch) => buffer.copyToChannel(data, ch));
  return buffer;
}
