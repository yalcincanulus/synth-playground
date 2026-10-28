<script lang="ts">
  import { onMount } from "svelte";
  import { DRUM_NAMES } from "../../audio/drums";
  import { RATES } from "../../audio/stepSequencer";
  import { CLIP_KIND_NAMES, clipBeats, MAX_BARS, type Clip } from "../../song/clips";
  import { MAX_SYNTH_TRACKS, MAX_TRACK_VOICES, VOLUME_MAX, VOLUME_MIN, type Track } from "../../song/song";
  import { surface, type Surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";
  import { trackCss as css } from "./trackColor";

  interface Props {
    pg: Playground;
  }
  let { pg }: Props = $props();

  const volumeText = (db: number) => (db <= VOLUME_MIN ? "off" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`);
  const panText = (pan: number) => (Math.abs(pan) < 0.01 ? "C" : `${pan < 0 ? "L" : "R"} ${Math.round(Math.abs(pan) * 100)}`);
  const synthCount = $derived(pg.songTracks.filter((t) => t.kind === "synth").length);
  const anySolo = $derived(pg.songTracks.some((t) => t.solo));

  function rename(t: Track, input: HTMLInputElement) {
    pg.setSongTrack(t.id, { name: input.value });
    // An empty name keeps the old one: show it again.
    input.value = pg.songTracks.find((x) => x.id === t.id)?.name ?? t.name;
  }

  function remove(t: Track) {
    if (confirm(`Remove the track "${t.name}" and its sound?`)) pg.removeSongTrack(t.id);
  }

  /** Open the preset browser (in the sound bar above) on this track's sound. */
  function browse(t: Track, e: MouseEvent) {
    e.stopPropagation();
    pg.selectSongTrack(t.id);
    pg.browserOpen = true;
  }

  // The playing clips' progress bars move with the music: redrawn every frame while the transport plays.
  let frame = $state(0);
  onMount(() => {
    let raf = 0;
    const tick = () => {
      if (pg.playing) frame++;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
  /** How far through its loop a clip is, 0..1 (0 when it isn't playing). */
  function progress(c: Clip) {
    if (frame < 0) return 0;
    const beat = pg.clipBeatNow(c.id);
    return beat < 0 ? 0 : beat / clipBeats(c);
  }

  /** What a clip holds, in a few words. */
  function summary(c: Clip) {
    if (c.kind === "drums") {
      const hits = c.patterns.reduce((n, p) => n + p.flat().filter((v) => v > 0).length, 0);
      return `${hits} hit${hits === 1 ? "" : "s"}`;
    }
    if (c.kind === "steps") return `${c.seq.length} steps · ${c.seq.free ? "Free clock" : RATES[c.seq.rate].name}`;
    return `${c.notes.length} note${c.notes.length === 1 ? "" : "s"}`;
  }

  /** The launcher's state of a clip: chosen for its track, playing now, waiting for the next bar, or about to stop. */
  function launchState(c: Clip) {
    const st = pg.clipLaunch[c.track];
    const chosen = st?.clip === c.id;
    return { chosen, playing: chosen && pg.playing, waiting: st?.next === c.id, stopping: chosen && st?.next !== undefined };
  }

  let clip = $derived(pg.selectedClipData);
  let clipTrack = $derived(clip ? pg.songTracks.find((t) => t.id === clip?.track) : undefined);

  function renameClip(c: Clip, input: HTMLInputElement) {
    pg.renameClip(c.id, input.value);
    input.value = pg.songClips.find((x) => x.id === c.id)?.name ?? c.name;
  }

  function removeClip(c: Clip) {
    if (confirm(`Delete the clip "${c.name}"?`)) pg.removeClip(c.id);
  }

  /** One meter per track, kept across redraws (so its level falls back smoothly). */
  const meters = new Map<string, ReturnType<typeof makeMeter>>();
  const meter = (id: string) => meters.get(id) ?? meters.set(id, makeMeter(id)).get(id)!;

  /** A level meter: the strip's peak in dB, falling back slowly, as a bar from -48 dB to 0 dB. */
  function makeMeter(id: string) {
    const buf = new Float32Array(512);
    let level = 0;
    return {
      animate: true,
      idle: () => level < 0.002 && !pg.audioRunning,
      draw: ({ g, w, h }: Surface) => {
        const node = pg.songTrackStrip(id)?.meter;
        let peak = 0;
        if (node) {
          node.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        }
        const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        const target = Math.max(0, Math.min(1, (db + 48) / 48));
        level = target > level ? target : level * 0.92 + target * 0.08;
        g.fillStyle = "#1c2326";
        g.fillRect(0, 0, w, h);
        g.fillStyle = level > 0.94 ? "#ff7a5c" : "#7fe0d0";
        g.fillRect(0, 0, w * level, h);
      },
    };
  }
</script>

<section class="song panel" aria-label="Song">
  <div class="head">
    <h2>Tracks</h2>
    <button onclick={() => pg.addSongTrack()} disabled={!pg.canAddSongTrack} title={pg.canAddSongTrack ? "A new synth track with a sound of its own" : `Up to ${MAX_SYNTH_TRACKS} synth tracks`}>+ Synth track</button>
    <span class="count">{synthCount} of {MAX_SYNTH_TRACKS} synth tracks</span>
    <span class="history">
      <button disabled={!pg.canUndoSong} onclick={() => pg.undoSong()} aria-label="Undo in the song" title={pg.songUndoLabel ? `Undo ${pg.songUndoLabel} (Ctrl+Z)` : "Nothing to undo in the song"}>↶</button>
      <button disabled={!pg.canRedoSong} onclick={() => pg.redoSong()} aria-label="Redo in the song" title={pg.songRedoLabel ? `Redo ${pg.songRedoLabel} (Ctrl+Shift+Z)` : "Nothing to redo in the song"}>↷</button>
    </span>
  </div>
  {#if pg.explain}
    <p class="explain">
      Each track has a sound of its own. Select a track to edit its sound (the Synth view and the presets follow it) and to play it from the keys. With the drums
      selected, the keys from C to G play the drum kit. The mixer sets how loud each track is and where it sits left to right; <strong>M</strong> mutes a track,
      <strong>S</strong> plays only the soloed ones.
      Below each track are its <strong>clips</strong>: short patterns that loop. ▶ plays a clip on its track (from the next bar while the music plays; ■ stops it at the
      next bar). Send the Play view's drum loop or step sequence here with <strong>Send to song</strong>, or make a new clip with <strong>+</strong>, then click a clip's
      name to rename it, set its length or change it with <strong>Edit in Play</strong>. The Play view's drums and step sequencer keep playing on top of the song.
    </p>
  {/if}

  <ol class="tracks">
    {#each pg.songTracks as t, i (t.id)}
      <li class="track" class:selected={pg.selectedSongTrack === t.id} class:silent={t.mute || (anySolo && !t.solo)} style:--track={css(t.color)}>
        <button class="swatch" onclick={() => pg.cycleSongTrackColor(t.id)} aria-label="Colour of {t.name}" title="Change the colour"></button>
        <button class="select" onclick={() => pg.selectSongTrack(t.id)} aria-pressed={pg.selectedSongTrack === t.id} title={t.kind === "synth" ? "Select: edit this sound and play it from the keys" : "Select: the keys from C to G play the drum kit"}>
          {pg.selectedSongTrack === t.id ? "●" : "○"}
        </button>
        <input class="name" value={t.name} maxlength="16" aria-label="Track name" onchange={(e) => rename(t, e.currentTarget)} onfocus={() => pg.selectSongTrack(t.id)} />

        <div class="sound">
          {#if t.kind === "synth"}
            <button class="step" onclick={() => { pg.selectSongTrack(t.id); pg.stepPreset(-1); }} aria-label="Previous preset">◀</button>
            <button class="preset" onclick={(e) => browse(t, e)} title="Browse presets for this track">
              {pg.presetOf(t.id).name}{pg.parts[t.id]?.dirty ? " *" : ""}
            </button>
            <button class="step" onclick={() => { pg.selectSongTrack(t.id); pg.stepPreset(1); }} aria-label="Next preset">▶</button>
          {:else}
            <span class="kit" title={DRUM_NAMES.join(", ")}>Drum kit · 8 drums</span>
          {/if}
        </div>

        {#if t.kind === "synth"}
          <label class="voices" title="Most notes this track plays at once (within its sound's own Max Voices). Fewer spares the computer.">
            <select value={t.voices} onchange={(e) => pg.setSongTrack(t.id, { voices: +e.currentTarget.value })}>
              {#each Array.from({ length: MAX_TRACK_VOICES }, (_, k) => k + 1) as n (n)}<option value={n}>{n}</option>{/each}
            </select>
            voices
          </label>
        {:else}
          <span class="voices"></span>
        {/if}

        <label class="slider vol" title="Volume (double-click: 0 dB)">
          <input type="range" min={VOLUME_MIN} max={VOLUME_MAX} step="0.5" value={t.volume} oninput={(e) => pg.setSongTrack(t.id, { volume: +e.currentTarget.value })} ondblclick={() => pg.setSongTrack(t.id, { volume: 0 })} aria-label="Volume of {t.name}" />
          <span class="val">{volumeText(t.volume)}</span>
        </label>
        <label class="slider pan" title="Pan: left to right (double-click: centre)">
          <input type="range" min="-1" max="1" step="0.02" value={t.pan} oninput={(e) => pg.setSongTrack(t.id, { pan: +e.currentTarget.value })} ondblclick={() => pg.setSongTrack(t.id, { pan: 0 })} aria-label="Pan of {t.name}" />
          <span class="val">{panText(t.pan)}</span>
        </label>
        <div class="ms">
          <button class="mute" class:on={t.mute} onclick={() => pg.setSongTrack(t.id, { mute: !t.mute })} aria-pressed={t.mute} title="Mute">M</button>
          <button class="solo" class:on={t.solo} onclick={() => pg.setSongTrack(t.id, { solo: !t.solo })} aria-pressed={t.solo} title="Solo: hear only the soloed tracks">S</button>
        </div>
        <canvas class="meter" use:surface={meter(t.id)} aria-hidden="true"></canvas>

        <div class="order">
          <button onclick={() => pg.moveSongTrack(t.id, -1)} disabled={i === 0} aria-label="Move {t.name} up">↑</button>
          <button onclick={() => pg.moveSongTrack(t.id, 1)} disabled={i === pg.songTracks.length - 1} aria-label="Move {t.name} down">↓</button>
          {#if t.kind === "synth"}
            <button class="remove" onclick={() => remove(t)} aria-label="Remove {t.name}" title="Remove the track">✕</button>
          {:else}
            <span class="remove"></span>
          {/if}
        </div>

        <div class="clips" role="group" aria-label="Clips of {t.name}">
          {#each pg.clipsOf(t.id) as c (c.id)}
            {@const st = launchState(c)}
            <div class="clip" class:selected={pg.selectedClip === c.id} class:chosen={st.chosen} class:playing={st.playing} class:waiting={st.waiting} class:stopping={st.stopping}>
              <button
                class="launch"
                onclick={() => pg.launchClip(c.id)}
                aria-label="{st.playing && !st.stopping ? 'Stop' : 'Play'} {c.name}"
                title={st.waiting ? "Starts on the next bar (click to cancel)" : st.playing && !st.stopping ? "Stop this track at the next bar" : pg.playing ? "Play on this track from the next bar" : "Play"}
              >{st.playing && !st.stopping ? "■" : "▶"}</button>
              <button class="clip-name" onclick={() => pg.selectClip(pg.selectedClip === c.id ? null : c.id)} title="{CLIP_KIND_NAMES[c.kind]} · {c.bars} bar{c.bars > 1 ? 's' : ''} · {summary(c)}">
                {c.name}
              </button>
              {#if st.playing}<span class="progress" style:width="{progress(c) * 100}%"></span>{/if}
            </div>
          {/each}
          <button class="add-clip" onclick={() => pg.addClip(t.id)} title={t.kind === "drums" ? "A new empty drum clip" : "A new step clip, to change with Edit in Play"}>
            + {t.kind === "drums" ? "Drum clip" : "Step clip"}
          </button>
        </div>
      </li>
    {/each}
  </ol>

  {#if clip && clipTrack}
    <section class="clip-panel" style:--track={css(clipTrack.color)} aria-label="Clip">
      <span class="kind">{CLIP_KIND_NAMES[clip.kind]} · {clipTrack.name}</span>
      <input class="clip-title" value={clip.name} maxlength="16" aria-label="Clip name" onchange={(e) => renameClip(clip!, e.currentTarget)} />
      <label class="bars">
        Length
        <select value={clip.bars} onchange={(e) => pg.setClipBars(clip!.id, +e.currentTarget.value)}>
          {#each Array.from({ length: MAX_BARS[clip.kind] }, (_, k) => k + 1) as n (n)}<option value={n}>{n} bar{n > 1 ? "s" : ""}</option>{/each}
        </select>
      </label>
      <span class="summary">{summary(clip)}</span>
      <span class="push"></span>
      {#if clip.kind !== "notes"}
        <button onclick={() => pg.editInPlay(clip!.id)} title={clip.kind === "drums" ? "Change it in the Play view's drum loop (and with the pads)" : "Change it in the Play view's step sequencer (and on the MiniLab)"}>Edit in Play</button>
      {/if}
      <button onclick={() => pg.duplicateClip(clip!.id)} title="A copy of this clip on the same track">Duplicate</button>
      <button class="danger" onclick={() => removeClip(clip!)} title="Delete this clip">Delete</button>
      <button class="close" onclick={() => pg.selectClip(null)} aria-label="Close">✕</button>
    </section>
  {/if}
</section>

<style>
  .song { display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 14px; }
  .head button { font-size: 12px; padding: 3px 10px; }
  .count { font-size: 12px; color: var(--dim); }
  .history { margin-left: auto; display: flex; gap: 2px; }
  .history button { padding: 3px 10px; }
  .explain { margin: 0; font-size: 12px; color: #a9b6ba; line-height: 1.45; max-width: 900px; }

  .tracks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .track {
    display: grid;
    grid-template-columns: 10px 28px minmax(90px, 150px) minmax(160px, 1fr) 90px minmax(120px, 190px) minmax(100px, 150px) auto 70px auto;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 5px 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #101416;
    overflow: hidden;
  }
  .track.selected { border-color: var(--track); background: color-mix(in srgb, var(--track) 9%, #101416); }
  .track.silent .sound, .track.silent .name, .track.silent .meter { opacity: 0.45; }
  .swatch { align-self: stretch; width: 10px; padding: 0; border: none; border-radius: 0; background: var(--track); }
  .select { padding: 0; width: 28px; height: 28px; border: none; background: none; color: var(--track); font-size: 15px; }
  .name { min-width: 0; padding: 3px 6px; background: transparent; border-color: transparent; font-weight: 600; }
  .name:hover, .name:focus { border-color: var(--line); background: #1c2326; }

  .sound { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .sound .step { padding: 2px 7px; font-size: 11px; }
  .preset { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; }
  .kit { color: var(--dim); font-size: 12px; padding-left: 6px; }

  .voices { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--dim); }
  .voices select { padding: 2px 4px; }
  .slider { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .slider input { flex: 1; min-width: 0; padding: 0; accent-color: var(--track); }
  .val { font: 11px var(--mono); color: var(--dim); width: 54px; text-align: right; flex-shrink: 0; }
  .pan .val { width: 34px; }
  .ms { display: flex; gap: 3px; }
  .ms button { width: 28px; padding: 3px 0; font-size: 12px; font-weight: 600; }
  .mute.on { background: #ffb347; border-color: #ffb347; color: #0b1314; }
  .solo.on { background: #7fe0d0; border-color: #7fe0d0; color: #0b1314; }
  .meter { width: 70px; height: 8px; border-radius: 2px; }
  .order { display: flex; gap: 2px; }
  .order button { padding: 2px 7px; font-size: 12px; }
  .order .remove { width: 26px; }

  /* Clips: a row of their own under the track's controls. */
  .clips { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
  .clip {
    position: relative; display: flex; align-items: stretch; overflow: hidden;
    border: 1px solid var(--line); border-radius: 5px; background: #161c1f; max-width: 100%;
  }
  .clip button { border: none; border-radius: 0; background: none; padding: 3px 8px; font-size: 12px; }
  .clip .launch { color: var(--dim); padding: 3px 7px; border-right: 1px solid var(--line); }
  .clip-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
  .clip.selected { border-color: var(--track); }
  .clip.chosen { background: color-mix(in srgb, var(--track) 18%, #161c1f); }
  .clip.chosen .launch { color: var(--track); }
  .clip.playing .launch { background: var(--track); color: #0b1314; }
  .clip.waiting .launch, .clip.stopping .launch { animation: blink 0.5s steps(2, jump-none) infinite; }
  @keyframes blink { 50% { opacity: 0.35; } }
  .progress { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--track); pointer-events: none; }
  .add-clip { font-size: 12px; padding: 3px 8px; color: var(--dim); border-style: dashed; }

  .clip-panel {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 10px;
    border: 1px solid var(--track); border-radius: 6px; background: color-mix(in srgb, var(--track) 8%, #101416); font-size: 12px;
  }
  .clip-panel .kind { color: var(--dim); }
  .clip-title { width: 150px; font-weight: 600; }
  .clip-panel .bars { display: flex; align-items: center; gap: 6px; color: var(--dim); }
  .clip-panel .summary { color: var(--dim); font-family: var(--mono); }
  .clip-panel .push { flex: 1; }
  .clip-panel button { font-size: 12px; padding: 3px 10px; }
  .clip-panel .danger { color: #ff8a7a; }

  @media (pointer: coarse) {
    .clip button, .add-clip, .clip-panel button { min-height: 36px; }
    .ms button, .order button, .sound .step { min-height: 36px; }
    .select { width: 36px; height: 36px; }
  }

  /* Narrower screens: two rows per track (who it is, then its mix). */
  @media (max-width: 1100px) {
    .track {
      grid-template-columns: 10px 28px minmax(80px, 140px) minmax(0, 1fr) auto auto;
      grid-template-areas:
        "sw sel name sound voices order"
        "sw mix mix mix mix mix";
      row-gap: 6px;
    }
    .swatch { grid-area: sw; }
    .select { grid-area: sel; }
    .name { grid-area: name; }
    .sound { grid-area: sound; }
    .voices { grid-area: voices; }
    .order { grid-area: order; }
    .vol, .pan, .ms, .meter { grid-row: 2; }
    .vol { grid-column: 2 / 4; }
    .pan { grid-column: 4 / 5; width: 100%; max-width: 240px; }
    .ms { grid-column: 5 / 7; justify-self: end; }
    .meter { display: none; }
  }
  @media (max-width: 700px) {
    .track {
      grid-template-columns: 10px 32px minmax(0, 1fr) auto;
      grid-template-areas:
        "sw sel name order"
        "sw sound sound sound"
        "sw vol vol vol"
        "sw pan pan ms";
    }
    .voices { display: none; }
    .sound { grid-column: 2 / 5; grid-row: 2; }
    .vol { grid-column: 2 / 5; grid-row: 3; }
    .pan { grid-column: 2 / 4; grid-row: 4; }
    .ms { grid-column: 4 / 5; grid-row: 4; }
    .order { grid-row: 1; grid-column: 4 / 5; }
  }
</style>
