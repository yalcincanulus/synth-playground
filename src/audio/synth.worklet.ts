// The synth's audio-thread code (an AudioWorklet module).
//
// "synth-voices": one processor runs every voice of a part, with its LFOs (dsp/voiceBank.ts).
// Output 0 is all voices in stereo; outputs 1.. are the stages (mono) in TAPS order, for the
// Synth view; the last output is the effect amounts (chorus, delay, reverb; 3 channels), which set
// the part's effect levels (see PartFx). Its port also reports what the LFOs are doing, for the drawings.
//
// Wavetables are prepared on the main thread (wavetables.ts) and sent once to a
// "table-loader" processor, which stores them where every voice's processor can read them.
//
// CPU meter: the processor adds the time it spends to a shared total, and the table loader's
// port reports it a few times a second as a share of the time available (see Engine.cpu).

import type { Table } from "./dsp/oscillator";
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
let blockFrame = -1;
let blockMs = 0;
let peakMs = 0;
let reportFrame = 0;
let voicesInBlock = 0;
let voices = 0;
/** Voice weight summed over the blocks since the last report. */
let unitsSum = 0;

function account(ms: number, voiceCount: number, units: number) {
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
  unitsSum += units;
  const elapsedFrames = currentFrame - reportFrame;
  if (elapsedFrames < REPORT_EVERY_S * sampleRate) return;
  const budgetMs = (BLOCK / sampleRate) * 1000;
  reporter?.postMessage({
    cpu: {
      load: busyMs / ((elapsedFrames / sampleRate) * 1000),
      peak: peakMs / budgetMs,
      voices,
      // Average voice weight over the same time (blocks without voices count as 0).
      units: unitsSum / (elapsedFrames / BLOCK),
      clock,
    },
  });
  reportFrame = currentFrame;
  busyMs = peakMs = voices = unitsSum = 0;
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

/** How often the LFOs' phases are reported to the main thread. */
const LFO_REPORT_S = 1 / 30;

class SynthVoices extends AudioWorkletProcessor {
  private bank: VoiceBank;
  private lfoReportFrame = 0;
  private taps: Float32Array[] = [];

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const { values, seed } = options.processorOptions;
    this.bank = new VoiceBank(sampleRate, values, TABLES, seed);
    this.port.onmessage = (e: MessageEvent<BankMessage | { type: "ping"; n: number }>) => {
      // A ping is answered once every message sent before it has arrived (the render check waits for this).
      if (e.data.type === "ping") this.port.postMessage({ type: "pong", n: e.data.n });
      else this.bank.post(e.data);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const start = now();
    const [left, right] = outputs[0];
    const last = outputs.length - 1;
    for (let i = 1; i < last; i++) this.taps[i - 1] = outputs[i][0];
    this.bank.render(left, right, currentFrame, this.taps, outputs[last]);
    if (this.bank.voiceCount) account(now() - start, this.bank.voiceCount, this.bank.units);
    if (currentFrame >= this.lfoReportFrame) {
      this.lfoReportFrame = currentFrame + LFO_REPORT_S * sampleRate;
      // The phases are now at the end of this block.
      this.port.postMessage({ type: "lfo", time: (currentFrame + left.length) / sampleRate, ...this.bank.lfoState() });
    }
    return true;
  }
}

registerProcessor("synth-voices", SynthVoices);
registerProcessor("table-loader", TableLoader);
