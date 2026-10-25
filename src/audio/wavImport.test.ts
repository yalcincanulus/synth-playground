import { describe, expect, test } from "bun:test";
import { CUT_FRAMES, cutIntoFrames, detectPeriod, makeWav, MAX_FRAMES, parseWav } from "./wavImport";
import { FRAME_SIZE } from "./wavetables";

const TAU = 2 * Math.PI;

/** A Serum-style table: `count` frames, each a saw with more harmonics than the last. */
function serumTable(count: number, size = FRAME_SIZE) {
  const x = new Float32Array(count * size);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < size; i++) {
      let y = 0;
      for (let h = 1; h <= f + 1; h++) y += Math.sin((TAU * h * i) / size) / h;
      x[f * size + i] = 0.5 * y;
    }
  }
  return x;
}

/** A 16-bit stereo PCM WAV (the most common kind of sound file). */
function pcm16Stereo(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const n = left.length;
  const out = new ArrayBuffer(44 + n * 4);
  const v = new DataView(out);
  const put = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(left[i] * 32767), true);
    v.setInt16(46 + i * 4, Math.round(right[i] * 32767), true);
  }
  return out;
}

/** Correlation of two frames, 1 = same shape. */
function similarity(a: Float32Array, b: Float32Array) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb);
}

describe("parseWav", () => {
  test("reads a float WAV with Serum's clm chunk", () => {
    const table = serumTable(4);
    const sound = parseWav(makeWav(table, 44100, 2048));
    expect(sound.sampleRate).toBe(44100);
    expect(sound.frameSize).toBe(2048);
    expect(sound.samples.length).toBe(table.length);
    expect(sound.samples[100]).toBeCloseTo(table[100], 6);
  });

  test("reads 16-bit stereo PCM, mixed to mono", () => {
    const l = new Float32Array(1000).fill(0.5);
    const r = new Float32Array(1000).fill(-0.25);
    const sound = parseWav(pcm16Stereo(l, r, 48000));
    expect(sound.frameSize).toBeUndefined();
    expect(sound.samples.length).toBe(1000);
    expect(sound.samples[10]).toBeCloseTo(0.125, 3);
  });

  test("rejects files that aren't WAV", () => {
    expect(() => parseWav(new TextEncoder().encode("ID3 not a wav at all").buffer as ArrayBuffer)).toThrow("Not a WAV");
  });
});

