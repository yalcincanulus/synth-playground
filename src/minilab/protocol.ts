// Arturia MiniLab 3 MIDI protocol.
//
// Inbound maps were captured from the device (research/capture-arturia-mode.log).
// Outbound SysEx comes from Ableton Live's MiniLab_3 remote script and was
// verified on hardware (firmware reply: 02 00 04 04 45 00 02 01).
// See docs/minilab3-protocol.md for details and open questions.

export const SYSEX_HEADER = [0xf0, 0x00, 0x20, 0x6b, 0x7f, 0x42] as const;
const END = 0xf7;

export type Program = "arturia" | "daw";
export type PadBank = "A" | "B";
export type TransportButton = "loop" | "stop" | "play" | "record" | "tap";

// --- Inbound CC maps. Arturia and DAW programs use disjoint CC numbers,
// so both maps can be decoded at once without knowing the current mode.

interface CcMap {
  knobs: number[];
  faders: number[];
  shift: number;
  encoder: number;
  encoderClick: number;
  shiftedEncoder?: number;
  shiftedEncoderClick?: number;
}

export const CC_MAPS: Record<Program, CcMap> = {
  arturia: {
    knobs: [74, 71, 76, 77, 93, 18, 19, 16],
    faders: [82, 83, 85, 17],
    shift: 9,
    encoder: 114,
    encoderClick: 115,
  },
  daw: {
    knobs: [86, 87, 89, 90, 110, 111, 116, 117],
    faders: [14, 15, 30, 31],
    shift: 27,
    encoder: 28,
    encoderClick: 118,
    shiftedEncoder: 29,
    shiftedEncoderClick: 119,
  },
};

export const MOD_CC = 1;
export const PAD_CHANNEL = 9; // 0-based, i.e. MIDI channel 10
export const PAD_NOTES: Record<PadBank, number> = { A: 36, B: 44 };
export const TRANSPORT_CCS: Record<number, TransportButton> = {
  105: "loop",
  106: "stop",
  107: "play",
  108: "record",
  109: "tap",
};

// --- Decoded events

export type ControlEvent =
  | { type: "key"; note: number; velocity: number; on: boolean; channel: number }
  | { type: "pad"; index: number; bank: PadBank; note: number; velocity: number; on: boolean }
  | { type: "padPressure"; index: number; bank: PadBank; value: number }
  | { type: "knob"; index: number; value: number; program: Program }
  | { type: "fader"; index: number; value: number; program: Program }
  | { type: "pitchBend"; value: number } // -1..1
  | { type: "mod"; value: number }
  | { type: "encoder"; delta: number; shifted: boolean }
  | { type: "encoderClick"; pressed: boolean; shifted: boolean }
  | { type: "shift"; pressed: boolean }
  | { type: "transport"; button: TransportButton; pressed: boolean }
  | { type: "program"; program: Program }
  | { type: "padBank"; bank: PadBank }
  | { type: "identity"; bytes: number[] }
  | { type: "unknown"; bytes: number[] };

const ccLookup = new Map<number, (value: number) => ControlEvent>();
for (const program of ["arturia", "daw"] as const) {
  const m = CC_MAPS[program];
  m.knobs.forEach((cc, index) => ccLookup.set(cc, (value) => ({ type: "knob", index, value, program })));
  m.faders.forEach((cc, index) => ccLookup.set(cc, (value) => ({ type: "fader", index, value, program })));
  ccLookup.set(m.shift, (v) => ({ type: "shift", pressed: v > 0 }));
  // Relative encoder: 64 is a "rest" value sent between steps, so delta 0 is dropped by the caller.
  ccLookup.set(m.encoder, (v) => ({ type: "encoder", delta: Math.sign(v - 64), shifted: false }));
  ccLookup.set(m.encoderClick, (v) => ({ type: "encoderClick", pressed: v > 0, shifted: false }));
  if (m.shiftedEncoder !== undefined)
    ccLookup.set(m.shiftedEncoder, (v) => ({ type: "encoder", delta: Math.sign(v - 64), shifted: true }));
  if (m.shiftedEncoderClick !== undefined)
    ccLookup.set(m.shiftedEncoderClick, (v) => ({ type: "encoderClick", pressed: v > 0, shifted: true }));
}
ccLookup.set(MOD_CC, (value) => ({ type: "mod", value }));
for (const [cc, button] of Object.entries(TRANSPORT_CCS))
  ccLookup.set(Number(cc), (v) => ({ type: "transport", button, pressed: v > 0 }));

function padFromNote(note: number): { index: number; bank: PadBank } | null {
  for (const bank of ["A", "B"] as const) {
    const index = note - PAD_NOTES[bank];
    if (index >= 0 && index < 8) return { index, bank };
  }
  return null;
}

