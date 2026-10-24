<script lang="ts">
  import { onMount } from "svelte";
  import { formatValue, LFO_TARGETS, PARAMS, toControl, type ParamId } from "../audio/params";
  import { FADERS } from "../presets/presets";
  import EnvelopeView from "./components/EnvelopeView.svelte";
  import Fader from "./components/Fader.svelte";
  import FilterCurve from "./components/FilterCurve.svelte";
  import Keyboard from "./components/Keyboard.svelte";
  import Knob from "./components/Knob.svelte";
  import Scope from "./components/Scope.svelte";
  import SeqGrid from "./components/SeqGrid.svelte";
  import Spectrum from "./components/Spectrum.svelte";
  import { PART_NAMES, Playground } from "./playground.svelte";
  import SynthView from "./synth/SynthView.svelte";
  import WavetableView from "./wavetable/WavetableView.svelte";
  import AboutPage from "./about/AboutPage.svelte";
  import SequencerPanel from "./sequencer/SequencerPanel.svelte";
  import { noteName } from "../audio/stepSequencer";

  const pg = new Playground();
  if (import.meta.env.DEV) Object.assign(window, { pg });

  // Preset colours are in the LED's 0-127 range; lift them toward white so dark ones stay readable on screen.
  let accent = $derived.by(() => {
    const [r, g, b] = pg.preset.color.map((c) => Math.round(c * 2 * 0.75 + 255 * 0.25));
    return `rgb(${r} ${g} ${b})`;
  });

  // Dropdown grouped by category (factory presets are already in that order); your own presets come last.
  let presetGroups = $derived.by(() => {
    const groups = new Map<string, { p: (typeof pg.presets)[number]; i: number }[]>();
    pg.presets.forEach((p, i) => {
      const group = pg.isUserPreset(i) ? "My presets" : p.category;
      groups.set(group, [...(groups.get(group) ?? []), { p, i }]);
    });
    return [...groups];
  });

  // The keyboard lights up the keys you hold and the notes the step sequencer plays.
  let keyboardNotes = $derived(new Set([...pg.notes, ...pg.seqNotes]));

  const display = (id: ParamId) => formatValue(id, pg.values[id]);
  const resetParam = (id: ParamId) => pg.setParam(id, pg.preset.values[id] ?? PARAMS[id].default);

  function savePreset() {
    const name = prompt("Preset name", `${pg.preset.name} 2`);
    if (name) pg.saveAsUserPreset(name);
  }

  onMount(() => {
    // Reconnect silently if MIDI was allowed before; otherwise wait for the button.
    navigator.permissions
      ?.query({ name: "midi", sysex: true } as unknown as PermissionDescriptor)
      .then((p) => {
        if (p.state === "granted") pg.connectMidi();
      })
      .catch(() => {});
  });

  // What each pad does while Shift is held. Arp, Pad and Prog are handled inside the MiniLab itself.
  const SHIFT_PADS = [
    { label: "Arp", deviceOnly: true },
    { label: "Pad bank", deviceOnly: true },
    { label: "Program", deviceOnly: true },
    { label: "⟲ Clear loop", deviceOnly: false },
    { label: "■ Stop", deviceOnly: false },
    { label: "▶ Play", deviceOnly: false },
    { label: "● Record", deviceOnly: false },
    { label: "Tap tempo", deviceOnly: false },
  ];

  /** On-screen glow colour for spectrum pads: the same red-to-violet rainbow as the hardware. */
  const spectrumCss = (band: number) => `hsl(${(band / 8) * 300} 90% 60%)`;

  const MIDI_TEXT = {
    idle: "",
    unsupported: "This browser has no Web MIDI. Use a Chromium browser (Chrome, Brave, Edge).",
    denied: "MIDI access was blocked. Allow MIDI (with SysEx) for this site and reconnect.",
    "not-found": "MiniLab 3 not found. Plug it in: it connects automatically.",
    connected: "",
  };
