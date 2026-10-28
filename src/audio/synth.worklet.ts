// The synth's audio-thread code (an AudioWorklet module).
//
// "synth-voices": one processor runs every voice of a part, with its LFOs (dsp/voiceBank.ts).
// Output 0 is all voices in stereo; outputs 1.. are the stages (mono) in TAPS order, for the
// Synth view (only rendered while something uses them: they cost every voice extra work; see the
// "taps" message); the last output is the effect amounts (chorus, delay, reverb; 3 channels), which set
// the part's effect levels (see PartFx). Its port also reports what the LFOs are doing, for the drawings.
//
// Wavetables are prepared on the main thread (wavetables.ts) and sent once to a
// "table-loader" processor, which stores them where every voice's processor can read them.
//
// "recorder": collects the app's output for "Record what you hear" and sends it to the main thread.
//
// "fx-slot": one of the effects written in our own code (distortion, phaser, flanger; dsp/effects.ts),
// stereo in and out. A part makes one when that effect is first turned on (see PartFx).
//
// CPU meter: the processors adds the time it spends to a shared total, and the table loader's
// port reports it a few times a second as a share of the time available (see Engine.cpu).

import type { Table } from "./dsp/oscillator";
import { makeEffect, type SlotEffect, type SlotKind } from "./dsp/effects";
import { VoiceBank, type BankMessage } from "./dsp/voiceBank";

declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor): void;

/** Loaded wavetables by id, shared by every processor in this audio context. */
const TABLES = new Map<number, Table>();

// --- CPU meter
const REPORT_EVERY_S = 0.25;
const BLOCK = 128;
// Chrome may not give worklets `performance`; Date.now() only counts whole milliseconds, but averaged
// over many blocks that start at random points within a millisecond it still gives the right mean.
const perf = (globalThis as { performance?: { now(): number } }).performance;
const clock = perf ? "performance" : "date";
const now = perf ? () => perf.now() : () => Date.now();
let reporter: MessagePort | null = null;
let busyMs = 0;
/** The part of busyMs spent in the effects (fx-slot). */
let fxMs = 0;
let blockFrame = -1;
let blockMs = 0;
let peakMs = 0;
let reportFrame = 0;
let voicesInBlock = 0;
let voices = 0;
/** Voice weight summed over the blocks since the last report. */
let unitsSum = 0;

function account(ms: number, voiceCount: number, units: number, fx = false) {
  if (currentFrame !== blockFrame) {
    peakMs = Math.max(peakMs, blockMs);
    voices = Math.max(voices, voicesInBlock);
    blockFrame = currentFrame;
    blockMs = 0;
    voicesInBlock = 0;
  }
  blockMs += ms;
  busyMs += ms;
  if (fx) fxMs += ms;
  voicesInBlock += voiceCount;
  unitsSum += units;
  const elapsedFrames = currentFrame - reportFrame;
  if (elapsedFrames < REPORT_EVERY_S * sampleRate) return;
  const budgetMs = (BLOCK / sampleRate) * 1000;
  reporter?.postMessage({
    cpu: {
      load: busyMs / ((elapsedFrames / sampleRate) * 1000),
      fx: fxMs / ((elapsedFrames / sampleRate) * 1000),
      peak: peakMs / budgetMs,
      voices,
      // Average voice weight over the same time (blocks without voices count as 0).
      units: unitsSum / (elapsedFrames / BLOCK),
      clock,
    },
  });
  reportFrame = currentFrame;
  busyMs = fxMs = peakMs = voices = unitsSum = 0;
}

class TableLoader extends AudioWorkletProcessor {
  constructor() {
    super();
    reporter = this.port;
    this.port.onmessage = (e) => {
      if (e.data.levels) TABLES.set(e.data.id, { frames: e.data.frames, levels: e.data.levels });
      else TABLES.delete(e.data.id);
    };
  }
  process() {
    return false;
  }
}

/** How often the LFOs' phases are reported to the main thread. */
const LFO_REPORT_S = 1 / 30;

