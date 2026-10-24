import { FILTER_TYPES, MOD_DESTS, MOD_SLOTS, MOD_SOURCES, slotIds, type ModDest, type ModSource, type ParamValues } from "./params";

/** Shared nodes a voice plugs into. Owned by the engine. */
export interface VoiceContext {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  /** Pitch modulation in cents (bend + LFO), added to every oscillator's detune. */
  pitchMod: AudioNode;
  /** Filter modulation in cents (LFO), added to every filter's detune. */
  filterMod: AudioNode;
  /** Pulse width modulation (LFO), added to every oscillator's width. */
  widthMod: AudioNode;
  /** Wavetable position modulation (LFO), added to every oscillator's position. */
  positionMod: AudioNode;
  /** Mod matrix sources shared by all voices, each -1..1 (the mod strip 0..1). */
  globalSources: { "lfo 1": AudioNode; "lfo 2": AudioNode; "mod strip": AudioNode };
  driveCurve: (drive: number) => Float32Array<ArrayBuffer> | null;
  /** Shared analysers that every voice also feeds, so each stage can be visualised. */
  taps: VoiceTaps;
}

export interface VoiceTaps {
  /** Raw sources, before their mixer level. */
  osc1: AudioNode;
  osc2: AudioNode;
  sub: AudioNode;
  noise: AudioNode;
  /** After the mixer, after drive, after the filter. */
  mix: AudioNode;
  drive: AudioNode;
  filter: AudioNode;
}

export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Biquad lowpass/highpass Q is in dB; bandpass Q is a plain quality factor. */
export function filterQ(type: number, resonance: number) {
  return FILTER_TYPES[type] === "bandpass" ? resonance : Math.min(24, 20 * Math.log10(resonance));
}

export function filterBase(p: ParamValues, note: number) {
  return Math.min(20000, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keyTrack));
}

/** Unison copies are spread this many cents either side (at least), so they never sound like one. */
export const unisonSpread = (p: ParamValues) => Math.max(p.osc2Detune, 8);

/** The "key" source: -1 two octaves below middle C, +1 two octaves above. */
export const keySource = (note: number) => (note - 60) / 24;

/** What a route's amount of 100% means at each destination. */
export const MOD_RANGE: Record<ModDest, number> = {
  pitch: 2400, // cents: ±2 octaves
  "osc 2 pitch": 2400,
  cutoff: 4800, // cents: ±4 octaves
  resonance: 12, // dB
  volume: 1,
  "wt pos": 1,
  width: 0.45,
  fm: 1,
  "osc mix": 1,
  sub: 0.8,
  noise: 1,
};

/** Freeze an automated param at its current value (cancelAndHoldAtTime is missing in Firefox). */
function hold(param: AudioParam, t: number) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

/** Attack (linear) to 1, then decay to sustain, as every envelope here does. Retriggers start from where it is. */
function startAdsr(param: AudioParam, attack: number, decay: number, sustain: number, peak: number, t: number, retrigger: boolean) {
  if (retrigger) hold(param, t);
  else param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(peak * sustain, t + attack, decay / 4);
}

function releaseTo0(param: AudioParam, release: number, t: number) {
  hold(param, t);
  param.setTargetAtTime(0, t, release / 4);
}

interface Route {
  key: string;
  dest: ModDest;
  /** One gain per destination param (osc mix moves two, in opposite directions). */
  gains: GainNode[];
  from: AudioNode;
}

export type NoteOwner = "keys" | "seq";

/** One sounding note: oscillators -> drive -> filter -> amp, plus its envelopes and mod matrix routes. */
export class Voice {
  note: number;
  /** Who played it: your keys or the step sequencer. Each only releases its own notes. */
  owner: NoteOwner = "keys";
  releasedAt: number | null = null;
  readonly startedAt: number;
  /** When the envelopes last (re)started: differs from startedAt after a mono retrigger. */
  triggeredAt: number;
  velocity: number;
  /** This note's "random" source value, -1..1. */
  random = Math.random() * 2 - 1;