describe("cutIntoFrames", () => {
  test("a Serum table comes through frame for frame, never resampled", () => {
    const table = serumTable(8);
    const { frames, mode } = cutIntoFrames(parseWav(makeWav(table, 44100, 2048)));
    expect(mode).toBe("frames");
    expect(frames.length).toBe(8);
    for (let f = 0; f < 8; f++) {
      const src = table.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE);
      expect(similarity(frames[f], src)).toBeGreaterThan(0.9999);
    }
  });

  test("without a clm chunk, whole 2048-sample frames still read as a table", () => {
    const { frames, mode } = cutIntoFrames(parseWav(makeWav(serumTable(3))));
    expect(mode).toBe("frames");
    expect(frames.length).toBe(3);
  });

  test("other frame sizes are stretched to 2048", () => {
    const table = serumTable(4, 1024);
    const { frames, how } = cutIntoFrames(parseWav(makeWav(table, 44100, 1024)));
    expect(frames.length).toBe(4);
    expect(frames[0].length).toBe(FRAME_SIZE);
    expect(how).toContain("1024");
    // Frame 2 has 3 harmonics: its stretched copy has the same shape.
    const stretched = Float32Array.from({ length: FRAME_SIZE }, (_, i) => table[2 * 1024 + Math.floor(i / 2)]);
    expect(similarity(frames[2], stretched)).toBeGreaterThan(0.999);
  });

  test("the whole table shares one gain, so a fade-out stays a fade-out", () => {
    const table = serumTable(2);
    for (let i = FRAME_SIZE; i < 2 * FRAME_SIZE; i++) table[i] *= 0.1;
    const { frames } = cutIntoFrames(parseWav(makeWav(table)));
    const peak = (f: Float32Array) => Math.max(...f.map(Math.abs));
    expect(peak(frames[0])).toBeCloseTo(1, 3);
    expect(peak(frames[1])).toBeLessThan(0.2);
  });

  test("never more than 256 frames", () => {
    const { frames } = cutIntoFrames({ sampleRate: 44100, samples: new Float32Array(300 * FRAME_SIZE).fill(0.1), frameSize: FRAME_SIZE });
    expect(frames.length).toBe(MAX_FRAMES);
  });

  test("a pitched sound is cut into single cycles that keep its shape", () => {
    const sr = 48000, hz = 220;
    // Two harmonics, the second fading in: the cycles should change along the table.
    const x = Float32Array.from({ length: sr }, (_, i) => {
      const t = i / sr;
      return 0.6 * Math.sin(TAU * hz * t) + 0.4 * t * Math.sin(TAU * 3 * hz * t + 0.3);
    });
    const { frames, mode, how } = cutIntoFrames({ sampleRate: sr, samples: x });
    expect(mode).toBe("cycles");
    expect(how).toContain("220 Hz");
    expect(frames.length).toBe(CUT_FRAMES);
    // One cycle per frame: the fundamental is harmonic 1 of the frame.
    const harmonic = (f: Float32Array, h: number) => {
      let re = 0, im = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        re += f[i] * Math.cos((TAU * h * i) / FRAME_SIZE);
        im += f[i] * Math.sin((TAU * h * i) / FRAME_SIZE);
      }
      return Math.hypot(re, im) / (FRAME_SIZE / 2);
    };
    const first = frames[0], last = frames[frames.length - 1];
    expect(harmonic(first, 1)).toBeGreaterThan(0.9);
    expect(harmonic(first, 2)).toBeLessThan(0.01);
    expect(harmonic(last, 3) / harmonic(last, 1)).toBeGreaterThan(0.5);
    // Neighbouring frames are lined up (no phase flips that would cancel when blended).
    for (let f = 1; f < frames.length; f++) expect(similarity(frames[f - 1], frames[f])).toBeGreaterThan(0.95);
    // Each cycle loops: its end leads into its start.
    for (const f of frames) expect(Math.abs(f[FRAME_SIZE - 1] - f[0])).toBeLessThan(0.02);
  });

  test("noise has no pitch, so it is cut into looped slices", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    const x = Float32Array.from({ length: 48000 }, rand);
    const { frames, mode } = cutIntoFrames({ sampleRate: 48000, samples: x });
    expect(mode).toBe("slices");
    expect(frames.length).toBe(CUT_FRAMES);
    for (const f of frames) {
      // The fade makes the end lead into the start like neighbouring samples do.
      expect(Math.abs(f[FRAME_SIZE - 1] - f[0])).toBeLessThan(2);
      expect(Math.max(...f.map(Math.abs))).toBeCloseTo(1, 3);
    }
  });

  test("a very short sound becomes one frame", () => {
    const x = Float32Array.from({ length: 500 }, (_, i) => Math.sin((TAU * i) / 500));
    const { frames } = cutIntoFrames({ sampleRate: 48000, samples: x }, "slices");
    expect(frames.length).toBe(1);
  });

  test("a silent sound is refused", () => {
    expect(() => cutIntoFrames({ sampleRate: 48000, samples: new Float32Array(5000) }, "cycles")).toThrow("silent");
  });
});

describe("detectPeriod", () => {
  test.each([55, 110, 440, 1000])("finds %d Hz", (hz) => {
    const sr = 44100;
    const x = Float32Array.from({ length: sr / 2 }, (_, i) => Math.sin((TAU * hz * i) / sr) + 0.5 * Math.sin((TAU * 2 * hz * i) / sr));
    const period = detectPeriod(x, sr)!;
    expect(sr / period).toBeCloseTo(hz, 0);
  });
});
