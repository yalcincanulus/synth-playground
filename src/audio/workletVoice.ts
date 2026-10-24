// The new engine's voice, as seen from the main thread: it keeps the note's state for the engine
// (and the visualisations) and sends each action to the "synth-voices" processor, which makes the sound.

import type { BankMessage } from "./dsp/voiceBank";
import { releaseEnd } from "./dsp/voiceMath";
import type { ParamValues } from "./params";
import type { NoteOwner, SynthVoice } from "./voice";

let nextId = 1;

export class WorkletVoice implements SynthVoice {
  owner: NoteOwner = "keys";
  releasedAt: number | null = null;
  readonly startedAt: number;
  triggeredAt: number;
  velocity: number;
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
    this.send({
      type: "on",
      id: this.id,
      t,
      note,
      velocity,
      unison,
      // Random parts are picked here, so a seeded render (render check) is repeatable.
      phases: Array.from({ length: 2 * unison }, () => Math.random()),
      seed: Math.floor(Math.random() * 2 ** 32),
    });
  }

  private send(msg: BankMessage) {
    this.port.postMessage(msg);
  }

  /** Nothing to do: the processor gets parameters once for all its voices (Engine sends them). */
  apply() {}

  glideTo(note: number, p: ParamValues, t: number) {
    this.note = note;
    this.send({ type: "glide", id: this.id, t, note, tc: Math.max(0.001, p.glide / 3) });
  }

  retrigger(_p: ParamValues, velocity: number, t: number) {
    this.releasedAt = null;
    this.triggeredAt = t;
    this.velocity = velocity;
    this.random = Math.random() * 2 - 1;
    this.send({ type: "retrigger", id: this.id, t, velocity });
  }

  release(p: ParamValues, t: number): number {
    this.releasedAt = t;
    this.send({ type: "release", id: this.id, t });
    return t + releaseEnd(p);
  }

  kill(t: number) {
    this.send({ type: "kill", id: this.id, t });
  }

  stop(at: number) {
    this.send({ type: "stop", id: this.id, t: at });
  }
}
