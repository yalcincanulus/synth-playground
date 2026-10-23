# MiniLab 3 Playground

A browser synth playground built for the Arturia MiniLab 3. It uses every control on the device and
drives its pad LEDs and OLED screen.

```sh
bun install
bun run dev        # http://localhost:5173 (playground), /probe.html (MIDI probe)
bun run typecheck
```

Use a Chromium browser (Chrome, Brave, Edge, Helium). Firefox and Safari lack full Web MIDI with SysEx.
Pad lights and the screen need the device in **DAW mode** (Shift + Prog).

## Controls

| MiniLab | Does |
|---|---|
| Keys | Play the synth |
| Knobs 1–8 | Preset-specific parameters (shown on the OLED while turning) |
| Faders 1–4 | Amp envelope: attack, decay, sustain, release |
| Pitch / Mod strips | Pitch bend ±2 semitones / LFO depth to the preset's mod target |
| Encoder | Browse presets, click to load. Shift + turn: switch visualiser |
| Pads, bank A | Drum kit, recordable into the 16-step loop |
| Pads, bank B | Load presets 1–8 |
| Shift + ▶ / ■ / ● / ⟲ / Tap | Play / stop / record the drum loop / clear it / tap tempo |

Without a MiniLab, the computer keyboard plays notes (A row; Z/X change octave), and every control works with the mouse.

## Layout

- `src/minilab/`: MiniLab 3 protocol (decoding, SysEx builders) and the port connection. See `docs/minilab3-protocol.md`.
- `src/audio/`: Web Audio engine: voices, effects, drums, sequencer, parameter definitions.
- `src/presets/`: factory presets; user presets are stored in localStorage.
- `src/app/`: Svelte UI. `playground.svelte.ts` connects the device, the engine and the UI.
- `src/probe/`: the raw MIDI probe page used to map the device.
