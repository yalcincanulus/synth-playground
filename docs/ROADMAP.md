# Roadmap

The next pieces of work, as slices to build in order. Each slice should work on its own, be testable on the MiniLab, and take about one session.

Rewritten 2026-10-24: the engine and sound quality now come first, so recipes and the course are built on a sound that won't change under them. Nothing below "Done" has been started.

## Done

### 8-step sequencer

Replaces the arpeggiator. Modelled on the Oberheim Mini-Sequencer: one knob and one light per step.

- 8 steps, each with a note, on/off (off is a rest) and a slide (holds the note into the next step and glides to it, like a TB-303).
- Settings: length 1–8, gate, rate (1/8, 1/8T, 1/16, 1/16T), direction (forward, backward, ping-pong, random).
- Runs on the drum loop's clock, so ▶ / ■ / Tap control both and they stay in time.
- While it plays, the keys either play notes and chords over it (Play, the default), transpose the whole line (Transpose, C4 = no change), or both (Split: below C4 transposes, C3 = no change). Encoder click in sequencer edit switches. Your notes and the sequencer's don't cut each other off.
- On the MiniLab, **sequencer edit** (Shift + encoder click twice: drum steps, then sequencer, then off):
  - knobs 1–8: step notes (two octaves from C3)
  - pads bank A: steps on/off; hold a pad and press a key to set that step's note
  - pads bank B: slides
  - faders: length, gate, rate, direction. After the faders change job, they "pick up": a fader does nothing until it reaches the current value, so the sound doesn't jump.
- On screen: a Step sequencer panel under the pads, and the keyboard lights the notes it plays.
- Status: built and checked on the MiniLab 2026-10-24. Also added: Shift + any knob changes the tempo, and the drum loop can be switched off.

## Why the engine comes first

Today each note is built from about 25 of the browser's own audio nodes (filter, waveshaper, gains, and seven signal sources for envelopes and modulation). Only the oscillators are our own code on the audio thread. This limits us:

- The filter is the browser's: clean, but it can't self-oscillate or saturate like an analog one.
- Envelopes are scheduled browser automation: possible clicks on fast retriggers, and the cause of a Firefox gap.
- The sound is mono until the chorus, there is one sound (part) only, there is no CPU measurement, and there are no tests.

The plan: **one AudioWorklet processor runs the whole voice** (oscillators, filter, drive, amp, envelopes, mod matrix) for all notes of a part, in TypeScript. The old engine stays switchable until every preset sounds right on the new one. WASM is a later option, only if the CPU meter asks for it.

What the browser still limits, whatever we do:

- **Latency:** sound is made in blocks of 128 samples, plus the operating system's buffer. We can't go below what the browser allows.
- **The main thread:** MIDI input and the sequencer's timer share it with the page. A freeze longer than the 100 ms look-ahead makes the sequencer miss notes (slice 4).
- **Fixed sample rate:** drive and FM create harsh aliasing unless we oversample them ourselves (slice 10).
- **No built-in CPU meter:** we time our own processor instead.

## Phase A: engine foundation

### 1. Test bench and CPU meter

- `bun test` for the pure TypeScript parts: sequencer logic, oscillator core, envelopes, and later the filters. DSP code is written as plain functions so it runs without a browser.
- A dev page that renders every preset offline (a few notes with `OfflineAudioContext`) and checks the result: no NaN, not silent, no clicks (sudden jumps) at note start and end, no level far above the others. It saves the old engine's results as the reference for A/B comparisons.
- A CPU meter: the processor times its own work for each 128-sample block against the time it has (about 2.7 ms at 48 kHz). For now it only measures the oscillators; this is the baseline.
- **Done when:** `bun test` passes, the render check runs over all presets, and the meter moves while playing.

### 2. New voice engine, part 1: the sound path

- One processor runs all notes: oscillators (the existing code), noise, mixer, drive, filter, amp, and the four envelopes, computed sample by sample.
- The filter is our own state-variable filter (low-pass, band-pass, high-pass), tuned to match today's sound.
- Notes arrive as timestamped messages, so sequencer notes start on the exact sample.
- A switch between the old and new engine (in the About page, or a dev setting).
- **Done when:** presets without modulation routes sound the same on both engines (render check and by ear), and fast retriggers don't click.

### 3. New voice engine, part 2: modulation and switching over

- LFOs, the mod matrix, velocity/key/random, mod strip, pitch bend, glide, mono/legato and unison inside the processor.
- "Listen here" and the stage pictures in the Synth view read the processor's per-stage outputs.
- Stolen notes fade out quickly instead of clicking.
- Once every factory preset matches, the new engine becomes the default and the old one is removed.
- **Done when:** all presets pass the render check and A/B by ear, and the CPU meter shows headroom with 10 notes of a heavy patch.

