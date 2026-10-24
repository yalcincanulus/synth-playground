// A sounding note, as seen from the main thread: it keeps the note's state for the engine (and the
// visualisations) and sends each action to the "synth-voices" processor, which makes the sound
// (dsp/voiceBank.ts).

import type { BankMessage } from "./dsp/voiceBank";
import { releaseEnd } from "./dsp/voiceMath";
import type { ParamValues } from "./params";
import { voiceWeight } from "./voiceLimit";

export type NoteOwner = "keys" | "seq";

let nextId = 1;

export class Voice {
  /** Who played it: your keys or the step sequencer. Each only releases its own notes. */
  owner: NoteOwner = "keys";
  releasedAt: number | null = null;
  readonly startedAt: number;
  /** When the envelopes last (re)started: differs from startedAt after a mono retrigger. */
  triggeredAt: number;
  velocity: number;
  /** How much work this voice is for the processor (see voiceWeight). */
  readonly weight: number;
  /** This note's "random" mod source value, -1..1. */
  random = Math.random() * 2 - 1;
  private id = nextId++;

  constructor(
    private port: MessagePort,
    p: ParamValues,
    public note: number,
    velocity: number,
    t: number,
  ) {
    this.startedAt = this.triggeredAt = t;
    this.velocity = velocity;
    const unison = Math.max(1, Math.min(3, Math.round(p.unison)));
    this.weight = voiceWeight(unison);
    this.send({
      type: "on",
      id: this.id,
      t,
      note,
      velocity,
      random: this.random,
      unison,
      // Random parts are picked here, so a seeded render (render check) is repeatable.
      phases: Array.from({ length: 2 * unison }, () => Math.random()),
      seed: Math.floor(Math.random() * 2 ** 32),
    });
  }

  private send(msg: BankMessage) {
    this.port.postMessage(msg);
  }

  /** Mono: move to a new note without retriggering the envelopes. */
  glideTo(note: number, p: ParamValues, t: number) {
    this.note = note;
    this.send({ type: "glide", id: this.id, t, note, tc: Math.max(0.001, p.glide / 3) });
  }

  /** Mono: restart the envelopes from where they are. */
  retrigger(velocity: number, t: number) {
    this.releasedAt = null;
    this.triggeredAt = t;
    this.velocity = velocity;
    this.random = Math.random() * 2 - 1;
    this.send({ type: "retrigger", id: this.id, t, velocity, random: this.random });
  }

  /** Start the release; returns the time the voice falls silent. */
  release(p: ParamValues, t: number): number {
    this.releasedAt = t;
    this.send({ type: "release", id: this.id, t });
    return t + releaseEnd(p);
  }

  /** Fast fade (voice stealing), then stop. */
  kill(t: number) {
    this.send({ type: "kill", id: this.id, t });
  }

  stop(at: number) {
    this.send({ type: "stop", id: this.id, t: at });
  }
}
