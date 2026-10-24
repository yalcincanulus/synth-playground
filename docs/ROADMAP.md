# Roadmap

The next pieces of work, as slices to build in order. Each slice should work on its own, be testable on the MiniLab, and take about one session.

Status: nothing in this file has been started (written 2026-10-24). Slice 0 is a bug fix to do before the rest.

## Fixes first

### 0. Firefox: lost note-offs

- In Firefox (tested without add-ons, and it works), releasing several keys at once plays a different note; Chromium is fine.
- Likely cause: the MIDI input assumes one complete message per MIDI event. If Firefox bundles several messages into one event, or uses running status (repeated messages without the status byte), the extra note-offs are dropped. Poly notes then keep ringing, and mono presets slide back to a key that is no longer held.
- Already ruled out: the audio engine. Firefox 158 has no `cancelAndHoldAtTime`, but the fallback in `voice.ts` reads correct values.
- Fix: split each incoming event into individual messages and restore missing status bytes (`src/minilab/protocol.ts`, `src/minilab/device.ts`). Log the raw bytes in Firefox once to confirm which case it is.
- Also update the About page: Firefox works without an add-on.
- **Done when:** releasing chords in Firefox leaves no notes ringing, in both poly and mono presets.

## Phase A: playing and the first learning step

### 1. Arpeggiator

- Hold a chord and it plays the notes one at a time: up, down, up-down, random, or as played.
- Settings: speed synced to the tempo (1/8, 1/16, triplets), range of 1–3 octaves, gate length, and latch (keeps playing after you let go).
- On the MiniLab: the pad labelled "Arp" turns it on and off. In the Synth view it's a new block next to Playing.
- **Done when:** you can hold a chord on the MiniLab and the arp plays it in time with the drum loop.

### 2. Scale lock and chord mode

- Choose a root note and a scale (major, minor, pentatonic, dorian…). Notes outside the scale snap to the nearest scale note.
- Chord mode: one key plays a chord that fits the scale (triads or 7ths).
- The on-screen keyboard greys out notes outside the scale. It works together with the arp.
- **Done when:** with any scale chosen, random playing sounds musical, and one finger can play chords.

### 3. Guided recipes: the engine and 3 recipes

- A recipe is a list of steps. Each step has:
  - plain-English text
  - a **highlight**: the block or knob to touch
  - a **check**: a condition on the settings, e.g. "Cutoff below 400 Hz", which moves you to the next step automatically
- A recipe panel with progress, a hint, and buttons to skip or go back.
- Hardware: the OLED shows the current step, and the MiniLab knob for the highlighted control is pointed out on screen.
- Recipes start from a blank "Init" sound, so you build the patch yourself.
- First recipes: **Reese bass, Pluck, Supersaw pad.**
- **Done when:** you can build all three from Init with only the recipe's guidance.

### 4. Recipe library

- About 12 more recipes, in groups:
  - **Bass:** acid, sub, FM.
  - **Leads:** sync lead, vowel lead.
  - **Pads:** PWM strings, wavetable scan pad.
  - **Effects:** laser, wind, synth toms.
  - **Keys:** e-piano, bell.
- A recipe browser that marks recipes as done.
- At the end of a recipe you can save the result as a preset.
- **Done when:** every recipe is completable, and your progress is remembered after a reload.

## Phase B: sound quality

### 5. Stereo

- The voice path becomes stereo:
  - unison copies spread left and right, with a **Stereo Width** setting
  - a **pan** destination in the mod matrix (e.g. random → pan, so each note sits in a different place)
- A stereo meter in the Output block.
- **Done when:** pads sound clearly wider, and switching to mono sounds unchanged.

### 6. Custom filter: ladder

- Our own filter running on the audio thread (like the oscillators): a 4-pole Moog-style "ladder" filter.
- It can scream at high resonance (self-oscillation, where the filter itself sings a tone). Drive overdrives it inside, which is where the classic squelch comes from.
- A filter model choice: **Classic** (the current one) or **Ladder**. Existing presets stay on Classic.
- The filter curve drawing matches the new filter.
- **Done when:** Acid Line set to Ladder sounds noticeably more alive. Note costs stay acceptable on CPU.

### 7. Filter morph and a second filter

- Low-pass, band-pass and high-pass become one smooth **morph** knob, also available as a mod matrix destination.
- An optional **Filter 2**, in series or parallel, with its own cutoff and resonance.
- **Done when:** sweeping the morph knob with an LFO is smooth, and the Synth view shows both filters.

