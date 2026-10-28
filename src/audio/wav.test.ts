import { describe, expect, test } from "bun:test";
import { cut, encodeWav, FADE_S, peakDb, tailEnd } from "./wav";

const noDither = () => 0.5;

describe("WAV files", () => {
  test("a 16-bit stereo file: its header, and samples interleaved and clipped", () => {
    const left = Float32Array.from([0, 0.5, -1, 2]);
    const right = Float32Array.from([1, -0.5, 0.25, -3]);
    const buf = encodeWav([left, right], 48000, 16, noDither);
    const v = new DataView(buf);
    const text = (at: number) => String.fromCharCode(...new Uint8Array(buf, at, 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 4);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(4 * 4);
    const samples = Array.from(new Int16Array(buf, 44));
    expect(samples).toEqual([0, 32767, 16384, -16383, -32767, 8192, 32767, -32767]);
  });

  test("24 bit: three bytes a sample, little-endian, the sign kept", () => {
    const buf = encodeWav([Float32Array.from([0.5, -0.5, -1])], 44100, 24, noDither);
    const v = new DataView(buf);
    expect(v.getUint16(34, true)).toBe(24);
    expect(v.getUint16(32, true)).toBe(3);
    expect(buf.byteLength).toBe(44 + 9);
    const read = (at: number) => (v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16));
    expect([read(44), read(47), read(50)]).toEqual([4194304, -4194303, -8388607]);
  });

  test("16-bit dither stays within a step either way", () => {
    let k = 0;
    const random = () => [0, 1][k++ % 2];
    const buf = encodeWav([Float32Array.from([0, 0])], 44100, 16, random);
    expect(Array.from(new Int16Array(buf, 44)).every((s) => Math.abs(s) <= 1)).toBe(true);
  });
});

describe("tails", () => {
  const rate = 1000;
  test("ends after the last sound past the song's end, plus a fade", () => {
    const ch = new Float32Array(5000);
    ch[100] = 1;
    ch[3000] = 0.01; // the reverb, still ringing
    expect(tailEnd([ch, new Float32Array(5000)], 2000, rate)).toBe(3001 + FADE_S * rate);
  });

  test("a silent tail ends at the song's end (plus the fade); never past the render", () => {
    const ch = new Float32Array(3000);
    ch[10] = 1;
    expect(tailEnd([ch], 2000, rate)).toBe(2000 + FADE_S * rate);
    const loud = new Float32Array(3000).fill(0.5);
    expect(tailEnd([loud], 2000, rate)).toBe(3000);
  });

  test("the cut fades out its last moments", () => {
    const [out] = cut([new Float32Array(100).fill(1)], 80, rate);
    expect(out.length).toBe(80);
    expect(out[79]).toBe(0);
    expect(out[50]).toBe(1);
    expect(out[70]).toBeGreaterThan(0);
    expect(out[70]).toBeLessThan(1);
  });

  test("peak level", () => {
    expect(peakDb([Float32Array.from([0, -0.5])])).toBeCloseTo(-6.02, 1);
    expect(peakDb([new Float32Array(4)])).toBe(-Infinity);
  });
});
