<script lang="ts">
  import { KEYS_MODES } from "../../audio/stepSequencer";
  import Fader from "../components/Fader.svelte";
  import Knob from "../components/Knob.svelte";
  import { SEQ_CLOCK_FADER, SEQ_FADERS, type Playground } from "../playground.svelte";

  interface Props {
    pg: Playground;
  }
  let { pg }: Props = $props();

  let s = $derived(pg.noteSeq);
  const KEYS_HELP = {
    Play: "Keys play notes and chords over the sequence",
    Transpose: "A key moves the whole sequence up or down (C4 = no change)",
    Split: "Keys below C4 transpose the sequence (C3 = no change), C4 and up play notes",
  };
  let mono = $derived(pg.parts.keys.values.mono > 0);
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
</script>

<section class="panel seq" class:off={!s.enabled}>
  <div class="head">
    <button class:active={s.enabled} onclick={() => pg.setSeqEnabled(!s.enabled)}>{s.enabled ? "On" : "Off"}</button>
    {#if pg.hasDevice}
      <button class:active={pg.seqEdit} onclick={() => pg.setSeqEdit(!pg.seqEdit)} title="Shift + encoder click (twice: drum steps, then sequencer)">
        Edit on MiniLab
      </button>
    {/if}
    <div class="keys" role="group" aria-label="What the keys do while the sequencer plays" title="Encoder click in sequencer edit">
      <span>Keys:</span>
      {#each KEYS_MODES as mode (mode)}
        <button class:active={pg.keysMode === mode} onclick={() => pg.setKeysMode(mode)} title={KEYS_HELP[mode]}>{mode}</button>
      {/each}
    </div>
    <span class="transpose">
      Transpose {s.transpose === 0 ? "0" : signed(s.transpose)}
      {#if s.transpose !== 0}<button class="small" onclick={() => pg.setTranspose(0)}>reset</button>{/if}
    </span>
    {#if mono && pg.keysMode !== "Transpose" && s.enabled}
      <span class="hint">The Keys part's preset is mono: one note at a time. Pick a poly preset for chords.</span>
    {/if}
    {#if pg.seqEdit}
      <span class="hint shifted">Knobs: step notes · Pads A: steps on/off (hold + key: set the note) · Pads B: slides · Faders: length, gate, clock, direction · Encoder click: keys mode</span>
    {/if}
  </div>

  <div class="body" class:explained={pg.explain}>
    <div class="steps">
      {#each s.steps as step, i (i)}
        <div class="col" class:outside={i >= s.length}>
          <span class="lamp" class:lit={pg.seqLamp(i)} aria-hidden="true"></span>
          <Knob
            number={i + 1}
            label="Step {i + 1}"
            display={pg.noteName(pg.stepNote(i))}
            position={pg.stepKnobPosition(i)}
            size={44}
            onchange={(t) => pg.setStepKnob(i, t)}
          />
          <button
            class="step"
            class:on={step.on}
            onclick={() => pg.toggleSeqStep(i)}
            aria-label="Step {i + 1} {step.on ? 'on' : 'off'}"
          >{step.on ? "On" : "Rest"}</button>
          <button class="slide" class:on={step.slide} onclick={() => pg.toggleSlide(i)} aria-label="Slide from step {i + 1}">Slide</button>
        </div>
      {/each}
    </div>
    <div class="controls">
      <div class="clock" role="group" aria-label="Sequencer clock">
        <div class="clock-modes">
          <button class:active={!s.free} onclick={() => pg.setClockFree(false)} title="Steps follow the tempo, locked to the drums">Sync</button>
          <button class:active={s.free} onclick={() => pg.setClockFree(true)} title="A free-running clock, like an analog sequencer's: the tempo doesn't move it">Free</button>
        </div>
        <Knob label="Clock" display={pg.clockDisplay} position={pg.clockPosition} size={64} onchange={(t) => pg.setClockKnob(t)} />
        <span class="clock-hint">{pg.clockHint}</span>
        <!-- Always laid out (hidden when not in use), so the box keeps its size while the knob turns. -->
        <span class="clock-legato" class:hidden={!pg.clockLegato} title="Too fast for each step to be a note: one note is held and each step moves its pitch, like an analog sequencer's pitch voltage. Gate, rests and slides wait until you turn it down">Blur: one held note</span>
        <button class="small" class:hidden={!s.free} disabled={!s.free} onclick={() => pg.matchClockToTempo()} title="Set the free clock to the Sync speed at the current tempo">Match tempo</button>
      </div>
      <div class="faders">
        {#each SEQ_FADERS as label, i (label)}
          {#if i !== SEQ_CLOCK_FADER}
            <Fader {label} height={96} display={pg.seqFaderDisplay(i)} position={pg.seqFaderPosition(i)} onchange={(t) => pg.setSeqFader(i, t)} />
          {/if}
        {/each}
      </div>
    </div>
    {#if pg.explain}
      <p class="explain">
        A step sequencer plays a short loop of notes by itself, in time with the drums. Each column is one step: the knob sets its
        note, the button below switches it on or off (off is a rest), and <b>Slide</b> holds the note into the next step and glides
        to it. Press ▶ to hear it, then play chords over it. <b>Keys</b> picks what the keyboard does while it runs: play notes,
        move the whole line up or down (Transpose), or both (Split: the low keys transpose, the rest play). <b>Clock</b> sets how
        fast the steps move: in <b>Sync</b> it picks a note length, so the line stays locked to the tempo; in <b>Free</b> it is a
        free-running clock in steps per second, like on old analog sequencers. Free ignores the tempo, so it drifts against the
        drums: sweep the knob while it plays to speed the line up or slow it down. Free goes up to audio rates: from 40 steps a
        second one note is held and only its pitch steps, so the notes blur into one sound (from about 20 loops a second the loop
        itself is a pitch). Start at the top and turn it down to reveal the line.
      </p>
    {/if}
  </div>
</section>

<style>
  .seq { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .head button { font-size: 12px; padding: 2px 10px; }
  .head .active { border-color: var(--accent); color: var(--accent); }
  .keys { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--dim); }
  .keys span { margin-right: 4px; }
  .transpose { font: 12px var(--mono); color: var(--dim); display: flex; align-items: center; gap: 6px; }
  .small { font-size: 11px !important; padding: 0 6px !important; }
  .hint { font-size: 12px; }
  .shifted { color: var(--accent); }
  .explain { margin: 0; font-size: 12px; color: #a9b6ba; line-height: 1.4; }

  .body { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; }
  .body.explained { grid-template-columns: 1fr auto minmax(220px, 300px); }
  .steps { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 6px; transition: opacity 0.15s; }
  .col.outside { opacity: 0.3; }
  .step, .slide { width: 100%; max-width: 72px; font-size: 12px; padding: 4px 0; border-radius: 5px; }
  .step { border: 2px solid var(--line); background: #101416; color: var(--dim); }
  .step.on { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; }
  /* One lamp per step, like the Mini-Sequencer's: lit on the step playing, all lit when the clock blurs. */
  .lamp {
    width: 12px; height: 12px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #5a2a1c, #2a120c 70%);
    box-shadow: inset 0 0 2px #000, 0 0 0 1px #000;
    /* Lights at once, fades like a filament. */
    transition: background 0.12s ease-out, box-shadow 0.12s ease-out;
  }
  .lamp.lit {
    background: radial-gradient(circle at 35% 35%, #fff3d6, #ff7a3a 45%, #c8321a 80%);
    box-shadow: 0 0 0 1px #000, 0 0 6px 2px #ff6a2acc, 0 0 14px 4px #ff4a1a55;
    transition: none;
  }
  .slide { font-size: 11px; padding: 2px 0; color: var(--dim); }
  .slide.on { border-color: #a35cff; color: #c99bff; background: #a35cff22; }
  .controls { display: flex; align-items: center; gap: 16px; }
  .clock { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; width: 150px; box-sizing: border-box; }
  /* Fixed width: the readouts change length as the knob turns, and the box mustn't resize with them. */
  .hidden { visibility: hidden; }
  .clock-modes { display: flex; gap: 2px; }
  .clock-modes button { font-size: 11px; padding: 1px 8px; }
  .clock-modes .active { border-color: var(--accent); color: var(--accent); }
  .clock-hint { font: 11px var(--mono); color: var(--dim); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; text-align: center; }
  .clock-legato { font-size: 11px; color: #c99bff; white-space: nowrap; }
  .faders { display: grid; grid-template-columns: repeat(3, 64px); }
  .seq.off .steps { opacity: 0.6; }

  @media (max-width: 1000px) {
    .body, .body.explained { grid-template-columns: 1fr; justify-items: center; }
    .steps { grid-template-columns: repeat(4, 1fr); }
  }
</style>