  /** Osc 1, Osc 2 and the sub, made together on the audio thread (see osc.worklet.ts). */
  private osc: AudioWorkletNode;
  private noise: AudioBufferSourceNode;
  private osc1Gain: GainNode;
  private osc2Gain: GainNode;
  private subGain: GainNode;
  private noiseGain: GainNode;
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private amp: GainNode;
  /** After the amp: the mod matrix's "volume" destination. */
  private modVca: GainNode;
  private mix: GainNode;
  private unison: number;

  /**
   * This voice's modulation signals, each a ConstantSource: the four envelopes (0..1, the
   * pitch envelope 1 -> 0), velocity (0..1), key and random (-1..1).
   */
  private sources: Record<"filter env" | "amp env" | "pitch env" | "mod env" | "velocity" | "key" | "random", ConstantSourceNode>;
  /** Filter and pitch envelope amounts: their envelope signal scaled into cents. */
  private filterEnvGain: GainNode;
  private pitchEnvGain: GainNode;
  private routes = new Map<number, Route>();

  constructor(
    private vc: VoiceContext,
    p: ParamValues,
    note: number,
    velocity: number,
    t: number,
  ) {
    const { ctx } = vc;
    this.note = note;
    this.startedAt = t;
    this.triggeredAt = t;
    this.velocity = velocity;

    this.osc1Gain = new GainNode(ctx);
    this.osc2Gain = new GainNode(ctx);
    this.subGain = new GainNode(ctx);
    this.noiseGain = new GainNode(ctx);
    this.shaper = new WaveShaperNode(ctx, { oversample: "2x" });
    this.filter = new BiquadFilterNode(ctx);
    this.amp = new GainNode(ctx, { gain: 0 });
    this.modVca = new GainNode(ctx);

    const unison = (this.unison = Math.round(p.unison));
    this.osc = new AudioWorkletNode(ctx, "synth-osc", {
      numberOfInputs: 0,
      numberOfOutputs: 3,
      outputChannelCount: [1, 1, 1],
      processorOptions: { unison },
    });
    this.param("frequency").value = midiToHz(note);
    this.osc.connect(this.osc1Gain, 0);
    this.osc.connect(this.osc2Gain, 1);
    this.osc.connect(this.subGain, 2);
    vc.pitchMod.connect(this.param("detune"));
    vc.widthMod.connect(this.param("width"));
    vc.positionMod.connect(this.param("position"));

    this.noise = new AudioBufferSourceNode(ctx, { buffer: vc.noise, loop: true });
    this.noise.connect(this.noiseGain);
    // Random start so stacked voices don't phase.
    this.noise.start(t, Math.random() * vc.noise.duration);

    const mix = (this.mix = new GainNode(ctx, { gain: 0.5 }));
    for (const g of [this.osc1Gain, this.osc2Gain, this.subGain, this.noiseGain]) g.connect(mix);
    mix.connect(this.shaper).connect(this.filter).connect(this.amp).connect(this.modVca).connect(vc.out);
    vc.filterMod.connect(this.filter.detune);

    const { taps } = vc;
    this.osc.connect(taps.osc1, 0);
    this.osc.connect(taps.osc2, 1);
    this.osc.connect(taps.sub, 2);
    this.noise.connect(taps.noise);
    mix.connect(taps.mix);
    this.shaper.connect(taps.drive);
    this.filter.connect(taps.filter);

    const constant = (offset = 0) => {
      const c = new ConstantSourceNode(ctx, { offset });
      c.start(t);
      return c;
    };
    this.sources = {
      "filter env": constant(),
      "amp env": constant(),
      "pitch env": constant(),
      "mod env": constant(),
      velocity: constant(velocity / 127),
      key: constant(keySource(note)),
      random: constant(this.random),
    };
    this.filterEnvGain = new GainNode(ctx, { gain: 0 });
    this.pitchEnvGain = new GainNode(ctx, { gain: 0 });
    this.sources["filter env"].connect(this.filterEnvGain).connect(this.filter.detune);
    this.sources["pitch env"].connect(this.pitchEnvGain).connect(this.param("pitchEnv"));

    this.apply(p, t);
    this.startEnvelopes(p, t, false);
  }

  private param(name: string) {
    return this.osc.parameters.get(name)!;
  }

