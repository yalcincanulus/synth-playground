import { CLIP_RANGE, softClipCurve } from "./softClip";

/**
 * Effects and master chain. Each part (see part.ts) has its own way in, with its own volume, chorus
 * and sends; the delay, reverb and master are shared:
 *
 *   part -> volume -> chorus -> post --+--> master -> limiter -> soft clipper -> analyser -> destination
 *                                      +--> delay send --> delay -^
 *                                      +--> reverb send -> reverb -^
 *   drumIn ----------------------------+--> master (and a smaller reverb send)
 */
export class Fx {
  readonly drumIn: GainNode;
  readonly analyser: AnalyserNode;
  /** The final sound's left and right channels, for the stereo meter. */
  readonly meters: { left: AnalyserNode; right: AnalyserNode };
  /** The shared effects' wet outputs, for visualisation. */
  readonly delayOut: AudioNode;
  readonly reverbOut: AudioNode;

  private delay: DelayNode;
  private delayIn: GainNode;
  private delayFeedback: GainNode;
  private reverb: ConvolverNode;
  private reverbIn: GainNode;
  private drumReverbSend: GainNode;
  private master: GainNode;
  private reverbSeconds = 0;

  constructor(private ctx: AudioContext) {
    this.master = new GainNode(ctx);
    // The drums play at the level the old shared master gave them at the default volume (0.7, squared).
    this.drumIn = new GainNode(ctx, { gain: 0.49 });

    // Delay with a darkening filter in the feedback loop.
    this.delay = new DelayNode(ctx, { maxDelayTime: 4 });
    this.delayIn = new GainNode(ctx);
    this.delayFeedback = new GainNode(ctx, { gain: 0.35 });
    const tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3500 });
    this.delayIn.connect(this.delay).connect(tone).connect(this.delayFeedback).connect(this.delay);
    tone.connect(this.master);
    this.delayOut = tone;

    // Reverb: convolution with a generated noise-decay impulse.
    this.reverb = new ConvolverNode(ctx);
    this.reverbIn = new GainNode(ctx);
    this.drumReverbSend = new GainNode(ctx, { gain: 0 });
    this.reverbIn.connect(this.reverb).connect(this.master);
    this.reverbOut = this.reverb;
    this.drumIn.connect(this.drumReverbSend).connect(this.reverbIn);
    this.drumIn.connect(this.master);

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

  private mute: GainNode;

  /** A new way in for one part. */
  addPart(): PartFx {
    return new PartFx(this.ctx, this.master, this.delayIn, this.reverbIn);
  }

  /** Silence the main output (the output analyser still sees the signal). */
  setMuted(muted: boolean) {
    this.mute.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  /** The shared settings (the Keys part's): delay time and feedback, room size, the drums' reverb. */
  setShared(opts: { delaySeconds: number; delayFeedback: number; reverbMix: number; reverbSize: number }) {
    const t = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(opts.delaySeconds, t, 0.05);
    this.delayFeedback.gain.setTargetAtTime(opts.delayFeedback, t, 0.02);
    this.drumReverbSend.gain.setTargetAtTime(opts.reverbMix * 0.4, t, 0.02);
    this.setReverbSize(opts.reverbSize);
  }

  private reverbTimer = 0;
  private pendingReverb: (() => void) | null = null;

  /** Apply a debounced reverb change now (the render check needs the preset's reverb from the first sample). */
  settle() {
    clearTimeout(this.reverbTimer);
    this.pendingReverb?.();
  }

  private setReverbSize(seconds: number) {
    if (Math.abs(seconds - this.reverbSeconds) < 0.05) return;
    // Building an impulse is expensive: debounce while a knob is turning.
    clearTimeout(this.reverbTimer);
    const build = () => {
      this.pendingReverb = null;
      this.reverbSeconds = seconds;
      this.reverb.buffer = makeImpulse(this.ctx, seconds);
    };
    this.pendingReverb = build;
    if (this.reverbSeconds === 0) build();
    else this.reverbTimer = window.setTimeout(build, 120);
  }
}

/** One part's way into the effects: its volume, its own chorus, and its sends to the shared delay and reverb. */
export class PartFx {
  /** The part's voices go in here. */
  readonly input: GainNode;
  /** After the chorus, for visualisation. */
  readonly chorusOut: AudioNode;
  private chorusWet: GainNode;
  private chorusDry: GainNode;
  private delaySend: GainNode;
  private reverbSend: GainNode;

  constructor(
    private ctx: AudioContext,
    master: AudioNode,
    delayIn: AudioNode,
    reverbIn: AudioNode,
  ) {
    this.input = new GainNode(ctx);
    const post = new GainNode(ctx);
    this.chorusOut = post;

    // Chorus: two delay lines swept by slow LFOs in opposite phase, panned apart. They take the part in
    // mono, as before the voices were stereo, so the chorus sounds the same at any Stereo Width.
    this.chorusDry = new GainNode(ctx);
    this.chorusWet = new GainNode(ctx, { gain: 0 });
    this.input.connect(this.chorusDry).connect(post);
    const mono = new GainNode(ctx, { channelCount: 1, channelCountMode: "explicit" });
    this.input.connect(mono);
    for (const [rate, pan] of [[0.31, -0.7], [0.43, 0.7]] as const) {
      const d = new DelayNode(ctx, { delayTime: 0.015, maxDelayTime: 0.05 });
      const lfo = new OscillatorNode(ctx, { frequency: rate });
      const depth = new GainNode(ctx, { gain: 0.004 });
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      mono.connect(d).connect(new StereoPannerNode(ctx, { pan })).connect(this.chorusWet);
    }
    this.chorusWet.connect(post);
    post.connect(master);

    this.delaySend = new GainNode(ctx, { gain: 0 });
    // The reverb takes the part in mono (it reverberates each side on its own, so a wide input would change
    // how it sounds in mono); its output is stereo as before.
    this.reverbSend = new GainNode(ctx, { gain: 0, channelCount: 1, channelCountMode: "explicit" });
    post.connect(this.delaySend).connect(delayIn);
    post.connect(this.reverbSend).connect(reverbIn);
  }

  set(opts: { chorus: number; delayMix: number; reverbMix: number; volume: number }) {
    const t = this.ctx.currentTime;
    this.chorusWet.gain.setTargetAtTime(opts.chorus * 0.8, t, 0.02);
    this.chorusDry.gain.setTargetAtTime(1 - opts.chorus * 0.3, t, 0.02);
    this.delaySend.gain.setTargetAtTime(opts.delayMix * 0.7, t, 0.02);
    this.reverbSend.gain.setTargetAtTime(opts.reverbMix, t, 0.02);
    this.input.gain.setTargetAtTime(opts.volume * opts.volume, t, 0.02);
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * (i < 100 ? i / 100 : 1);
    }
  }
  return buffer;
}