/** Decode one MIDI message from the main "Minilab3 MIDI" port. Returns null for no-op messages. */
export function decode(bytes: ArrayLike<number>): ControlEvent | null {
  const data = Array.from(bytes);
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;

  if (data[0] === 0xf0) return decodeSysex(data);

  switch (status) {
    case 0x80:
    case 0x90: {
      const on = status === 0x90 && data[2] > 0;
      const pad = channel === PAD_CHANNEL ? padFromNote(data[1]) : null;
      if (pad) return { type: "pad", ...pad, note: data[1], velocity: data[2], on };
      return { type: "key", note: data[1], velocity: data[2], on, channel };
    }
    case 0xa0: {
      const pad = channel === PAD_CHANNEL ? padFromNote(data[1]) : null;
      if (pad) return { type: "padPressure", ...pad, value: data[2] };
      break;
    }
    case 0xb0: {
      const make = ccLookup.get(data[1]);
      if (!make) break;
      const event = make(data[2]);
      if (event.type === "encoder" && event.delta === 0) return null;
      return event;
    }
    case 0xe0: {
      const raw = (data[2] << 7) | data[1];
      return { type: "pitchBend", value: Math.max(-1, (raw - 8192) / 8191) };
    }
  }
  return { type: "unknown", bytes: data };
}

function decodeSysex(data: number[]): ControlEvent {
  // Universal identity reply: F0 7E <dev> 06 02 ...
  if (data[1] === 0x7e && data[3] === 0x06 && data[4] === 0x02) return { type: "identity", bytes: data };
  const isArturia = SYSEX_HEADER.every((b, i) => data[i] === b);
  if (isArturia) {
    const body = data.slice(SYSEX_HEADER.length, -1);
    // 02 00 40 62 <prog>: program changed (1 = Arturia, 2 = DAW)
    // 02 00 40 63 <bank>: pad bank changed (0 = A, 1 = B)
    if (body[0] === 0x02 && body[1] === 0x00 && body[2] === 0x40) {
      if (body[3] === 0x62) return { type: "program", program: body[4] === 2 ? "daw" : "arturia" };
      if (body[3] === 0x63) return { type: "padBank", bank: body[4] === 1 ? "B" : "A" };
    }
  }
  return { type: "unknown", bytes: data };
}

// --- Outbound messages

export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, END];

/** Tells the device a DAW is connected. Required before LED and display messages take effect. */
export const connectMessage = () => [...SYSEX_HEADER, 0x02, 0x00, 0x40, 0x6a, 0x21, END];
export const disconnectMessage = () => [...SYSEX_HEADER, 0x02, 0x00, 0x40, 0x6a, 0x20, END];
export const requestProgramMessage = () => [...SYSEX_HEADER, 0x01, 0x00, 0x40, 0x01, END];

/** LED IDs for the RGB colour message. Pad and Oct IDs are verified; Shift/Hold are guesses. */
export const LED_IDS = {
  padsA: [0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b],
  padsB: [0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b],
  transport: { loop: 0x57, stop: 0x58, play: 0x59, record: 0x5a, tap: 0x5b } as Record<TransportButton, number>,
  octMinus: 0x31,
  octPlus: 0x33,
} as const;

const clamp7 = (n: number) => Math.max(0, Math.min(127, Math.round(n)));

/** Set one LED's colour. r, g, b are 0-127. */
export const ledColorMessage = (id: number, r: number, g: number, b: number) => [
  ...SYSEX_HEADER, 0x02, 0x02, 0x16, id & 0x7f, clamp7(r), clamp7(g), clamp7(b), END,
];

export type DisplayIcon = "none" | "arp" | "play" | "record" | "arm";
const ICON_BYTES: Record<DisplayIcon, number> = { none: 0, arp: 1, play: 2, record: 3, arm: 4 };

export const DISPLAY_LINE_1_WIDTH = 10;
export const DISPLAY_LINE_2_WIDTH = 18;

function ascii(text: string, width: number): number[] {
  return Array.from(text.slice(0, width), (c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code < 0x7f ? code : 0x3f; // '?'
  });
}

const DISPLAY_HEADER = [...SYSEX_HEADER, 0x04, 0x02, 0x60];

/** Persistent two-line screen. Icons occupy three slots: [transport, arm, arp]. */
export function displayMessage(
  line1: string,
  line2: string,
  icons: { transport?: "none" | "play" | "record"; arm?: boolean; arp?: boolean } = {},
): number[] {
  return [
    ...DISPLAY_HEADER,
    0x1f, 0x07, 0x01,
    ICON_BYTES[icons.transport ?? "none"],
    icons.arm ? ICON_BYTES.arm : 0,
    icons.arp ? ICON_BYTES.arp : 0,
    0x00,
    0x01, ...ascii(line1, DISPLAY_LINE_1_WIDTH), 0x00,
    0x02, ...ascii(line2, DISPLAY_LINE_2_WIDTH), 0x00,
    END,
  ];
}

/** Transient parameter popup (as when turning a knob), keyed by the control's CC number. */
export function parameterMessage(cc: number, name: string, value: string): number[] {
  return [
    ...DISPLAY_HEADER,
    0x1f, 0x08, 0x02, cc & 0x7f, 0x00,
    0x01, ...ascii(name, DISPLAY_LINE_1_WIDTH), 0x00,
    0x02, ...ascii(value, DISPLAY_LINE_2_WIDTH), 0x00,
    END,
  ];
}

/** Knob realign IDs (DAW program): knob index 0-7 -> 7..14. */
export const KNOB_REALIGN_IDS = [7, 8, 9, 10, 11, 12, 13, 14];

/** Set the device's internal value for a knob so the next turn continues from `value`. */
export const knobValueMessage = (knobIndex: number, value: number) => [
  ...SYSEX_HEADER, 0x21, 0x10, 0x00, KNOB_REALIGN_IDS[knobIndex], 0x00, clamp7(value), END,
];

export const toHex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