  /** Start (or, in mono, restart from where they are) the amp, filter, pitch and mod envelopes. */
  private startEnvelopes(p: ParamValues, t: number, retrigger: boolean) {
    const peak = 1 - p.velocity + p.velocity * (this.velocity / 127);
    startAdsr(this.amp.gain, p.attack, p.decay, p.sustain, peak, t, retrigger);
    startAdsr(this.sources["amp env"].offset, p.attack, p.decay, p.sustain, 1, t, retrigger);
    startAdsr(this.sources["filter env"].offset, p.filterAttack, p.filterDecay, p.filterSustain, 1, t, retrigger);
    startAdsr(this.sources["mod env"].offset, p.modEnvAttack, p.modEnvDecay, p.modEnvSustain, 1, t, retrigger);
    // Pitch envelope: jump to Amount, then slide back to the note's own pitch.
    const pe = this.sources["pitch env"].offset;
    pe.cancelScheduledValues(t);
    pe.setValueAtTime(1, t);
    pe.setTargetAtTime(0, t, p.pitchEnvDecay / 4);
  }

  /** Update sound parameters on a sounding voice. Envelopes keep their current shape. */
  apply(p: ParamValues, t = this.vc.ctx.currentTime) {
    const set = (name: string, v: number) => this.param(name).setValueAtTime(v, t);
    set("wave1", p.osc1Wave);
    set("wave2", p.osc2Wave);
    set("sync", p.oscSync);
    set("envTarget", p.pitchEnvTarget);
    set("table", p.wtTable);
    this.param("position").setTargetAtTime(p.wtPos, t, 0.01);
    this.param("osc2Detune").setTargetAtTime(p.osc2Semi * 100 + p.osc2Detune, t, 0.01);
    this.param("spread").setTargetAtTime(unisonSpread(p), t, 0.01);
    this.param("width").setTargetAtTime(p.pulseWidth, t, 0.01);
    this.param("fm").setTargetAtTime(p.fmAmount, t, 0.01);
    this.osc1Gain.gain.setTargetAtTime((1 - p.oscMix) / Math.sqrt(this.unison), t, 0.01);
    this.osc2Gain.gain.setTargetAtTime(p.oscMix / Math.sqrt(this.unison), t, 0.01);
    this.subGain.gain.setTargetAtTime(p.subLevel * 0.8, t, 0.01);
    this.noiseGain.gain.setTargetAtTime(p.noiseLevel, t, 0.01);
    this.shaper.curve = this.vc.driveCurve(p.drive);
    this.filter.type = FILTER_TYPES[p.filterType];
    this.filter.Q.setTargetAtTime(filterQ(p.filterType, p.resonance), t, 0.01);
    this.filter.frequency.setTargetAtTime(filterBase(p, this.note), t, 0.01);
    // Envelope amounts, so turning them changes a held note too.
    const velScale = 0.5 + 0.5 * (p.velocity > 0 ? this.velocity / 127 : 1);
    this.filterEnvGain.gain.setTargetAtTime(p.filterEnvAmt * 1200 * velScale, t, 0.01);
    this.pitchEnvGain.gain.setTargetAtTime(p.pitchEnvAmt * 100, t, 0.01);
    this.applyRoutes(p, t);
  }

  /** Mod matrix: connect, update or remove each of the routes. */
  private applyRoutes(p: ParamValues, t: number) {
    for (let n = 1; n <= MOD_SLOTS; n++) {
      const ids = slotIds(n);
      const source = MOD_SOURCES[p[ids.src]];
      const dest = MOD_DESTS[p[ids.dst]];
      const amount = p[ids.amt];
      const existing = this.routes.get(n);
      const key = `${source}>${dest}`;
      if (existing && (existing.key !== key || source === "off" || amount === 0)) {
        this.unplug(existing);
        this.routes.delete(n);
      }
      if (source === "off" || !dest || amount === 0) continue;
      let route = this.routes.get(n);
      if (!route) {
        const from = this.sourceNode(source);
        const gains = this.destParams(dest).map(([param]) => {
          const g = new GainNode(this.vc.ctx, { gain: 0 });
          from.connect(g).connect(param);
          return g;
        });
        route = { key, dest, gains, from };
        this.routes.set(n, route);
      }
      const targets = this.destParams(dest);
      route.gains.forEach((g, i) => g.gain.setTargetAtTime(amount * MOD_RANGE[dest] * targets[i][1], t, 0.01));
    }
  }

