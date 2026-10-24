// A value that moves sample by sample the way an AudioParam's automation does, so the new voice
// engine's envelopes and glides matched the old Web Audio engine's exactly (roadmap slices 2-3):
//
// - `ramp`: linearRampToValueAtTime from the current value, optionally followed by setTargetAtTime
//   (an envelope's attack, then its decay toward sustain).
// - `approach`: setTargetAtTime from the current value (decay, release, glide, parameter smoothing).
//
// Times are in samples. `tick()` returns the value for the current sample and moves one sample on.

const HOLD = 0;
const LINEAR = 1;
const TARGET = 2;

export class Ramp {
  value: number;
  private mode = HOLD;
  // Linear segment
  private step = 0;
  private left = 0;
  private end = 0;
  // Exponential approach (now, or after the linear segment)
  private target = 0;
  private coef = 0;
  private thenTarget = 0;
  private thenCoef = -1;

  constructor(value = 0) {
    this.value = value;
  }

  /** Jump to `value` and stay there. */
  set(value: number) {
    this.value = value;
    this.mode = HOLD;
  }

  /**
   * Straight line from the current value to `to` over `samples`, then (optionally) approach `then`
   * with time constant `thenTc` samples.
   */
  ramp(to: number, samples: number, then?: number, thenTc = 0) {
    this.thenCoef = then === undefined ? -1 : coefFor(thenTc);
    this.thenTarget = then ?? 0;
    if (samples < 1) {
      this.value = to;
      this.afterLinear();
      return;
    }
    this.mode = LINEAR;
    this.end = to;
    this.left = samples;
    this.step = (to - this.value) / samples;
  }

  /** Approach `target` exponentially from the current value, with time constant `tc` samples. */
  approach(target: number, tc: number) {
    this.mode = TARGET;
    this.target = target;
    this.coef = coefFor(tc);
  }

  tick(): number {
    const v = this.value;
    if (this.mode === LINEAR) {
      if (--this.left <= 0) {
        this.value = this.end;
        this.afterLinear();
      } else this.value += this.step;
    } else if (this.mode === TARGET) {
      this.value = this.target + (this.value - this.target) * this.coef;
    }
    return v;
  }

  private afterLinear() {
    if (this.thenCoef < 0) this.mode = HOLD;
    else {
      this.mode = TARGET;
      this.target = this.thenTarget;
      this.coef = this.thenCoef;
    }
  }
}

/** Per-sample factor for an exponential approach with time constant `tc` samples. */
export const coefFor = (tc: number) => (tc <= 0 ? 0 : Math.exp(-1 / tc));
