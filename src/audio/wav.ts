// WAV files out: the song export and the output recorder write plain PCM WAV, 16 or 24 bit, which every
// audio player opens. And where a render's tail (the delay and reverb ringing out) has fallen silent.
// Plain code, so it is tested without a browser.

export type WavBits = 16 | 24;

/** Below this (dBFS) the tail counts as silence: under the noise of a 16-bit file's last bit, near enough. */
export const SILENCE_DB = -84;
/** The last moments before the cut fade out, so it doesn't click. */
export const FADE_S = 0.02;

/**
 * Stereo (or mono) samples as a WAV file. Samples beyond ±1 are clipped. 16-bit samples get a little TPDF
 * dither (the quiet end of a reverb tail stays smooth instead of breaking into steps); `random` makes it
 * repeatable in tests.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, bits: WavBits, random: () => number = Math.random): ArrayBuffer {
  const n = channels[0]?.length ?? 0;
  const count = channels.length;
  const bytes = bits / 8;
  const dataSize = n * count * bytes;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, count, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * count * bytes, true);
  v.setUint16(32, count * bytes, true);
  v.setUint16(34, bits, true);
  text(36, "data");
  v.setUint32(40, dataSize, true);
  const max = bits === 16 ? 32767 : 8388607;
  const dither = bits === 16 ? () => random() - random() : () => 0;
  let at = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      const s = Math.max(-max - 1, Math.min(max, Math.round(x * max + dither())));
      if (bits === 16) v.setInt16(at, s, true);
      else {
        v.setUint8(at, s & 0xff);
        v.setUint8(at + 1, (s >> 8) & 0xff);
        v.setUint8(at + 2, (s >> 16) & 0xff);
      }
      at += bytes;
    }
  }
  return buf;
}

/**
 * Where a render can end: after `from` (the song's last bar), at the last sample louder than SILENCE_DB, plus
 * the fade's length; never past the end of the render. Returns a length in samples.
 */
export function tailEnd(channels: readonly Float32Array[], from: number, sampleRate: number): number {
  const n = channels[0]?.length ?? 0;
  const floor = 10 ** (SILENCE_DB / 20);
  let last = Math.min(from, n);
  for (const ch of channels) {
    for (let i = n - 1; i >= last; i--) {
      if (Math.abs(ch[i]) > floor) {
        last = i + 1;
        break;
      }
    }
  }
  return Math.min(n, last + Math.round(FADE_S * sampleRate));
}

/** The first `length` samples of each channel, fading out over the last FADE_S when that cuts a tail short. */
export function cut(channels: readonly Float32Array[], length: number, sampleRate: number): Float32Array[] {
  const fade = Math.min(length, Math.round(FADE_S * sampleRate));
  return channels.map((ch) => {
    const out = ch.slice(0, length);
    for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
    return out;
  });
}

/** The loudest sample, in dBFS (-Infinity for silence). */
export function peakDb(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
