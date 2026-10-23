/**
 * Effects and master chain:
 *
 *   synthIn -> chorus -> post --+--> master -> limiter -> analyser -> destination
 *                                +--> delay send --^
 *                                +--> reverb send -^
 *   drumIn  ---------------------+--> master (and a smaller reverb send)
 */
export class Fx {
  readonly synthIn: GainNode;
  readonly drumIn: GainNode;
  readonly analyser: AnalyserNode;
  /** Points inside the chain, for visualisation: after chorus, delay's wet output, reverb's wet output. */
  readonly chorusOut: AudioNode;
  readonly delayOut: AudioNode;
  readonly reverbOut: AudioNode;

  private chorusWet: GainNode;
  private chorusDry: GainNode;
  private delay: DelayNode;
  private delaySend: GainNode;
  private delayFeedback: GainNode;
  private reverb: ConvolverNode;
  private reverbSend: GainNode;
  private drumReverbSend: GainNode;
  private master: GainNode;
  private reverbSeconds = 0;

  constructor(private ctx: AudioContext) {
    this.synthIn = new GainNode(ctx);
    this.drumIn = new GainNode(ctx);
    const post = new GainNode(ctx);
    this.chorusOut = post;
    this.master = new GainNode(ctx);

    // Chorus: two delay lines swept by slow LFOs in opposite phase, panned apart.
    this.chorusDry = new GainNode(ctx);
    this.chorusWet = new GainNode(ctx, { gain: 0 });
    this.synthIn.connect(this.chorusDry).connect(post);
    for (const [rate, pan] of [[0.31, -0.7], [0.43, 0.7]] as const) {
      const d = new DelayNode(ctx, { delayTime: 0.015, maxDelayTime: 0.05 });
      const lfo = new OscillatorNode(ctx, { frequency: rate });
      const depth = new GainNode(ctx, { gain: 0.004 });
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      this.synthIn.connect(d).connect(new StereoPannerNode(ctx, { pan })).connect(this.chorusWet);
    }
    this.chorusWet.connect(post);
    post.connect(this.master);

    // Delay with a darkening filter in the feedback loop.
    this.delay = new DelayNode(ctx, { maxDelayTime: 4 });
    this.delaySend = new GainNode(ctx, { gain: 0 });
    this.delayFeedback = new GainNode(ctx, { gain: 0.35 });
    const tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3500 });
    post.connect(this.delaySend).connect(this.delay).connect(tone).connect(this.delayFeedback).connect(this.delay);
    tone.connect(this.master);
    this.delayOut = tone;

    // Reverb: convolution with a generated noise-decay impulse.
    this.reverb = new ConvolverNode(ctx);
    this.reverbSend = new GainNode(ctx, { gain: 0 });
    this.drumReverbSend = new GainNode(ctx, { gain: 0 });
    post.connect(this.reverbSend).connect(this.reverb).connect(this.master);
    this.reverbOut = this.reverb;
    this.drumIn.connect(this.drumReverbSend).connect(this.reverb);
    this.drumIn.connect(this.master);

    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.15 });
    this.analyser = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0.75 });
    this.mute = new GainNode(ctx);
    this.master.connect(limiter).connect(this.analyser).connect(this.mute).connect(ctx.destination);
  }

  private mute: GainNode;

  /** Silence the main output (the output analyser still sees the signal). */
  setMuted(muted: boolean) {
    this.mute.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  set(opts: {
    chorus: number;
    delayMix: number;
    delaySeconds: number;
    delayFeedback: number;
    reverbMix: number;
    reverbSize: number;
    volume: number;
  }) {
    const t = this.ctx.currentTime;
    this.chorusWet.gain.setTargetAtTime(opts.chorus * 0.8, t, 0.02);
    this.chorusDry.gain.setTargetAtTime(1 - opts.chorus * 0.3, t, 0.02);
    this.delaySend.gain.setTargetAtTime(opts.delayMix * 0.7, t, 0.02);
    this.delay.delayTime.setTargetAtTime(opts.delaySeconds, t, 0.05);
    this.delayFeedback.gain.setTargetAtTime(opts.delayFeedback, t, 0.02);
    this.reverbSend.gain.setTargetAtTime(opts.reverbMix, t, 0.02);
    this.drumReverbSend.gain.setTargetAtTime(opts.reverbMix * 0.4, t, 0.02);
    this.master.gain.setTargetAtTime(opts.volume * opts.volume, t, 0.02);
    this.setReverbSize(opts.reverbSize);
  }

  private reverbTimer = 0;
  private setReverbSize(seconds: number) {
    if (Math.abs(seconds - this.reverbSeconds) < 0.05) return;
    // Building an impulse is expensive: debounce while a knob is turning.
    clearTimeout(this.reverbTimer);
    const build = () => {
      this.reverbSeconds = seconds;
      this.reverb.buffer = makeImpulse(this.ctx, seconds);
    };
    if (this.reverbSeconds === 0) build();
    else this.reverbTimer = window.setTimeout(build, 120);
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
