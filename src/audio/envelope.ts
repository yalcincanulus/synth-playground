// Envelope math matching what Voice schedules on its AudioParams: a linear attack,
// then exponential approaches (setTargetAtTime with time constant = stage / 4).
// The engine only schedules envelopes; this recomputes where they are, for display.

export interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export type Stage = "attack" | "decay" | "sustain" | "release" | "off";

export interface EnvPoint {
  /** 0..1, relative to the envelope's peak. */
  level: number;
  stage: Stage;
  /** Seconds into the current stage. */
  elapsed: number;
}

/** Level while the key is held, `t` seconds after the envelope started. */
function heldLevel(env: Adsr, t: number): EnvPoint {
  if (t < env.attack) return { level: t / env.attack, stage: "attack", elapsed: t };
  const d = t - env.attack;
  const level = env.sustain + (1 - env.sustain) * Math.exp(-d / (env.decay / 4));
  // After one decay time the curve is within 2% of sustain: call it sustain.
  return { level, stage: d < env.decay ? "decay" : "sustain", elapsed: d < env.decay ? d : d - env.decay };
}

export function envelopeAt(env: Adsr, now: number, triggeredAt: number, releasedAt: number | null): EnvPoint {
  if (releasedAt === null || now < releasedAt) return heldLevel(env, now - triggeredAt);
  const from = heldLevel(env, releasedAt - triggeredAt).level;
  const elapsed = now - releasedAt;
  const level = from * Math.exp(-elapsed / (env.release / 4));
  return { level, stage: level < 0.005 ? "off" : "release", elapsed };
}
