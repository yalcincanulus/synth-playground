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