### 8. Measuring CPU and limiting voices

- A small CPU/load display, and a **max voices** setting (polyphony).
- If the browser starts struggling, the quietest notes get cut first.
- **Done when:** heavy patches (unison 3, tables, routes, ladder filter) never crackle; they lose notes instead.

## Phase C: finishing wavetables

### 9. WAV import

- Drop in a Serum-format WAV (2048-sample frames), or any short sound, which gets cut into frames.
- Imported tables are saved in the browser and appear in the table list.
- **Done when:** a free Serum table from the internet plays, and survives a reload.

### 10. Draw your own table

- Draw 2–4 keyframes (waves) with the mouse, or start from harmonic sliders. The app blends between them to make the full table.
- Live preview while drawing.
- **Done when:** you can draw a table, hear it, and save it.

## Phase D: the learning course

Modelled on Ableton's Learning Synths: short pages, each with a few sentences of text, **one** interactive widget, and only the controls that page needs.

### 11. Course framework and Chapter 1, "Sound and Oscillators"

- **Course mode:** a new tab with a lesson page on the left and a **reduced synth** on the right. A lesson lists the blocks and controls it allows, and everything else is hidden and held at sensible values (e.g. the filter fully open).
- **Lessons are written as data:**
  - text paragraphs
  - interactive widgets: wave picture, keyboard, single knob, A/B comparison
  - "try this" steps that use the **same engine as recipes**
- Next/back, progress saved, and MiniLab knobs mapped only to what the page shows.
- **Chapter 1, about 6 pages:** what sound is, pitch, loudness, wave shapes, harmonics (with the harmonics bars), detune and beating.
- **Done when:** someone with no synth knowledge can go through Chapter 1 using only the MiniLab and the page.

### 12. Chapter 2, "Shaping over time" (envelopes)

- Amp envelope stage by stage (each control appears only once it's explained), then the filter envelope.
- The widgets compare a long attack with a short one, and a pluck with a pad.

### 13. Chapter 3, "Filters"

- Cutoff, resonance, filter types, key tracking, drive, the ladder filter vs Classic.
- A spectrogram widget shows what the filter removes.
- That spectrogram view gets built in this slice and can be reused in the Synth view.

### 14. Chapter 4, "Movement" (LFOs and modulation)

- LFO shapes, rate, depth, targets and tempo sync, then the idea of the mod matrix through patching exercises.

### 15. Chapter 5, "Beyond subtractive"

- Sync, FM, pulse width and wavetables, ending with a "build your own" page that opens the full Synth view.

### 16. Ear training and sound matching

- **Quizzes:** "which sounds brighter?", "which wave is this?", "is the attack slow or fast?"
- **Sound matching game:** hear a target sound and recreate it with only the controls the page shows. The app scores how close you are, using measured features like brightness, the shape of the volume, and pitch.
- Placed at the end of each chapter as an optional challenge.

### 17. Course polish

- A progress overview, links from course pages to the matching recipes ("now build a Reese bass").
- A glossary panel: hover a term like "cutoff" to see its definition.

## Notes on the order

- **Recipes (3–4) come before the course** because a course page's "try this" steps are recipe steps. Building recipes first gives a tested engine.
- **The sound slices (5–10) come before the course chapters** that teach them: Chapter 3 can then explain the ladder filter, and Chapter 5 the custom wavetables. To start the course sooner, slices 11–12 only need the current synth and could move up to right after slice 4.

## Backlog

Ideas without a place in the order yet. Any of them can slot in between phases.

- Mod matrix: let the LFOs and the mod strip move the LFO rates, LFO depths and the effect amounts (destinations shared by all notes).
- Mod matrix: drag cables directly in the Synth view; show the fixed connections (filter envelope → cutoff and so on) as greyed-out routes; a 3rd LFO; a step sequencer as a modulation source.
- Wavetables: warp modes (bend, mirror, sync).
- Presets: tags, favourites, search, export/import as files; morphing between two presets with a fader.
- Pads play notes (which would also make pad pressure useful as a matrix source).
- Melodic step sequencer, with per-step parameter changes.
- Looper/recorder, with WAV export.
- "What changed?" view: compare a tweaked preset with the saved version (A/B).
- Effects rack: separate effect slots you can reorder; distortion types, phaser, flanger, EQ, bit-crusher, compressor.
- MiniLab: small drawings on the OLED (if the protocol allows it), MIDI learn, remembering the knob page and settings for each view.
