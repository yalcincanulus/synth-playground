<script lang="ts">
  import { DRUM_NAMES } from "../../audio/drums";
  import { MAX_SYNTH_TRACKS, MAX_TRACK_VOICES, TRACK_COLORS, VOLUME_MAX, VOLUME_MIN, type Track } from "../../song/song";
  import { surface, type Surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";

  interface Props {
    pg: Playground;
  }
  let { pg }: Props = $props();

  // Track colours are in the LED's 0-127 range, lifted toward white like the preset accent.
  const css = (i: number) => {
    const [r, g, b] = TRACK_COLORS[i].map((c) => Math.round(c * 2 * 0.75 + 255 * 0.25));
    return `rgb(${r} ${g} ${b})`;
  };
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
  </div>
  {#if pg.explain}
    <p class="explain">
      Each track has a sound of its own. Select a track to edit its sound (the Synth view and the presets follow it) and to play it from the keys. With the drums
      selected, the keys from C to G play the drum kit. The mixer sets how loud each track is and where it sits left to right; <strong>M</strong> mutes a track,
      <strong>S</strong> plays only the soloed ones. The Play view's drums and step sequencer play on top of the song.
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
      </li>
    {/each}
  </ol>
</section>

<style>
  .song { display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 14px; }
  .head button { font-size: 12px; padding: 3px 10px; }
  .count { font-size: 12px; color: var(--dim); }
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

  @media (pointer: coarse) {
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
