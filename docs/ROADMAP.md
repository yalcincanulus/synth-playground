# Roadmap

The next pieces of work, as slices to build in order. Each slice should work on its own, be testable on the MiniLab, and take about one session.

Rewritten 2026-10-24: the engine and sound quality now come first, so recipes and the course are built on a sound that won't change under them.

Updated 2026-10-25: after the recipes, the synth and the app get better first (Phase F: speed on weaker computers, layout, editing safety, presets, arpeggiator, effects, modulation). The course (Phase G) is postponed until that is done.

Updated 2026-10-26: ear training and sound matching (the old slice 29) moved to the backlog; course polish is now slice 29.

## Done

### 8-step sequencer

Replaces the arpeggiator. Modelled on the Oberheim Mini-Sequencer: one knob and one light per step.

- 8 steps, each with a note, on/off (off is a rest) and a slide (holds the note into the next step and glides to it, like a TB-303).
- Settings: length 1–8, gate, clock, direction (forward, backward, ping-pong, random).
- **Clock**, Sync or Free (like the Clock knob of the Mini-Sequencer):
  - Sync: the knob picks a note length (1/8, 1/8T, 1/16, 1/16T), locked to the tempo and the drums.
  - Free: a free-running clock, 0.5 steps per second to 2 kHz on an exponential knob. The tempo doesn't move it, so it drifts against the drums; sweeping it while it plays speeds the line up or slows it down. A new speed counts from the last step played. "Match tempo" sets it to the Sync speed at the current tempo. Switching modes while playing carries on from the next step due (to Sync: on the next grid point).
  - Audio rates (from 40 steps per second, `LEGATO_HZ`): one note is held and each step only moves its pitch, like an analog sequencer's pitch voltage at a fast clock (gate, rests and slides wait until it slows down). The notes blur into one sound; from about 20 loops a second the loop is itself a pitch. Turning the clock down from the top reveals the line. Pitch steps are `glide` messages with no glide time, sent only when the pitch changes; the keyboard lights every note of the line while it blurs, and the playhead is reported at most 20 times a second.
  - The panel shows the other mode's terms beside the knob (steps/s in Sync, "16ths at N BPM" in Free, the loop's rate and note at audio rates).
  - Shift + knob 1 on the MiniLab turns the clock (Free: an eighth of an octave a click; Sync: a division every 4 clicks). Shift + knobs 2–8 are still the tempo.