### 4. Robust timing

- The sequencer and drum clock tick from a Web Worker, so page work and background tabs can't delay it. Notes are still sent ahead with exact times.
- Measure key-to-sound latency. If the page itself slows MIDI down, make the visualisers cheaper (lower frame rate, less work per frame).
- **Done when:** the sequencer stays in time while switching views quickly, while the tab is in the background, and during heavy patches.

### 5. Voices and CPU safety

- A **max voices** setting. When it's reached, or when the CPU meter gets close to the limit, the quietest or oldest notes are cut first, with a short fade.
- **Done when:** heavy patches (unison 3, tables, routes) never crackle; they lose notes instead.

### 6. Two parts

- Two sounds playing at once, each with its own preset: **Keys** (what you play) and **Sequencer** (what the step sequencer plays), e.g. a bass line under a chord pad.
- The knobs, the Synth view and the preset browser edit the selected part; a part switch on screen and on the MiniLab.
- Both parts share the effects and the drums, and each part has a volume.
- **Done when:** a bass preset plays the sequence while you play a pad preset on the keys, and both can be edited from the MiniLab.

## Phase B: sound quality

### 7. Stereo

- Unison copies spread left and right, with a **Stereo Width** setting.
- A **pan** destination in the mod matrix (e.g. random → pan, so each note sits in a different place).
- A stereo meter in the Output block.
- **Done when:** pads sound clearly wider, and switching to mono sounds unchanged.

### 8. Ladder filter

- A 4-pole Moog-style "ladder" filter inside the voice processor. It can scream at high resonance (self-oscillation: the filter itself sings a tone), and Drive overdrives it inside, which is where the classic squelch comes from.
- A filter model choice: **Clean** (the state-variable filter) or **Ladder**. Existing presets stay on Clean.
- The filter curve drawing matches the chosen filter.
- **Done when:** Acid Line set to Ladder sounds noticeably more alive, at an acceptable CPU cost.

### 9. Filter morph and a second filter

- Low-pass, band-pass and high-pass become one smooth **morph** knob, also a mod matrix destination.
- An optional **Filter 2**, in series or parallel, with its own cutoff and resonance.
- **Done when:** sweeping the morph knob with an LFO is smooth, and the Synth view shows both filters.

### 10. Clean drive and FM

- Oversampling (running at a higher rate inside, then filtering back down) for drive, FM and sync, so high notes don't sound harsh or "digital".
- A soft clipper on the output, so loud patches saturate instead of distorting harshly.
- **Done when:** a high FM or driven note sounds clean in a side-by-side test, and the CPU cost is measured.

### 11. Effects pass

- Stereo delay with ping-pong, a better chorus, and a reverb with size and damping controls.
- Effect amounts and LFO rates/depths become mod matrix destinations (from the backlog).
- **Done when:** every effect sounds good on the factory presets, and an LFO can sweep the delay or reverb amount.

## Phase C: finishing wavetables

### 12. WAV import

- Drop in a Serum-format WAV (2048-sample frames), or any short sound, which gets cut into frames.
- Imported tables are saved in the browser and appear in the table list.
- **Done when:** a free Serum table from the internet plays, and survives a reload.

### 13. Draw your own table

- Draw 2–4 keyframes (waves) with the mouse, or start from harmonic sliders. The app blends between them to make the full table.
- Live preview while drawing.
- **Done when:** you can draw a table, hear it, and save it.

## Phase D: playing

### 14. Scale lock and chord mode

- Choose a root note and a scale (major, minor, pentatonic, dorian…). Notes outside the scale snap to the nearest scale note.
- Chord mode: one key plays a chord that fits the scale (triads or 7ths).
- The on-screen keyboard greys out notes outside the scale. It works together with the sequencer: the step knobs snap to the scale.
- **Done when:** with any scale chosen, random playing sounds musical, and one finger can play chords.

## Phase E: guided recipes

### 15. Guided recipes: the engine and 3 recipes

- A recipe is a list of steps. Each step has:
  - plain-English text
  - a **highlight**: the block or knob to touch
  - a **check**: a condition on the settings, e.g. "Cutoff below 400 Hz", which moves you to the next step automatically
- A recipe panel with progress, a hint, and buttons to skip or go back.
- Hardware: the OLED shows the current step, and the MiniLab knob for the highlighted control is pointed out on screen.
- Recipes start from a blank "Init" sound, so you build the patch yourself.
- First recipes: **Reese bass, Pluck, Supersaw pad.**
- **Done when:** you can build all three from Init with only the recipe's guidance.

### 16. Recipe library

- About 12 more recipes, in groups:
  - **Bass:** acid, sub, FM.
  - **Leads:** sync lead, vowel lead.
  - **Pads:** PWM strings, wavetable scan pad.
  - **Effects:** laser, wind, synth toms.
  - **Keys:** e-piano, bell.
