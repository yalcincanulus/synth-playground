import { CHORUS_DELAY, CHORUS_DEPTH, CHORUS_LINES, CHORUS_RATE, reverbImpulse, triangleWave } from "./fxShapes";
import { CLIP_RANGE, softClipCurve } from "./softClip";

/**
 * Effects and master chain. Each part (see part.ts) has its own way in, with its own volume, chorus
 * and sends; the delay, reverb and master are shared:
 *
 *   part -> volume -> chorus -> post --+--> master -> limiter -> soft clipper -> analyser -> destination
 *                                      +--> delay send --> delay -^
 *                                      +--> reverb send -> reverb -^
 *   drumIn ----------------------------+--> master (and a smaller reverb send)
 *
 * The parts' chorus amount and delay and reverb sends follow a signal from their voice processor (the
 * settings plus any mod matrix routes, sample by sample), so an LFO can sweep them.
 */
export class Fx {
  readonly drumIn: GainNode;
  readonly analyser: AnalyserNode;
  /** The final sound's left and right channels, for the stereo meter. */
  readonly meters: { left: AnalyserNode; right: AnalyserNode };
  /** The shared effects' wet outputs, for visualisation. */
  readonly delayOut: AudioNode;
  readonly reverbOut: AudioNode;

  private delays: [DelayNode, DelayNode];
  private delayIn: GainNode;
  /** The delay's routing: input to each side, each side's feedback to itself and across (see setShared). */
  private delayRoutes: Record<"inL" | "inR" | "inRtoL" | "fbL" | "fbR" | "fbLtoR" | "fbRtoL", GainNode>;
  private reverb: ConvolverNode;
  private reverbIn: GainNode;
  private drumReverbSend: GainNode;
  private master: GainNode;
  private reverbSeconds = 0;
  private reverbDamping = -1;

  constructor(private ctx: AudioContext) {
    this.master = new GainNode(ctx);
    // The drums play at the level the old shared master gave them at the default volume (0.7, squared).
    this.drumIn = new GainNode(ctx, { gain: 0.49 });

    // Delay: one line per side, each with a darkening filter in its feedback loop. Stereo: each side
    // feeds back into itself. Ping-pong: both sides go into the left line and the feedback crosses
    // over, so the echoes bounce left, right, left...
    this.delayIn = new GainNode(ctx);
    const sides = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.delayIn.connect(sides);
    const line = () => new DelayNode(ctx, { maxDelayTime: 4 });
    const tone = () => new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3500 });
    this.delays = [line(), line()];
    const [toneL, toneR] = [tone(), tone()];
    const gain = (g: number) => new GainNode(ctx, { gain: g });
    const r = (this.delayRoutes = { inL: gain(1), inR: gain(1), inRtoL: gain(0), fbL: gain(0.35), fbR: gain(0.35), fbLtoR: gain(0), fbRtoL: gain(0) });
    const [dL, dR] = this.delays;
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
    merge.connect(this.master);
    this.delayOut = merge;

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

  /** The shared settings (the Keys part's): delay time, feedback and mode, the reverb's room, the drums' reverb. */
  setShared(opts: { delaySeconds: number; delayFeedback: number; pingPong: boolean; reverbMix: number; reverbSize: number; reverbDamping: number }) {
    const t = this.ctx.currentTime;
    for (const d of this.delays) d.delayTime.setTargetAtTime(opts.delaySeconds, t, 0.05);
    const fb = opts.delayFeedback;
    const pp = opts.pingPong;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.02);
    const r = this.delayRoutes;
    set(r.inL, pp ? 0.5 : 1);
    set(r.inRtoL, pp ? 0.5 : 0);
    set(r.inR, pp ? 0 : 1);
    set(r.fbL, pp ? 0 : fb);
    set(r.fbR, pp ? 0 : fb);
    set(r.fbLtoR, pp ? fb : 0);
    set(r.fbRtoL, pp ? fb : 0);
    set(this.drumReverbSend, opts.reverbMix * 0.4);
    this.setReverb(opts.reverbSize, opts.reverbDamping);
  }

  private reverbTimer = 0;
  private pendingReverb: (() => void) | null = null;

  /** Apply a debounced reverb change now (the render check needs the preset's reverb from the first sample). */
  settle() {
    clearTimeout(this.reverbTimer);
    this.pendingReverb?.();
  }

  private setReverb(seconds: number, damping: number) {
    if (Math.abs(seconds - this.reverbSeconds) < 0.05 && Math.abs(damping - this.reverbDamping) < 0.01) return;
    // Building an impulse is expensive: debounce while a knob is turning.
    clearTimeout(this.reverbTimer);
    const build = () => {
      this.pendingReverb = null;
      this.reverbSeconds = seconds;
      this.reverbDamping = damping;
      this.reverb.buffer = makeImpulse(this.ctx, seconds, damping);
    };
    this.pendingReverb = build;
    if (this.reverbSeconds === 0) build();
    else this.reverbTimer = window.setTimeout(build, 120);
  }
}

