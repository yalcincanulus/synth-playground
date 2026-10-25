// The output's soft clipper. The limiter before it needs 2 ms to react, so the start of a loud note can
// still go past full scale, where the sound card would cut it off flat (hard clipping: a harsh crackle).
// This curve leaves everything below KNEE untouched and bends louder peaks smoothly towards full scale,
// so they saturate (warmer, like tape) instead.

/** Below this level (about -3 dB) the sound passes unchanged. */
export const KNEE = 0.7;
/** The curve covers inputs up to this level (+6 dB); a WaveShaperNode holds its end value beyond. */
export const CLIP_RANGE = 2;

/** The clipper's output for an input level; never beyond ±1, and with no corner at the knee. */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  return Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
}

/** The curve for a WaveShaperNode fed the signal divided by CLIP_RANGE (its input runs -1..1). */
export function softClipCurve(points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = softClip(((i / (points - 1)) * 2 - 1) * CLIP_RANGE);
  return curve;
}