- A recipe browser that marks recipes as done.
- At the end of a recipe you can save the result as a preset.
- **Done when:** every recipe is completable, and your progress is remembered after a reload.

## Phase F: the learning course

Modelled on Ableton's Learning Synths: short pages, each with a few sentences of text, **one** interactive widget, and only the controls that page needs.

### 17. Course framework and Chapter 1, "Sound and Oscillators"

- **Course mode:** a new tab with a lesson page on the left and a **reduced synth** on the right. A lesson lists the blocks and controls it allows, and everything else is hidden and held at sensible values (e.g. the filter fully open).
- **Lessons are written as data:**
  - text paragraphs
  - interactive widgets: wave picture, keyboard, single knob, A/B comparison
  - "try this" steps that use the **same engine as recipes**
- Next/back, progress saved, and MiniLab knobs mapped only to what the page shows.
- **Chapter 1, about 6 pages:** what sound is, pitch, loudness, wave shapes, harmonics (with the harmonics bars), detune and beating.
- **Done when:** someone with no synth knowledge can go through Chapter 1 using only the MiniLab and the page.

### 18. Chapter 2, "Shaping over time" (envelopes)

- Amp envelope stage by stage (each control appears only once it's explained), then the filter envelope.
- The widgets compare a long attack with a short one, and a pluck with a pad.

### 19. Chapter 3, "Filters"

- Cutoff, resonance, filter types, key tracking, drive, the ladder filter vs the clean filter.
- A spectrogram widget shows what the filter removes.
- That spectrogram view gets built in this slice and can be reused in the Synth view.

### 20. Chapter 4, "Movement" (LFOs and modulation)

- LFO shapes, rate, depth, targets and tempo sync, then the idea of the mod matrix through patching exercises.

### 21. Chapter 5, "Beyond subtractive"

- Sync, FM, pulse width and wavetables, ending with a "build your own" page that opens the full Synth view.

### 22. Ear training and sound matching

- **Quizzes:** "which sounds brighter?", "which wave is this?", "is the attack slow or fast?"
- **Sound matching game:** hear a target sound and recreate it with only the controls the page shows. The app scores how close you are, using measured features like brightness, the shape of the volume, and pitch.
- Placed at the end of each chapter as an optional challenge.

### 23. Course polish

- A progress overview, links from course pages to the matching recipes ("now build a Reese bass").
- A glossary panel: hover a term like "cutoff" to see its definition.

## Notes on the order

- **The engine (1–6) comes first** so that sound changes don't force re-tuning presets, recipes and course pages later. Slices 2–3 are the big rewrite; 1 makes it safe.
- **Two parts (6) comes right after the new engine**, because that's when it is cheap: a second part is a second copy of the processor.
- **Sound quality (7–11) comes before recipes and the course** that use it: the acid recipe wants the ladder filter, and the course's filter chapter explains it.
- **Scale lock (14)** is small and independent; it can move earlier if playing feels more urgent than wavetables.
- **Recipes (15–16) come before the course**, because a course page's "try this" steps are recipe steps.

## Backlog

Ideas without a place in the order yet. Any of them can slot in between phases.

- Mod matrix: drag cables directly in the Synth view; show the fixed connections (filter envelope → cutoff and so on) as greyed-out routes; a 3rd LFO; a step sequencer as a modulation source.
- Wavetables: warp modes (bend, mirror, sync).
- Presets: tags, favourites, search, export/import as files; morphing between two presets with a fader.
- Pads play notes (which would also make pad pressure useful as a matrix source).
- Arpeggiator (hold a chord, it plays the notes in turn), on the same clock as the sequencer.
- Sequencer: 16 steps (second page on pad bank B), per-step velocity/accent, a second row of values as a mod matrix source (e.g. step → cutoff), a Sequencer block in the Synth view, saving sequences.
- Looper/recorder, with WAV export.
- "What changed?" view: compare a tweaked preset with the saved version (A/B).
- Effects rack: separate effect slots you can reorder; distortion types, phaser, flanger, EQ, bit-crusher, compressor.
- WASM: rewrite the voice processor in Rust or C++ compiled to WebAssembly, only if the CPU meter shows TypeScript is too slow.
- MiniLab: small drawings on the OLED (if the protocol allows it), MIDI learn, remembering the knob page and settings for each view.
- Firefox: lost note-offs when releasing chords (postponed 2026-10-24; Chromium is the target for now). Likely cause: the MIDI input assumes one complete message per event, so bundled messages or running status drop note-offs. Fix: split each event into messages and restore missing status bytes (`src/minilab/protocol.ts`, `src/minilab/device.ts`), then update the About page. The new engine (slices 2–3) removes the other Firefox gap, the missing `cancelAndHoldAtTime`.
