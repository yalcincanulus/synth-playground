import { describe, expect, test } from "bun:test";
import { VoiceBank, type BankMessage } from "./dsp/voiceBank";
import { defaultValues, type ParamValues } from "./params";
import { Voice } from "./voice";

const SR = 48000;
const BLOCK = 128;

/** A voice processor reached the way a part reaches it: through a port. */
function processor(over: Partial<ParamValues> = {}) {
  const p = { ...defaultValues(), ...over };
  const bank = new VoiceBank(SR, p);
  const port = { postMessage: (m: BankMessage) => bank.post(m) } as unknown as MessagePort;
  const run = (seconds: number) => {
    const left = new Float32Array(BLOCK);
    const right = new Float32Array(BLOCK);
    for (let i = 0; i < seconds * SR; i += BLOCK) bank.render(left, right, i);
  };
  return { p, bank, port, run };
}

describe("Voice", () => {
  test("a planned note killed before it starts doesn't play on", () => {
    const { p, bank, port, run } = processor();
    const v = new Voice(port, p, 60, 100, 0.2);
    v.kill(0.05);
    run(0.5);
    expect(bank.voiceCount).toBe(0);
  });

  test("a planned note released (and its stop due) before it starts doesn't play on", () => {
    const { p, bank, port, run } = processor({ release: 0.01 });
    const v = new Voice(port, p, 60, 100, 0.2);
    v.stop(v.release(p, 0.05));
    run(0.5);
    expect(bank.voiceCount).toBe(0);
  });
});
