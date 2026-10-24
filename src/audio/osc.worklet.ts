// The synth's audio-thread code (an AudioWorklet module).
//
// - "synth-osc" (classic engine): one processor per voice wraps an Oscillator (dsp/oscillator.ts).
//   Outputs: 0 = Osc 1, 1 = Osc 2, 2 = Sub (each the sum of its copies).
// - "synth-voices" (new engine): one processor runs every voice of a part (dsp/voiceBank.ts).
//   Inputs: 0 = pitch (cents), 1 = filter (cents), 2 = pulse width, 3 = wavetable position (the LFOs
//   and pitch bend, still Web Audio nodes). Output: the mono sum of all voices.
//
// Wavetables are prepared on the main thread (wavetables.ts) and sent once to a
// "table-loader" processor, which stores them where every voice's processor can read them.
//
// CPU meter: every processor adds the time it spends to a shared total, and the table loader's
// port reports it a few times a second as a share of the time available (see Engine.cpu).

import { Oscillator, type OscParams, type Table } from "./dsp/oscillator";
import { VoiceBank, type BankInputs, type BankMessage } from "./dsp/voiceBank";

declare const sampleRate: number;
declare const currentTime: number;
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
let blockFrame = -1;
let blockMs = 0;
let peakMs = 0;
let reportFrame = 0;
let voicesInBlock = 0;
let voices = 0;

function account(ms: number, voiceCount = 1) {
  if (currentFrame !== blockFrame) {
    peakMs = Math.max(peakMs, blockMs);
    voices = Math.max(voices, voicesInBlock);
    blockFrame = currentFrame;
    blockMs = 0;
    voicesInBlock = 0;
  }
  blockMs += ms;
  busyMs += ms;
  voicesInBlock += voiceCount;
  const elapsedFrames = currentFrame - reportFrame;
  if (elapsedFrames < REPORT_EVERY_S * sampleRate) return;
  const budgetMs = (BLOCK / sampleRate) * 1000;
  reporter?.postMessage({
    cpu: {
      load: busyMs / ((elapsedFrames / sampleRate) * 1000),
      peak: peakMs / budgetMs,
      voices,
      clock,
    },
  });
  reportFrame = currentFrame;
  busyMs = peakMs = voices = 0;
}

class TableLoader extends AudioWorkletProcessor {
  constructor() {
    super();
    reporter = this.port;
    this.port.onmessage = (e) => TABLES.set(e.data.id, { frames: e.data.frames, levels: e.data.levels });
  }
  process() {
    return false;
  }
}

class SynthOsc extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 440, minValue: 0, automationRate: "a-rate" },
      /** Cents, for all oscillators: bend and LFO pitch modulation are connected here. */
      { name: "detune", defaultValue: 0, automationRate: "a-rate" },
      /** Cents, the pitch envelope: on all oscillators or on Osc 2 only (envTarget). */
      { name: "pitchEnv", defaultValue: 0, automationRate: "a-rate" },
      { name: "envTarget", defaultValue: 0, automationRate: "k-rate" },
      /** Cents, Osc 2's offset from Osc 1 (its pitch and detune). */
      { name: "osc2Detune", defaultValue: 0, automationRate: "a-rate" },
      /** Cents between the outer unison copies and the middle. */
      { name: "spread", defaultValue: 0, automationRate: "k-rate" },
      /** Pulse width for square waves; the LFO's width modulation is connected here. */
      { name: "width", defaultValue: 0.5, automationRate: "a-rate" },
      { name: "fm", defaultValue: 0, automationRate: "a-rate" },
      { name: "sync", defaultValue: 0, automationRate: "k-rate" },
      { name: "wave1", defaultValue: 2, automationRate: "k-rate" },
      { name: "wave2", defaultValue: 2, automationRate: "k-rate" },
      { name: "table", defaultValue: 0, automationRate: "k-rate" },
      /** Wavetable position 0..1; the LFO's position modulation is connected here. */
      { name: "position", defaultValue: 0, automationRate: "a-rate" },
    ];
  }

  private osc: Oscillator;
  private stopAt = Infinity;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const phases: number[] = options.processorOptions?.phases ?? [];
    let k = 0;
    const random = () => (k < phases.length ? phases[k++] : Math.random());
    this.osc = new Oscillator(options.processorOptions?.unison ?? 1, sampleRate, TABLES, random);
    this.port.onmessage = (e) => (this.stopAt = e.data.stopAt);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    if (currentTime >= this.stopAt) return false;
    const start = now();
    this.osc.render(params as OscParams, outputs[0][0], outputs[1][0], outputs[2][0]);
    account(now() - start);
    return true;
  }
}

class SynthVoices extends AudioWorkletProcessor {
  private bank: VoiceBank;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.bank = new VoiceBank(sampleRate, options.processorOptions.values, TABLES);
    this.port.onmessage = (e: MessageEvent<BankMessage | { type: "ping"; n: number }>) => {
      // A ping is answered once every message sent before it has arrived (the render check waits for this).
      if (e.data.type === "ping") this.port.postMessage({ type: "pong", n: e.data.n });
      else this.bank.post(e.data);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const start = now();
    const input = (i: number) => inputs[i]?.[0];
    const mods: BankInputs = { pitch: input(0), filter: input(1), width: input(2), position: input(3) };
    this.bank.render(outputs[0][0], currentFrame, mods);
    if (this.bank.voiceCount) account(now() - start, this.bank.voiceCount);
    return true;
  }
}

registerProcessor("synth-osc", SynthOsc);
registerProcessor("synth-voices", SynthVoices);
registerProcessor("table-loader", TableLoader);