class SynthVoices extends AudioWorkletProcessor {
  private bank: VoiceBank;
  private lfoReportFrame = 0;
  private taps: Float32Array[] = [];
  /** Whether the stage outputs are wanted (the Synth view is open, or a stage is being listened to). */
  private tapsOn = false;
  /** The part was removed (a song track deleted): process() returns false, and the processor is gone for good. */
  private closed = false;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const { values, seed } = options.processorOptions;
    this.bank = new VoiceBank(sampleRate, values, TABLES, seed);
    this.port.onmessage = (e: MessageEvent<BankMessage | { type: "ping"; n: number } | { type: "taps"; on: boolean } | { type: "close" }>) => {
      // A ping is answered once every message sent before it has arrived (the render check waits for this).
      if (e.data.type === "ping") this.port.postMessage({ type: "pong", n: e.data.n });
      else if (e.data.type === "taps") this.tapsOn = e.data.on;
      else if (e.data.type === "close") this.closed = true;
      else this.bank.post(e.data);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.closed) return false;
    const start = now();
    const left = outputs[0][0];
    const right = outputs[0][1];
    const last = outputs.length - 1;
    for (let i = 1; i < last; i++) this.taps[i - 1] = outputs[i][0];
    if (!this.tapsOn) for (const tap of this.taps) tap.fill(0);
    this.bank.render(left, right, currentFrame, this.tapsOn ? this.taps : null, outputs[last]);
    if (this.bank.voiceCount) account(now() - start, this.bank.voiceCount, this.bank.units);
    if (currentFrame >= this.lfoReportFrame) {
      this.lfoReportFrame = currentFrame + LFO_REPORT_S * sampleRate;
      // The phases are now at the end of this block.
      this.port.postMessage({ type: "lfo", time: (currentFrame + left.length) / sampleRate, ...this.bank.lfoState() });
    }
    return true;
  }
}

type SlotMessage = { type: "params"; values: Parameters<SlotEffect["set"]>[0] } | { type: "on"; on: boolean } | { type: "ping"; n: number } | { type: "close" };

class FxSlot extends AudioWorkletProcessor {
  private fx: SlotEffect;
  private kind: SlotKind;
  /**
   * Whether the effect is in the chain. Out of it, it does nothing; process() still returns true, because
   * Chrome doesn't start a processor again once it has returned false, even when it is reconnected.
   */
  private on = true;
  /** Its part was removed: process() returns false, and the processor is gone for good. */
  private closed = false;
  private reportFrame = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const { kind, values } = options.processorOptions;
    this.kind = kind;
    this.fx = makeEffect(kind, sampleRate, values);
    this.port.onmessage = (e: MessageEvent<SlotMessage>) => {
      if (e.data.type === "ping") this.port.postMessage({ type: "pong", n: e.data.n });
      else if (e.data.type === "on") this.on = e.data.on;
      else if (e.data.type === "close") this.closed = true;
      else this.fx.set(e.data.values);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.closed) return false;
    if (!this.on) return true;
    const start = now();
    const [left, right] = outputs[0];
    const input = inputs[0];
    // Unconnected, the input has no channels: silence goes through (an LFO keeps going, feedback rings out).
    if (input.length) {
      left.set(input[0]);
      right.set(input[1] ?? input[0]);
    }
    this.fx.process(left, right, left.length);
    account(now() - start, 0, 0, true);
    if (this.kind !== "distortion" && currentFrame >= this.reportFrame) {
      this.reportFrame = currentFrame + LFO_REPORT_S * sampleRate;
      this.port.postMessage({ type: "phase", time: (currentFrame + left.length) / sampleRate, phase: this.fx.phase });
    }
    return true;
  }
}

/** Frames the recorder collects before it sends them to the main thread (about 0.1 s). */
const RECORD_CHUNK = 4096;

/**
 * "recorder": what comes in (the app's output), sent to the main thread in chunks of stereo samples, until it
 * is told to stop. It has no outputs, so Chrome runs it for its input alone.
 */
class Recorder extends AudioWorkletProcessor {
  private left = new Float32Array(RECORD_CHUNK);
  private right = new Float32Array(RECORD_CHUNK);
  private at = 0;
  private stopped = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: "stop" }>) => {
      if (e.data.type !== "stop") return;
      this.send();
      this.stopped = true;
      this.port.postMessage({ type: "done" });
    };
  }

  private send() {
    if (!this.at) return;
    const left = this.left.slice(0, this.at);
    const right = this.right.slice(0, this.at);
    this.port.postMessage({ type: "chunk", left, right }, [left.buffer, right.buffer]);
    this.at = 0;
  }

  process(inputs: Float32Array[][]) {
    if (this.stopped) return false;
    const input = inputs[0];
    const n = input[0]?.length ?? BLOCK;
    for (let i = 0; i < n; i++) {
      // Nothing connected (or silence that Chrome leaves out): zeros, so the time still counts.
      this.left[this.at] = input[0]?.[i] ?? 0;
      this.right[this.at] = input[1]?.[i] ?? input[0]?.[i] ?? 0;
      if (++this.at === RECORD_CHUNK) this.send();
    }
    return true;
  }
}

registerProcessor("synth-voices", SynthVoices);
registerProcessor("recorder", Recorder);
registerProcessor("fx-slot", FxSlot);
registerProcessor("table-loader", TableLoader);
