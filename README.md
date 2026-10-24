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
| Keys | Play the Keys part |
| Shift + any key | Switch which part the knobs, faders, presets and Synth view edit: Keys or Sequencer |
| Knobs 1–8 | Preset-specific parameters (shown on the OLED while turning) |
| Faders 1–4 | Amp envelope: attack, decay, sustain, release |
| Pitch / Mod strips | Pitch bend ±2 semitones / LFO depth to the preset's mod target |
| Encoder | Browse presets, click to load. Hold: Dice (random patch). Shift + turn: switch visualiser |
| Shift + encoder click | Step edit: pads edit the drum loop (bank A = steps 1–8, bank B = 9–16), encoder picks the drum |
| Pads, bank A | Drum kit, recordable into the 16-step loop. Optional "Spectrum lights" turn them into a live 8-band meter |
| Pads, bank B | Load 8 favourite presets (First Saw, Round Bass, Acid Line, Wobble, Warm Pad, Glass Strings, Brass Stab, Pluck) |
| Shift + ▶ / ■ / ● / ⟲ / Tap | Play / stop / record the drum loop / clear it / tap tempo |

### Two parts

Two sounds play at once, each with its own preset: **Keys** (what you play) and **Sequencer** (what the step
sequencer plays), e.g. a pad over a bass line. The switch above the presets (or Shift + any key) picks which part the
knobs, faders, encoder, favourite pads, Dice and the Synth view edit. The keys always play the Keys part. Each part has
its own Volume, chorus and delay/reverb amounts; the delay time and feedback and the room size are shared and come
from the Keys part. The pitch and mod strips move the Keys part.

### Synth view

The **Synth** tab draws the whole synth as blocks in signal order (oscillators → mixer → drive → filter →
amp → effects → output), with the modulators below (pitch envelope, playing, two LFOs, filter and amp
envelopes). The oscillators also do pulse width (and PWM from an LFO), hard sync and FM. Every
block shows its live signal and all its controls, and coloured cables show what modulates what. Short
explanations are on each block; the selected block's full explanation and a "Try this" are in the strip
at the top. The 🎧 button on a block (or an encoder click) lets you hear the sound at that point only.

**Stereo:** unison copies spread left and right by **Stereo** (in the Playing block), and the mod matrix's
**pan** destination moves whole notes (random → pan puts each note somewhere else). Both keep the sound in mono
unchanged: left and right averaged are always the mono sound (exactly, without drive). The Output block shows
left and right levels and a stereo picture: a vertical line is mono, a wide cloud is a wide sound.

**Filter models:** the Filter block's **Model** picks **Clean** (a smooth 2-pole state-variable filter) or
**Ladder** (a Moog-style 4-pole: steeper, loses some bass as Resonance rises, and near the top of Resonance it
sings on its own at the cutoff). With the ladder, Drive overdrives the filter from inside instead of the drive
stage before it. The filter drawings follow the model. Factory presets use Clean; try Acid Line on Ladder.

The **Mod Matrix** strip adds up to 8 extra routes: any source (LFOs, the four envelopes including a spare
Mod Envelope, velocity, key, the mod strip, a random value per note) to any destination (pitch, cutoff,
resonance, volume, wavetable position, pulse width, FM, osc mix, sub, noise, pan), each with an amount. Press
**Patch**, click a source block, then a destination block; each route is drawn as a cable in its source's colour.

In this view the MiniLab knobs follow the selected block: click a block, or turn the encoder to step
through the knob pages (Sources, Filter, Osc Tricks, Envelopes, LFO 1, LFO 2, Playing, Mod Env, Matrix, Effects; on the Matrix page
knobs 1–8 are the amounts of routes 1–8, and the screen names the route, e.g. `MEnv>WTPos`). Shift + encoder
switches between the playground's waveform, spectrum and the Synth view.

### Wavetable view

The **Wavetable** tab shows the current wavetable (a stack of single-cycle waves) in 3D, with the wave playing
right now lit up, plus that wave and its harmonics. Set an oscillator's wave to **Table**, pick one of the 8
built-in tables (the encoder steps through them), and move **WT Pos**: by hand, with knob 1, or with an LFO or
the mod strip set to *WT Pos*. Tables are band-limited per octave, so high notes stay clean.

Without a MiniLab, the computer keyboard plays notes (A row; Z/X change octave), and every control works with the mouse.

## Layout

- `src/minilab/`: MiniLab 3 protocol (decoding, SysEx builders) and the port connection. See `docs/minilab3-protocol.md`.
- `src/audio/`: the audio engine: voices, effects, drums, sequencer, parameter definitions. Every note is made
  in one AudioWorklet processor (`synth.worklet.ts` runs `dsp/voiceBank.ts`): oscillators (anti-aliased with
  polyBLEP, with sync and FM), the clean and ladder filters, drive, envelopes, the LFOs and the mod matrix. `dsp/` is plain
  TypeScript, tested with `bun test`. The effects are Web Audio nodes.
  `wavetables.ts` defines the built-in wavetables and prepares their per-octave versions.
- `src/presets/`: factory presets; user presets are stored in localStorage.
- `src/app/`: Svelte UI. `playground.svelte.ts` connects the device, the engine and the UI.
- `src/probe/`: the raw MIDI probe page used to map the device.
