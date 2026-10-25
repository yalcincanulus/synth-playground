<script lang="ts">
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  let ctx = $derived(pg.engine.ctx);
  const hasMidi = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  /** What the browser reports as the delay from the synth to the speakers. */
  let latencyMs = $derived(pg.audioRunning ? Math.round(((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000) : null);
  /** Notes start at the next audio block, about this long after the page handles a key. */
  const blockMs = $derived((128 / ctx.sampleRate) * 1000);
  let t = $derived(pg.timing);
  let keyToSound = $derived(latencyMs === null || t.midiAverage === null ? null : Math.round(t.midiAverage + blockMs + latencyMs));
  const ms = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
</script>

<article class="about">
  <section class="intro">
    <h2>About</h2>
    <p class="lead">
      MiniLab 3 Playground is a synthesizer that runs in the browser, made for the Arturia MiniLab 3. Every knob, fader, pad
      and touch strip does something, and the MiniLab's pad lights and screen follow what the app is doing. There is nothing to
      install.
    </p>
    <p>It is for learning synthesis by playing, in the spirit of Ableton's Learning Synths, built around a real controller.</p>
  </section>

  <div class="columns">
    <section>
      <h3>What's inside</h3>
      <ul>
        <li><strong>Playground:</strong> presets, Dice (a random patch), a drum loop with step editing, waveform and spectrum views.</li>
        <li><strong>Step sequencer:</strong> 8 steps with notes, rests and slides, played on the MiniLab's knobs and pads. Play chords over it, or transpose it from the keys.</li>
        <li><strong>Two parts:</strong> the keys and the step sequencer each have their own sound, say a pad over a bass line. Pick the part to edit above the presets, or with Shift + any key on the MiniLab.</li>
        <li><strong>Synth:</strong> the whole synth as blocks with live signals and cables, plain-English explanations, and "Listen here" to hear any stage on its own.</li>
        <li><strong>Wavetable:</strong> eight built-in wavetables in 3D, with the wave playing right now and its harmonics. Import your own: a Serum-format WAV, or any short sound, which is cut into frames. Imported tables stay in this browser.</li>
        <li><strong>Sound:</strong> two oscillators with pulse width, hard sync, FM and wavetables; sub and noise; a clean or a ladder filter with a low-pass to high-pass morph, an optional second filter, and drive; stereo unison and panning; amp, filter, pitch and mod envelopes; two LFOs; a mod matrix with 8 routes that also reaches the effects and the LFOs; a three-line chorus, a stereo or ping-pong delay, and a reverb with damping.</li>
      </ul>

      <h3>Coming later <span class="tag">not in yet</span></h3>
      <ul class="later">
        <li>Drawing your own wavetables</li>
        <li>Scale lock and chord mode</li>
        <li>Guided recipes: build a sound step by step</li>
        <li>An interactive course that introduces one topic at a time</li>
      </ul>

      <h3>Getting started</h3>
      <ol>
        <li>Click <strong>Connect MiniLab</strong> and allow MIDI access.</li>
        <li>On the MiniLab, hold <strong>Shift</strong> and tap <strong>Prog</strong> to switch to DAW mode. The pads light up and the screen follows the app.</li>
        <li>No MiniLab? The computer keyboard plays notes (A row; Z / X change octave), and every control works with the mouse.</li>
      </ol>

      <h3>This browser</h3>
      <dl class="facts">
        <dt>Web MIDI</dt>
        <dd class:bad={!hasMidi}>{hasMidi ? "supported" : "not supported: the MiniLab can't connect"}</dd>
        <dt>Audio</dt>
        <dd>{pg.audioRunning ? `running at ${(ctx.sampleRate / 1000).toFixed(1)} kHz` : "not started yet (click anywhere to start)"}</dd>
        <dt>Output delay</dt>
        <dd>{latencyMs === null ? "—" : `about ${latencyMs} ms, as reported by the browser`}</dd>
        <dt>MIDI wait</dt>
        <dd>
          {t.midiAverage === null || t.midiWorst === null
            ? "play a few notes on the MiniLab to measure"
            : `${ms(t.midiAverage)} on average, ${ms(t.midiWorst)} at worst: how long a key's message waits before the page handles it`}
        </dd>
        <dt>Key to sound</dt>
        <dd>{keyToSound === null ? "—" : `about ${keyToSound} ms (MIDI wait + one audio block + output delay)`}</dd>
        <dt>Page freezes</dt>
        <dd>{t.longestFreeze ? `longest ${Math.round(t.longestFreeze)} ms in the last minute` : "none over 50 ms in the last minute"}</dd>
        <dt>Sequencer</dt>
        <dd>
          {#if t.sequencer}
            {t.sequencer.lateSteps
              ? `${t.sequencer.lateSteps} step${t.sequencer.lateSteps > 1 ? "s" : ""} skipped because the page was too busy`
              : "every step on time"}{t.sequencer.closest !== null ? `; closest step planned ${ms(t.sequencer.closest * 1000)} ahead` : ""}
          {:else}
            not playing
          {/if}
        </dd>
      </dl>

      <h3>Sound engine</h3>
      <p class="note">
        Every note is made by one piece of our own code on the audio thread, sample by sample: oscillators, filter, drive,
        envelopes, the LFOs and the mod matrix. Only the effects (chorus, delay, reverb) are the browser's own audio nodes.
        The CPU meter at the top shows how much of the available time that code uses.
      </p>
    </section>

    <section>
      <h3>Limitations of a browser app</h3>

      <h4>Browsers</h4>
      <ul>
        <li>Needs a Chromium-based browser: Chrome, Edge, Brave, Opera and similar. Safari has no Web MIDI. Firefox needs an extra site permission add-on and is untested.</li>
        <li>Sound starts only after a click on the page. MIDI needs your permission and an https or localhost address.</li>
      </ul>

      <h4>Audio</h4>
      <ul>
        <li><strong>Delay:</strong> sound goes through the browser and the system's standard audio path, so there is more delay between key and sound than in a desktop synth with a dedicated audio driver. There is no buffer size setting and no choice of output device.</li>
        <li><strong>One CPU core:</strong> all sound is made on one audio thread. With heavy patches (many notes, unison, wavetables, routes) the synth plays fewer notes at once rather than crackle; the CPU meter's tooltip counts the notes cut. The effects aren't measured, so very heavy reverb or delay use can still crackle.</li>
        <li><strong>Background tabs:</strong> browsers slow down hidden tabs. The sequencer and drums keep time (their clock runs in a worker thread, which isn't slowed down), but the visuals pause.</li>
        <li><strong>A busy page:</strong> notes are planned 100 ms ahead. If the page freezes for longer, the steps it missed are skipped, so the loop stays on the beat instead of stumbling.</li>
        <li><strong>Not a plugin:</strong> it can't load in a DAW. To record it, capture the system audio.</li>
        <li><strong>Sound quality:</strong> the sound path runs at twice the sample rate and a soft clipper guards the output, but very high notes with strong FM or a fully driven ladder filter still have some harshness; the regular oscillators are less clean than the wavetables on very high notes. Panning keeps the sound in mono unchanged, so a hard-panned note is louder on its side than a centred one.</li>
      </ul>

      <h4>The MiniLab</h4>
      <ul>
        <li>The pad lights and screen use Arturia's DAW protocol, learned from Ableton's MiniLab 3 integration script rather than official documentation. A firmware update could change it.</li>
        <li>If another app (a DAW, Arturia MIDI Control Center) has the MiniLab open, the browser may not be able to connect, especially on Windows.</li>
        <li>The keys don't send pressure (aftertouch); only the pads do.</li>
      </ul>

      <h4>Your presets</h4>
      <ul>
        <li>Saved presets live in this browser profile only. Clearing site data deletes them, and they don't sync between browsers or computers.</li>
      </ul>
    </section>
  </div>

  <footer>
    <p>
      Inspired by Ableton's Learning Synths. The MiniLab protocol comes from Ableton's MiniLab 3 integration script. Built with
      Svelte, Vite, Web Audio and Web MIDI.
    </p>
    <p class="small">Not affiliated with Arturia or Ableton. MiniLab is a trademark of Arturia; Ableton and Learning Synths are trademarks of Ableton.</p>
  </footer>
</article>

<style>
  .about { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px 22px; display: grid; gap: 18px; font-size: 13.5px; line-height: 1.5; color: #c4cfd2; }
  h2 { margin: 0 0 6px; font-size: 20px; color: var(--accent); }
  h3 { margin: 18px 0 6px; font-size: 14px; color: var(--text); }
  h3:first-child { margin-top: 0; }
  h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  p { margin: 0 0 8px; }
  .lead { font-size: 15px; color: var(--text); max-width: 75ch; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  ul, ol { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  strong { color: var(--text); font-weight: 600; }
  .tag { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #ffcc33; border: 1px solid #ffcc3366; border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: 2px; }
  .later { color: var(--dim); }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
  dt { color: var(--dim); }
  dd { margin: 0; font-family: var(--mono); font-size: 12px; color: var(--accent); }
  dd.bad { color: #ff6b6b; }
  .note { color: var(--dim); font-size: 12.5px; max-width: 60ch; }
  footer { border-top: 1px solid var(--line); padding-top: 12px; color: var(--dim); font-size: 12.5px; }
  .small { font-size: 11.5px; margin: 0; }
  @media (max-width: 900px) { .columns { grid-template-columns: 1fr; } }
</style>
