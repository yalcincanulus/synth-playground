<script lang="ts">
  import { KEYS_MODES } from "../../audio/stepSequencer";
  import Fader from "../components/Fader.svelte";
  import Knob from "../components/Knob.svelte";
  import { SEQ_FADERS, type Playground } from "../playground.svelte";

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
    <div class="title">Step sequencer</div>
    <button class:active={s.enabled} onclick={() => pg.setSeqEnabled(!s.enabled)}>{s.enabled ? "On" : "Off"}</button>
    <button class:active={pg.seqEdit} onclick={() => pg.setSeqEdit(!pg.seqEdit)} title="Shift + encoder click (twice: drum steps, then sequencer)">
      Edit on MiniLab
    </button>
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
      <span class="hint shifted">Knobs: step notes · Pads A: steps on/off (hold + key: set the note) · Pads B: slides · Faders: length, gate, rate, direction · Encoder click: keys mode</span>
    {/if}
  </div>

  {#if pg.explain}
    <p class="explain">
      A step sequencer plays a short loop of notes by itself, in time with the drums. Each column is one step: the knob sets its
      note, the button below switches it on or off (off is a rest), and <b>Slide</b> holds the note into the next step and glides
      to it. Press ▶ to hear it, then play chords over it. <b>Keys</b> picks what the keyboard does while it runs: play notes,
      move the whole line up or down (Transpose), or both (Split: the low keys transpose, the rest play).
    </p>
  {/if}

  <div class="body">
    <div class="steps">
      {#each s.steps as step, i (i)}
        <div class="col" class:outside={i >= s.length}>
          <Knob
            number={i + 1}
            label="Step {i + 1}"
            display={pg.noteName(pg.stepNote(i))}
            position={pg.stepKnobPosition(i)}
            hot={pg.seqStep === i}
            size={52}
            onchange={(t) => pg.setStepKnob(i, t)}
          />
          <button
            class="step"
            class:on={step.on}
            class:now={pg.seqStep === i}
            onclick={() => pg.toggleSeqStep(i)}
            aria-label="Step {i + 1} {step.on ? 'on' : 'off'}"
          >{step.on ? "On" : "Rest"}</button>
          <button class="slide" class:on={step.slide} onclick={() => pg.toggleSlide(i)} aria-label="Slide from step {i + 1}">Slide</button>
        </div>
      {/each}
    </div>
    <div class="faders">
      {#each SEQ_FADERS as label, i (label)}
        <Fader {label} display={pg.seqFaderDisplay(i)} position={pg.seqFaderPosition(i)} onchange={(t) => pg.setSeqFader(i, t)} />
      {/each}
    </div>
  </div>
</section>

<style>
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .head .title { margin: 0 6px 0 0; }
  .head button { font-size: 12px; padding: 2px 10px; }
  .head .active { border-color: var(--accent); color: var(--accent); }
  .keys { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--dim); }
  .keys span { margin-right: 4px; }
  .transpose { font: 12px var(--mono); color: var(--dim); display: flex; align-items: center; gap: 6px; }
  .small { font-size: 11px !important; padding: 0 6px !important; }
  .hint { font-size: 12px; }
  .shifted { color: var(--accent); }
  .explain { margin: 0 0 10px; font-size: 13px; color: var(--dim); max-width: 900px; line-height: 1.45; }

  .body { display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: center; }
  .steps { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 6px; transition: opacity 0.15s; }
  .col.outside { opacity: 0.3; }
  .step, .slide { width: 100%; max-width: 72px; font-size: 12px; padding: 4px 0; border-radius: 5px; }
  .step { border: 2px solid var(--line); background: #101416; color: var(--dim); }
  .step.on { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; }
  .step.now { outline: 2px solid #fff; outline-offset: 2px; }
  .slide { font-size: 11px; padding: 2px 0; color: var(--dim); }
  .slide.on { border-color: #a35cff; color: #c99bff; background: #a35cff22; }
  .faders { display: grid; grid-template-columns: repeat(4, 64px); }
  .seq.off .steps { opacity: 0.6; }

  @media (max-width: 1000px) {
    .body { grid-template-columns: 1fr; justify-items: center; }
    .steps { grid-template-columns: repeat(4, 1fr); }
  }
</style>