</script>

<svelte:window onkeydown={(e) => pg.handleKey(e, true)} onkeyup={(e) => pg.handleKey(e, false)} />

<div class="app" style:--accent={accent}>
  <header>
    <h1>MiniLab 3 <span>Playground</span></h1>
    <nav class="views" aria-label="View">
      <button class:active={pg.view === "playground"} onclick={() => pg.setView("playground")}>Playground</button>
      <button class:active={pg.view === "synth"} onclick={() => pg.setView("synth")} title="Shift + encoder">Synth</button>
      <button class:active={pg.view === "wavetable"} onclick={() => pg.setView("wavetable")} title="Shift + encoder">Wavetable</button>
    </nav>
    <button class="about-link" class:active={pg.view === "about"} onclick={() => pg.setView("about")}>About</button>

    <div class="midi">
      {#if pg.midiStatus === "connected"}
        <span class="pill ok">● {pg.deviceName}{pg.program ? ` · ${pg.program === "daw" ? "DAW" : "Arturia"} mode` : ""}</span>
        <span class="shift" class:on={pg.shift} title="Shift button on the MiniLab">Shift</span>
        {#if pg.program === "arturia"}
          <span class="hint">Pad lights and the screen need DAW mode: hold Shift and tap Prog.</span>
        {/if}
      {:else}
        <button class="primary" onclick={() => pg.connectMidi()}>Connect MiniLab</button>
        <span class="hint">{MIDI_TEXT[pg.midiStatus]}</span>
      {/if}
    </div>

    {#if pg.audioRunning}
      <span
        class="cpu"
        class:hot={pg.cpu.load > 0.6 || (pg.cpu.clock === "performance" && pg.cpu.peak > 0.9)}
        style:--load={Math.min(1, pg.cpu.load)}
        title="CPU: share of the time available that the voice processor uses (every note and the LFOs; not the effects) · {pg.cpu.voices} voices{pg.cpu.cuts
          ? ` · ${pg.cpu.cuts} note${pg.cpu.cuts > 1 ? "s" : ""} cut to keep it from crackling`
          : ""}{pg.cpu.clock ===
        'performance'
          ? ` · busiest block ${Math.round(pg.cpu.peak * 100)}%`
          : ''}"
      >
        CPU {Math.round(pg.cpu.load * 100)}%
      </span>
    {/if}

    <div class="transport">
      <button class:active={pg.playing} onclick={() => pg.togglePlay()} title="Play / stop (Shift + ▶)">{pg.playing ? "■" : "▶"}</button>
      <button class="rec" class:active={pg.recording} onclick={() => pg.toggleRecord()} title="Record pads into the loop (Shift + ●)">●</button>
      <label class="bpm" title="Shift + any knob on the MiniLab">
        <input type="number" min="40" max="240" value={pg.bpm} onchange={(e) => pg.setBpm(+e.currentTarget.value)} />
        BPM
      </label>
      <button onclick={() => pg.tap()} title="Tap tempo (Shift + Tap)">Tap</button>
      <button onclick={() => pg.clearPattern()} title="Clear the drum loop (Shift + ⟲)">Clear</button>
    </div>
  </header>

  <section class="presets">
    <div class="parts" role="group" aria-label="Part" title="Which sound the knobs, faders and presets edit (Shift + any key on the MiniLab)">
      {#each ["keys", "seq"] as const as part (part)}
        <button class:active={pg.part === part} onclick={() => pg.selectPart(part)}>
          <span class="part-name">{PART_NAMES[part]}</span>
          <span class="part-preset">{pg.presetOf(part).name}</span>
        </button>
      {/each}
    </div>
    <button onclick={() => pg.loadPreset(pg.presetIndex - 1)} aria-label="Previous preset">◀</button>
    <!-- `selected` per option rather than select.value: the Dice option appears in the same update that selects it. -->
    <select onchange={(e) => pg.loadPreset(+e.currentTarget.value)}>
      {#if pg.dicePreset}<option value={-1} disabled selected>🎲 {pg.dicePreset.name} · {pg.dicePreset.category}</option>{/if}
      {#each presetGroups as [category, entries] (category)}
        <optgroup label={category}>
          {#each entries as { p, i } (i)}
            <option value={i} selected={!pg.dicePreset && i === pg.presetIndex}>{i + 1}. {p.name}{pg.isUserPreset(i) ? " (user)" : ""}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <button onclick={() => pg.loadPreset(pg.presetIndex + 1)} aria-label="Next preset">▶</button>
    <button class="dice" onclick={() => pg.dice()} title="Random patch (hold the encoder down)">🎲 Dice</button>
    {#if pg.browseIndex !== null}
      <span class="browse">Encoder: {pg.presets[pg.browseIndex].name}, click to load</span>
    {/if}
    {#if pg.dirty}<span class="dirty">edited</span>{/if}
    <span class="spacer"></span>
    <button onclick={savePreset}>Save as…</button>
    {#if pg.isUserPreset()}<button onclick={() => pg.deleteUserPreset()}>Delete</button>{/if}
  </section>

  {#if pg.view === "playground"}
  <section class="viz">
    <div class="panel main-viz">
      <div class="tabs">
        <button class:active={pg.vizMode === "scope"} onclick={() => (pg.vizMode = "scope")}>Waveform</button>
        <button class:active={pg.vizMode === "spectrum"} onclick={() => (pg.vizMode = "spectrum")}>Spectrum</button>
        <span class="hint" class:shifted={pg.shift}>Shift + encoder switches view</span>
      </div>
      <div class="canvas">
        {#if pg.vizMode === "scope"}
          <Scope analyser={pg.engine.analyser} color={accent} />
        {:else}
          <Spectrum analyser={pg.engine.analyser} color={accent} />
        {/if}
      </div>
    </div>
    <div class="side">
      <div class="panel"><div class="title">Filter</div><div class="canvas"><FilterCurve ctx={pg.engine.ctx} values={pg.values} color={accent} /></div></div>
      <div class="panel"><div class="title">Envelopes</div><div class="canvas"><EnvelopeView values={pg.values} color={accent} /></div></div>
    </div>
  </section>

  <section class="surface panel">
    <div class="strips">
      <div class="strip" title="Pitch bend strip">
        <div class="bend" style:top="{50 - Math.max(0, pg.bend) * 50}%" style:bottom="{50 + Math.min(0, pg.bend) * 50}%"></div>
        <div class="center"></div>
        <span>Pitch</span>
      </div>
      <div class="strip" title="Mod strip: adds LFO to {LFO_TARGETS[pg.parts.keys.values.modTarget]} (Keys part)">
        <div class="mod" style:height="{pg.mod * 100}%"></div>
        <span>Mod</span>
      </div>
    </div>

    <div class="knobs">
      {#each pg.preset.knobs as id, i (i)}
        <Knob
          number={i + 1}
          label={PARAMS[id].label}
          display={display(id)}
          position={toControl(id, pg.values[id])}
          hot={pg.touched?.param === id}
          onchange={(t) => pg.setKnob(i, t)}
          onreset={() => resetParam(id)}
        />
      {/each}
    </div>

    <div class="faders">
      {#each FADERS as id, i (id)}
        <Fader
          label={PARAMS[id].label}
          display={display(id)}
          position={toControl(id, pg.values[id])}
          hot={pg.touched?.param === id}
          onchange={(t) => pg.setFader(i, t)}
        />
      {/each}
    </div>
  </section>

  <section class="bottom">
    <div class="panel pads-panel">
      <div class="title pads-title">
        {#if pg.shift}
          <span class="shifted">Shift held · pads are transport controls</span>
        {:else if pg.seqEdit}
          <span class="shifted">Sequencer edit · {pg.bank === "A" ? "steps on/off, hold + key sets the note" : "slides"}</span>
        {:else if pg.stepMode}
          <span class="shifted">Step edit · {pg.drumName(pg.stepTrack)} · steps {pg.bank === "A" ? "1–8" : "9–16"}</span>
        {:else}
          Pads · bank A: drums · bank B: 8 favourite presets
        {/if}
      </div>
      <div class="pad-modes">
        <button class:active={pg.stepMode} onclick={() => pg.toggleStepMode()} title="Shift + encoder click">Step edit</button>
        {#if pg.seqEdit}
          <button class:active={pg.bank === "A"} onclick={() => (pg.bank = "A")} title="Pad bank A">Steps</button>
          <button class:active={pg.bank === "B"} onclick={() => (pg.bank = "B")} title="Pad bank B">Slides</button>
        {:else if pg.stepMode}
          <button class:active={pg.bank === "A"} onclick={() => (pg.bank = "A")} title="Pad bank A">1–8</button>
          <button class:active={pg.bank === "B"} onclick={() => (pg.bank = "B")} title="Pad bank B">9–16</button>
        {:else}
          <button class:active={pg.spectrumPads} onclick={() => pg.setSpectrumPads(!pg.spectrumPads)} title="Pad lights follow the sound">Spectrum lights</button>
        {/if}
      </div>
      <div class="pads">
        {#each pg.padLevels as level, i}
          {@const step = i + (pg.bank === "B" ? 8 : 0)}
          {@const seqStep = pg.noteSeq.steps[i]}
          {@const editing = pg.stepMode || pg.seqEdit}
          {@const stepOn = pg.seqEdit ? (pg.bank === "A" ? seqStep.on : seqStep.slide) : pg.pattern[pg.stepTrack][step] > 0}
          <button
            class="pad"
            class:shifted={pg.shift}
            class:device-only={pg.shift && SHIFT_PADS[i].deviceOnly}
            class:step={editing && !pg.shift}
            class:step-on={editing && stepOn}
            class:slide={pg.seqEdit && pg.bank === "B"}
            class:playhead={pg.seqEdit ? pg.seqStep === i : pg.stepMode && pg.playStep === step}
            class:outside={pg.seqEdit && i >= pg.noteSeq.length}
            style:--level={editing ? 0 : pg.spectrumPads ? pg.spectrumLevels[i] : level}
            style:--glow={pg.spectrumPads && !editing ? spectrumCss(i) : "var(--accent)"}
            onpointerdown={() => pg.hitPad(i, 100)}
            onpointerup={() => pg.releasePad(i)}
            onpointerleave={() => pg.releasePad(i)}
          >
            {#if pg.shift}{SHIFT_PADS[i].label}
            {:else if pg.seqEdit}{pg.bank === "A" ? `${i + 1} · ${noteName(seqStep.note)}` : `Slide ${i + 1}`}
            {:else if pg.stepMode}Step {step + 1}
            {:else}{pg.drumName(i)}{/if}
          </button>
        {/each}
      </div>
    </div>
    <div class="panel seq-panel" class:muted={!pg.drumsOn}>
      <div class="title seq-title">
        Drum loop {pg.recording ? "· recording pad hits" : ""}
        <button class:active={pg.drumsOn} onclick={() => pg.setDrumsOn(!pg.drumsOn)} title="Mute the drum loop (the sequencer keeps playing)">
          {pg.drumsOn ? "On" : "Off"}
        </button>
      </div>
      <SeqGrid
        pattern={pg.pattern}
        getStep={() => pg.seq.currentStep}
        levels={pg.padLevels}
        selected={pg.stepMode ? pg.stepTrack : null}
        ontoggle={(t, s) => pg.toggleStep(t, s)}
        onselect={(t) => pg.selectTrack(t)}
      />
    </div>
  </section>

  <SequencerPanel {pg} />
  {:else if pg.view === "synth"}
    <SynthView {pg} {accent} />
  {:else if pg.view === "wavetable"}
    <WavetableView {pg} {accent} />
  {:else}
    <AboutPage {pg} />
  {/if}

  <section class="panel">
    <Keyboard notes={keyboardNotes} onnoteon={(n) => pg.noteOn(n, 100)} onnoteoff={(n) => pg.noteOff(n)} />
  </section>

  <footer>
    Keys: computer keyboard A–' plays notes, Z / X shifts octave · Encoder: browse presets, click to load, hold for Dice (Synth view: knob pages, click to listen; Wavetable view: pick the table) ·
    Shift + encoder click: drum step edit (turn to pick the drum), click again: sequencer edit, again: off ·
    Shift + any knob: tempo · Shift + pads: ▶ play, ■ stop, ● record, ⟲ clear loop, Tap tempo · Double-click a knob to reset it
  </footer>

  {#if !pg.audioRunning}
    <button class="start" onclick={() => pg.startAudio()}>
      <span class="big">Click to start audio</span>
      <span>Browsers only allow sound after a click.</span>
    </button>
  {/if}
</div>

<style>
  .app { display: grid; gap: 12px; padding: 12px 16px 16px; max-width: 1400px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 18px; letter-spacing: 0.02em; }
  h1 span { color: var(--accent); font-weight: 400; }
  .views { display: flex; gap: 2px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .views button { border: none; background: none; font-size: 13px; padding: 4px 14px; border-radius: 4px; color: var(--dim); }
  .views .active { background: var(--accent); color: #0b1314; font-weight: 600; }
  .about-link { background: none; border: none; color: var(--dim); font-size: 13px; padding: 4px 6px; margin-left: -12px; }
  .about-link:hover { color: var(--text); }
  .about-link.active { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }
  .midi { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; white-space: nowrap; }
  .pill.ok { color: var(--accent); border-color: var(--accent); }
  .hint { color: var(--dim); font-size: 12px; }
  .cpu {
    font: 11px var(--mono); color: var(--dim); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; min-width: 64px; text-align: center;
    background: linear-gradient(to right, color-mix(in srgb, var(--accent) 30%, transparent) calc(var(--load) * 100%), transparent 0);
  }
  .cpu.hot { color: #ff6b6b; border-color: #ff6b6b; }
  .transport { display: flex; align-items: center; gap: 6px; }
  .transport button { min-width: 34px; }
  .transport .active { background: var(--accent); color: #0b1314; }
  .transport .rec { color: #ff6b6b; }
  .transport .rec.active { background: #ff6b6b; color: #fff; }
  .bpm { display: flex; align-items: center; gap: 4px; color: var(--dim); font-size: 12px; }
  .bpm input { width: 52px; padding: 4px 6px; text-align: center; font: 13px var(--mono); color: var(--text); appearance: textfield; }
  .bpm input::-webkit-inner-spin-button, .bpm input::-webkit-outer-spin-button { appearance: none; margin: 0; }

  .presets { display: flex; align-items: center; gap: 6px; }
  .parts { display: flex; gap: 2px; margin-right: 8px; }
  .parts button { display: grid; text-align: left; padding: 2px 10px; line-height: 1.2; }
  .parts button.active { border-color: var(--accent); }
  .part-name { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }
  .parts button.active .part-name { color: var(--accent); }
  .part-preset { font-size: 12.5px; }
  .presets select { min-width: 260px; font-size: 14px; padding: 5px 8px; }
  .browse { color: var(--accent); font-size: 12px; }
  .dirty { color: var(--dim); font-size: 12px; font-style: italic; }
  .spacer { flex: 1; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .viz { display: grid; grid-template-columns: 1fr 340px; gap: 12px; height: 280px; }
  .main-viz { display: flex; flex-direction: column; }
  .canvas { position: relative; }
  .main-viz .canvas { flex: 1; min-height: 0; }
  .tabs { display: flex; gap: 4px; align-items: center; margin-bottom: 6px; }
  .tabs button { font-size: 12px; padding: 2px 10px; }
  .tabs .active { border-color: var(--accent); color: var(--accent); }
  .tabs .hint { margin-left: auto; }
  .side { display: grid; grid-template-rows: 1fr 1fr; gap: 12px; min-height: 0; }
  .side .panel { display: flex; flex-direction: column; min-height: 0; }
  .side .canvas { flex: 1; min-height: 0; }

  .surface { display: grid; grid-template-columns: auto 1fr auto; gap: 28px; align-items: center; }
  .strips { display: flex; gap: 10px; }
  .strip { width: 30px; height: 150px; background: #0b0e10; border-radius: 5px; position: relative; overflow: hidden; }
  .strip span { position: absolute; bottom: 4px; width: 100%; text-align: center; font-size: 10px; color: var(--dim); }
  .strip .center { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: #fff3; }
  .strip .bend { position: absolute; left: 0; right: 0; background: var(--accent); opacity: 0.7; }
  .strip .mod { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); opacity: 0.7; }
  .knobs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 8px; }
  .faders { display: grid; grid-template-columns: repeat(4, 64px); }

  .bottom { display: grid; grid-template-columns: 420px 1fr; gap: 12px; }
  .pads { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .pad {
    aspect-ratio: 1.6; border-radius: 6px; border: 2px solid var(--accent); background: #101416; font-size: 12px; color: var(--text);
    box-shadow: 0 0 calc(var(--level) * 24px) var(--accent), inset 0 0 calc(var(--level) * 40px) var(--accent);
    transition: box-shadow 0.12s;
  }
  .pad { box-shadow: 0 0 calc(var(--level) * 24px) var(--glow, var(--accent)), inset 0 0 calc(var(--level) * 40px) var(--glow, var(--accent)); }
  .pad.shifted { border-style: dashed; color: var(--accent); }
  .pad.step { color: var(--dim); border-color: var(--line); }
  .pad.step-on { background: var(--accent); color: #0b1314; border-color: var(--accent); }
  .pad.playhead { outline: 2px solid #fff; outline-offset: 2px; }
  .pad.slide.step-on { background: #a35cff; border-color: #a35cff; }
  .pad.outside { opacity: 0.3; }
  .pads-title { margin-bottom: 4px; }
  .seq-title { display: flex; align-items: center; gap: 8px; }
  .seq-title button { font-size: 11px; padding: 1px 10px; text-transform: none; letter-spacing: 0; }
  .seq-title .active { border-color: var(--accent); color: var(--accent); }
  .seq-panel.muted :global(.seq) { opacity: 0.4; }
  .pad-modes { display: flex; gap: 4px; margin-bottom: 8px; }
  .pad-modes button { font-size: 12px; padding: 2px 10px; }
  .pad-modes .active { border-color: var(--accent); color: var(--accent); }
  .dice { margin-left: 6px; }
  .pad.device-only { opacity: 0.45; }
  .shift { border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; font-size: 12px; color: var(--dim); transition: all 0.08s; }
  .shift.on { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; box-shadow: 0 0 12px var(--accent); }
  .shifted { color: var(--accent); }

  footer { color: var(--dim); font-size: 12px; text-align: center; }

  @media (max-width: 1000px) {
    .viz { grid-template-columns: 1fr; height: auto; }
    .main-viz .canvas { height: 200px; flex: none; }
    .side { grid-template-rows: 150px 150px; }
    .surface { grid-template-columns: 1fr; justify-items: center; }
    .bottom { grid-template-columns: 1fr; }
    .presets select { min-width: 0; flex: 1; }
  }

  .start {
    position: fixed; inset: 0; background: #0b0e10e0; border: none; border-radius: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; color: var(--dim); cursor: pointer; z-index: 10;
  }
  .start .big { font-size: 28px; color: var(--accent); }
</style>
