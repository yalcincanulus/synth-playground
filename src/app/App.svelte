<script lang="ts">
  import { onMount } from "svelte";
  import { formatValue, LFO_TARGETS, PARAMS, toControl, type ParamId } from "../audio/params";
  import { FADERS } from "../presets/presets";
  import Fader from "./components/Fader.svelte";
  import Keyboard from "./components/Keyboard.svelte";
  import ScaleBar from "./components/ScaleBar.svelte";
  import ChordDisplay from "./components/ChordDisplay.svelte";
  import { playable } from "../audio/scale";
  import Knob from "./components/Knob.svelte";
  import Scope from "./components/Scope.svelte";
  import SeqGrid from "./components/SeqGrid.svelte";
  import Spectrum from "./components/Spectrum.svelte";
  import { PART_NAMES, Playground } from "./playground.svelte";
  import SynthView from "./synth/SynthView.svelte";
  import WavetableView from "./wavetable/WavetableView.svelte";
  import AboutPage from "./about/AboutPage.svelte";
  import SequencerPanel from "./sequencer/SequencerPanel.svelte";

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

  // The list of changes from the saved preset: opens under its button, closes on a click elsewhere.
  let showChanges = $state(false);
  let changes = $derived(pg.dirty ? pg.changes : []);
  $effect(() => {
    if (!pg.dirty) showChanges = false;
  });
  function closeChanges(e: MouseEvent) {
    if (showChanges && !(e.target instanceof Element && e.target.closest(".changes-wrap"))) showChanges = false;
  }

  // The on-screen keyboard can fold away (the MiniLab and the computer keyboard still play); remembered per browser.
  const KEYS_OPEN_KEY = "minilab3.keyboard";
  let keysOpen = $state(localStorage.getItem(KEYS_OPEN_KEY) !== "closed");
  function toggleKeys() {
    keysOpen = !keysOpen;
    localStorage.setItem(KEYS_OPEN_KEY, keysOpen ? "open" : "closed");
  }

  // Play view: the drums or the step sequencer below the knobs. Editing either on the MiniLab brings its tab up.
  let rhythm = $state<"drums" | "seq">("drums");
  $effect(() => {
    if (pg.seqEdit) rhythm = "seq";
  });
  $effect(() => {
    if (pg.stepMode) rhythm = "drums";
  });

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


<svelte:window onkeydown={(e) => pg.handleKey(e, true)} onkeyup={(e) => pg.handleKey(e, false)} onclick={closeChanges} />

