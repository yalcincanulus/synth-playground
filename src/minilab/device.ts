import {
  connectMessage,
  decode,
  disconnectMessage,
  IDENTITY_REQUEST,
  requestProgramMessage,
  type ControlEvent,
} from "./protocol";

const MAIN_PORT = /minilab\s*3/i;
const OTHER_PORTS = /DIN|MCU|HUI|ALV/i;

export const isMainPort = (port: MIDIPort) => MAIN_PORT.test(port.name ?? "") && !OTHER_PORTS.test(port.name ?? "");

export interface RawMessage {
  direction: "in" | "out";
  bytes: number[];
  time: number;
}

/**
 * A MiniLab 3 on one input/output port pair.
 *
 * Outgoing messages go through a paced queue: the device drops or misroutes
 * SysEx sent back-to-back. A message with a `key` replaces any pending message
 * with the same key, so rapid updates (LEDs, display) collapse to the latest.
 */
export class MiniLab {
  /** Minimum gap between outgoing messages, in ms. */
  gapMs = 15;

  private queue: { key?: string; bytes: number[] }[] = [];
  private draining = false;
  private eventListeners = new Set<(e: ControlEvent) => void>();
  private rawListeners = new Set<(m: RawMessage) => void>();

  constructor(
    readonly input: MIDIInput,
    readonly output: MIDIOutput,
  ) {
    input.onmidimessage = (e) => {
      if (!e.data) return;
      const bytes = Array.from(e.data);
      this.rawListeners.forEach((l) => l({ direction: "in", bytes, time: e.timeStamp }));
      const event = decode(bytes);
      if (event) this.eventListeners.forEach((l) => l(event));
    };
  }

  onEvent(listener: (e: ControlEvent) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onRaw(listener: (m: RawMessage) => void) {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  send(bytes: number[], key?: string) {
    const pending = key === undefined ? -1 : this.queue.findIndex((m) => m.key === key);
    if (pending >= 0) this.queue[pending].bytes = bytes;
    else this.queue.push({ key, bytes });
    if (!this.draining) this.drain();
  }

  private drain() {
    const next = this.queue.shift();
    if (!next) {
      this.draining = false;
      return;
    }
    this.draining = true;
    try {
      this.output.send(next.bytes);
      this.rawListeners.forEach((l) => l({ direction: "out", bytes: next.bytes, time: performance.now() }));
    } catch (err) {
      console.error("MIDI send failed", err);
    }
    setTimeout(() => this.drain(), this.gapMs);
  }

  /** DAW handshake: enables LED and display control, and asks for the current program. */
  hello() {
    this.send(IDENTITY_REQUEST);
    this.send(connectMessage());
    this.send(requestProgramMessage());
  }

  goodbye() {
    this.send(disconnectMessage());
  }

  close() {
    this.input.onmidimessage = null;
    this.queue = [];
  }
}

export async function requestMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) throw new Error("Web MIDI is not supported in this browser.");
  return navigator.requestMIDIAccess({ sysex: true });
}

export function findPorts(access: MIDIAccess) {
  const inputs = [...access.inputs.values()];
  const outputs = [...access.outputs.values()];
  return {
    inputs,
    outputs,
    input: inputs.find(isMainPort),
    output: outputs.find(isMainPort),
  };
}
