# MiniLab 3 MIDI protocol

Sources: captured from the device on 2026-10-23 (`research/capture-arturia-mode.log`), plus Ableton Live 12's
`MiniLab_3` remote script (decompiled: github.com/gluon/AbletonLive12_MIDIRemoteScripts). The code version is
`src/minilab/protocol.ts`.

Status: **verified** = seen on hardware. **script** = from Ableton's script, not yet seen on hardware.

## Ports (Linux ALSA names)

| Port | Use |
|---|---|
| `Minilab3 MIDI` | Everything: controls in, SysEx out. The app uses only this port. |
| `Minilab3 DIN THRU` | MIDI out to the 5-pin DIN jack |
| `Minilab3 MCU/HUI` | Mackie Control: Shift+transport pads also send notes 86/93/94/95 here |
| `Minilab3 ALV` | Analog Lab V integration |

Identity reply: `F0 7E 7F 06 02 00 20 6B 02 00 04 04 45 00 02 01 F7` (verified).

## Inbound

Channels are 1-based here.

| Control | Arturia program (1) | DAW program (2) | Status |
|---|---|---|---|
| Knobs 1–8 | CC 74 71 76 77 93 18 19 16 | CC 86 87 89 90 110 111 116 117 | verified / verified |
| Faders 1–4 | CC 82 83 85 17 | CC 14 15 30 31 | verified / verified |
| Shift | CC 9 | CC 27 | verified / verified |
| Encoder turn | CC 114 relative | CC 28 (Shift: CC 29) | verified / verified |
| Encoder click | CC 115 | CC 118 (Shift: CC 119) | verified / verified |
| Keys | Notes on the keyboard channel (default ch 1), 48–72 at Oct 0 | same | verified |
| Pads bank A | Notes 36–43, ch 10, velocity + poly aftertouch | same | verified |
| Pads bank B | Notes 44–51, ch 10 | same | verified |
| Pitch strip | Pitch bend | same | verified |
| Mod strip | CC 1 | same | verified |
| Shift + loop/stop/play/rec/tap | CC 105–109 | same | verified |

- The two programs' CC numbers do not overlap, so one decoder handles both.
- Relative encoder: value > 64 = clockwise, < 64 = counter-clockwise. A 64 "rest" value comes between steps; ignore it.
- Keys send no aftertouch. Pads send polyphonic aftertouch (per-pad pressure).
- Hold, Chord, Oct −/+ and Arp are handled inside the device. They send no messages; you see only their effect on notes.

Status SysEx from the device (`F0 00 20 6B 7F 42 …` header):

| Body | Meaning |
|---|---|
| `02 00 40 62 01/02` | Program changed: 1 = Arturia, 2 = DAW |
| `02 00 40 63 00/01` | Pad bank changed: 0 = A, 1 = B |

## Outbound (header `F0 00 20 6B 7F 42`)

| Message | Body | Status |
|---|---|---|
| Connect (DAW hello) | `02 00 40 6A 21` | verified: required before LED/display messages take effect |
| Disconnect | `02 00 40 6A 20` | script |
| Request program | `01 00 40 01` | script |
| LED colour | `02 02 16 <id> <r> <g> <b>` (0–127 each) | verified |
| Screen, persistent | `04 02 60 1F 07 01 <icon> <arm> <arp> 00 01 <line1 ≤10> 00 02 <line2 ≤18> 00` | verified |
| Screen, parameter popup | `04 02 60 1F 08 02 <cc> 00 01 <name ≤10> 00 02 <value ≤18> 00` | script |
| Knob value realign | `21 10 00 <7..14> 00 <value>` | script |

Icon bytes: 0 none, 1 arp, 2 play, 3 record, 4 arm.

LED IDs: pads bank A `0x34–0x3B` (verified), bank B `0x44–0x4B` (verified), transport `0x57–0x5B` (script),
Oct − `0x31` and Oct + `0x33` (verified). Shift and Hold: unknown, probably `0x2E–0x32`.

**Pacing:** LED messages sent back-to-back landed on the wrong pads; with ~300 ms gaps they were correct.
`MiniLab.send()` paces the queue (default 15 ms). The safe minimum is not yet known.
