<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { formatValue, LFO_TARGETS, PARAMS, toControl, type ParamId } from "../audio/params";
  import { FADERS } from "../presets/presets";
  import Fader from "./components/Fader.svelte";
  import Keyboard from "./components/Keyboard.svelte";
  import ScaleBar from "./components/ScaleBar.svelte";
  import Switch from "./components/Switch.svelte";
  import ArpBar from "./components/ArpBar.svelte";
  import ChordDisplay from "./components/ChordDisplay.svelte";
  import { playable } from "../audio/scale";
  import { noteName } from "../audio/stepSequencer";
  import Knob from "./components/Knob.svelte";
  import Scope from "./components/Scope.svelte";
  import SeqGrid from "./components/SeqGrid.svelte";
  import Spectrum from "./components/Spectrum.svelte";
  import { surface } from "./components/canvas";
  import { spectrogram } from "./components/spectrogram";
  import { PART_NAMES, Playground, SHIFT_FADERS } from "./playground.svelte";
  import SongView from "./song/SongView.svelte";
  import SynthView from "./synth/SynthView.svelte";
  import WavetableView from "./wavetable/WavetableView.svelte";
  import AboutPage from "./about/AboutPage.svelte";
  import CourseView from "./course/CourseView.svelte";
  import CourseControls from "./course/CourseControls.svelte";
  import SequencerPanel from "./sequencer/SequencerPanel.svelte";
  import PresetBrowser from "./presets/PresetBrowser.svelte";
  import Marquee from "./components/Marquee.svelte";
  import { trackCss } from "./song/trackColor";
  import { narrow, touch } from "./media.svelte";
  import GuidePanel from "./songGuide/GuidePanel.svelte";

  const pg = new Playground();
  if (import.meta.env.DEV) Object.assign(window, { pg });

  // Preset colours are in the LED's 0-127 range; lift them toward white so dark ones stay readable on screen.
  let accent = $derived.by(() => {
    const [r, g, b] = pg.preset.color.map((c) => Math.round(c * 2 * 0.75 + 255 * 0.25));
    return `rgb(${r} ${g} ${b})`;
  });

  // What the preset button says under the name: where the sound comes from.
  let presetMeta = $derived.by(() => {
    const p = pg.preset;
    if (p.from === "recipe") return "Recipe";
    if (p.from === "dice") return "🎲 Dice";
    if (p.from === "link") return "from a link";
    if (!pg.isListed(p)) return "not saved";
    return pg.isUserPreset(p) ? `mine · ${p.category}` : p.category;
  });

  // The keyboard lights up the keys you hold and the notes the step sequencer plays. With the arpeggiator,
  // the keys you hold are outlined and the note it plays lights up.
  let keyboardNotes = $derived(new Set([...(pg.arp.on ? pg.arpNotes : pg.notes), ...pg.seqNotes]));
  let heldNotes = $derived(pg.arp.on ? new Set(pg.notes) : undefined);

  /** A setting as heard: automation (a playing clip moving it) over the sound's own value. */
  const shown = (id: ParamId) => pg.autoShown[id] ?? pg.values[id];
  const display = (id: ParamId) => formatValue(id, shown(id));
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
  // Narrow screens: Recipes, MiniLab, CPU, Explanations and About sit in the header's ⋯ menu.
  let menuOpen = $state(false);
  // Learn on a phone: the page's controls and the keyboard sit in a dock along the bottom.
  let docked = $derived(pg.view === "course" && narrow.current);
  /** A "Make a song" lesson is open: its guide sits beside the view (any view but Learn and About, so a step can send you to Play or Synth). */
  let guided = $derived(pg.guide !== null && pg.view !== "course" && pg.view !== "about");
  function closeChanges(e: MouseEvent) {
    if (menuOpen && !(e.target instanceof Element && e.target.closest(".more, .extras"))) menuOpen = false;
    if (showChanges && !(e.target instanceof Element && e.target.closest(".changes-wrap"))) showChanges = false;
    if (pg.browserOpen && !(e.target instanceof Element && e.target.closest(".preset-wrap"))) pg.browserOpen = false;
  }

  // The on-screen keyboard can fold away (the MiniLab and the computer keyboard still play); remembered per browser.
  const KEYS_OPEN_KEY = "minilab3.keyboard";
  let keysOpen = $state(localStorage.getItem(KEYS_OPEN_KEY) !== "closed");
  function toggleKeys() {
    keysOpen = !keysOpen;
    localStorage.setItem(KEYS_OPEN_KEY, keysOpen ? "open" : "closed");
  }

  // Play view: the step sequencer or the drums below the knobs. Editing either on the MiniLab brings its tab up.
  let rhythm = $state<"drums" | "seq">("seq");
  $effect(() => {
    if (pg.seqEdit) rhythm = "seq";
  });
  $effect(() => {
    if (pg.stepMode) rhythm = "drums";
  });
  // "Edit in Play" from the Song view: the clip's editor comes up.
  $effect(() => {
    if (!pg.editClipId) return;
    const kind = untrack(() => pg.editClip?.kind);
    if (kind === "drums") rhythm = "drums";
    else if (kind === "steps") rhythm = "seq";
  });
  let editTrack = $derived(pg.editClip ? pg.songTracks.find((t) => t.id === pg.editClip?.track) : undefined);

  onMount(() => {
    // Reconnect silently if MIDI was allowed before; otherwise wait for the button.
    navigator.permissions
      ?.query({ name: "midi", sysex: true } as unknown as PermissionDescriptor)
      .then((p) => {
        if (p.state === "granted") pg.connectMidi();
      })
      .catch(() => {});
    // A hot reload (development) mounts a new App with a new Playground: silence this one.
    return () => pg.dispose();
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
    "not-found": "",
    connected: "",
  };

  /** A recording's length as m:ss. */
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
</script>


<svelte:window onkeydown={(e) => pg.handleKey(e, true)} onkeyup={(e) => pg.handleKey(e, false)} onclick={closeChanges} />

<div class="app" style:--accent={accent}>
  <!-- Row 1: where you are (the views) and the app's state (MiniLab, CPU, help). -->
  <header class="top">
    <h1>Synth <span>Playground</span></h1>
    <nav class="views" aria-label="View">
      <button data-label="Play" data-guide="view-play" class:active={pg.view === "playground"} onclick={() => pg.setView("playground")} title="Play: the preset's main controls, the pads, drums and step sequencer{pg.hw(' (Shift + encoder)')}">Play</button>
      <button data-label="Synth" data-guide="view-synth" class:active={pg.view === "synth"} onclick={() => pg.setView("synth")} title="The whole synth as blocks: see and change every part of the sound{pg.hw(' (Shift + encoder)')}">Synth</button>
      <button data-label="Wavetable" class:active={pg.view === "wavetable"} onclick={() => pg.setView("wavetable")} title="Pick, import and draw wavetables{pg.hw(' (Shift + encoder)')}">Wavetable</button>
      <button data-label="Song" data-guide="view-song" class:active={pg.view === "song"} onclick={() => pg.setView("song")} title="Tracks, each with a sound of its own, and their mix{pg.hw(' (Shift + encoder)')}. Experimental: still being worked on">Song<svg class="experimental" viewBox="0 0 12 12" aria-label="experimental"><path d="M4.5 1h3M5 1v3.5L2 10a1 1 0 0 0 .9 1.5h6.2A1 1 0 0 0 10 10L7 4.5V1M3.4 7.5h5.2" /></svg></button>
      <button data-label="Learn" class:active={pg.view === "course"} onclick={() => pg.setView("course")} title="The course: how sound and synths work, one idea per page, with only the controls each page needs">Learn</button>
    </nav>
    <!-- On a narrow screen the rest of the row folds into a menu; on a wide one the wrapper takes no space of its own. -->
    <button class="more" class:open={menuOpen} onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen} aria-label="More">⋯</button>
    <div class="extras" class:open={menuOpen}>
    <button class="recipes-link" class:active={!!pg.recipe || pg.recipeList} onclick={() => { menuOpen = false; pg.openRecipes(); }} title="Build a classic sound step by step">Recipes</button>

    <div class="midi">
      {#if pg.hasDevice}
        <span class="pill ok">● {pg.deviceName}{pg.program ? ` · ${pg.program === "daw" ? "DAW" : "Arturia"} mode` : ""}</span>
        <span class="shift" class:on={pg.shift} title="Shift button on the MiniLab">Shift</span>
        {#if pg.program === "arturia"}
          <span class="hint" title="Pad lights and the screen need DAW mode: hold Shift and tap Prog.">Lights and screen need DAW mode: Shift + Prog.</span>
        {/if}
      {:else}
        <!-- Quiet on purpose: the app works fully without a MiniLab; connecting one is an extra. -->
        <button class="pill connect" onclick={() => pg.connectMidi()} title="Optional: play and control the app from an Arturia MiniLab 3. Everything works without one: the mouse, the on-screen keyboard and the computer keys.">○ Connect a MiniLab <span class="opt">optional</span></button>
        <span class="hint" title={MIDI_TEXT[pg.midiStatus]}>{MIDI_TEXT[pg.midiStatus]}</span>
      {/if}
    </div>

    {#if pg.audioRunning}
      <span
        class="cpu"
        class:hot={pg.cpu.load > 0.6 || (pg.cpu.clock === "performance" && pg.cpu.peak > 0.9)}
        style:--load={Math.min(1, pg.cpu.load)}
        title="CPU: share of the time available that our audio code uses (every note and the LFOs, and the distortion, phaser and flanger{pg.cpu.fx >= 0.005 ? `: ${Math.round(pg.cpu.fx * 100)}%` : ''}; not the browser's own effects) · {pg.cpu.voices} voices{pg.cpu.cuts
          ? ` · ${pg.cpu.cuts} note${pg.cpu.cuts > 1 ? "s" : ""} cut to keep it from crackling`
          : ""}{pg.cpu.clock ===
        'performance'
          ? ` · busiest block ${Math.round(pg.cpu.peak * 100)}%`
          : ''}"
      >
        CPU {Math.round(pg.cpu.load * 100)}%
      </span>
    {/if}
    <Switch on={pg.explain} label="Explanations" title="Plain-English explanations on every view" onchange={() => pg.setExplain(!pg.explain)} />
    <button class="about-link" class:active={pg.view === "about"} onclick={() => { menuOpen = false; pg.setView("about"); }} title="What this is, the shortcuts, and this browser's limits">About & shortcuts</button>
    </div>
  </header>

  {#if pg.linkNotice}
    <div class="link-notice" class:bad={!pg.linkNotice.ok} role="status">
      <span>{pg.linkNotice.text}</span>
      <button onclick={() => (pg.linkNotice = null)} aria-label="Close" title="Close">✕</button>
    </div>
  {/if}

  <!-- Row 2: the sound being edited, and time (shared by the drums and the sequencer). The course has its own sound for each page. -->
  {#if pg.view !== "course"}
  <section class="soundbar">
    <div class="group sound">
      <div class="parts" role="group" aria-label="Part" title="Which sound the controls and presets edit{pg.hw(' (Shift + any key on the MiniLab)')}">
        {#each ["keys", "seq"] as const as part (part)}
          <button class:active={pg.part === part && !pg.drumsSelected} onclick={() => pg.selectPart(part)}>
            <span class="part-name">{PART_NAMES[part]}</span>
            <span class="part-preset"><Marquee text={pg.presetOf(part).name} /></span>
          </button>
        {/each}
        <!-- The song track selected last: its sound can be edited from any view (and the keys play it while it is selected). -->
        {#if pg.lastTrack && pg.parts[pg.lastTrack]}
          <button class="track-part" class:active={pg.part === pg.lastTrack && !pg.drumsSelected} onclick={() => pg.selectPart(pg.lastTrack!)} title="A song track: the keys play it while it is selected">
            <span class="part-name"><Marquee text={pg.partName(pg.lastTrack)} /></span>
            <span class="part-preset"><Marquee text={pg.presetOf(pg.lastTrack).name} /></span>
          </button>
        {/if}
      </div>
      <button onclick={() => pg.stepPreset(-1)} aria-label="Previous preset" title="Previous preset in the browser's list{pg.hw(' (or turn the encoder)')}">◀</button>
      <div class="preset-wrap">
        <button class="preset-btn" class:open={pg.browserOpen} onclick={() => (pg.browserOpen = !pg.browserOpen)} aria-expanded={pg.browserOpen} title="Browse presets: search, categories, favourites, preview">
          <span class="pdot" style:background={accent}></span>
          <span class="pname">{pg.preset.name}</span>
          <span class="pmeta">{presetMeta}</span>
          <span class="chev">▾</span>
        </button>
        {#if pg.browserOpen}<PresetBrowser {pg} onclose={() => (pg.browserOpen = false)} />{/if}
      </div>
      <button onclick={() => pg.stepPreset(1)} aria-label="Next preset" title="Next preset in the browser's list{pg.hw(' (or turn the encoder)')}">▶</button>
      <span class="break"></span>
      <button onclick={() => pg.dice()} title="Random patch{pg.hw(' (hold the encoder down)')}">🎲 Dice</button>
      <div class="undo" role="group" aria-label="Undo and redo">
        <button disabled={!pg.canUndo} onclick={() => pg.undoSound()} aria-label="Undo" title={pg.undoLabel ? `Undo ${pg.undoLabel}${pg.view === "song" ? "" : ` (Ctrl+Z${pg.hw(" · Shift + pitch strip down")})`}` : "Nothing to undo"}>↶</button>
        <button disabled={!pg.canRedo} onclick={() => pg.redoSound()} aria-label="Redo" title={pg.redoLabel ? `Redo ${pg.redoLabel}${pg.view === "song" ? "" : ` (Ctrl+Shift+Z${pg.hw(" · Shift + pitch strip up")})`}` : "Nothing to redo"}>↷</button>
      </div>
      {#if pg.browseId !== null}
        <span class="browse">Encoder: {pg.presets.find((p) => p.id === pg.browseId)?.name}, click to load</span>
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
    </div>

    <div class="group transport" role="group" aria-label="Transport">
      <button class:active={pg.playing} data-guide="play" onclick={() => pg.togglePlay()} title="Play / stop the drums and the step sequencer{pg.hw(' (Shift + ▶)')}">{pg.playing ? "■" : "▶"}</button>
      <button class="rec" class:active={pg.recording} onclick={() => pg.toggleRecord()} title="{pg.view === 'song' || pg.editClip?.kind === 'drums' ? 'Record into a clip' : 'Record pads into the drum loop'}{pg.hw(' (Shift + ●)')}">●</button>
      <label class="bpm" data-guide="tempo" title={pg.hw("Shift + knobs 2–8 on the MiniLab") || undefined}>
        <input type="number" min="40" max="240" value={pg.bpm} onchange={(e) => pg.setBpm(+e.currentTarget.value)} />
        BPM
      </label>
      <button onclick={() => pg.tap()} title="Tap tempo{pg.hw(' (Shift + Tap)')}">Tap</button>
      {#if pg.songPlays && pg.view !== "song"}
        <button class="song-on" onclick={() => pg.setView("song")} title="The song plays along with the toys, on the same clock and tempo. Click to open the Song view">Song ▶</button>
      {/if}
      {#if pg.outputRec}
        <button class="outrec" onclick={() => pg.toggleOutputRecording()} title="Recording what you hear: click to stop">
          ● {clock(pg.outputRec.seconds)} ■
        </button>
      {:else if pg.recordedWav && !pg.recordedWav.saved}
        <button class="outrec" onclick={() => pg.saveRecording()} title="Save the recording as a WAV file">Save {clock(pg.recordedWav.seconds)}</button>
        <button class="outrec" onclick={() => confirm("Throw the recording away?") && pg.discardRecording()} aria-label="Discard the recording" title="Throw the recording away">✕</button>
      {/if}
    </div>
  </section>
  {/if}

  <div class="main" class:guided>
  <div class="view">
  {#if pg.view === "playground"}
    <div class="play">
      <section class="surface panel" aria-label={pg.hasDevice ? "The MiniLab's knobs and faders" : "The preset's main controls"}>
        <!-- The strips only show what the MiniLab's strips do: no MiniLab, no strips. -->
        {#if pg.hasDevice}
        <div class="strips">
          <div class="strip" title="Pitch bend strip">
            <div class="bend" style:top="{50 - Math.max(0, pg.bend) * 50}%" style:bottom="{50 + Math.min(0, pg.bend) * 50}%"></div>
            <div class="center"></div>
            <span>Pitch</span>
          </div>
          <div class="strip" title="Mod strip: adds LFO to {LFO_TARGETS[pg.parts[pg.playerPart].values.modTarget]} ({pg.partName(pg.playerPart)} part). Shift + mod strip on the MiniLab: the scale's root">
            <div class="mod" style:height="{pg.mod * 100}%"></div>
            <span>Mod</span>
          </div>
        </div>
        {/if}

        <div class="knobs">
          {#each pg.preset.knobs as id, i (i)}
            <Knob
              number={pg.hasDevice ? i + 1 : undefined}
              label={PARAMS[id].label}
              display={display(id)}
              position={toControl(id, shown(id))}
              hot={pg.touched?.param === id}
              size={46}
              onchange={(t) => pg.setKnob(i, t)}
              onreset={() => resetParam(id)}
            />
          {/each}
        </div>

        <div class="faders">
          {#each FADERS as id, i (id)}
            {#if pg.shift}
              <!-- Shift held on the MiniLab: the faders pick the arpeggiator, the scale and chord mode. -->
              {@const state = pg.shiftFaderState(i)}
              <Fader label={SHIFT_FADERS[i]} display={state.display} position={state.position} hot height={96} onchange={(t) => pg.setShiftFader(i, t)} />
            {:else}
              <Fader
                label={PARAMS[id].label}
                display={display(id)}
                position={toControl(id, shown(id))}
                hot={pg.touched?.param === id}
                height={96}
                onchange={(t) => pg.setFader(i, t)}
              />
            {/if}
          {/each}
        </div>
        {#if pg.explain}
          <p class="surface-note">{#if pg.hasDevice}The MiniLab's knobs and faders. Each preset puts its main controls on the knobs{:else}Each preset puts its main controls here, and the amp envelope on the faders{/if}; the <b>Synth</b> view has the rest.</p>
        {/if}
      </section>

      <section class="panel main-viz">
        <div class="tabs">
          <button class:active={pg.vizMode === "scope"} onclick={() => (pg.vizMode = "scope")}>Waveform</button>
          <button class:active={pg.vizMode === "spectrum"} onclick={() => (pg.vizMode = "spectrum")}>Spectrum</button>
          <button class:active={pg.vizMode === "spectrogram"} onclick={() => (pg.vizMode = "spectrogram")} title="The spectrum over time: time runs right to left, higher pitches higher up, brighter is louder">Spectrogram</button>
          {#if pg.hasDevice}<span class="hint" class:shifted={pg.shift}>Shift + encoder: next view</span>{/if}
        </div>
        <div class="canvas">
          {#if pg.vizMode === "scope"}
            <Scope analyser={pg.engine.analyser} color={accent} />
          {:else if pg.vizMode === "spectrum"}
            <Spectrum analyser={pg.engine.analyser} color={accent} />
          {:else}
            <canvas class="spectrogram" use:surface={{ draw: spectrogram(() => pg.engine.analyser, () => accent), animate: true }}></canvas>
          {/if}
        </div>
      </section>
    </div>

    <section class="rhythm">
      <div class="rhythm-bar">
        <div class="seg" role="tablist" aria-label="Rhythm">
          <button role="tab" aria-selected={rhythm === "seq"} class:active={rhythm === "seq"} data-guide={rhythm === "seq" ? undefined : "send-steps"} onclick={() => (rhythm = "seq")}>
            Step sequencer <i class="dot" class:on={pg.ownNoteSeq.enabled}></i>
          </button>
          <button role="tab" aria-selected={rhythm === "drums"} class:active={rhythm === "drums"} data-guide={rhythm === "drums" ? undefined : "send-drums drum-grid"} onclick={() => (rhythm = "drums")}>
            Drums <i class="dot" class:on={pg.drumsOn}></i>
          </button>
        </div>
        <span class="hint">Both play together with ▶, in time with each other.</span>
      </div>

      {#if pg.editClip}
        {@const c = pg.editClip}
        <div class="clip-banner" style:--track={trackCss(editTrack?.color ?? 0)}>
          <span class="clip-what">Editing clip <b>{c.name}</b>{editTrack ? ` on ${editTrack.name}` : ""}: what you change here is heard in the song.</span>
          {#if c.kind === "drums" && c.bars > 1}
            <span class="clip-bars" role="group" aria-label="Bar of the clip">
              {#each Array.from({ length: c.bars }, (_, k) => k) as k (k)}
                <button class:active={pg.editBar === k} onclick={() => pg.setEditBar(k)}>Bar {k + 1}</button>
              {/each}
            </span>
          {/if}
          <button class="clip-back" data-guide="back-to-pattern" onclick={() => pg.endClipEdit()} title="The drum loop and the step sequencer edit their own patterns again">Back to my pattern</button>
        </div>
      {/if}

      {#if rhythm === "drums"}
        {@const clip = pg.editClip?.kind === "drums" ? pg.editClip : null}
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
                  Pads{#if pg.hasDevice}{" "}<span class="bank">A: drums · B: favourite presets</span>{/if}
                {/if}
              </div>
              <div class="pad-modes">
                <button class:active={pg.stepMode} onclick={() => pg.toggleStepMode()} title={pg.hw("Shift + encoder click") || undefined}>Step edit</button>
                {#if pg.seqEdit}
                  <button class:active={pg.bank === "A"} onclick={() => (pg.bank = "A")} title="Pad bank A">Steps</button>
                  <button class:active={pg.bank === "B"} onclick={() => (pg.bank = "B")} title="Pad bank B">Slides</button>
                {:else if pg.stepMode}
                  <button class:active={pg.bank === "A"} onclick={() => (pg.bank = "A")} title={pg.hw("Pad bank A") || undefined}>1–8</button>
                  <button class:active={pg.bank === "B"} onclick={() => (pg.bank = "B")} title={pg.hw("Pad bank B") || undefined}>9–16</button>
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
          <div class="panel seq-panel" class:muted={!clip && !pg.drumsOn}>
            <div class="title seq-title">
              {#if clip}
                Drum clip · {clip.name}{clip.bars > 1 ? ` · bar ${pg.editBar + 1}` : ""}
              {:else}
                Drum loop {pg.recording && !pg.take ? "· recording pad hits" : ""}
                <button class:active={pg.drumsOn} onclick={() => pg.setDrumsOn(!pg.drumsOn)} title="Mute the drum loop (the sequencer keeps playing)">
                  {pg.drumsOn ? "On" : "Off"}
                </button>
                <button class="send" data-guide="send-drums" onclick={() => pg.sendDrumsToSong()} title="Copy the drum loop into a new clip on the song's drum track">Send to song</button>
              {/if}
              <button class="clear" onclick={() => pg.clearPattern()} title="{clip ? 'Clear this bar of the clip' : 'Clear the drum loop'}{pg.hw(' (Shift + ⟲)')}">Clear</button>
            </div>
            <div class="grid-wrap" data-guide="drum-grid">
            <SeqGrid
              pattern={pg.pattern}
              getStep={() => pg.gridStep()}
              levels={pg.padLevels}
              selected={pg.stepMode ? pg.stepTrack : null}
              ontoggle={(t, s) => pg.toggleStep(t, s)}
              onselect={(t) => pg.selectTrack(t)}
            />
            </div>
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
  {:else if pg.view === "song"}
    <SongView {pg} />
  {:else if pg.view === "course"}
    <CourseView {pg} {accent} />
  {:else}
    <AboutPage {pg} />
  {/if}
  </div>
  {#if guided}<GuidePanel {pg} />{/if}
  </div>

  <!-- Learn on a phone: the page's controls and the keyboard stay along the bottom of the screen while the page scrolls. -->
  <div class="dock" class:docked>
  {#if docked}<CourseControls {pg} docked />{/if}
  <section class="panel keys" class:folded={!keysOpen} data-guide="keys">
    <div class="keys-head">
      {#if !docked}<ChordDisplay {pg} />{/if}
      {#if pg.view !== "course"}
        <ArpBar {pg} />
        <ScaleBar {pg} />
      {/if}
      {#if !pg.hasDevice || narrow.current}
        <!-- Without a MiniLab, the computer keyboard plays: which notes, and Z / X to move them. On a phone the on-screen keys show the same notes. -->
        <div class="qwerty" title={touch.current ? undefined : "The octave the computer keyboard plays: A to ' (W, E, T… are the black keys) play the notes shown here. Z / X move it down or up an octave."}>
          <span class="label">Octave</span>
          <button onclick={(e) => { pg.shiftKeyOctave(-1); e.currentTarget.blur(); }} disabled={pg.keyOctave <= -3} aria-label="Octave down (Z)">{#if !touch.current}<kbd>Z</kbd> {/if}◀</button>
          <span class="range">{noteName(60 + pg.keyOctave * 12)}–{noteName(77 + pg.keyOctave * 12)}</span>
          <button onclick={(e) => { pg.shiftKeyOctave(1); e.currentTarget.blur(); }} disabled={pg.keyOctave >= 3} aria-label="Octave up (X)">▶{#if !touch.current} <kbd>X</kbd>{/if}</button>
        </div>
      {/if}
      <button class="fold" onclick={toggleKeys} aria-expanded={keysOpen} title="{keysOpen ? 'Hide' : 'Show'} the on-screen keyboard. {pg.hasDevice ? 'The MiniLab and the computer keyboard' : 'The computer keyboard'} (A–' row) play{pg.hasDevice ? '' : 's'} either way">
        Keyboard <span class="chev">{keysOpen ? "▾" : "▴"}</span>
      </button>
    </div>
    {#if keysOpen}
      <!-- A phone has room for an octave and a half: the same notes as the computer keyboard's octave. -->
      <Keyboard
        from={narrow.current ? 60 + pg.keyOctave * 12 : 36}
        to={narrow.current ? 77 + pg.keyOctave * 12 : 84}
        notes={keyboardNotes}
        held={heldNotes}
        onnoteon={(n) => pg.noteOn(n, pg.rec.velocity)}
        onnoteoff={(n) => pg.noteOff(n)}
        playable={(n) => pg.drumsSelected || playable(n, pg.scale)}
        root={pg.scale.scale === "off" || pg.drumsSelected ? null : pg.scale.root}
        label={pg.drumsSelected ? (n) => pg.drumOfKey(n) : undefined}
      />
    {/if}
  </section>
  </div>

  {#if !pg.audioRunning}
    <button class="start" onclick={() => pg.startAudio()}>
      {#if touch.current}
        <span class="big">Tap to start audio</span>
        <span>Browsers only allow sound after a tap.</span>
      {:else}
        <span class="big">Click to start audio</span>
        <span>Browsers only allow sound after a click.</span>
        <span>Everything works with the mouse, and your computer keyboard plays notes (A to ').</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  /* One column that may be narrower than its content: rows like the sound bar then shrink to the window instead of widening the page. */
  .app { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 8px 16px 12px; max-width: 1400px; margin: 0 auto; }
  /* The view, and a lesson's guide beside it (under it below 1100 px). */
  .app:has(.main.guided) { max-width: 1740px; }
  .main, .view { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; min-width: 0; }
  .main.guided { grid-template-columns: minmax(0, 1fr) 330px; gap: 12px; align-items: start; }
  @media (max-width: 1100px) {
    .main.guided { grid-template-columns: minmax(0, 1fr); }
  }
  .hint { color: var(--dim); font-size: 12px; }
  .shifted { color: var(--accent); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }

  /* ---- header row 1: views and app state */
  .top { display: flex; align-items: center; gap: 14px; min-width: 0; }
  h1 { margin: 0; font-size: 17px; letter-spacing: 0.02em; white-space: nowrap; }
  h1 span { color: var(--accent); font-weight: 400; }
  .top > :not(.midi, .extras), .extras > :not(.midi) { flex: none; }
  .extras { display: contents; }
  .more { display: none; }
  .views { display: flex; gap: 2px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .views button { border: none; background: none; font-size: 13px; padding: 4px 16px; border-radius: 4px; color: var(--dim); }
  /* Room for the bold label is kept on every tab, so picking one doesn't change the bar's width. */
  .views button { display: inline-grid; justify-items: center; }
  .views button::after { content: attr(data-label); font-weight: 600; height: 0; visibility: hidden; overflow: hidden; }
  .views button:hover { color: var(--text); }
  /* A flask in the corner: the Song view is still experimental. Out of the flow, so the label stays centred. */
  .views button:has(.experimental) { position: relative; }
  .experimental { position: absolute; top: 2px; right: 2px; width: 10px; height: 10px; fill: none; stroke: #ffb15c; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
  .views .active .experimental { stroke: #0b1314; }
  .views .active, .views .active:hover { background: var(--accent); color: #0b1314; font-weight: 600; }
  .recipes-link { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); font-size: 13px; padding: 4px 12px; }
  .recipes-link.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  /* Pushed to the right; the hint shortens first, and the row wraps before the button is covered. */
  .midi { display: flex; align-items: center; gap: 10px; flex: 0 1 auto; min-width: 140px; margin-left: auto; }
  .midi .hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .midi button { flex: none; }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; white-space: nowrap; }
  .pill.ok { color: var(--accent); border-color: var(--accent); }
  .pill.connect { background: none; color: var(--dim); }
  .pill.connect:hover { color: var(--text); border-color: var(--dim); }
  .connect .opt { font-size: 10px; opacity: 0.7; margin-left: 4px; }
  .shift { border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; font-size: 12px; color: var(--dim); transition: all 0.08s; }
  .shift.on { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; box-shadow: 0 0 12px var(--accent); }
  .cpu {
    font: 11px var(--mono); color: var(--dim); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; min-width: 64px; text-align: center; white-space: nowrap;
    background: linear-gradient(to right, color-mix(in srgb, var(--accent) 30%, transparent) calc(var(--load) * 100%), transparent 0);
  }
  .cpu.hot { color: #ff6b6b; border-color: #ff6b6b; }
  .about-link { background: none; border: none; color: var(--dim); font-size: 12px; padding: 4px 2px; white-space: nowrap; }
  .about-link:hover { color: var(--text); }
  .about-link.active { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }

  /* ---- header row 2: the sound and time */
  /* The transport moves to a row of its own only when the sound controls no longer fit (the preset name shrinks first). */
  .soundbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
  .group button { white-space: nowrap; }
  .group { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #0f1416; border: 1px solid var(--line); border-radius: 8px; }
  .sound { flex: 1 1 0; min-width: min-content; }
  .parts { display: flex; gap: 2px; margin-right: 6px; }
  /* A fixed size, so loading a preset with a longer name doesn't move the rest of the row. */
  .parts button { display: grid; width: 150px; text-align: left; padding: 3px 12px; line-height: 1.25; }
  .parts button.active { border-color: var(--accent); }
  .part-name { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }
  .parts button.active .part-name { color: var(--accent); }
  .part-preset { font-size: 13.5px; min-width: 0; }
  .preset-wrap { position: relative; flex: 0 1 270px; min-width: 170px; }
  .preset-btn { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 4px 10px; text-align: left; }
  .preset-btn.open { border-color: var(--accent); }
  .pdot { width: 9px; height: 9px; border-radius: 50%; flex: none; align-self: center; }
  .pname { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pmeta { font-size: 11px; color: var(--dim); white-space: nowrap; flex: 1; }
  .preset-btn .chev { font-size: 10px; color: var(--dim); }
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
  .transport .song-on { color: #7fe0d0; border-color: #7fe0d0; font-size: 12px; }
  .transport .outrec { color: #ff6b6b; border-color: #ff6b6b; font: 12px var(--mono); }
  .bpm { display: flex; align-items: center; gap: 4px; color: var(--dim); font-size: 12px; }
  .bpm input { width: 52px; padding: 4px 6px; text-align: center; font: 13px var(--mono); color: var(--text); appearance: textfield; }
  .bpm input::-webkit-inner-spin-button, .bpm input::-webkit-outer-spin-button { appearance: none; margin: 0; }

  /* ---- Play view: the MiniLab's controls and the sound, then the rhythm */
  /* The controls take the width they need; the visualiser gets the rest. */
  .play { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; }
  .surface { display: grid; grid-template-columns: auto 1fr auto; column-gap: 24px; align-items: center; padding: 8px 14px; }
  .surface-note { grid-column: 1 / -1; width: 0; min-width: 100%; margin: 4px 0 0; font-size: 11.5px; color: #a9b6ba; }
  .strips { display: flex; gap: 8px; }
  .strip { width: 28px; height: 136px; background: #0b0e10; border-radius: 5px; position: relative; overflow: hidden; }
  .strip span { position: absolute; bottom: 4px; width: 100%; text-align: center; font-size: 10px; color: var(--dim); }
  .strip .center { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: #fff3; }
  .strip .bend { position: absolute; left: 0; right: 0; background: var(--accent); opacity: 0.7; }
  .strip .mod { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); opacity: 0.7; }
  .knobs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 8px; }
  .faders { display: grid; grid-template-columns: repeat(4, 58px); }
  .main-viz { display: flex; flex-direction: column; min-height: 200px; }
  .canvas { position: relative; flex: 1; min-height: 0; border-radius: 4px; background: #0b0e10; }
  .spectrogram { position: absolute; inset: 0; width: 100%; height: 100%; display: block; border-radius: 4px; }
  .tabs { display: flex; gap: 4px; align-items: center; margin-bottom: 6px; }
  .tabs button { font-size: 12px; padding: 2px 10px; }
  .tabs .active { border-color: var(--accent); color: var(--accent); }
  .tabs .hint { margin-left: auto; font-size: 11px; }

  .rhythm { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
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

  /* What opening a link did (or why it couldn't). */
  .link-notice {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; border: 1px solid var(--accent); border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 12%, var(--panel)); font-size: 13px;
  }
  .link-notice span { flex: 1; min-width: 0; }
  .link-notice.bad { border-color: #ff7a5c; background: color-mix(in srgb, #ff7a5c 12%, var(--panel)); }
  .link-notice button { flex: none; padding: 2px 8px; }

  /* "Edit in Play": which clip the editors below work on, in its track's colour. */
  .clip-banner {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
    padding: 6px 10px; border: 1px solid var(--track); border-radius: 6px;
    background: color-mix(in srgb, var(--track) 12%, var(--panel)); font-size: 12px;
  }
  .clip-what { flex: 1 1 260px; }
  .clip-bars { display: flex; gap: 2px; }
  .clip-banner button { font-size: 12px; padding: 2px 10px; }
  .clip-bars .active { border-color: var(--track); color: var(--track); }
  .clip-back { margin-left: auto; }
  .pad-modes { display: flex; gap: 4px; flex: none; }
  .bank { text-transform: none; letter-spacing: 0; }
  .pad-modes button { font-size: 12px; padding: 2px 10px; }
  .pad-modes .active { border-color: var(--accent); color: var(--accent); }

  /* ---- the keyboard, on every view */
  .dock { display: grid; gap: 6px; min-width: 0; }
  .dock.docked {
    position: sticky; bottom: 0; z-index: 5; margin: 0 -10px -12px; padding: 6px 10px 8px;
    background: var(--bg); border-top: 1px solid var(--line); box-shadow: 0 -8px 20px #0008;
  }
  .docked .keys { padding: 6px 8px; }
  .docked .keys-head { min-height: 0; margin-bottom: 6px; justify-content: space-between; }
  .docked .qwerty { margin-left: 0; }
  .keys { padding: 8px 10px; }
  /* One row when it fits; with the arpeggiator and the scale both open on a narrow window, the scale wraps below. */
  .keys { min-width: 0; }
  .keys-head { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; min-height: 32px; margin-bottom: 8px; }
  .keys.folded .keys-head { margin-bottom: 0; }
  .fold { flex: none; display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 10px; color: var(--dim); }
  .fold:hover { color: var(--text); }
  .chev { font-size: 10px; }
  .qwerty { flex: none; display: flex; align-items: center; gap: 6px; font-size: 12px; margin-left: auto; }
  .qwerty .label { color: var(--dim); }
  .qwerty button { padding: 1px 6px; font-size: 11px; color: var(--dim); }
  .qwerty button:hover:not(:disabled) { color: var(--text); }
  .qwerty kbd { font: 600 10px var(--mono); color: var(--text); }
  .qwerty .range { min-width: 58px; text-align: center; font: 12px var(--mono); color: var(--accent); }

  @media (max-width: 1100px) {
    .top { flex-wrap: wrap; }
  }
  @media (max-width: 1000px) {
    /* The sound controls wrap, so the transport takes a short row of its own instead of a tall box beside them. */
    .sound { flex-wrap: wrap; flex-basis: 100%; }
    .play { grid-template-columns: 1fr; }
    .main-viz { height: 200px; }
    .drums { grid-template-columns: 1fr; }
  }
  @media (max-width: 800px) {
    .surface { grid-template-columns: 1fr; justify-items: center; row-gap: 12px; }
    .sound { flex-wrap: wrap; }
  }
  .break { display: none; }
  /* Phones: one header row (the views and ⋯), the sound bar in rows that fill the width. Matches `narrow` in media.svelte.ts. */
  @media (max-width: 700px) {
    .app { padding: 8px 10px 12px; }
    .top { flex-wrap: nowrap; gap: 8px; position: relative; }
    h1 { font-size: 15px; }
    .views { flex: 1 1 auto; min-width: 0; }
    .views button { flex: 1 1 auto; padding: 6px 8px; }
    .views button:has(.experimental) { padding-right: 14px; }
    .more { display: block; flex: none; font-size: 18px; line-height: 1; padding: 5px 12px; }
    .more.open { border-color: var(--accent); color: var(--accent); }
    .extras { display: none; }
    .extras.open {
      display: flex; flex-direction: column; align-items: flex-start; gap: 12px; position: absolute; top: calc(100% + 6px); right: 0; z-index: 25;
      width: min(320px, calc(100vw - 20px)); padding: 12px; background: #10171a; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 10px 30px #000a;
    }
    .extras .midi { margin-left: 0; flex-wrap: wrap; min-width: 0; }
    .extras .midi .hint { white-space: normal; }
    .about-link { padding: 4px 0; font-size: 13px; }

    .soundbar { gap: 6px; }
    .parts { flex: 1 1 100%; margin-right: 0; }
    .parts button { flex: 1 1 0; width: auto; min-width: 0; }
    .preset-wrap { flex: 1 1 0; min-width: 0; }
    .break { display: block; flex-basis: 100%; height: 0; }
    .transport { flex: 1 1 auto; }
    /* The changes list: a sheet along the bottom of the screen. */
    .changes { position: fixed; top: auto; left: 10px; right: 10px; bottom: 10px; width: auto; max-height: 60vh; }
    .rhythm-bar .hint { display: none; }
  }
  @media (max-width: 560px) {
    h1 { display: none; }
  }
  /* Five views beside ⋯ on the smallest phones. */
  @media (max-width: 400px) {
    .views button { padding: 6px 4px; font-size: 12.5px; }
    .views button:has(.experimental) { padding-right: 14px; }
  }

  /* Touch screens: fingers need bigger targets than a mouse. */
  @media (pointer: coarse) {
    .tabs button, .seg button, .pad-modes button, .seq-title button { padding: 7px 12px; }
    .undo button { min-width: 40px; padding: 6px; }
    .qwerty button, .fold { padding: 6px 12px; }
    .changes li { padding: 4px 0; }
    .c-revert { padding: 4px 10px; }
  }
  .start {
    position: fixed; inset: 0; background: #0b0e10e0; border: none; border-radius: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; color: var(--dim); cursor: pointer; z-index: 10;
  }
  .start .big { font-size: 28px; color: var(--accent); }
</style>