<div class="app" style:--accent={accent}>
  <!-- Row 1: where you are (the views) and the app's state (MiniLab, CPU, help). -->
  <header class="top">
    <h1>MiniLab 3 <span>Playground</span></h1>
    <nav class="views" aria-label="View">
      <button data-label="Play" class:active={pg.view === "playground"} onclick={() => pg.setView("playground")} title="Play: the MiniLab's knobs and faders, the pads, drums and step sequencer (Shift + encoder)">Play</button>
      <button data-label="Synth" class:active={pg.view === "synth"} onclick={() => pg.setView("synth")} title="The whole synth as blocks: see and change every part of the sound (Shift + encoder)">Synth</button>
      <button data-label="Wavetable" class:active={pg.view === "wavetable"} onclick={() => pg.setView("wavetable")} title="Pick, import and draw wavetables (Shift + encoder)">Wavetable</button>
    </nav>
    <button class="recipes-link" class:active={!!pg.recipe || pg.recipeList} onclick={() => pg.openRecipes()} title="Build a classic sound step by step">Recipes</button>

    <div class="midi">
      {#if pg.midiStatus === "connected"}
        <span class="pill ok">● {pg.deviceName}{pg.program ? ` · ${pg.program === "daw" ? "DAW" : "Arturia"} mode` : ""}</span>
        <span class="shift" class:on={pg.shift} title="Shift button on the MiniLab">Shift</span>
        {#if pg.program === "arturia"}
          <span class="hint" title="Pad lights and the screen need DAW mode: hold Shift and tap Prog.">Lights and screen need DAW mode: Shift + Prog.</span>
        {/if}
      {:else}
        <button class="primary" onclick={() => pg.connectMidi()}>Connect MiniLab</button>
        <span class="hint" title={MIDI_TEXT[pg.midiStatus]}>{MIDI_TEXT[pg.midiStatus]}</span>
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
    <label class="explain-toggle" title="Plain-English explanations on every view">
      <input type="checkbox" checked={pg.explain} onchange={(e) => pg.setExplain(e.currentTarget.checked)} /> Explanations
    </label>
    <button class="about-link" class:active={pg.view === "about"} onclick={() => pg.setView("about")} title="What this is, the MiniLab and keyboard shortcuts, and this browser's limits">About & shortcuts</button>
  </header>

  <!-- Row 2: the sound being edited, and time (shared by the drums and the sequencer). -->
  <section class="soundbar">
    <div class="group sound">
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
      <select onchange={(e) => pg.loadPreset(+e.currentTarget.value)} aria-label="Preset">
        {#if pg.dicePreset}<option value={-1} disabled selected>{pg.dicePreset.from === "recipe" ? "Recipe:" : "🎲"} {pg.dicePreset.name} · {pg.dicePreset.category}</option>{/if}
        {#each presetGroups as [category, entries] (category)}
          <optgroup label={category}>
            {#each entries as { p, i } (i)}
              <option value={i} selected={!pg.dicePreset && i === pg.presetIndex}>{i + 1}. {p.name}{pg.isUserPreset(i) ? " (user)" : ""}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <button onclick={() => pg.loadPreset(pg.presetIndex + 1)} aria-label="Next preset">▶</button>
      <button onclick={() => pg.dice()} title="Random patch (hold the encoder down)">🎲 Dice</button>
      <div class="undo" role="group" aria-label="Undo and redo">
        <button disabled={!pg.canUndo} onclick={() => pg.undo()} aria-label="Undo" title={pg.undoLabel ? `Undo ${pg.undoLabel} (Ctrl+Z · Shift + pitch strip down)` : "Nothing to undo"}>↶</button>
        <button disabled={!pg.canRedo} onclick={() => pg.redo()} aria-label="Redo" title={pg.redoLabel ? `Redo ${pg.redoLabel} (Ctrl+Shift+Z · Shift + pitch strip up)` : "Nothing to redo"}>↷</button>
      </div>
      {#if pg.browseIndex !== null}
        <span class="browse">Encoder: {pg.presets[pg.browseIndex].name}, click to load</span>
      {:else if pg.dirty}
        <div class="changes-wrap">
          <button class="changes-btn" class:open={showChanges} onclick={() => (showChanges = !showChanges)} aria-expanded={showChanges} title="What you changed since the preset was loaded">
            {changes.length} change{changes.length === 1 ? "" : "s"} ▾
          </button>
          {#if showChanges}
            <div class="changes" role="dialog" aria-label="Changes from the saved preset">
              <div class="changes-head">Changed from <strong>{pg.preset.name}</strong></div>
              {#if changes.length}
                <ul>
                  {#each changes as c (c.id)}
                    <li class:hot={pg.touched?.param === c.id}>
                      <span class="c-label">{c.label}</span>
                      <span class="c-from">{c.from}</span>→<span class="c-to">{c.to}</span>
                      <button class="c-revert" title="Back to {c.from}" onclick={() => pg.revertParam(c.id)}>↺</button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="none">Everything is back where the preset had it.</p>
              {/if}
            </div>
          {/if}
        </div>
        <button class="compare" class:active={pg.comparing} onclick={() => pg.toggleCompare()} title={pg.comparing ? "Back to your edit" : "Hear the saved preset (A/B); click again for your edit"}>
          {pg.comparing ? "Hearing saved" : "Compare"}
        </button>
      {/if}
      <span class="push"></span>
      <button onclick={savePreset}>Save as…</button>
      {#if pg.isUserPreset()}<button onclick={() => pg.deleteUserPreset()}>Delete</button>{/if}
    </div>

    <div class="group transport" role="group" aria-label="Transport">
      <button class:active={pg.playing} onclick={() => pg.togglePlay()} title="Play / stop the drums and the step sequencer (Shift + ▶)">{pg.playing ? "■" : "▶"}</button>
      <button class="rec" class:active={pg.recording} onclick={() => pg.toggleRecord()} title="Record pads into the drum loop (Shift + ●)">●</button>
      <label class="bpm" title="Shift + any knob on the MiniLab">
        <input type="number" min="40" max="240" value={pg.bpm} onchange={(e) => pg.setBpm(+e.currentTarget.value)} />
        BPM
      </label>
      <button onclick={() => pg.tap()} title="Tap tempo (Shift + Tap)">Tap</button>
    </div>
  </section>

  {#if pg.view === "playground"}
    <div class="play">
      <section class="surface panel" aria-label="The MiniLab's knobs and faders">
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
              size={46}
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
              height={96}
              onchange={(t) => pg.setFader(i, t)}
            />
          {/each}
        </div>
        {#if pg.explain}
          <p class="surface-note">The MiniLab's knobs and faders. Each preset puts its main controls on the knobs; the <b>Synth</b> view has the rest.</p>
        {/if}
      </section>

      <section class="panel main-viz">
        <div class="tabs">
          <button class:active={pg.vizMode === "scope"} onclick={() => (pg.vizMode = "scope")}>Waveform</button>
          <button class:active={pg.vizMode === "spectrum"} onclick={() => (pg.vizMode = "spectrum")}>Spectrum</button>
          <span class="hint" class:shifted={pg.shift}>Shift + encoder: next view</span>
        </div>
        <div class="canvas">
          {#if pg.vizMode === "scope"}
            <Scope analyser={pg.engine.analyser} color={accent} />
          {:else}
            <Spectrum analyser={pg.engine.analyser} color={accent} />
          {/if}
        </div>
      </section>
    </div>

    <section class="rhythm">
      <div class="rhythm-bar">
        <div class="seg" role="tablist" aria-label="Rhythm">
          <button role="tab" aria-selected={rhythm === "drums"} class:active={rhythm === "drums"} onclick={() => (rhythm = "drums")}>
            Drums <i class="dot" class:on={pg.drumsOn}></i>
          </button>
          <button role="tab" aria-selected={rhythm === "seq"} class:active={rhythm === "seq"} onclick={() => (rhythm = "seq")}>
            Step sequencer <i class="dot" class:on={pg.noteSeq.enabled}></i>
          </button>
        </div>
        <span class="hint">Both play together with ▶, in time with each other.</span>
      </div>

      {#if rhythm === "drums"}
        <div class="drums">
          <div class="panel pads-panel">
            <div class="pads-head">
              <div class="title pads-title">
                {#if pg.shift}
                  <span class="shifted">Shift held · pads are transport controls</span>
                {:else if pg.seqEdit}
                  <span class="shifted">Sequencer edit · {pg.bank === "A" ? "steps on/off, hold + key sets the note" : "slides"}</span>
                {:else if pg.stepMode}
                  <span class="shifted">Step edit · {pg.drumName(pg.stepTrack)} · steps {pg.bank === "A" ? "1–8" : "9–16"}</span>
                {:else}
                  Pads <span class="bank">A: drums · B: favourite presets</span>
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
                  {:else if pg.seqEdit}{pg.bank === "A" ? `${i + 1} · ${pg.noteName(pg.stepNote(i))}` : `Slide ${i + 1}`}
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
              <button class="clear" onclick={() => pg.clearPattern()} title="Clear the drum loop (Shift + ⟲)">Clear</button>
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
        </div>
      {:else}
        <SequencerPanel {pg} />
      {/if}
    </section>
  {:else if pg.view === "synth"}
    <SynthView {pg} {accent} />
  {:else if pg.view === "wavetable"}
    <WavetableView {pg} {accent} />
  {:else}
    <AboutPage {pg} />
  {/if}

  <section class="panel keys" class:folded={!keysOpen}>
    <div class="keys-head">
      <ChordDisplay {pg} />
      <ScaleBar {pg} />
      <button class="fold" onclick={toggleKeys} aria-expanded={keysOpen} title="{keysOpen ? 'Hide' : 'Show'} the on-screen keyboard. The MiniLab and the computer keyboard (A–' row) play either way">
        Keyboard <span class="chev">{keysOpen ? "▾" : "▴"}</span>
      </button>
    </div>
    {#if keysOpen}
      <Keyboard
        notes={keyboardNotes}
        onnoteon={(n) => pg.noteOn(n, 100)}
        onnoteoff={(n) => pg.noteOff(n)}
        playable={(n) => playable(n, pg.scale)}
        root={pg.scale.scale === "off" ? null : pg.scale.root}
      />
    {/if}
  </section>

  {#if !pg.audioRunning}
    <button class="start" onclick={() => pg.startAudio()}>
      <span class="big">Click to start audio</span>
      <span>Browsers only allow sound after a click.</span>
    </button>
  {/if}
</div>

<style>
  .app { display: grid; gap: 8px; padding: 8px 16px 12px; max-width: 1400px; margin: 0 auto; }
  .hint { color: var(--dim); font-size: 12px; }
  .shifted { color: var(--accent); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }

  /* ---- header row 1: views and app state */
  .top { display: flex; align-items: center; gap: 14px; min-width: 0; }
  h1 { margin: 0; font-size: 17px; letter-spacing: 0.02em; white-space: nowrap; }
  h1 span { color: var(--accent); font-weight: 400; }
  .top > :not(.midi) { flex: none; }
  .views { display: flex; gap: 2px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .views button { border: none; background: none; font-size: 13px; padding: 4px 16px; border-radius: 4px; color: var(--dim); }
  /* Room for the bold label is kept on every tab, so picking one doesn't change the bar's width. */
  .views button { display: inline-grid; justify-items: center; }
  .views button::after { content: attr(data-label); font-weight: 600; height: 0; visibility: hidden; overflow: hidden; }
  .views button:hover { color: var(--text); }
  .views .active, .views .active:hover { background: var(--accent); color: #0b1314; font-weight: 600; }
  .recipes-link { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); font-size: 13px; padding: 4px 12px; }
  .recipes-link.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  /* Pushed to the right; the hint shortens first, and the row wraps before the button is covered. */
  .midi { display: flex; align-items: center; gap: 10px; flex: 0 1 auto; min-width: 140px; margin-left: auto; }
  .midi .hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .midi button { flex: none; }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; white-space: nowrap; }
  .pill.ok { color: var(--accent); border-color: var(--accent); }
  .shift { border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; font-size: 12px; color: var(--dim); transition: all 0.08s; }
  .shift.on { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; box-shadow: 0 0 12px var(--accent); }
  .cpu {
    font: 11px var(--mono); color: var(--dim); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; min-width: 64px; text-align: center; white-space: nowrap;
    background: linear-gradient(to right, color-mix(in srgb, var(--accent) 30%, transparent) calc(var(--load) * 100%), transparent 0);
  }
  .cpu.hot { color: #ff6b6b; border-color: #ff6b6b; }
  .explain-toggle { font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap; color: var(--dim); }
  .about-link { background: none; border: none; color: var(--dim); font-size: 12px; padding: 4px 2px; white-space: nowrap; }
  .about-link:hover { color: var(--text); }
  .about-link.active { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }

  /* ---- header row 2: the sound and time */
  .soundbar { display: flex; gap: 10px; align-items: stretch; }
  .group button { white-space: nowrap; }
  .group { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #0f1416; border: 1px solid var(--line); border-radius: 8px; }
  .sound { flex: 1; min-width: 0; }
  .parts { display: flex; gap: 2px; margin-right: 6px; }
  .parts button { display: grid; text-align: left; padding: 1px 10px; line-height: 1.2; }
  .parts button.active { border-color: var(--accent); }
  .part-name { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }
  .parts button.active .part-name { color: var(--accent); }
  .part-preset { font-size: 12.5px; white-space: nowrap; }
  .sound select { width: 260px; min-width: 0; font-size: 14px; padding: 4px 8px; }
  .browse { color: var(--accent); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .push { flex: 1; }
  .undo { display: flex; gap: 2px; }
  .undo button { min-width: 30px; padding: 2px 6px; font-size: 15px; line-height: 1.2; }
  .undo button:disabled { opacity: 0.35; cursor: default; border-color: var(--line); }
  .changes-wrap { position: relative; }
  .changes-btn { font-size: 12px; color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .changes-btn.open { background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .changes {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 20; width: 380px; max-height: 360px; overflow-y: auto;
    background: #10171a; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; box-shadow: 0 10px 30px #000a; font-size: 12px;
  }
  .changes-head { color: var(--dim); margin-bottom: 6px; }
  .changes-head strong { color: var(--text); }
  .changes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .changes li { display: grid; grid-template-columns: 1fr auto 14px auto 24px; gap: 6px; align-items: center; color: var(--dim); }
  .changes li.hot .c-label { color: var(--accent); }
  .c-label { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-from, .c-to { font: 11px var(--mono); white-space: nowrap; }
  .c-to { color: var(--accent); }
  .c-revert { padding: 0 4px; font-size: 12px; line-height: 18px; background: none; color: var(--dim); }
  .none { margin: 0; color: var(--dim); }
  .compare { font-size: 12px; font-family: var(--mono); }
  .compare.active { background: #ffcc33; border-color: #ffcc33; color: #111; }
  .transport button { min-width: 34px; }
  .transport .active { background: var(--accent); color: #0b1314; }
  .transport .rec { color: #ff6b6b; }
  .transport .rec.active { background: #ff6b6b; color: #fff; }
  .bpm { display: flex; align-items: center; gap: 4px; color: var(--dim); font-size: 12px; }
  .bpm input { width: 52px; padding: 4px 6px; text-align: center; font: 13px var(--mono); color: var(--text); appearance: textfield; }
  .bpm input::-webkit-inner-spin-button, .bpm input::-webkit-outer-spin-button { appearance: none; margin: 0; }

  /* ---- Play view: the MiniLab's controls and the sound, then the rhythm */
  .play { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 10px; }
  .surface { display: grid; grid-template-columns: auto 1fr auto; column-gap: 24px; align-items: center; padding: 8px 14px; }
  .surface-note { grid-column: 1 / -1; margin: 4px 0 0; font-size: 11.5px; color: #a9b6ba; }
  .strips { display: flex; gap: 8px; }
  .strip { width: 28px; height: 136px; background: #0b0e10; border-radius: 5px; position: relative; overflow: hidden; }
  .strip span { position: absolute; bottom: 4px; width: 100%; text-align: center; font-size: 10px; color: var(--dim); }
  .strip .center { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: #fff3; }
  .strip .bend { position: absolute; left: 0; right: 0; background: var(--accent); opacity: 0.7; }
  .strip .mod { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); opacity: 0.7; }
  .knobs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 8px; }
  .faders { display: grid; grid-template-columns: repeat(4, 58px); }
  .main-viz { display: flex; flex-direction: column; min-height: 200px; }
  .canvas { position: relative; flex: 1; min-height: 0; }
  .tabs { display: flex; gap: 4px; align-items: center; margin-bottom: 6px; }
  .tabs button { font-size: 12px; padding: 2px 10px; }
  .tabs .active { border-color: var(--accent); color: var(--accent); }
  .tabs .hint { margin-left: auto; font-size: 11px; }

  .rhythm { display: grid; gap: 6px; }
  .rhythm-bar { display: flex; align-items: center; gap: 12px; }
  .seg { display: flex; gap: 2px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .seg button { border: none; background: none; font-size: 12px; padding: 2px 12px; border-radius: 4px; color: var(--dim); display: flex; align-items: center; gap: 6px; }
  .seg button:hover { color: var(--text); }
  .seg .active, .seg .active:hover { background: #222b2f; color: var(--text); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #3a454b; }
  .dot.on { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .drums { display: grid; grid-template-columns: 380px 1fr; gap: 10px; }
  .pads { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .pad {
    height: 46px; border-radius: 6px; border: 2px solid var(--accent); background: #101416; font-size: 12px; color: var(--text);
    box-shadow: 0 0 calc(var(--level) * 24px) var(--glow, var(--accent)), inset 0 0 calc(var(--level) * 40px) var(--glow, var(--accent));
    transition: box-shadow 0.12s;
  }
  .pad.shifted { border-style: dashed; color: var(--accent); }
  .pad.step { color: var(--dim); border-color: var(--line); }
  .pad.step-on { background: var(--accent); color: #0b1314; border-color: var(--accent); }
  .pad.playhead { outline: 2px solid #fff; outline-offset: 2px; }
  .pad.slide.step-on { background: #a35cff; border-color: #a35cff; }
  .pad.outside { opacity: 0.3; }
  .pad.device-only { opacity: 0.45; }
  .pads-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 22px; }
  .pads-title { margin: 0; flex: 1; min-width: 0; line-height: 1.25; }
  .seq-title { display: flex; align-items: center; gap: 8px; }
  .seq-title button { font-size: 11px; padding: 1px 10px; text-transform: none; letter-spacing: 0; }
  .seq-title .active { border-color: var(--accent); color: var(--accent); }
  .seq-title .clear { margin-left: auto; }
  .seq-panel.muted :global(.seq) { opacity: 0.4; }
  .pad-modes { display: flex; gap: 4px; flex: none; }
  .bank { text-transform: none; letter-spacing: 0; }
  .pad-modes button { font-size: 12px; padding: 2px 10px; }
  .pad-modes .active { border-color: var(--accent); color: var(--accent); }

  /* ---- the keyboard, on every view */
  .keys { padding: 8px 10px; }
  .keys-head { display: flex; gap: 16px; align-items: center; min-height: 32px; margin-bottom: 8px; }
  .keys.folded .keys-head { margin-bottom: 0; }
  .fold { flex: none; display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 10px; color: var(--dim); }
  .fold:hover { color: var(--text); }
  .chev { font-size: 10px; }

  @media (max-width: 1100px) {
    .top { flex-wrap: wrap; }
    .soundbar { flex-wrap: wrap; }
  }
  @media (max-width: 1000px) {
    .play { grid-template-columns: 1fr; }
    .main-viz { height: 200px; }
    .drums { grid-template-columns: 1fr; }
  }
  @media (max-width: 800px) {
    .surface { grid-template-columns: 1fr; justify-items: center; row-gap: 12px; }
    .sound { flex-wrap: wrap; }
  }

  .start {
    position: fixed; inset: 0; background: #0b0e10e0; border: none; border-radius: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; color: var(--dim); cursor: pointer; z-index: 10;
  }
  .start .big { font-size: 28px; color: var(--accent); }
</style>
