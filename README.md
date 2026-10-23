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
| Encoder | Browse presets, click to load. Hold: Dice (random patch). Shift + turn: switch visualiser |
| Shift + encoder click | Step edit: pads edit the drum loop (bank A = steps 1–8, bank B = 9–16), encoder picks the drum |
| Pads, bank A | Drum kit, recordable into the 16-step loop. Optional "Spectrum lights" turn them into a live 8-band meter |
| Pads, bank B | Load presets 1–8 |
| Shift + ▶ / ■ / ● / ⟲ / Tap | Play / stop / record the drum loop / clear it / tap tempo |

### Synth view

The **Synth** tab draws the whole synth as blocks in signal order (oscillators → mixer → drive → filter →
amp → effects → output), with the modulators below (playing, two LFOs, filter and amp envelopes). Every
block shows its live signal and all its controls, and coloured cables show what modulates what. Short
explanations are on each block; the selected block's full explanation and a "Try this" are in the strip
at the top. The 🎧 button on a block (or an encoder click) lets you hear the sound at that point only.

In this view the MiniLab knobs follow the selected block: click a block, or turn the encoder to step
through the knob pages (Sources, Filter, Envelopes, LFO 1, LFO 2, Playing, Effects). Shift + encoder
switches between the playground's waveform, spectrum and the Synth view.

Without a MiniLab, the computer keyboard plays notes (A row; Z/X change octave), and every control works with the mouse.

## Layout

- `src/minilab/`: MiniLab 3 protocol (decoding, SysEx builders) and the port connection. See `docs/minilab3-protocol.md`.
- `src/audio/`: Web Audio engine: voices, effects, drums, sequencer, parameter definitions.
- `src/presets/`: factory presets; user presets are stored in localStorage.
- `src/app/`: Svelte UI. `playground.svelte.ts` connects the device, the engine and the UI.
- `src/probe/`: the raw MIDI probe page used to map the device.