/**
 * One part's way into the effects: its volume, its own chorus, and its sends to the shared delay and
 * reverb. The chorus amount and the sends follow `amounts` (see Fx).
 */
export class PartFx {
  /** The part's voices go in here. */
  readonly input: GainNode;
  /** The voice processor's effect amounts go in here: chorus, delay, reverb (0..1, one channel each). */
  readonly amounts: ChannelSplitterNode;
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

    // Chorus: three delay lines, each swept by a triangle LFO a third of a cycle apart, placed left,
    // centre and right. When one line's pitch rises, another's falls, so the wobble mostly cancels
    // out: a wide, steady shimmer rather than a seasick one. They take the part in mono, so the chorus
    // sounds the same at any Stereo Width.
    this.chorusDry = new GainNode(ctx);
    this.chorusWet = new GainNode(ctx, { gain: 0 });
    this.input.connect(this.chorusDry).connect(post);
    const mono = new GainNode(ctx, { channelCount: 1, channelCountMode: "explicit" });
    this.input.connect(mono);
    for (const { pan, phase } of CHORUS_LINES) {
      const d = new DelayNode(ctx, { delayTime: CHORUS_DELAY, maxDelayTime: 0.05 });
      const { real, imag } = triangleWave(phase);
      const lfo = new OscillatorNode(ctx, { frequency: CHORUS_RATE, periodicWave: new PeriodicWave(ctx, { real, imag, disableNormalization: true }) });
      const depth = new GainNode(ctx, { gain: CHORUS_DEPTH });
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      // Three lines at 2/3 each: about the level of the old two-line chorus.
      mono.connect(d).connect(new GainNode(ctx, { gain: 2 / 3 })).connect(new StereoPannerNode(ctx, { pan })).connect(this.chorusWet);
    }
    this.chorusWet.connect(post);
    post.connect(master);

    this.delaySend = new GainNode(ctx, { gain: 0 });
    // The reverb takes the part in mono (it reverberates each side on its own, so a wide input would change
    // how it sounds in mono); its output is stereo as before.
    this.reverbSend = new GainNode(ctx, { gain: 0, channelCount: 1, channelCountMode: "explicit" });
    post.connect(this.delaySend).connect(delayIn);
    post.connect(this.reverbSend).connect(reverbIn);

    // The amounts drive the levels: wet = chorus x 0.8, dry = 1 - chorus x 0.3, delay send = delay x 0.7,
    // reverb send = reverb. (A signal into an AudioParam adds to its own value.)
    this.amounts = new ChannelSplitterNode(ctx, { numberOfOutputs: 3 });
    const scaled = (channel: number, gain: number, param: AudioParam) => this.amounts.connect(new GainNode(ctx, { gain }), channel).connect(param);
    scaled(0, 0.8, this.chorusWet.gain);
    scaled(0, -0.3, this.chorusDry.gain);
    scaled(1, 0.7, this.delaySend.gain);
    scaled(2, 1, this.reverbSend.gain);
  }

  /** The part's Volume (the effect amounts come from the voice processor). */
  setVolume(volume: number) {
    this.input.gain.setTargetAtTime(volume * volume, this.ctx.currentTime, 0.02);
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, damping: number): AudioBuffer {
  const sides = reverbImpulse(ctx.sampleRate, seconds, damping);
  const buffer = ctx.createBuffer(2, sides[0].length, ctx.sampleRate);
  sides.forEach((data, ch) => buffer.copyToChannel(data, ch));
  return buffer;
}
