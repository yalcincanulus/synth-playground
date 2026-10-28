<script lang="ts">
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  let ctx = $derived(pg.engine.ctx);
  const hasMidi = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
</script>

<article class="about">
  <section class="intro">
    <h2>About</h2>
    <p class="lead">
      Synth Playground is a synthesizer in the browser, for learning synthesis by playing, in the spirit of Ableton's Learning
      Synths. Nothing to install, and nothing to plug in: the mouse and your computer keyboard are enough. With an Arturia
      MiniLab 3 connected, every knob, fader, pad and strip does something, and the pad lights and screen follow along.
    </p>
  </section>

  <div class="columns">
    <section>
      <h3>What's inside</h3>
      <ul>
        <li><strong>Play:</strong> the preset's main controls, presets, Dice for a random patch, a drum loop, and live pictures of the sound.</li>
        <li><strong>Two parts:</strong> the keys and an 8-step sequencer each have their own sound, say a pad over a bass line.</li>
        <li><strong>Synth:</strong> the whole synth with plain-English explanations, as blocks joined by cables or as a plugin-style panel. "Listen here" plays any stage on its own.</li>
        <li><strong>Wavetable:</strong> eight built-in wavetables in 3D; import your own or draw one.</li>
        <li><strong>Song:</strong> up to seven synth tracks and a drum track, each with its own sound, and a mixer with volume, pan, mute and solo. Each track loops a clip: the drum loop or a step sequence sent from the Play view (changed there with "Edit in Play"), or notes drawn in the piano roll.</li>
        <li><strong>Learn:</strong> a five-chapter course on how sound and synths work, one idea per page, with only the controls that page needs.</li>
        <li><strong>Recipes and Classics:</strong> 18 sounds to build step by step, and 21 presets that recreate famous synth sounds.</li>
        <li><strong>Scale lock, chords and arpeggiator:</strong> every key lands in the scale, plays a whole chord, or an arpeggio in time with the drums.</li>
        <li><strong>Preset browser:</strong> search by what a sound is ("dark bass", "wide pad"), star favourites, and save your own.</li>
      </ul>

      <h3>Getting started</h3>
      <ol>
        <li>Play notes on the computer keyboard (A row; Z / X change octave) or the on-screen keys. Every control works with the mouse.</li>
        <li>Have a MiniLab 3? Click <strong>Connect a MiniLab</strong> and allow MIDI access.</li>
        <li>On the MiniLab, hold <strong>Shift</strong> and tap <strong>Prog</strong> to switch to DAW mode. The pads light up and the screen follows the app.</li>
      </ol>
    </section>

    <section>
      <h3 id="shortcuts">Shortcuts</h3>
      <dl class="keys">
        <dt>Computer keyboard</dt>
        <dd>A to ' plays notes (W, E, T… are the black keys); Z / X shift the octave</dd>
        <dt>Encoder</dt>
        <dd>Turn to browse presets, click to load, hold for Dice. In the Synth, Wavetable and Learn views it turns the knob pages, tables or course pages</dd>
        <dt>Shift + encoder</dt>
        <dd>Turn: the next view. Click: drum step edit, again: sequencer edit, again: off</dd>
        <dt>Shift + knob 1</dt>
        <dd>The step sequencer's clock</dd>
        <dt>Shift + knobs 2–8</dt>
        <dd>Tempo</dd>
        <dt>Shift + any key</dt>
        <dd>Switch part (Keys or Sequencer; in the Song view, each synth track too)</dd>
        <dt>Shift + faders</dt>
        <dd>1: arpeggiator mode, 2: its range, 3: the scale, 4: notes, triads or 7ths (bottom = off)</dd>
        <dt>Shift + mod strip</dt>
        <dd>The scale's root: C at the left end, B at the right</dd>
        <dt>Undo / redo</dt>
        <dd>Ctrl+Z / Ctrl+Shift+Z, or hold Shift and push the pitch strip down or up. In the Song view they undo song edits (tracks and clips); elsewhere, the sound.</dd>
        <dt>Shift + pads</dt>
        <dd>▶ play, ■ stop, ● record, ⟲ clear the drum loop, Tap tempo</dd>
        <dt>Mouse</dt>
        <dd>Drag a knob or fader up and down; double-click a knob to reset it</dd>
        <dt>Piano roll</dt>
        <dd>Click to draw a note, drag to move it, drag its end to lengthen it, double-click or right-click to delete. Shift + click or Shift + drag selects; Alt drags off the grid. Delete, arrows (Shift: an octave), Ctrl+C / X / V / D / A. Wheel scrolls; Ctrl + wheel zooms across, Alt + wheel up and down.</dd>
      </dl>

      <h3>Good to know</h3>
      <ul>
        <li>It needs a Chromium-based browser (Chrome, Edge, Brave, Opera). Safari has no Web MIDI, and Firefox isn't tested.</li>
        <li>Sound starts after your first click on the page.</li>
        <li>Your presets and tables stay in this browser. Use <strong>Export mine</strong> in the preset browser to keep them in a file.</li>
        <li>If the MiniLab won't connect, close other apps that have it open (a DAW, Arturia MIDI Control Center).</li>
        <li>It isn't a plugin, so it can't load in a DAW. To record it, capture the system audio.</li>
      </ul>

      <h3>This browser</h3>
      <dl class="facts">
        <dt>Web MIDI</dt>
        <dd class:bad={!hasMidi}>{hasMidi ? "supported" : "not supported: the MiniLab can't connect"}</dd>
        <dt>Audio</dt>
        <dd>{pg.audioRunning ? `running at ${(ctx.sampleRate / 1000).toFixed(1)} kHz` : "not started yet (click anywhere to start)"}</dd>
      </dl>
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
  p { margin: 0 0 8px; }
  .lead { font-size: 15px; color: var(--text); max-width: 75ch; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  ul, ol { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  strong { color: var(--text); font-weight: 600; }
  .keys { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
  .keys dt { color: var(--text); white-space: nowrap; }
  .keys dd { margin: 0; font: inherit; color: inherit; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
  dt { color: var(--dim); }
  dd { margin: 0; font-family: var(--mono); font-size: 12px; color: var(--accent); }
  dd.bad { color: #ff6b6b; }
  footer { border-top: 1px solid var(--line); padding-top: 12px; color: var(--dim); font-size: 12.5px; }
  .small { font-size: 11.5px; margin: 0; }
  @media (max-width: 900px) { .columns { grid-template-columns: 1fr; } }
</style>