- Runs on the drum loop's lookahead scheduler either way, so ▶ / ■ control both. Tap and the tempo move it only in Sync.
- Default line: G3, C4, B♭4, B♭4, C5, C5, C5, C5.
- While it plays, the keys either play notes and chords over it (Play, the default), transpose the whole line (Transpose, C4 = no change), or both (Split: below C4 transposes, C3 = no change). Encoder click in sequencer edit switches. Your notes and the sequencer's don't cut each other off.
- On the MiniLab, **sequencer edit** (Shift + encoder click twice: drum steps, then sequencer, then off):
  - knobs 1–8: step notes (two octaves from C3)
  - pads bank A: steps on/off; hold a pad and press a key to set that step's note
  - pads bank B: slides
  - faders: length, gate, clock (division in Sync, speed in Free), direction. Sync/Free is switched on screen. After the faders change job, they "pick up": a fader does nothing until it reaches the current value, so the sound doesn't jump.
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
- Status: done 2026-10-24.
  - `bun test` covers the sequencer, the oscillator (moved to `src/audio/dsp/oscillator.ts`), the envelope maths and the render analysis.
  - The render check is `render.html`. Renders are seeded, so they repeat exactly, and the old engine's results are saved in `src/render/reference.json`.
  - First findings:
    - No preset clicks or stops dead.
    - Acid Line and Table Pluck peak just above 0 dB (slice 10's soft clipper).
    - Acid Line is 8 dB louder than the median preset.
    - The random LFO wave is stepped by a main-thread timer, so it can't be rendered offline or seeded (the new engine fixes this).
  - CPU baseline: 8 notes of a unison-2 pad use about 6% of the available time for the oscillators. Chrome gives worklets no precise clock (`performance.now()`), so the meter averages whole-millisecond timings.

### 2. New voice engine, part 1: the sound path

- One processor runs all notes: oscillators (the existing code), noise, mixer, drive, filter, amp, and the four envelopes, computed sample by sample.
- The filter is our own state-variable filter (low-pass, band-pass, high-pass), tuned to match today's sound.
- Notes arrive as timestamped messages, so sequencer notes start on the exact sample.
- A switch between the old and new engine (in the About page, or a dev setting).
- **Done when:** presets without modulation routes sound the same on both engines (render check and by ear), and fast retriggers don't click.
- Status: built 2026-10-24, waiting for an ear check on the MiniLab. Switch engines on the About page.
  - **Code:** `src/audio/dsp/voiceBank.ts` (the voices), `svf.ts` (filter), `ramp.ts` (envelopes and glides that move like Web Audio automation), `drive.ts` (drive with 2x oversampling, as the classic WaveShaper had). `WorkletVoice` sends the actions from the main thread.
  - **Also in this slice** (planned for slice 3): mono, legato and glide; velocity; unison. The LFOs and pitch bend reach the processor as audio inputs from their existing Web Audio nodes.
  - **Kept for the A/B:** new notes glide from the classic engine's start values over about 10 ms (gains 1, filter at 350 Hz, envelope amounts 0), as the classic voices did. Starting from the targets instead is a later, deliberate change.
  - **Render check fixes:**
    - notes are now played at their time, as live (the offline render pauses at each note)
    - the reverb size is applied before rendering
    - the reference was re-saved
  - **Result:** 35 presets without routes match within 1 dB, most exactly (0.0). Square Lead differs only in bands 55 dB below its tone. Digital Keys differs slightly from its random LFO. The 3 presets with routes differ, as expected.
  - **CPU:** 8 notes of a unison-2 pad use about 11% for the whole voice path.

### 3. New voice engine, part 2: modulation and switching over

- The mod matrix inside the processor, with every source (LFOs, the four envelopes, velocity, key, random, mod strip) and destination.
- Decide whether the LFOs move inside the processor too (today they are Web Audio nodes feeding it), and make the random LFO repeatable.
- "Listen here" and the stage pictures in the Synth view read the processor's per-stage outputs.
- Stolen notes fade out quickly instead of clicking.
- Once every factory preset matches, the new engine becomes the default and the old one is removed.
- After the switch, new notes start at their target settings instead of gliding from the classic start values for 10 ms (decided 2026-10-24). Re-save the render reference afterwards.
- **Done when:** all presets pass the render check and A/B by ear, and the CPU meter shows headroom with 10 notes of a heavy patch.
- Status: done 2026-10-24 (checked by ear on the MiniLab). The classic engine is removed; the engine switch on the About page is gone.
  - **Decided:** the LFOs, pitch bend and the mod strip moved into the processor too, so it has no inputs left. The random LFO is seeded, so renders now repeat exactly. The processor reports the LFOs' phase about 30 times a second (and each new random value) for the Synth view's drawings.
  - **Code:** `voiceBank.ts` runs the mod matrix per voice: every source and destination, with each route's amount gliding over 10 ms like the classic gains. `dsp/lfo.ts` has the LFOs. `voice.ts` is now the main-thread side of a note (it was `WorkletVoice`). `osc.worklet.ts` became `synth.worklet.ts`.
  - **Taps:** the processor has one output per stage (raw Osc 1, Osc 2, sub and noise, mixer, drive, filter), so "Listen here" and the stage pictures work as before.
  - **Stolen notes** fade over 5 ms (tested: no cut).
  - **Bug found in the classic engine:** LFO 1 always played a sine when its shape said "triangle" (the default), because the shape was only set on a change. The new engine plays the shape it shows, so the default LFO 1 shape is now **sine**, which keeps every factory preset sounding as before. User presets saved with "triangle" now really get a triangle.
  - **A/B result** (with the classic start values put back temporarily): all 38 presets match the classic reference within about 1 dB, routes included. As before, Square Lead differs only in bands 55 dB below its tone, and Digital Keys in its random LFO.
  - **After the switch:** notes start at their target settings. The classic voices faded each note in from full noise and sub level over 10 ms, a small noise burst on every note; that is gone. Most audible on fast-decaying keys presets (chord spectrum up to 19 dB different, mostly reverb tail of that burst). The reference was re-saved, and two renders in a row are now identical (0.0 everywhere).
  - **CPU:** 10 notes of unison 3, wavetable + saw, drive, noise, sub and all 8 routes: about 1.05 ms of the 2.67 ms per block in Chromium's JavaScript engine (39%), measured outside the worklet.

### 4. Robust timing

- The sequencer and drum clock tick from a Web Worker, so page work and background tabs can't delay it. Notes are still sent ahead with exact times.
- Measure key-to-sound latency. If the page itself slows MIDI down, make the visualisers cheaper (lower frame rate, less work per frame).
- **Done when:** the sequencer stays in time while switching views quickly, while the tab is in the background, and during heavy patches.
- Status: done 2026-10-24 (checked on the MiniLab together with slice 5).
  - **Clock:** `clock.worker.ts` ticks every 25 ms from a Web Worker, which background tabs don't slow down. The sequencer still plans notes 100 ms ahead on the main thread, with exact times.
  - **Late steps:** a step found more than 20 ms in the past is skipped (drums and the note sequencer alike) instead of played late, so after a freeze the loop stays on the beat. A forced 250 ms freeze skipped one step; every step that played was planned at least 39 ms ahead.
  - **Not solved by a worker:** the planning itself still runs on the page, so a freeze longer than about 75 ms still loses steps (now cleanly). Fully fixing that means running the sequencer, the drums and voice allocation on the audio thread; worth doing only if the About page shows real freezes.
  - **Measured on this machine:** switching views quickly caused no page freeze over 50 ms, and the Synth view's drawings delay the page's event loop by under 0.3 ms, so the visualisers don't slow MIDI down and were left as they are.
  - **About page:** MIDI wait (how long a key's message waits before the page handles it), key-to-sound estimate, the longest page freeze in the last minute, and the sequencer's skipped steps and closest margin.

### 5. Voices and CPU safety

- A **max voices** setting. When it's reached, or when the CPU meter gets close to the limit, the quietest or oldest notes are cut first, with a short fade.
- **Done when:** heavy patches (unison 3, tables, routes) never crackle; they lose notes instead.
- Status: done 2026-10-24 (checked on the MiniLab together with slice 4).
  - **Max Voices** (1–16, default 10, as before) is a preset setting in the Playing block, also on its knob page.
  - **Which note goes** (`voiceLimit.ts`): released notes first, the quietest of them; then the step sequencer's oldest note; then your oldest. Cut notes fade over 5 ms.
  - **CPU limit:** the meter's clock is whole milliseconds in Chromium, too coarse to react block by block, so the engine predicts instead. Each voice has a weight (1 + its unison copies); the processor reports its average load and weight together, and `CpuGuard` learns the cost per unit of weight. Before a note starts, notes are cut until the total fits 60% of the time available. Above 80% measured (say, a route added to held notes), one note is cut per report. The meter's tooltip counts the notes cut.
  - **The effects aren't measured** (they are the browser's nodes on the same thread); the 60% target leaves room for them.
  - **Tested:** Max Voices 4 holds 8 played notes to 4. On this machine 16 heavy notes (unison 3, table, drive, 8 routes) use 46%, so nothing is cut. With the target lowered to 20% for the test, it settled at 5 notes at 17% load, each new note fading out the oldest.
  - The render reference was re-saved: on long-release presets the phrase goes over 10 voices, and the quietest note is now cut instead of the oldest (envelope differences under 1 dB).

### 6. Two parts

- Two sounds playing at once, each with its own preset: **Keys** (what you play) and **Sequencer** (what the step sequencer plays), e.g. a bass line under a chord pad.
- The knobs, the Synth view and the preset browser edit the selected part; a part switch on screen and on the MiniLab.
- Both parts share the effects and the drums, and each part has a volume.
- **Done when:** a bass preset plays the sequence while you play a pad preset on the keys, and both can be edited from the MiniLab.
- Status: done 2026-10-24 (checked on the MiniLab, Shift + key included).
  - **Engine:** `part.ts` is one part (its own voice processor, voices, LFOs and stage taps); `Engine` holds two and a selected one, which the visualisations follow. Max Voices is per part; the CPU limit counts both parts' voices and cuts from either (a mono part's voice last).
  - **Effects:** each part has its own Volume, chorus and delay/reverb sends (`PartFx`); the delay time, feedback and room size are shared and come from the Keys part. The master no longer follows a preset's Volume, so the drums play at a fixed level (the old default, 0.7 squared).
  - **Playground:** each part keeps its own preset, settings and "edited" mark. The knobs, faders, encoder, favourite pads, Dice, the Synth and Wavetable views and "Listen here" follow the selected part. The Sequencer part starts on Round Bass.
  - **Switching:** two buttons above the presets (showing each part's preset), and Shift + any key on the MiniLab (the key doesn't sound). The OLED's first line starts with Keys or Seq.
  - **Choices:** the keys always play the Keys part, and the pitch and mod strips move it. So editing the Sequencer part is heard while the sequencer plays (or through step auditions).
  - **Render check:** identical to the reference (the Keys part's sound path is unchanged).

## Phase B: sound quality

### 7. Stereo

- Unison copies spread left and right, with a **Stereo Width** setting.
- A **pan** destination in the mod matrix (e.g. random → pan, so each note sits in a different place).
- A stereo meter in the Output block.
- **Done when:** pads sound clearly wider, and switching to mono sounds unchanged.
- Status: done 2026-10-25 (checked by ear and eye on the MiniLab).
  - **How:** the oscillator also outputs a "side" signal (each unison copy times its position, flattest copy left, sharpest right, Osc 2 mirrored). Left = sum − width × side, right = sum + width × side, so (left + right) / 2 is always the mono sound. Voices with unison copies run drive and filter once per side; others stay mono inside.
  - **Stereo** (0–100%, default 60%) is a preset setting in the Playing block (shown when Unison is above 1) and on its knob page. **Pan** is a new mod matrix destination; it uses the same sum-keeping rule, so a hard-panned note is the mono level times two on one side.
  - **Effects:** the chorus and the reverb take each part in mono (so in mono they sound as before at any width); the delay is stereo.
  - **Output block:** left and right meters, and a stereo picture (goniometer) with the correlation (+1 mono, 0 wide).
  - **Render check:** a Width column. Unison pads are 51–62% wide at the default; the mono figures moved by under 1 dB (the output limiter reacts to the higher per-side peaks; drive on Reese Bass and Sci-Fi Drone). Presets without unison moved by at most 0.2 dB, from the chorus reaching the reverb in mono. Reference re-saved. Live: Warm Pad (no effects) is 0% wide at Stereo 0 and 92% at 100%.
  - **CPU:** the heavy test (10 notes, unison 3, table + saw, drive, 8 routes) went from 0.57 to 0.80 ms per block in bun (21% → 30%), mostly from running drive twice. The CPU limit (slice 5) absorbs it. A later saving: run the mono path when Stereo is 0.

### 8. Ladder filter

- A 4-pole Moog-style "ladder" filter inside the voice processor. It can scream at high resonance (self-oscillation: the filter itself sings a tone), and Drive overdrives it inside, which is where the classic squelch comes from.
- A filter model choice: **Clean** (the state-variable filter) or **Ladder**. Existing presets stay on Clean.
- The filter curve drawing matches the chosen filter.
- **Done when:** Acid Line set to Ladder sounds noticeably more alive, at an acceptable CPU cost.
- Status: done 2026-10-25 (checked on the MiniLab).
  - **How:** `dsp/ladder.ts` is four one-pole stages with the last fed back, solved for the current sample (zero-delay feedback), so the cutoff is in tune at any setting. One tanh where the feedback meets the input keeps self-oscillation at a steady level. High-pass and band-pass mix the stages' outputs (as in the Oberheim Xpander). The low-pass makes up about half the bass it loses as Resonance rises.
  - **Model** (Clean / Ladder) is a preset setting in the Filter block, and on the Filter knob page in place of Key Track (still on the Playing page). Resonance's knob travel maps evenly onto the feedback, 0 to 4.2: the filter sings on its own from about 17. A resonance route moves the feedback by about a third of the knob per 12 dB (100%). Dice picks Ladder 30% of the time.
  - **Drive** with the ladder goes into the filter's saturator instead of the drive stage: the saturator is the Drive stage's curve, tanh(gain × x) / tanh(gain), with the feedback inside it. The Drive block still draws its curve, and its tap plays that curve on the mixer's signal.
  - **Drawings:** the filter curves (Synth view and playground) use the ladder's exact small-signal response when it is chosen.
  - **Level:** at the presets' own settings the ladder is within 3 dB of Clean (Acid Line −2.8 dB RMS, from the bass lost at high resonance; Warm Pad −0.2 dB).
  - **CPU:** cheaper than Clean when Drive is on, because the drive stage's 2x oversampling is skipped: the heavy test (10 notes, unison 3, table + saw, drive) is 0.43 ms per block in bun against 0.67 (16% against 25%). Without drive, about the same. The ladder's saturator isn't oversampled, so heavy drive on high notes can alias (slice 10).
  - **Render check:** factory presets stay on Clean, whose sound path is unchanged, so the reference stands.

### 9. Filter morph and a second filter

- Low-pass, band-pass and high-pass become one smooth **morph** knob, also a mod matrix destination.
- An optional **Filter 2**, in series or parallel, with its own cutoff and resonance.
- **Done when:** sweeping the morph knob with an LFO is smooth, and the Synth view shows both filters.
- Status: done 2026-10-25 (checked on the MiniLab).
  - **Morph** (`filterMorph`, 0–1) replaces the filter type: 0 low-pass, 0.5 band-pass, 1 high-pass. In between, the two neighbouring outputs of the same filter are crossfaded (going straight from low-pass to high-pass would leave a notch). Both models morph; the ladder mixes its stages the same way. At 0, 0.5 and 1 the output is exactly the old type's, so all 38 factory presets render bit-identically (compared sample by sample against the previous commit's engine). Saved user presets are migrated on load (type → morph, and a "Filter" knob becomes Morph).
  - **Resonance** now uses one rule for every morph position: Q = Resonance, capped at 24 dB as the low-pass was. The band-pass used to go up to Q 20; it now stops at about 16, and a resonance route on it now moves in dB like the others.
  - **Filter 2** (off / series / parallel) is a clean filter with its own Cutoff (default 300 Hz), Resonance and Morph (default high-pass). It follows Key Track, not the filter envelope or the LFOs. Series: after Filter 1. Parallel: on Filter 1's input (after the drive stage), added to Filter 1's output. Stereo voices run it per side.
  - **Mod matrix:** two new destinations, *morph* (100% = the whole range) and *cutoff 2* (±4 octaves), added at the end so saved routes keep their meaning.
  - **Synth view:** a Filter 2 block under Filter, drawing its curve (with Filter 1's dimmed behind it) and its own signal; the cables follow the mode. Each filter block's "Listen here" plays that filter on its own. A Filter 2 knob page (Filter 2's four settings, then Filter 1's cutoff, resonance, morph and Key Track). Morph replaces the type on the Filter page. Dice morphs sometimes and turns Filter 2 on 20% of the time.
  - **Tests:** the morph's drawn response matches the filter's measured one at in-between positions; a 1% morph step never moves the response by 2 dB or more; an LFO on morph adds no jumps beyond the saw's own (both models).
  - **CPU:** heavy test (10 notes, unison 3, table + saw, drive) 0.69 ms per block in bun; with an LFO on morph and Filter 2 in parallel, 0.75 (26% → 28%).

### 10. Clean drive and FM

- Oversampling (running at a higher rate inside, then filtering back down) for drive, FM and sync, so high notes don't sound harsh or "digital".
- A soft clipper on the output, so loud patches saturate instead of distorting harshly.
- **Done when:** a high FM or driven note sounds clean in a side-by-side test, and the CPU cost is measured.
- Status: done 2026-10-25 (checked by ear on the MiniLab).
  - **Measuring it:** `aliasLevel` (`render/analyse.ts`) measures the energy between a steady note's harmonics against the energy on them; fold-back lands between the harmonics. Lower is cleaner. Tests in `voiceBank.test.ts` hold the results below.
  - **2x sound path:** each voice's oscillators, mixer, drive and filters run at twice the sample rate. Envelopes, routes and LFOs stay at the normal rate and are held for both samples. The voices are summed at 2x and come back down once per part (and once per tap) through a 63-tap half-band filter (`dsp/halfband.ts`: flat to 20 kHz, 85 dB down from 28 kHz), which adds 15.5 samples (0.3 ms) of delay. Noise is made at 2x, scaled to keep its level.
  - **Drive:** the 2x path fed the drive more harmonics than before, so it got first-order antiderivative anti-aliasing (ADAA: the curve's average between samples, from its integral) instead of its own 2x oversampler.
  - **FM bug found:** strong FM pushes Osc 1's phase backward for part of each cycle, and the oscillator skipped smoothing (polyBLEP) for edges crossed backward. It now smooths them in both directions; this mattered more than the oversampling for FM on saw and pulse waves.
  - **Results at C7 (2093 Hz), before → after, dB:** FM sine 100% −4 → −56; FM saw 50% −8 → −35; sync +19 −28 → −36; drive 100% −31 → −39; ladder + drive 100% −23 → −29; plain saw −34 → −45. At C6 the FM sine at 50% was already clean (−92).
  - **Soft clipper** (`softClip.ts`) after the output limiter: unchanged below 0.7 (−3 dB), then bends smoothly towards full scale, as a WaveShaperNode with 4x oversampling. The limiter needs 2 ms to react, so note starts could go past full scale before; now they saturate instead of clipping.
  - **CPU (bun, 10 notes):** plain saw 10% → 11%; the heavy test (unison 3, table + saw, drive, sub, noise) 27% → 22%, and 31% → 25% with 8 routes. Cheaper overall, because profiling found the oscillator's edge check allocating on every sample; that fix paid for the 2x path.
  - **Render check** (run in T3's built-in browser): 0 of 38 presets have issues, and every peak is now below 0 dB (Acid Line and Table Pluck went just over before). Levels within 0.2 dB of the old reference; loudness over time +0.1 to +0.6 dB (the 0.3 ms delay shifts it slightly); chord spectra mostly within about 1 dB. Larger: Scan Pad +4.2 dB (at 2x the wavetable reader picks a richer level, so harmonics from 12 to 20 kHz that the old one cut now play), Funk Bass +2.1, Digital Keys +2.0, Acid Line +1.8 (drive). Reference re-saved.
  - **Not done:** the ladder with heavy drive could run at 4x for another few dB; the plain oscillators' smoothing could be raised from polyBLEP to a longer one. Neither seemed worth the CPU now.

### 11. Effects pass

- Stereo delay with ping-pong, a better chorus, and a reverb with size and damping controls.
- Effect amounts and LFO rates/depths become mod matrix destinations (from the backlog).
- **Done when:** every effect sounds good on the factory presets, and an LFO can sweep the delay or reverb amount.
- Status: done 2026-10-25 (checked on the MiniLab with the Test presets).
  - **Delay:** a **Delay Mode** setting, Stereo (as before: each side echoes on its own side) or Ping-pong (both sides into the left line, the feedback crosses over: echoes go left, right, left). One line per side, each with the darkening filter in its loop. Shared, from the Keys part, like the time and feedback.
  - **Chorus:** three delay lines (12 ms ± 3 ms) on triangle LFOs at 0.45 Hz, a third of a cycle apart, placed left, centre and right. When one line's pitch rises another's falls, so the wobble mostly cancels: wide and steady instead of seasick. The triangles are PeriodicWaves shifted in phase (an OscillatorNode can't start at a chosen phase). Same amount mapping as before.
  - **Reverb:** a **Damping** setting (default 40%). The impulse's noise passes through a low-pass (12 dB per octave) that closes as the tail goes on, so the highs die away sooner and the lows decay as before. At 60%, halfway through the tail the highs above 4 kHz are about 20 dB down. At 0 the impulse is exactly the old one.
  - **Mod matrix:** new destinations for the whole part: **chorus, delay, reverb** (100% = the whole range, kept within 0..1) and **LFO 1/2 rate** (100% = 3 octaves faster or slower) and **depth** (added on the LFO's own target; more tremolo depth lowers the centre too, so it never goes above full). They run once per part with the LFOs (from LFO values one sample back); per-note sources reach them from the newest note. Added at the end of the list, so saved routes keep their meaning.
  - **How the amounts get out:** the voice processor has a new 3-channel output with the effect amounts per sample (settings plus routes). It drives the chorus wet and dry gains and the delay and reverb sends through their AudioParams, so a sweep is sample-accurate. Volume stays on the main thread.
  - **Checked in the browser** (offline renders in the page): the reverb send works (no tail at 0, −42 dB at 60%); ping-pong echoes alternate with 55 dB between the sides, stereo mode is identical on both; velocity → delay alone opens the delay. The Synth view draws the three chorus sweeps, L/R labels on ping-pong echoes and the damped highs as a dashed curve.
  - **Presets:** Acid Line Volume 0.7 → 0.55 and Funk Bass 0.7 → 0.58, so they are no longer flagged as loud (they were 9.3 and 8.2 dB above the median). Dice picks Damping and sometimes Ping-pong.
  - **Render check:** 0 of 38 presets have issues. Presets without effects are unchanged; the rest move by up to about 3 dB in the shape over time and the spectrum (the damped reverb tails and the new chorus). Reference re-saved.
  - **Test presets:** a new "Test" category, last in the list, with one preset per feature: Ping-pong Pluck, Damping Room, Chorus Tide (LFO 2 → chorus), Delay Throw (square LFO 2 synced to a bar → delay), Reverb Breath (LFO 2 → reverb), Echo Starts (mod envelope → delay), Strip Vibrato (mod strip → LFO 1 rate) and Velocity Vibrato (velocity → LFO 1 depth). Knob 1 is always the feature's main control (the route amount, or the new setting). All 46 presets pass the render check.

## Phase C: finishing wavetables

### 12. WAV import

- Drop in a Serum-format WAV (2048-sample frames), or any short sound, which gets cut into frames.
- Imported tables are saved in the browser and appear in the table list.
- **Done when:** a free Serum table from the internet plays, and survives a reload.
- Status: done 2026-10-25 (checked in the browser and on the MiniLab).
  - **Import:** "Import a sound…" in the Wavetable tab's table list, or drop a file anywhere on the tab. "Cut as" picks how (Auto by default). The result line says what was done, and so does the table's description.
  - **WAV reading** (`wavImport.ts`): our own reader, not the browser's decoder, because the browser resamples to the audio context's rate (a 44.1 kHz Serum table would get 2229-sample frames at 48 kHz). PCM 8/16/24/32-bit and float 32/64, any channel count (mixed to mono), any chunk layout (Serum puts a `JUNK` and a `clm ` chunk before the samples, which leaves them unaligned). MP3, OGG and other formats go through the browser.
  - **Cut modes:** *Wavetable frames*: Serum's `clm ` chunk gives the frame size (`<!>2048`); without it, a length of whole 2048-sample frames counts as a table. Up to 256 frames; other frame sizes are stretched to 2048. One gain for the whole table, so a table that fades keeps its fade. *Single cycles*: the pitch is found (YIN on 5 windows, the median), then 64 single cycles from across the sound, each lined up with the one before (correlation search) so blending neighbours doesn't cancel. *Slices*: 64 slices of 2048 samples, each with its last 256 samples faded into the samples just before its start, so it loops without a click (these don't keep the pitch). Auto: frames if the file says so or fits, else cycles, falling back to slices when no pitch is found. Silence at both ends is skipped; only the first 30 s are read.
  - **Storage** (`tableStore.ts`): IndexedDB (a 256-frame table is 2 MB, too big for localStorage). Read once before the app starts, so presets that use an imported table find it.
  - **Table list:** imported tables follow the 8 built-in ones, so the Wavetable parameter's range (knob, encoder, Synth view dropdown) grows with them. × deletes one (after a confirm); the ones after it move down an id, and both parts, Dice patches and saved user presets are updated to match. Whatever used the deleted table gets Basic Shapes.
  - **Audio thread:** imported tables are prepared and sent when a part first uses them, not in the background like the built-in ones (they can be 6x bigger). The oscillator already handled any frame count.
  - **Checked in the browser:** two free tables from GitHub, both play and survive a reload: [mattetti/SerumWavetables](https://github.com/mattetti/SerumWavetables) "Prophet 5 PWM+" (a real Serum export with `clm `, 16 frames) and [jpnielsen/wavetables](https://github.com/jpnielsen/wavetables) (128 frames, no `clm `, an 18-byte `fmt ` and a `fact` chunk). A 196 Hz pluck as WAV and as MP3 was found at 196 Hz and cut into 64 cycles. Deleting a table moved the later ones down and a saved preset followed. With Osc 1 alone on an imported table the output is −20 dB RMS; on a missing table it is silent, so the sound really comes from the table.
  - **Found while testing:** a part that already named an id before that table existed (say a preset) never got the table on the audio thread; an import now sends whatever the parts use.
  - **Render check:** 0 of 46 presets have issues, every preset identical to the reference (0.0 dB on every measure); not re-saved.
  - **Tests:** `wavImport.test.ts` (WAV formats, Serum frames, stretching, one gain per table, the 256 limit, cycles that keep their shape and line up, slices that loop, pitch detection 55 Hz to 1 kHz).

### 13. Draw your own table

- Draw 2–4 keyframes (waves) with the mouse, or start from harmonic sliders. The app blends between them to make the full table.
- Live preview while drawing.
- **Done when:** you can draw a table, hear it, and save it.
- Status: done 2026-10-25 (checked by ear on the MiniLab).
  - **Editor:** "Draw a table…" in the Wavetable tab (or ✎ on a saved drawing) replaces the controls under the table view. It starts with sine → saw. 2 to 4 keyframes, spread evenly along the table. Draw with the mouse (every sample between two mouse points gets a value, so no gaps), or start from Sine/Triangle/Saw/Square, "From <table>" (the wave the table that played before has at that place), Smooth, Flip, Clear. The 32 harmonic bars can be dragged across. MiniLab knobs 1–8 are harmonics 1–8 of the selected keyframe, and the OLED shows them.
  - **Blending** (`tableDraw.ts`): *Harmonics* (the default) moves each harmonic's strength in a straight line and its phase the short way round, so nothing cancels between keyframes. *Crossfade* mixes the waves, like the oscillator does between frames. 31 or 32 frames, so every keyframe lands exactly on a frame. There is no DC offset, and one gain for the whole table (a quiet keyframe stays quiet).
  - **Live preview:** while the editor is open, a draft table at the end of the list plays. It is rebuilt at most every 40 ms and sent to the audio thread again. Held notes pick it up on the next block. Saving keeps the draft as a new table, or writes over the drawing that was opened. Cancel removes the draft and brings back the table that played before.
  - **Storage:** a drawing is stored like an imported table, and also keeps its keyframes and blend mode, so it opens again for editing after a reload.
  - **Checked in the browser** (Helium, headless): draw, bars, knob, add a keyframe, save, reload, edit, cancel, edit and save again, delete. No errors.
  - **Tests:** `tableDraw.test.ts` (lines without gaps, harmonic strengths read back, smoothing, keyframes landing on frames, crossfade vs harmonics on a wave and its upside-down copy, one gain, a flat keyframe).
  - **Render check:** not run. The sound path did not change; only new tables were added.

## Phase D: playing

### 14. Scale lock and chord mode

- Choose a root note and a scale (major, minor, pentatonic, dorian…). Notes outside the scale snap to the nearest scale note.
- Chord mode: one key plays a chord that fits the scale (triads or 7ths).
- The on-screen keyboard greys out notes outside the scale. It works together with the sequencer: the step knobs snap to the scale.
- **Done when:** with any scale chosen, random playing sounds musical, and one finger can play chords.
- Status: done 2026-10-25 (checked on the MiniLab).
  - **Controls:** a "Scale lock" strip above the on-screen keyboard, in every view: Root, Scale, Chords. The setting is shared by both parts and kept after a reload (localStorage). Each change shows on the OLED.
  - **Scales** (`scale.ts`): major, minor, dorian, mixolydian, harmonic minor, major and minor pentatonic, blues. A note outside the scale moves to the nearest scale note. When two are equally near, it goes to the lower one.
  - **Chords:** triads or 7ths, made by stacking every other note of the scale on the key's note. The 5- and 6-note scales borrow their 7-note parent scale (major pentatonic from major, minor pentatonic and blues from minor), so their chords are normal chords. The blues "blue note" has no chord, so in chord mode its key plays a neighbour's chord. The chord's name shows on the OLED and in the strip, together with every chord of the scale. Names are spelled for the key (Eb in C minor, not D#), in plain ASCII so the OLED can show them.
  - **Keys:** each held key remembers what it played. A scale change never leaves a note hanging. When two keys play the same note, the note stops only when the last of them is released.
  - **On-screen keyboard:** greys out the keys that move to another note, and marks the root.
  - **Sequencer:** with scale lock on, a step knob only reaches the scale's notes. Hold a pad + a key, and the note is moved into the scale. Whatever the sequencer plays (step + transpose) is moved into the scale too, so transposing keeps the line in key. Turning scale lock off brings back the stored notes. The step names show the note you hear.
  - **Checked in the browser** (Helium, headless): D dorian C# → C; Dm triad on D; Cmaj7 from C and C# held together stays until both are released; a scale change while a key is held leaves nothing hanging; the computer keyboard plays chords; step knobs and sequencer notes stay in C minor pentatonic; the setting survives a reload.
  - **Tests:** `scale.test.ts` (snapping for every scale and root, the chords of C major, harmonic minor's major V, the borrowed chords, the blue note, spelling), and a `stepSequencer.test.ts` case for the pitch hook (including two steps that snap to one note tied by a slide).

### 14b. Chord detection

- Added 2026-10-25, before the recipes: the UI names the chord you play on the keys. It is not shown on the OLED (the user's choice).
- Status: done 2026-10-25 (checked on the MiniLab).
  - **Detection** (`chordDetect.ts`): each held note is tried as the root, and the intervals above it are matched against 21 chord shapes: triads, sus2/sus4, 6ths, 7ths (including m7b5, dim7, 7sus4, m(maj7), maj7#5), add9, 9ths. The best match has the lowest note as its root (otherwise it is written as a slash chord, C/E), uses every note (a 7th or 9th may leave out its 5th), and is the simplest. So C E G A is C6, and with A in the bass it is Am7. One note shows its name. Two notes show the interval, or a power chord (C5) for a 5th. Notes that make no named chord are listed as notes, never given a wrong chord name.
  - **With scale lock:** the chord's number in the key (I, ii, V7, viiø7; an inversion keeps its number), and "outside the key" when one of its notes isn't in the key. Names are spelled for the key. With the scale off they use the usual spelling (C#, Eb, F#, Ab, Bb), and so do the step names.
  - **Timing:** the name is found 40 ms after the notes stop changing, so it doesn't flicker while the fingers land. A release only renames the chord while 3 or more notes are still held. Letting go one finger at a time keeps the name showing, dimmed once its notes are released. A scale change renames the held chord.
  - **What it listens to:** the Keys part's held notes (chord mode's chords included), not the sequencer. In chord mode the strip's chord list lights up the chord being played.
  - **Tests:** `chordDetect.test.ts` (triads, inversions, 7ths/6ths/9ths, the bass deciding C6 vs Am7, a 7th chord without its 5th, clusters, spelling, numbers in the key, notes outside the key, and every chord that chord mode plays found under the same name).

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
- Status: done 2026-10-25 (tried by the user, who asked for a slower pace and a new card design).
  - **Where:** the "Recipes" button in the header opens the recipe list in the Synth view. A recipe runs there: its panel takes the place of the block details and stays pinned at the top while you scroll. Starting a recipe gives the Keys part the **Init** sound (Osc 1's saw alone, filter open, full sustain, no effects), as an unsaved sound like a Dice patch ("Recipe: Init" in the preset menu). When the recipe is done, the sound takes the recipe's name.
  - **Steps** (`src/recipes/`): text, a "why" line (what it does, what to listen for), and checks: conditions on settings (a range or a choice, with a suggested value for the hint) or on playing (a note, a low note, a chord). A step is done once all its checks have held for 1.2 s, so sweeping a knob through the range doesn't count. It then stays on screen, ticked, with "✓ Done. Listen to what changed…" and a bar that runs down for 3 s before the next step comes. Next step → goes on at once. (It first moved on after 0.6 s with no pause; the user found that too quick.) Each check has a live tick and the current value. Hint gives the suggested values. Back never passes a step by itself; Skip, Start again (back to Init) and Close (the sound stays) are there too. Loading another preset or rolling Dice on the Keys part ends the recipe.
  - **Pointing:** the step's block pulses in the diagram and its control is outlined. The knobs move to the page that has the control, and the panel says which knob or fader (the amp envelope is always on faders 1–4), with that page's knob map. The OLED shows "Step 3/11" and "Knob 5: Osc Mix" (or "Fader 3: Sustain", "Play a chord"), and "<Recipe> done!" at the end.
  - **Recipe cards:** a soft glow of the recipe's colour from the top right, the category as a small tag, the step count, and a sketch of the finished sound's volume shape (its amp envelope, from the recipe's suggested values).
  - **Recipes:** Reese Bass (11 steps), Pluck (10), Supersaw Pad (11). Done screen: what you built, Save as preset…, another recipe.
  - **Checked in the browser** (Helium, headless): all three built from Init with only MiniLab knobs, faders and keys (every step moved on by itself, and every control was on the knob the panel named). Also checked: a knob swept through the range, Back to a finished step, Skip, Start again, Save as preset, loading a preset, and switching to the Sequencer part (the panel says so, with a button back to Keys).
  - **Found while testing:** deleting a user preset while a recipe ran crashed the OLED update (it read the preset before the list was updated); the recipe now ends after the new preset is in place.
  - **Tests:** `recipes.test.ts` (each recipe can be built from Init by following the hints, no step is already done when it starts, later steps don't undo earlier ones, aims are within range, every control is on a block and on a knob or fader, each recipe ends by playing; where the knobs and faders are).

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
- Status: done 2026-10-25 (the user built some of the recipes on the MiniLab).
  - **12 new recipes**, 15 in all: Bass: Reese, Acid (ladder filter, resonance, fast filter envelope, drive, glide), Sub (sine + a little triangle, filtered round, a touch of drive), FM (two sines, modulator an octave up, quick filter envelope). Leads: Sync (Osc 2 synced, pitch envelope on Osc 2 only), Vowel (the Vowels table swept by LFO 2, mono with glide). Keys: Pluck, E-Piano (sine + octave-up triangle, long decay, velocity, tremolo, chorus), Bell (FM at +22 semitones, long ring, slow filter decay, hall). Pads: Supersaw, PWM Strings (two pulse waves, LFO 2 on width), Wavetable Scan (Formant Sweep table, very slow LFO 2 on position, unison 3). Effects: Laser (big fast pitch envelope, delay with feedback), Wind (noise through a band-pass that follows the keys, slow LFO gusts), Synth Toms (sine, pitch drop, a little noise, velocity). 8 to 14 steps each. No recipe needs the mod matrix.
  - **Browser:** the recipe list is grouped (Bass, Leads, Keys, Pads, Effects). A recipe you have finished shows "✓ Built", and the header counts "N of 15 built", with a reset link. Progress is kept in localStorage. Saving the result as a preset is on the done screen (slice 15).
  - **Screen-only controls:** the Wavetable menu has no knob in the Synth view, so the panel says "On screen" for it and the OLED shows "Set Wavetable". It is the only one (`SCREEN_ONLY`).
  - **Checked in the browser** (Helium, headless): all 15 recipes built from Init in a row, every step moving on by itself and every control reached through the knob or fader the panel named (the Wavetable menu on screen). All 15 still ticked after a reload.
  - **Tests:** the recipe tests now run for all 15. A new test checks that every control a step asks for is already on show on its block when the step comes (Pulse Width needs a square wave, the Wavetable menu needs a table, Stereo needs unison).

## Phase F: a better synth and a better app

The synth must run well on weaker computers, and the app should be easier to find your way around. The slices alternate between the app and the sound, so every session shows a visible change. Speed comes first, because every later feature adds work for the computer.

### 17. Speed on weaker computers

- **Measure first.** An accurate clock for the CPU meter: today it only counts whole milliseconds, so the peak reading is useless. Time each stage of the voice processor (oscillators, wavetable reads, filters, envelopes, modulation) and the main thread's frame time in each view. Test with Chromium's CPU slowdown (4x and 6x) as the "weak computer".
- **Audio thread:** speed up what the measurements point to, e.g. work done every sample that could be done once per block, filter settings worked out again when nothing changed, wavetable reads, the mono path when Stereo is 0 (noted in slice 7). WASM only if TypeScript can't get there (it was the backlog's fallback).
- **Main thread:** the Synth view draws many live pictures at once. Draw only what is on screen, at a lower rate where it can't be seen, and skip frames when nothing changed. MIDI and the keys must stay instant while it draws.
- Today, on a fast desktop (Ryzen 7 7800X3D), 8 notes of Scan Pad take 39% of the voice processor's time.
- **Done when:** at a 4x CPU slowdown, 8 notes of the heaviest preset play without dropped notes, every view stays smooth, and the render check still matches.
- Status: done 2026-10-25.
  - **Measuring:** `bun run bench` holds 8 notes of several presets and prints each one's share of the audio thread's time per block (`src/bench/voices.bench.ts`). Run it under Node too (`bun build … --target=node`, then `node`): Node uses V8, the same engine as Chromium, and its numbers match the browser; bun's engine (JavaScriptCore) optimises differently. Found while measuring: Chromium's CPU slowdown does not reach the AudioWorklet thread, so for the audio side the test became a budget instead: about 20% on this desktop (Ryzen 7 7800X3D) for 8 notes of the heaviest preset leaves a laptop 3–4x slower under the limit. Chrome's worklets have no accurate clock (only Date.now), so the meter's average is right but its peak is not; that stays as it was.
  - **Audio thread, 8 notes, in Helium:** Scan Pad 39% → 18%, First Saw 17% → 10%, PWM Strings ~20% → 11%, Reese Bass ~23% → 16–18%. Garbage collection on the audio thread went from 20 ms to 2 ms per 2 s.
    - The phases wrapped with `% 1`, a slow library call in V8 (a fifth of a plain saw's time). Now `x - Math.floor(x)`, which gives exactly the same numbers.
    - The wavetable reader works out the frames to blend once per sample for all unison copies (and only when the position moved), and wraps indexes with a bit mask.
    - Envelopes and glides fill a whole block at once and stop computing once they arrive. The filter's coefficient (a tan() and an exp()) is only worked out again when its inputs change.
    - The big one: calls that V8 couldn't inline allocated memory for every number they passed, about 1 MB per block, at every copy of every sample. The oscillators now run in short loops over the block, one unison copy at a time; the second pass (mixer, drive, filters, amp) runs stage by stage, each filter and drive with its own block method. The edge check for the polyBLEPs is a tiny function, with the rare crossing in a separate one.
    - The stage taps (the Synth view's pictures) are only rendered while the Synth view is open or a stage is listened to.
    - Nothing is allocated per block any more (closures, subarray views, event lists when there are no events).
    - The sound: bit-identical for every change except the per-copy loops, which add the unison copies in a different order (differences up to 1.4e-6). The render check: 0 of 46 presets have issues, every measure 0.0 dB from the reference (not re-saved).
  - **Main thread** (Chromium's 4x / 6x CPU slowdown, 8 notes of Scan Pad): Playground view 38 → 59 fps / 27 → 47 fps; Synth view 56 → 60 / 37 → 52; Wavetable view 60 / 54 → 60.
    - Live pictures share one animation loop. It skips pictures that are off screen and pictures with nothing new (the scope during silence), and drops to every other frame while frames arrive late (trying 60 fps again after 5 s, then waiting longer each time it fails).
    - Canvas shadowBlur (the scope's and the wavetable's glow, the envelope and LFO dots) is replaced by two faint wide strokes under the line (`glowStroke`, `glowDot`): it looks the same and costs almost nothing.
    - Still slow under heavy slowdown: the main scope's canvas commit (about 5 ms per frame at 1x). That cost is from headless Chromium drawing canvases without a GPU; a laptop with any GPU (integrated is enough) composites canvases far more cheaply. Not measured on real weak hardware.

### 18. Layout and navigation

- **Header:** group it (views, recipes, MIDI, CPU, transport) so it isn't one crowded row.
- **Views:** make the Playground view's job clear next to the Synth view (the playing surface vs the full synth), so they don't repeat each other.
- **Synth view:** fit it without long scrolling: a tighter diagram, and a modulator row you can fold away.
- **Laptop screens:** works from about 1280 x 720, no sideways scrolling.
- **Done when:** on a laptop screen, each view shows its main controls without scrolling, and nothing has moved somewhere you can't find it.
- Status: done 2026-10-25.
  - **Header:** two rows. Row 1 holds the views (Play, Synth, Wavetable), Recipes, the MiniLab status, CPU, the Explanations switch (it was only in the Synth view, but it works on every view) and "About & shortcuts". Row 2 holds the sound (part, preset, Dice, Save) on the left and time (play, record, BPM, Tap) on the right. "Clear" moved into the drum loop panel. The footer with all the shortcuts is gone; the shortcuts are now a list on the About page.
  - **Views:** the Playground view is now **Play**: the MiniLab's 8 knobs and 4 faders, the strips, and the scope or spectrum. Below them, one tab switches between Drums (pads and loop) and Step sequencer. Editing either from the MiniLab brings its tab up. The filter curve and envelope pictures are gone from Play: the Synth view shows both, with more detail. Each view button has a tooltip that says what the view is for.
  - **Synth view:** the knobs in the signal path show their label beside the knob, not under it, which halves their height. The pictures are shorter, and the one-line text on each block is now its tooltip. The detail panel is one strip: two lines each of explanation and "Try this" (More shows all of it), and the knob map in two rows of four, laid out like the MiniLab. The cable legend moved to the modulator row. "▸ Modulators" folds that row to a strip of names that cables still reach, and the app remembers the choice.
  - **Wavetable view:** the table list runs down the left. The "not playing" notice sits on the 3D picture. The controls are in one short row.
  - **Keyboard:** 76 px instead of 90. The bar above it is one slim row: the chord on one line, then a **Scale lock** switch. "Off" is no longer an item in the Scale menu. Turning the switch on shows the root, the scale and "Notes / Triads / 7ths" (chord mode), and brings back the last scale you used (Major the first time). With chords on, the scale's chords are listed. "Keyboard ▾" folds the keys away; the MiniLab and the computer keys still play. The app remembers both choices.
  - **Measured** (Helium, 1280 x 720 window, explanations on): Play 1371 → 720 px tall, with nothing to scroll (the sequencer tab too). Synth: the signal path ends at 670 px. With the modulators folded, the strip of names also fits on screen; the keyboard is below. Wavetable 1271 → 750 px, all its controls on screen. No sideways scrolling at 1280, 1100 or 900 px wide.

### 19. Undo, redo and compare

- **Undo and redo** for every sound change (knobs, faders, screen controls, recipe steps, Dice). Ctrl+Z / Ctrl+Shift+Z, buttons on screen, and a MiniLab shortcut. Moving one knob a long way counts as one change.
- **Compare:** switch between the edited sound and the saved preset (A/B) to hear what your changes did, and a list of what changed ("Cutoff 1.8 kHz → 400 Hz").
- **Done when:** you can try anything and always get back, and you can hear and read the difference from the saved preset.
- Status: done 2026-10-25.
  - **Undo and redo** (`src/app/history.ts`): each part keeps its own history of up to 200 steps. A step is a snapshot of the part's sound (preset, Dice or recipe patch, every value, the "edited" flag). Changes to the same control less than 0.8 s apart join one step, so a knob turned a long way is undone in one go; a pause or another control starts a new step. Covered: knobs, faders, every screen control, preset loads, Dice, starting a recipe (undoing it leaves the recipe), the recipe steps (they are knob moves), adding and removing a route, picking a wavetable. Deleting a user preset or a wavetable clears the history, because the numbers after it move down one.
  - **Where:** ↶ ↷ next to Dice (the tooltip names the step), Ctrl+Z and Ctrl+Shift+Z or Ctrl+Y, and on the MiniLab Shift + the pitch strip: down undoes, up redoes, once per push. The OLED says what was undone. Holding Shift no longer bends the pitch.
  - **Compare:** when the sound is edited, "N changes ▾" opens the list of what changed from the saved preset ("Cutoff 1.80 kHz → 30 Hz"), each with ↺ to put it back. Settings of empty matrix routes are left out. "Compare" plays the saved preset while the screen keeps showing your edit; click again, or change anything, to hear your edit.
  - **Checked** in Helium: a long mouse drag on a knob is one step; undo and redo across a knob, a preset load and Dice; Shift + strip; a route; Compare sends the saved values to the engine.

### 20. Arpeggiator, and scale and chords on the MiniLab

- **Arpeggiator:** hold notes or a chord and it plays them one at a time: up, down, up-down, random, the order played; 1–3 octaves; rate and gate like the sequencer; latch (keeps going after you let go). On the same clock as the sequencer and drums. Works with chord mode, so one finger makes an arpeggio.
- **On the MiniLab:** switch the arpeggiator, scale lock and chord mode without the mouse (a Shift combination that is still free; Shift + pitch strip is undo/redo since slice 19), shown on the OLED.
- **Done when:** one finger plays an in-scale arpeggio in time with the drums, set up from the MiniLab alone.
- Status: done 2026-10-25 (checked on the MiniLab).
  - **Arpeggiator** (`src/audio/arpeggiator.ts`): plays the Keys part's held notes (chord mode's chords included, already in the scale) one at a time. Patterns: Up, Down, Up-down (the top and bottom notes aren't played twice), Random (never the same note twice in a row), Played (the order the keys went down). 1–3 octaves, rate (1/8, 1/8T, 1/16, 1/16T, as the sequencer), gate 5–100%, and latch: after you let go it keeps playing until a new chord (the first key pressed with no key down replaces the latched notes; keys added while one is held join in). Each note keeps the velocity of its key. A new note joins the pattern in place, without restarting it.
  - **Clock:** on the drum clock. With the transport stopped, the clock runs for the arpeggiator alone (drums and sequencer silent) while it has notes, and its first note plays at once. While the drums play, it starts on the next step of the grid. Pressing ▶ while it runs starts the drums where the clock had planned up to, so every note stays on the drum grid and none plays twice; ■ stops the drums and the arpeggio goes on.
  - **On screen:** an **Arp** switch in the keyboard strip, next to Scale lock: pattern, octaves, rate, gate and Latch. The keys you hold are outlined; the note playing lights up. The settings are kept after a reload. Switching it on while keys are held takes them over; switching it off leaves them silent until pressed again. The Scale lock switch moved into a shared `Switch` component.
  - **On the MiniLab** (Shift + faders and Shift + mod strip were free): Shift + fader picks by where the fader is: 1 the pattern (bottom = off), 2 the range in octaves, 3 the scale (bottom = off), 4 notes / triads / 7ths (with the scale off, this brings back the last scale). Shift + mod strip picks the root, C at the left to B at the right. The OLED says what changed and shows its arp icon while the arpeggiator is on. While Shift is held, the on-screen faders show these jobs. Afterwards each fader picks up its own job again (it does nothing until it reaches its value).
  - **Layout:** at 1280 x 720 the Play view still fits with Arp and Scale lock both open (the list of the scale's chords hides when there is no room). Narrower, Scale lock wraps to a second line.
  - **Checked in the browser** (Helium, headless): set up from MiniLab events alone (Shift + faders 1–4, Shift + mod strip: D dorian, triads, Up, 2 octaves), one key D played D F A up two octaves in 16ths with the drums stopped, then on the drum grid after ▶; released, it stopped. Latch, a new chord replacing a latched one, switching on while keys are held, fader pickup after Shift, settings after a reload.
  - **Tests:** `arpeggiator.test.ts` (each pattern and octaves, up-down's ends, the grid, triplets, the gate, latch, random, skipping a late step, the clock running alone, ▶ while it runs).
  - **Render check:** not run; the sound engine did not change.

### 21. Preset browser

- A browser instead of the long dropdown: categories, search, favourites, tags, and your own presets apart from the factory ones.
- Hear a preset before loading it (a short preview note).
- Export and import presets as files.
- **Done when:** you can find a sound by what it is ("dark bass") in a few seconds, and move your presets to another computer.
- Status: done 2026-10-25 (tried by the user).
  - **Ids instead of list positions:** every preset has an id for good (`factory:<name>`, `user:<random>`; Dice and recipe sounds get their own). Each part holds its preset itself, not a number in the list. The old dropdown's ◀ ▶ went wrong after Dice or a deleted preset, because they stepped from a stale number; that whole class of bug is gone. Undo steps keep the preset too, so deleting a preset no longer clears the history.
  - **Browser** (`src/app/presets/PresetBrowser.svelte`, logic in `src/presets/browser.ts`): click the preset name in the header. Groups down the left (All, ★ Favourites, My presets, then the categories; "Test" is shown as "Feature demos"), a search box, and 16 describing-word buttons (dark, bright, warm, soft, fat, dirty, punchy, plucky, slow, moving, wide, spacey, retro, metallic, chords, mono). Every typed word must match the name, the category or a tag; the start of a word is enough, plurals and a few other words work ("pads", "effects"). "dark bass" finds Reese Bass and Sub Bass. ↑ ↓ and Enter work in the search box; Esc or a click outside closes it. Click a row to load it; double-click loads and closes.
  - **Tags:** every factory preset has 3–6 describing words (written from its settings). Your presets keep the tags of the sound they were saved from.
  - **Preview:** ▷ plays a short note (a chord for pads, keys and brass; a low note for basses; longer for slow attacks) on a third voice processor of its own, made the first time you preview. The parts keep their sounds and notes.
  - **Favourites:** ★ on any preset, kept after a reload. Pad bank B now loads the first 8 favourites (the old 8 pad presets are the default favourites); a pad with no favourite is dark.
  - **Your presets:** a group of their own, with rename and delete. Deleting the preset a part is on leaves the sound playing as "not saved".
  - **Files:** "Export mine" saves your presets as a JSON file; "Import…" adds a file's presets to yours. Presets you already have (same name and settings) are skipped; a name taken by another sound gets a number. Settings are checked: unknown ones are dropped, values are kept in range, and a wavetable the other computer doesn't have becomes the first table.
  - **◀ ▶ and the encoder** step through the browser's list (a category, favourites, a search), wrapping round; from a sound that isn't in it, ▶ goes to the first. The OLED counts within that list.
  - **Checked in the browser** (Helium, headless): "dark bass" + Enter; preview without changing the part; tags and groups; ◀ ▶ through Bass, also after Dice; encoder browse and click; save, rename, delete, undo; export, then import into a fresh browser profile (and again: "already here"), kept after a reload. No errors.
  - **Part buttons:** Keys and Sequencer are a fixed size now, so a preset with a longer name doesn't move the header row. A name too long for its button slides to show the rest and back (`Marquee.svelte`, like a long title in a media player; it stays still with reduced motion).
  - **Tests:** `browser.test.ts` (search by name, category and tag, word starts, plurals and other words, groups, tag buttons, favourites' order, export → import, duplicates and name clashes, settings checked, files that aren't presets; every factory preset tagged with its own id).

### 22. Effects

- Effect slots you can reorder, each with its own on/off.
- New effects: phaser, flanger, distortion types (soft, hard, fold, bit-crusher), EQ, compressor, next to the chorus, delay and reverb.
- Each effect gets a block in the Synth view, with a picture and a plain-English explanation like the others.
- **Done when:** every effect can be heard on its own and in any order, and the CPU stays within slice 17's target.
- Status: done 2026-10-26 (checked by the user).
  - **One chain per part:** distortion, compressor, EQ, phaser, flanger, chorus, delay, reverb, run in the part's order (`fxSlot1..8`, repaired if a file holds a broken order) with an On switch each (`distortionOn`…`reverbOn`; chorus, delay and reverb default to on, so old presets keep their sound). An effect that is off is taken out of the chain and costs nothing. The delay and reverb are no longer shared: each part has its own (time, feedback, room). The drums get a little of the Keys part's reverb, as before.
  - **Our own code** (`dsp/effects.ts`, an "fx-slot" processor each, made the first time the effect is turned on): **Distortion** soft (tanh), hard (clip), fold (sine fold), at 2x the sample rate (a new `Interpolator2` up, the existing `Decimator2` down: exactly 31 samples, and the dry sound is held back to match), and **crush** (12 down to 2 bits, each sample held up to 16 times) at the normal rate; Drive keeps the volume about the same (make-up from a reference sine), plus Tone (12 dB/oct low-pass) and Mix. **Phaser:** 6 first-order all-passes swept 150 Hz up to 6 octaves, feedback, the right side a quarter cycle ahead. **Flanger:** 0.5–7.5 ms swept delay with ±90% feedback, same stereo offset. The phaser and flanger make up the level their notches take away (averaged over the octaves and the sweep).
  - **The browser's nodes:** EQ (low shelf 150 Hz, peak with Mid Freq, high shelf 5 kHz, ±15 dB) and compressor (threshold, ratio, attack, release; its own make-up gain).
  - **Synth view:** the effects have a row of their own between the signal path and the modulators, in chain order: the chain cable goes Amp → each effect that is on → Output, passing behind the ones that are off (folded to their title). Drag the ⠿ handle to move one (or focus it and press ← →); the On switch is in the header. Pictures: the distortion's curve (crush: bits and rate), the compressor's curve with a live gain-reduction bar, the EQ's response, the phaser's notches and the flanger's comb where the sweep is now (the processors report their LFO phase). New knob pages: Dist+Comp, Phase+Flng, EQ. Moving and switching are undo steps.
  - **CPU** (Node/V8, per 128-sample block): distortion 20 µs (0.8% of the budget; crush 0.15%), phaser 0.2%, flanger 0.1%; no allocation on the audio thread after warm-up. Their time is reported apart (`fx` in the CPU report), so the voice limit still learns the right cost per note and leaves their share free.
  - **Feature demos:** Phaser Keys, Jet Flanger, Fuzz Lead, Fold Pluck, Crushed Keys, Squash Pluck, Telephone EQ (knob 1 switches the effect, to compare) and Fuzzed Reverb (the reverb before the distortion). Dice sometimes adds a phaser, flanger or some distortion.
  - **Checked in the browser** (Helium, headless): every effect alone changes the sound and is heard on its "Listen here" tap; each demo with its effect on and off; drag and drop and the arrow keys reorder, undo restores; the Sequencer part keeps its own chain. Found and fixed: Chrome never runs a processor again once `process()` has returned false, even when reconnected, so a switched-off effect came back silent.
  - **Render check:** 0 of 54 presets have issues. 17 reverb presets differ by up to 3 dB in the shape over time. That is only a different draw of the reverb's noise (each part now builds its own impulse, which uses up the seeded random numbers): with only the Keys part building one, nothing differs. Reference re-saved.

### 23. Modulation

- Patch in the Synth view by dragging a cable from a source to a destination.
- Show the fixed connections (filter envelope → cutoff, amp envelope → volume) as greyed-out routes in the matrix, so all modulation is in one place.
- A third LFO.
- **Done when:** a route can be made, changed and removed by dragging alone, and every modulation the synth does is visible.
- Status: done 2026-10-26 (checked by the user).
  - **Dragging cables** (`src/app/synth/patchDrag.svelte.ts`): every modulator has a ○ socket on its top edge, where its cables leave; Playing has four (velocity, key, mod strip, random), named while the pointer is on the block. Drag from a socket and every block that can take a route shows its destinations as drop zones (Oscillator 1: Pitch, WT Pos, Pulse width; Filter: Cutoff, Resonance, Filter morph…); let go on one to make the route. Each route cable has a ● at its end: drag it to another destination to move the route (source and amount kept), or into empty space to remove it ("Let go to remove route n" shows at the pointer). Esc cancels. Near the window's top or bottom edge the page scrolls, so the modulator row reaches the oscillators. A click on a socket (or Enter) starts click patching from that source; ＋ Patch still works. Every change is one undo step. New routes start at +50%, pitch routes at +10% (100% is two octaves).
  - **Fixed wiring:** under the routes, greyed out: Amp Env → Volume, Filter Env → Cutoff, Pitch Env → Pitch, LFO 1 and 2 → their targets, Velocity → Volume and filter env, Key → Cutoff, Mod strip → LFO 1 depth, Pitch strip → Pitch, Osc 2 → Osc 1 (FM) and Osc 1 → Osc 2 (sync), each with its amount; the ones doing nothing now are fainter. A click puts the knobs on the block that sets it. It folds away, and the app remembers that. It makes the Synth view about 50 px taller at 1280 x 720 (the list takes two lines).
  - **LFO 3:** like the Mod Envelope, only connected through routes: Shape (triangle by default), Sync and Rate, a block in the modulator row (now eight) and an "LFO 3" knob page (rate, shape, sync, routes 1–4's amounts). New source "LFO 3" and destination "LFO 3 rate", added at the end of the lists so saved presets keep their routes. Its picture is as deep as its strongest route ("Not patched" without one).
  - **Checked in the browser** (Helium, headless, 1280 x 720): LFO 3 → Resonance dragged from the modulator row (the page scrolled up on the way), moved to Osc mix, removed by dropping on empty space; Velocity → Cutoff from Playing's socket; click patching from a socket with the modulators folded. No errors.
  - **Tests:** LFO 3 does nothing without a route and sweeps an effect amount with one; a route on its rate speeds it up; it moves a note's cutoff.
  - **Render check:** 0 of 54 presets have issues (not re-saved).

### 23b. Classics

Added 2026-10-26 after slice 23, before the course: the synth recreates famous sounds with what it already has, so you can compare it with the records.

- **Presets:** a Classics group in the preset browser, 21 recreations: Stadium Brass (OB-Xa, "Jump"), Acid 303 and Filthy Acid (TB-303, "Acid Tracks", "Da Funk"), Prog Lead (Moog, "Lucky Man"), Funk Moog Bass ("Flash Light"), Sync Sweep (Prophet-5, "Let's Go"), Hoover (Alpha Juno, "Mentasm"), Trance Supersaw (JP-8000), Juno Pad, Oxygene Strings (string machine through a phaser), Blade Brass (CS-80, "Blade Runner"), Growl Sweep (OB-X, "Tom Sawyer"), FM House Bass (TX81Z "Lately Bass"), FM Tine Piano (DX7), Popcorn Pluck, Axel Lead (Jupiter-8, "Axel F"), Monday Bass ("Blue Monday"), Feel Love Seq ("I Feel Love"), G-Funk Whine, Electro-Theremin ("Good Vibrations") and Upside Arp ("Stranger Things").
- Each has an `about` line: the original instrument, a record to compare with, and how to play it. The browser shows it in place of the describing words (in full as the tooltip), and search finds it ("oberheim", "vangelis").
- **Left out on purpose:** sounds based on samples (Korg M1 piano and organ, Mellotron, the orchestra hit).
- **Known limits:** the supersaw has 6 saws per note (the JP-8000 has 7); the DX7 sounds use two-operator FM, not six; the CS-80 is played with key pressure, so here the mod strip and velocity stand in; the sequencer has no accents for the 303.
- **Recipes:** Stadium Brass, Hoover and G-Funk Whine, in a Classics group of their own (18 recipes now).
- **Tests:** every Classic names a year or decade, uses only real settings within range, and is found by its instrument or artist; the recipes pass the usual checks (buildable from Init by the hints, no step done before it starts, every control on a knob or fader).
- **Render check:** 0 of 75 presets have issues; the 54 that were there are unchanged. Feel Love Seq, G-Funk Whine, FM House Bass and Trance Supersaw were made louder to sit with the others. Reference re-saved.
- Status: done 2026-10-26 (the user tried the ones they know; a full comparison with the records comes later).

## Phase G: the learning course

Postponed on 2026-10-25 until Phase F was done; started 2026-10-26. Modelled on Ableton's Learning Synths: short pages, each with a few sentences of text, **one** interactive widget, and only the controls that page needs.

### 24. Course framework and Chapter 1, "Sound and Oscillators"

- **Course mode:** a new tab with a lesson page on the left and a **reduced synth** on the right. A lesson lists the blocks and controls it allows, and everything else is hidden and held at sensible values (e.g. the filter fully open).
- **Lessons are written as data:**
  - text paragraphs
  - interactive widgets: wave picture, keyboard, single knob, A/B comparison
  - "try this" steps that use the **same engine as recipes**
- Next/back, progress saved, and MiniLab knobs mapped only to what the page shows.
- **Chapter 1, about 6 pages:** what sound is, pitch, loudness, wave shapes, harmonics (with the harmonics bars), detune and beating.
- **Done when:** someone with no synth knowledge can go through Chapter 1 using only the MiniLab and the page.
- Status: done 2026-10-26 (checked by the user).
  - **Where:** a **Learn** tab next to Play, Synth and Wavetable. The page is on the left: a title, 2–3 short paragraphs (new words in bold), one widget, and "Try this". On the right is the reduced synth: only the page's blocks, in signal order (Oscillator 1 → Output; on the last page also Oscillator 2 and the Mixer), each with only the page's controls. Below it, the knobs the page uses. A row of page chips at the top (✓ when done), with Back and Next.
  - **Held still:** each page starts from its own sound over the course's base (Init with a sine: one oscillator, filter open, no envelopes, no effects). Opening Learn stops the transport, leaves any recipe, step or sequencer edit, selects the Keys part, and switches the arpeggiator and scale lock off. The sound bar (presets, Dice, undo) is hidden. Leaving gives back the Keys part's sound (preset, edits, "edited" flag), the arpeggiator and the scale. Changes on a course page are not undo steps, and undo is off while the course is open.
  - **Lessons as data** (`src/course/`): `Lesson` has text, a widget, the blocks, the knobs (MiniLab knobs 1, 2…), a starting sound, choice limits (the Osc 1 wave offers sine to square, without "table"), and steps. The steps are recipe steps and run on the same engine (`RecipeRun`, now generic): they hold for 1.2 s, then stay ticked for 3 s. A new play check, "a high note" (C5 or above).
  - **Widgets:** live wave (zoomed to fit, or at a fixed scale so its height shows loudness); pitch (the note's name and frequency, and its wave over 10 ms, so a higher note shows more swings); one big knob; harmonic bars (the wave drawn small, "=", then its first 16 harmonics); A/B comparison (each side sets the page's controls, so you see what changed; with the beat rate at the note you play).
  - **Chapter 1, 6 pages:** What sound is, Pitch, Loudness (Volume), Wave shapes, Harmonics, Detune and beating (A/B, Osc Mix and Detune).
  - **On the MiniLab:** the knobs control only the page's controls (a limited choice control spreads its few choices over the whole turn). Other knobs and the faders do nothing (the OLED says "not on this page"). The encoder turns the pages, and a click switches A/B. Pad bank B doesn't load presets, a long press doesn't roll Dice, and Shift + key doesn't switch part. The OLED shows "Learn 3/6" and the step's control ("Knob 1: Volume", "Play a high note").
  - **Progress:** the open page and the done pages are kept after a reload ("N of 6 pages done", with a reset link). A page is done when its last step is.
  - **Checked in the browser** (Helium, headless, 1280 x 720): all 6 pages done from simulated MiniLab events alone (keys, knobs, encoder turn and click). Faders, unused knobs, pad bank B and a long press changed nothing. Leaving gave back an edited preset with the arpeggiator and a scale on. Progress kept after a reload. With the keyboard folded, pages 1 and 3 fit on the screen and the others scroll by 26–160 px (with it open, 70–245 px). No sideways scrolling at 1280, 1100 or 900 px wide.
  - **Tests:** `course.test.ts` (each page can be done from its starting sound by following the hints, and no step is done before it starts; steps only ask for the page's knobs; every control is on a block the page shows; aims within range and within the page's choices; short paragraphs; A/B sides only set the page's controls, and A is the starting sound).

### 25. Chapter 2, "Shaping over time" (envelopes)

- Amp envelope stage by stage (each control appears only once it's explained), then the filter envelope.
- The widgets compare a long attack with a short one, and a pluck with a pad.
- Status: done 2026-10-26 (checked by the user).
  - **5 pages** (`src/course/chapter2.ts`), all on the sawtooth: **Attack** (A/B short vs long attack, fader 1), **Decay and Sustain** (faders 1–3), **Release** (all four faders: ADSR), **Pluck and pad** (A/B of the two shapes), **The filter envelope** (Cutoff, Filt Env and F Decay on knobs 1–3, with a short introduction to the filter, which chapter 3 explains).
  - **Each control appears once it is explained:** a page lists its `faders` (the amp envelope keeps its own faders, as everywhere else in the app), and only those faders work there; the others say "not on this page" on the OLED. On the screen they carry an F1–F4 badge, and "On the MiniLab" lists them. When a page opens or A/B changes a fader's setting, the fader picks up: it does nothing until it reaches the new value.
  - **New in the framework:** an envelope widget (the Synth view's envelope picture, with a dot per sounding note), A/B comparisons that show an envelope instead of the wave, and a "Shaping it" group under the reduced synth for the envelope blocks (they are outside the signal path). The OLED names faders too ("Fader 3: Sustain").
  - **Checked in the browser** (Helium, headless, 1280 x 720): all 5 pages done from simulated MiniLab events alone (keys, faders with pickup, knobs, encoder turns and clicks). Fader 1 does nothing on the filter page. No errors.
  - **Tests:** the course tests now cover both chapters, plus: faders only hold the amp envelope and are not also on a knob; steps only ask for the page's knobs and faders; every control is on a block or modulator the page shows.

### 26. Chapter 3, "Filters"

- Cutoff, resonance, filter types, key tracking, drive, the ladder filter vs the clean filter.
- A spectrogram widget shows what the filter removes.
- That spectrogram view gets built in this slice and can be reused in the Synth view.
- Status: done 2026-10-26 (checked by the user).
  - **6 pages** (`src/course/chapter3.ts`): **Cutoff** (subtractive synthesis, the low-pass), **Resonance**, **Filter types** (Filt Morph: low-pass, band-pass, high-pass), **Key tracking**, **Drive** (on a sine, so the new harmonics show), **Clean and ladder** (A/B of the two models, then self-oscillation and an acid sweep).
  - **Spectrogram** (`src/app/components/spectrogram.ts`): time runs right to left, pitch goes up on a log scale (30 Hz to 16 kHz), brighter is louder. The brightness follows the sound: the loudest level of the last moments is full colour, and 60 dB below it is black, so quiet and loud sounds both show their harmonics. A row's level blends the two nearest analyser bins down low, and takes the loudest of its bins up high. A dashed line can mark a frequency (the filter's live cutoff, with the envelope and key tracking).
    - Found while testing: moving the history left by drawing the canvas onto itself blended the moved picture over the old one, so faint pixels added up until everything was solid. It now replaces the old picture ("copy").
  - **Where it is used:** the filter pages show two spectrograms side by side, into and out of the filter (on the Drive page, into the drive and out of the filter), so you see what was taken away. The Synth view's **Filter block** now shows a small spectrogram of its output, with the cutoff line, where its small scope was. The **Play view** has a third tab, **Spectrogram** (also reached with Shift + encoder).
  - **Other widgets:** the filter's response curve (the Synth view's picture: dashed where the knob is, solid where the filter is now), on its own or under an A/B comparison.
  - **The stage taps** now also run while the Learn view is open, because the spectrograms read them.
  - **Self-oscillation:** the ladder only rings on its own above Resonance 16.8 (feedback 4), so the step asks for about 19.
  - **Checked in the browser** (Helium, headless, 1280 x 720): all 6 pages done from simulated MiniLab events alone; the spectrograms show the harmonics leave as the cutoff falls and appear as the drive rises. No errors.

### 27. Chapter 4, "Movement" (LFOs and modulation)

- LFO shapes, rate, depth, targets and tempo sync, then the idea of the mod matrix through patching exercises.
- Status: done 2026-10-26 (checked by the user).
  - **6 pages** (`src/course/chapter4.ts`): **The LFO** (depth and rate as vibrato on a sine), **What it moves** (LFO To: pitch, filter, volume; the other two targets are left out), **LFO shapes** (on the filter, ending on random at 8 Hz), **Tempo sync** (a wobble on a resonant filter, at 1/4 then 1/8, with the drums), **The mod matrix** (route 1: Velocity → Cutoff, then play softly and hard), **Patching LFO 3** (LFO 3 → Pan, then a slower LFO 3).
  - **Patching from the MiniLab:** route 1's From, To and Amount are on knobs 1–3, so the exercises need no mouse. The page mentions that the Synth view patches the same routes by dragging cables. The routes count as the Mod Matrix block (`lessonBlockOf`).
  - **New widgets:** an LFO picture (the Synth view's, with its dot and rate), with a ▶ / ■ drums button on the tempo sync page (the MiniLab's transport buttons work too). The drums stop when you turn to another page or leave the Learn view from that page (the user's request); and a route diagram (From → To with the amount, the cable's thickness following it) over a spectrogram of the filter's output or the stereo picture.
  - **Checked in the browser** (Helium, headless, 1280 x 720): all 6 pages done from simulated MiniLab events alone, the drums started and stopped with the MiniLab's transport buttons. No errors.

### 28. Chapter 5, "Beyond subtractive"

- Sync, FM, pulse width and wavetables, ending with a "build your own" page that opens the full Synth view.
- Status: done 2026-10-26 (checked by the user).
  - **7 pages** (`src/course/chapter5.ts`): **Pulse width** (a square narrowing to a thin pulse), **PWM** (LFO 2 moving the width), **Hard sync** (only Osc 2 heard; Sync on, then Osc 2 Pitch to +7 and about +16), **FM** (two sines, only Osc 1 heard; FM Amount, then Osc 2 at +12 and +6 for a bell-like clang), **Wavetables** (WT Pos through the Shapes table, then the Vowels table), **Moving through a table** (LFO 2 moving WT Pos through the Formant table), **Build your own** (a recap, and two buttons into the Synth view: with Init, or with your own sound back).
  - **Sync aims avoid whole ratios:** at +12 or +19 Osc 2 finishes whole cycles before each restart, so nothing is cut and you only hear a higher note. The page says so.
  - **New widgets:** an oscillator picture (the wave Osc 1 or Osc 2 makes from its settings, over two cycles of Osc 1, with Osc 1's restarts dashed) beside a spectrogram of that oscillator's tap; and the Wavetable tab's table stack beside the harmonics of the wave playing. The Wavetable choice offers only the 8 built-in tables.
  - **Live pulse width:** the oscillator pictures (here and in the Synth view) now draw the pulse width as it is right now, with the LFOs and routes (`liveWidth`, next to `livePosition`), so PWM shows in the picture.
  - **Build your own:** "with Init" leaves the course (your sound comes back first), then loads Init as one undo step, so undo gives your sound back. The last page now says "That's the end of the course."
  - **Checked in the browser** (Helium, headless, 1280 x 720): all 7 pages done from simulated MiniLab events alone. An unused knob and the faders changed nothing. "With Init" opened the Synth view on Init, and undo gave back the earlier preset. No errors (only the missing favicon, which was missing before).

### 29. Course polish

- A progress overview, links from course pages to the matching recipes ("now build a Reese bass").
- A glossary panel: hover a term like "cutoff" to see its definition.
- Status: done 2026-10-26 (to be checked by the user). Phase G is complete.
  - **Contents** (a button in the course header, with "N/30"): every chapter as a card with its done count, a bar and its pages (✓ when done; click to open one), and its recipes. Above them: the whole course's progress, "Continue" (or "Start") to the first page not done, "✓ Course done" once all are, and the reset link (moved here from the sidebar). Turning a page with the encoder closes it.
  - **Recipes at the chapter ends, not on every page** (decided with the user: a recipe opens the full Synth view, which would break a chapter in the middle). Each `Chapter` lists 1–4 recipes that use what it taught: Reese Bass and Sub Bass; Pluck and Supersaw Pad; Acid Bass and Wind; E-Piano and G-Funk Whine; PWM Strings, Sync Lead, Bell and Vowel Lead. A chapter's last page, once done, says "That's the end of Chapter n", offers "Next: Chapter n+1", and lists them under "Put it to use" (✓ for the recipes you have built). A recipe leaves the course (your sound comes back first), then starts, so undo gives your sound back. Learn keeps its page for when you come back.
  - **Glossary** (`src/course/glossary.ts`): 62 terms, each with a definition of one or two sentences. The page that introduces a term is the first one that has it in bold. On a page, bold terms have a dotted underline and show their definition on hover, focus or click. So does the first plain mention of a term from an earlier chapter ("cutoff" in Chapter 4), unless this chapter puts it in bold itself. The most basic words (wave, sine, pitch, oscillator) are explained only where they are in bold. That keeps it to 0–4 marks a page. The tooltip names the page that explains the term. The **Glossary** panel lists all terms A–Z, each with a link to that page.
  - **Favicon:** a small wave icon on all three pages (the missing favicon showed up as an error in every check).
  - **Checked in the browser** (Helium, headless, 1280 x 720): the tooltip on a plain mention, Contents and Continue, a glossary link, the end of Chapter 1, the encoder closing Contents, a recipe started from the chapter end (the Synth view on Init, and undo gave back the sound from before Learn), and Learn reopening on the same page. No sideways scrolling at 1280, 900 or 600 px wide. No errors.
  - **Tests:** every bold word is a term or a control's label; every term is introduced somewhere and has a short definition; no word belongs to two terms; marking keeps the text and marks a term at most once a page, only from an earlier chapter; each chapter's recipes exist.

## Phase H: a general app, the MiniLab optional

Added 2026-10-27. The app works fully with nothing connected, but it talks about the MiniLab everywhere, and the course text names knobs and faders by number. Without a MiniLab, that is noise. From now on the MiniLab is an optional extra: its hints show only while it is connected.

- **Connected now:** the hints follow `midiStatus === "connected"`. They disappear the moment the MiniLab is unplugged, and come back when it reconnects.
- **Internal names stay:** the `minilab3.*` storage keys, the IndexedDB name, the export file names and `src/minilab/`. Renaming the keys would lose saved settings.

### 30. Hardware hints only with a MiniLab

- One flag, `pg.hasDevice`, and one small way to show a hardware hint only when it is set, so each tooltip doesn't need its own check.
- **Knob numbers:** without a MiniLab, no knob page numbers anywhere. The 1–8 and F1–F4 badges on controls (`ParamControl`), the "MiniLab knobs → page" panel in the Synth view, the "Knobs →" strip in the Panel view, the knob list in the Wavetable view, "On the MiniLab" in the course and in recipes, and the numbers on the Play view's knobs. Clicking a block still selects it; the space goes to the explanation.
- **Tooltips and notes:** the Shift combinations, the encoder, the pads and pad banks, "Shift + Prog" (App, ArpBar, PresetBrowser, the Play surface note, the recipe play hint) say only what works without the device.
- **Device-only controls:** hidden without a MiniLab ("Edit on MiniLab" in the sequencer). The Pitch and Mod strips in the Play view only show the hardware, so they are hidden too.
- **The Play view's knobs and faders** become "the preset's main controls", not "the MiniLab's knobs and faders".
- Status: done 2026-10-27 (to be checked by the user).
  - `pg.hasDevice` and `pg.hw(text)` (the text with a MiniLab, "" without). Unplugging also lets go of Shift and leaves sequencer edit, since neither can be undone without the device.
  - Without a MiniLab, the Synth, Wavetable and recipe panels drop their knob column and the explanation takes the width.
  - **Connecting is an extra, not a must** (the user's request): "Connect MiniLab" was a bright button that made the app look unusable without one. It is now a quiet outlined pill, "○ Connect a MiniLab · optional", in the place where the connected device's pill shows; its tooltip says everything works without one. When no MiniLab is found, nothing is said: the pill just stays (it connects by itself once one is plugged in). The start screen adds "Everything works with the mouse, and your computer keyboard plays notes".
  - **Kept on purpose:** the connect pill and its messages, the About page's MiniLab parts (getting started, shortcuts, troubleshooting), the Pitch strip and Mod strip routes in the Synth view's fixed wiring (they are part of the synth), and the course and recipe text (slice 31).
  - **Checked in the browser** (Helium, headless, 1280 x 800): with nothing connected, every view shows no knob numbers and no hardware tooltips; with a MiniLab (simulated) they all come back; after an unplug they go again. No errors.

### 31. Course and recipe text without knob numbers

- The course and recipe text names the control, not where it is on the MiniLab: "Turn knob 1 (Cutoff) down…" becomes a control reference, "Turn [[cutoff]] down…". Without a MiniLab it shows **Cutoff**; with one, **Cutoff** and a small "knob 1" chip. The knob comes from the page's `knobs`, the fader from `FADERS`, a recipe's from the `hw` it already works out.
- Encoder lines ("click B, or click the encoder", "the MiniLab's play button") show their hardware part only with a MiniLab.
- **Tests:** every reference names a control the page (or recipe step) has, so the text can't drift from the knob layout. This replaces keeping "knob N" in the text in step with `knobs` by hand.
- Status: done 2026-10-27 (to be checked by the user).
  - **Marks** (`stepPieces` in `src/recipes/recipe.ts`, shown by `StepText.svelte`): `[[cutoff]]` shows the control's label in bold, with a "knob 1" / "fader 3" chip while a MiniLab is connected; `{{…}}` is an aside shown only with one ("click B{{, or click the encoder}}"). They work in a step's text and its why.
  - **Course:** every step that names a control marks it (follow-ups like "Now Square." stay as they are). The paragraphs name controls without saying where they are ("Knob 1, **LFO To**, picks…" is now "**LFO To** picks…"; "It is on fader 1." is gone). The first step of the course says how to play without a MiniLab.
  - **Recipes keep plain names** (decided while building it): their steps name controls in their own words ("LFO 1's Rate"), and with a MiniLab the "On the MiniLab" box already says where each one is. Marking all 152 steps would mean rewording them. The "(fader 3)" notes are gone, and the strip tips ("Try the pitch strip for bends") are MiniLab asides.
  - **Block texts:** "Faders 1–4" (Amp Envelope) and "Knobs 1–8 set the amounts" (Mod Matrix) are gone from the Synth view's explanations, which the course shows too.
  - **Tests:** paragraphs have no marks and no hardware; step text read without a MiniLab names no knob, fader, encoder, strip or MiniLab; every marked control is on the page (course) or on a Synth view block (recipes); `stepPieces` and `stepPlain` themselves.
  - **Checked in the browser** (Helium, headless, 1280 x 800): course pages and a recipe step read cleanly with nothing connected, and show the chips with a MiniLab (simulated). No errors.

### 32. Phones and touch screens

Added 2026-10-27 after an audit at 360, 390, 768 and 1024 px. Tablets mostly hold up. On a phone, the Synth (cables), Wavetable and Play views and the open preset browser are wider than the screen, the keyboard's keys are 13 px wide, and the top bars take about 40% of the first screen.

- **No sideways scrolling** on any view at 360 px and up, popups included.
- **Header on narrow screens:** the title and the view tabs on one row; Recipes, Explanations, CPU, About and Connect go into a "⋯" menu. The sound bar and the transport fit in fewer rows; the part buttons shrink to the width.
- **Keyboard:** on narrow screens 1½–2 octaves, with octave buttons. Several fingers at once (chords by touch). The "Z / X" labels only on computers with a keyboard.
- **Synth view:** below about 800 px, the panel only (the Cables/Panel switch hides; the saved choice comes back on wide screens). On a phone the panel is one column: scopes and curves no taller than about 100 px, the wave buttons on one row, the modulator tabs one row that scrolls sideways. No empty cells in the two-column grid at tablet width.
- **Wavetable view:** stacked on narrow screens; the table list becomes a row that scrolls sideways.
- **Preset browser and the changes list:** full width on a phone; the categories become a row of chips.
- **Learn:** the page's controls come first (grouped by block, including the controls on the signal-chain blocks); "The synth on this page" becomes one line (`Oscillator 1 → Amp → Output`). On narrow screens a dock at the bottom holds the page's controls and the keyboard, so you read a step and turn its control without scrolling.
- **Touch:** tap targets at least about 36–40 px tall on touch screens (`pointer: coarse`), and the start screen speaks of tapping, not clicking and the computer keyboard.
- **Done when:** every view can be used on a 390 x 844 phone without zooming or scrolling sideways, and a Learn page's step and its control are on screen together.
- Status: done 2026-10-27 (to be checked by the user).
  - **Breakpoints** (`src/app/media.svelte.ts`): `narrow` (700 px: phone header, small keyboard, Learn dock), `noCables` (800 px), `touch` (`pointer: coarse`). The CSS `@media` rules use the same numbers.
  - **Header:** below 700 px, the views and a ⋯ button; the menu holds Recipes, the MiniLab pill, CPU, Explanations and About. Below 560 px the title goes, so the four views fit. The part buttons share the width; ◀ preset ▶ get a row of their own. Below 1000 px the transport takes a short row instead of a tall box beside the sound controls.
  - **Keyboard:** each finger (or the mouse) has its own note, so chords and sliding work by touch. Below 700 px it shows C4–F5, the same notes as the computer keyboard's octave, and the octave buttons move both. "Z" / "X" show only without a touch screen. Keys are taller on touch screens.
  - **Synth:** below 800 px the panel only (the saved Cables choice comes back when wider). Below 1100 px an odd block out (Mixer, Output) takes the whole row. Below 600 px one block a row, the modulator tabs a row that scrolls sideways, and a modulator's page stacks its picture over its knobs. The recipe panel goes to one column.
  - **Wavetable:** below 1000 px the wave and harmonics sit under the 3D picture; below 700 px one column, the tables a row that scrolls sideways, the "not playing" notice above the picture; the drawing editor stacks too.
  - **Preset browser:** full screen on a phone, groups and describing words as rows that scroll sideways. The changes list is a sheet along the bottom.
  - **Learn:** the side panel starts with **Controls** (each block with controls on this page, signal path first, then the modulators). "The synth on this page" is one line of names (`Oscillator 1 → Amp → Output`, modulators dashed); each name's tooltip has its short description, and the block the step is about lights up. Below 700 px, the controls and the keyboard sit in a dock fixed to the bottom of the screen (about a third of a 390 x 844 screen on an envelope page); the control the step asks for is scrolled into view in the dock. The page buttons are a row that scrolls sideways and keeps the open page in view.
  - **Touch:** bigger targets on touch screens for the wave and mode buttons, menus, tabs, sequencer steps, undo/redo, the octave and fold buttons, the course buttons. The start screen says "Tap to start audio" on a touch screen.
  - **Checked in the browser** (Helium, headless, touch emulated): no sideways scrolling at 360 and 390 px in 20 states (arp and scale on, drums, changes list, preset browser, recipe list and a running recipe, the Matrix, Effects and LFO tabs, the drawing editor, four Learn pages, Contents, Glossary, About), nor at 768 or 1280 px. A two-finger chord on the phone keyboard plays both notes, a finger slides to the next key, and letting go stops them. Desktop layouts unchanged apart from the Learn side panel.
  - **Known limits:** a step that asks for a low or high note ("below C3") needs the octave buttons on a phone. The recipe panel stays at the top while you scroll (about a quarter of a phone screen). The Synth view on a phone is long (one column of every block).

## Notes on the order

- **The engine (1–6) comes first** so that sound changes don't force re-tuning presets, recipes and course pages later. Slices 2–3 are the big rewrite; 1 makes it safe.
- **Two parts (6) comes right after the new engine**, because that's when it is cheap: a second part is a second copy of the processor.
- **Sound quality (7–11) comes before recipes and the course** that use it: the acid recipe wants the ladder filter, and the course's filter chapter explains it.
- **Scale lock (14)** is small and independent; it can move earlier if playing feels more urgent than wavetables.
- **Recipes (15–16) come before the course**, because a course page's "try this" steps are recipe steps.
- **Phase F (17–23) comes before the course** (decided 2026-10-25): the course will explain the synth, so the synth and the app should be in their final shape first.
- **Speed (17) comes first in Phase F**, because each later slice adds work for the computer. The layout (18) comes before the features that add new controls to it.

## Backlog

Ideas without a place in the order yet. Any of them can slot in between phases.

- Ear training and sound matching (moved out of Phase G, 2026-10-26; was slice 29):
  - **Quizzes:** "which sounds brighter?", "which wave is this?", "is the attack slow or fast?"
  - **Sound matching game:** hear a target sound and recreate it with only the controls the page shows. The app scores how close you are, using measured features like brightness, the shape of the volume, and pitch.
  - Placed at the end of each chapter as an optional challenge.
- Wavetables: warp modes (bend, mirror, sync).
- Presets: morphing between two presets with a fader.
- Sequencer upgrades (kept for later, 2026-10-25): 16 steps (second page on pad bank B), per-step velocity/accent, a second row of values as a mod matrix source (e.g. step → cutoff), a Sequencer block in the Synth view, saving sequences.
- Looper/recorder, with WAV export.
- MiniLab: small drawings on the OLED (if the protocol allows it), MIDI learn, remembering the knob page and settings for each view.
- Firefox: lost note-offs when releasing chords (postponed 2026-10-24; Chromium is the target for now). Likely cause: the MIDI input assumes one complete message per event, so bundled messages or running status drop note-offs. Fix: split each event into messages and restore missing status bytes (`src/minilab/protocol.ts`, `src/minilab/device.ts`), then update the About page. The new engine (slices 2–3) removes the other Firefox gap, the missing `cancelAndHoldAtTime`.
- Other MIDI keyboards: let any MIDI keyboard play notes, not only the MiniLab (`findPorts` looks for the MiniLab only). Out of scope for Phase H, kept for later (decided with the user, 2026-10-27).
- Not planned: playing notes on the MiniLab's pads (and pad pressure as a source). The user finds the pads unpleasant to play (2026-10-25); they stay drums, sequencer steps and shortcuts.