  private sourceNode(source: Exclude<ModSource, "off">): AudioNode {
    if (source === "lfo 1" || source === "lfo 2" || source === "mod strip") return this.vc.globalSources[source];
    return this.sources[source];
  }

  /** The params a destination moves, each with a direction. */
  private destParams(dest: ModDest): [AudioParam, number][] {
    const g = 1 / Math.sqrt(this.unison);
    switch (dest) {
      case "pitch": return [[this.param("detune"), 1]];
      case "osc 2 pitch": return [[this.param("osc2Detune"), 1]];
      case "cutoff": return [[this.filter.detune, 1]];
      case "resonance": return [[this.filter.Q, 1]];
      case "volume": return [[this.modVca.gain, 1]];
      case "wt pos": return [[this.param("position"), 1]];
      case "width": return [[this.param("width"), 1]];
      case "fm": return [[this.param("fm"), 1]];
      case "osc mix": return [[this.osc2Gain.gain, g], [this.osc1Gain.gain, -g]];
      case "sub": return [[this.subGain.gain, 1]];
      case "noise": return [[this.noiseGain.gain, 1]];
    }
  }

  private unplug(route: Route) {
    for (const g of route.gains) {
      route.from.disconnect(g);
      g.disconnect();
    }
  }

  /** Mono mode: move to a new note without retriggering envelopes. */
  glideTo(note: number, p: ParamValues, t: number) {
    this.note = note;
    const glide = Math.max(0.001, p.glide / 3);
    const f = this.param("frequency");
    hold(f, t);
    f.setTargetAtTime(midiToHz(note), t, glide);
    this.filter.frequency.setTargetAtTime(filterBase(p, note), t, glide);
    this.sources.key.offset.setTargetAtTime(keySource(note), t, glide);
  }

  /** Mono mode: a new note after all keys were released retriggers the envelopes. */
  retrigger(p: ParamValues, velocity: number, t: number) {
    this.releasedAt = null;
    this.triggeredAt = t;
    this.velocity = velocity;
    this.random = Math.random() * 2 - 1;
    this.sources.velocity.offset.setValueAtTime(velocity / 127, t);
    this.sources.random.offset.setValueAtTime(this.random, t);
    this.apply(p, t);
    this.startEnvelopes(p, t, true);
  }

  /** Start the release stage. Returns the time the voice falls silent. */
  release(p: ParamValues, t: number): number {
    this.releasedAt = t;
    releaseTo0(this.amp.gain, p.release, t);
    releaseTo0(this.sources["amp env"].offset, p.release, t);
    releaseTo0(this.sources["filter env"].offset, p.filterRelease, t);
    releaseTo0(this.sources["mod env"].offset, p.modEnvRelease, t);
    return t + p.release * 1.8 + 0.05;
  }

  /** Fast fade for voice stealing. */
  kill(t: number) {
    hold(this.amp.gain, t);
    this.amp.gain.setTargetAtTime(0, t, 0.005);
    this.stop(t + 0.05);
  }

  stop(at: number) {
    // The worklet has no stop(): it is told when to end, and then lets itself be removed.
    this.osc.port.postMessage({ stopAt: at });
    for (const s of [this.noise, ...Object.values(this.sources)]) {
      try {
        s.stop(at);
      } catch {
        // already stopped
      }
    }
    // The shared modulation sources hold references to every voice they feed: unplug them.
    this.noise.onended = () => {
      this.vc.pitchMod.disconnect(this.param("detune"));
      this.vc.widthMod.disconnect(this.param("width"));
      this.vc.positionMod.disconnect(this.param("position"));
      this.vc.filterMod.disconnect(this.filter.detune);
      for (const route of this.routes.values()) this.unplug(route);
      this.routes.clear();
      const nodes: AudioNode[] = [this.osc, this.noise, this.mix, this.shaper, this.filter, this.amp, this.modVca, this.filterEnvGain, this.pitchEnvGain];
      for (const n of [...nodes, ...Object.values(this.sources)]) n.disconnect();
    };
  }
}
