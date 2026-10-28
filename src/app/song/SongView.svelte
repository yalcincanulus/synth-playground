<script lang="ts">
  import { onMount } from "svelte";
  import { download, fileName } from "../download";
  import { DRUM_NAMES } from "../../audio/drums";
  import { RATES } from "../../audio/stepSequencer";
  import { CLIP_KIND_NAMES, clipBeats, MAX_BARS, type Clip } from "../../song/clips";
  import { GRIDS } from "../../song/noteEdit";
  import { EXAMPLE_SONGS } from "../../song/examples";
  import { MAX_SYNTH_TRACKS, MAX_TRACK_VOICES, VOLUME_MAX, VOLUME_MIN, type Track } from "../../song/song";
  import { LOOP_LENGTHS, type PadState } from "../../song/looper";
  import { surface, type Surface } from "../components/canvas";
  import type { Playground } from "../playground.svelte";
  import SequencerPanel from "../sequencer/SequencerPanel.svelte";
  import Arrangement, { clipDrag } from "./Arrangement.svelte";
  import PianoRoll from "./PianoRoll.svelte";
  import { trackCss as css } from "./trackColor";
  import { guideKey } from "../../course/song/guide";
  import SongLessons from "../songGuide/SongLessons.svelte";

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

  /** What recording is doing, in a few words. */
  function recStatus() {
    if (frame < 0) return "";
    const take = pg.take;
    if (take) {
      const st = pg.takeState();
      const name = pg.songClips.find((c) => c.id === take.clip)?.name ?? "";
      if (!st) return `Recording ${name}`;
      if (st.phase === "count") return `Count-in… ${st.count}`;
      if (st.phase === "wait") return `${name} starts on the next bar`;
      return `Recording ${name}${st.pass > 0 ? ` · time round ${st.pass + 1}` : ""}`;
    }
    const armed = pg.songTracks.find((t) => t.id === pg.armedTrack);
    if (armed) return `${armed.name} is armed: ● records into its clip`;
    return "Arm a track (● beside M and S) to record on it";
  }

  // ------------------------------------------------------------------ the looper

  const PAD_WORDS: Record<PadState, string> = {
    off: "empty: click to select it",
    selected: "selected: click again to get it ready",
    ready: "ready: the first note you play starts recording",
    recording: "recording: click to end the take (the loop plays)",
    playing: "its loop plays: click to stop it at the next bar",
    stopped: "its loop is stopped: click to play it again",
  };

  /** A looper pad on screen works as on the MiniLab: click, hold (ready to record, onto its loop), Shift + click (undo its last take). */
  let padTimer = 0;
  let padHeld = false;
  function padDown(t: Track, e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.shiftKey) return pg.undoLoopLayer(t.id);
    padHeld = false;
    clearTimeout(padTimer);
    padTimer = window.setTimeout(() => {
      padHeld = true;
      pg.setLoopReady(t.id);
    }, 450);
  }
  function padUp(t: Track, e: PointerEvent) {
    if (e.button !== 0 || e.shiftKey) return;
    clearTimeout(padTimer);
    if (!padHeld) pg.tapLoopPad(t.id);
    padHeld = true;
  }

  /** The looper's line: the length, and what to do next. */
  function loopStatus() {
    if (frame < 0) return "";
    const take = pg.take;
    const t = pg.songTracks.find((x) => x.id === (take?.track ?? pg.loopReady));
    const at = pg.loopBar();
    if (take && t) return `Recording ${t.name}${at ? ` · bar ${at.bar}${at.of ? ` of ${at.of}` : ""}` : ""}: click its pad to end the take`;
    if (pg.loopReady && t) return `${t.name} is ready: play to start recording${pg.playing ? "" : " (the music starts with your first note)"}`;
    return "Click a track's pad to select it, again to get it ready, then play: your first note starts the loop";
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

  // ------------------------------------------------------------------ songs

  let songList = $state(false);
  let lessonList = $state(false);
  let songFileInput: HTMLInputElement;
  let songMessage = $state<{ ok: boolean; text: string } | null>(null);

  function renameSong(input: HTMLInputElement) {
    pg.renameSong(input.value);
    input.value = pg.songName;
  }

  function deleteSong(id: string, name: string) {
    if (confirm(`Delete the song "${name}"? This can't be undone.`)) void pg.deleteSong(id);
  }

  async function copyLink() {
    let url: string;
    try {
      url = await pg.songShareLink();
    } catch (err) {
      songMessage = { ok: false, text: (err as Error).message };
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      songMessage = { ok: true, text: `Link copied (${(url.length / 1024).toFixed(1)} KB): it opens this song in any browser` };
    } catch {
      // No clipboard (not allowed here): copy it by hand.
      prompt("Copy this link:", url);
    }
  }

  function exportSong() {
    download(pg.exportSong(), `${fileName(pg.songName)}.song.json`, "application/json");
    songMessage = { ok: true, text: `${pg.songName} saved to a file` };
  }

  // ------------------------------------------------------------------ WAV

  let wavPanel = $state(false);
  let wavMessage = $state<{ ok: boolean; text: string } | null>(null);
  const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  async function exportWav() {
    wavMessage = null;
    try {
      const { wav, seconds } = await pg.exportWav();
      const range = pg.wavSettings.range === "loop" && pg.loopRange ? ` bars ${pg.loopRange.start + 1}-${pg.loopRange.end}` : "";
      download(wav, `${fileName(pg.songName)}${range}.wav`, "audio/wav");
      wavMessage = { ok: true, text: `Exported ${duration(seconds)} (${(wav.byteLength / 1048576).toFixed(1)} MB)` };
    } catch (err) {
      const e = err as Error;
      wavMessage = { ok: e.name === "AbortError", text: e.name === "AbortError" ? "Export cancelled" : e.message };
    }
  }

  const exportBars = $derived(pg.exportRange ? pg.exportRange.end - pg.exportRange.start : 0);

  async function importSong(file: File | undefined) {
    if (!file) return;
    try {
      songMessage = { ok: true, text: await pg.importSong(file) };
      songList = false;
    } catch (err) {
      songMessage = { ok: false, text: (err as Error).message };
    }
  }

  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  /** What a track's sound is, in words: the preset it started from, and whether it was edited. */
  function soundTitle(id: string) {
    const p = pg.presetOf(id);
    const from = pg.isListed(p) ? p.name : `${p.name} (no longer in your presets)`;
    return `${from}${pg.parts[id]?.dirty ? ", edited" : ""}. Click to browse presets for this track.`;
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
  <div class="song-bar" role="group" aria-label="The song">
    <input class="song-name" data-guide="song-name" value={pg.songName} maxlength="32" aria-label="Song name" title="The song's name (it is saved as you work)" onchange={(e) => renameSong(e.currentTarget)} />
    <button onclick={() => (songList = !songList)} aria-expanded={songList} title="Your songs, and the example songs">Songs {songList ? "▴" : "▾"}</button>
    <button onclick={() => pg.newSong()} title="A new, empty song (this one stays saved)">New</button>
    {#if pg.linkSong}
      <button class="go" data-guide="save-song" onclick={() => pg.saveLinkedSong()} title="Keep this song among yours: from then on it is saved as you work">Save to my songs</button>
    {:else}
      <button onclick={() => pg.duplicateSong()} title="Keep this song as it is, and go on in a copy">Duplicate</button>
    {/if}
    <button onclick={exportSong} data-guide="song-export" title="Save the song as a file, with its sounds and wavetables, to keep or open on another computer">Export</button>
    <button onclick={copyLink} data-guide="copy-link" title="Copy a link that opens this song in any browser (nothing is uploaded: the song is in the link)">Copy link</button>
    <button onclick={() => (wavPanel = !wavPanel)} aria-expanded={wavPanel} data-guide={wavPanel ? undefined : "wav wav-record"} title="Make an audio file of the song, or record what you hear">WAV {wavPanel ? "▴" : "▾"}</button>
    <button onclick={() => songFileInput.click()} title="Open a song file as a new song">Import…</button>
    <input bind:this={songFileInput} type="file" accept=".json,application/json" hidden onchange={(e) => { void importSong(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
    <button class="lessons-btn" class:on={lessonList} onclick={() => (lessonList = !lessonList)} aria-expanded={lessonList} title="Make a song and Live looping: lessons on everything the Song view does, for someone who has never made music on a computer">Lessons {lessonList ? "▴" : "▾"}</button>
    {#if pg.practiceSong}
      <span class="saved unsaved" title="A lesson's practice song: nothing is saved until you choose Save to my songs">Practice song, not saved</span>
    {:else if pg.linkSong}
      <span class="saved unsaved" title="This song came from a link: nothing is saved until you choose Save to my songs">From a link, not saved</span>
    {:else}
      <span class="saved" title="Songs are saved in this browser as you work">Saved</span>
    {/if}
    {#if songMessage}<span class="song-msg" class:bad={!songMessage.ok}>{songMessage.text}</span>{/if}
  </div>
  {#if lessonList}
    <div class="lesson-list">
      {#each [pg.songGuide, pg.loopGuide] as guide (guide.course.id)}
        <h4>{guide.course.title}</h4>
        <SongLessons {pg} {guide} />
      {/each}
    </div>
  {/if}
  {#if wavPanel}
    <div class="wav-panel">
      <div class="wav-export" role="group" aria-label="Export the song as a WAV file">
        <h3>Export as WAV</h3>
        <div class="wav-row">
          <select value={pg.wavSettings.range} onchange={(e) => pg.setWavSettings({ range: e.currentTarget.value as "song" | "loop" })} aria-label="What to export">
            <option value="song">The whole song</option>
            <option value="loop" disabled={!pg.loopRange}>The loop region{pg.loopRange ? ` (bars ${pg.loopRange.start + 1}–${pg.loopRange.end})` : ""}</option>
          </select>
          <select value={pg.wavSettings.rate} onchange={(e) => pg.setWavSettings({ rate: +e.currentTarget.value as 44100 | 48000 })} aria-label="Sample rate">
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz</option>
          </select>
          <select value={pg.wavSettings.bits} onchange={(e) => pg.setWavSettings({ bits: +e.currentTarget.value as 16 | 24 })} aria-label="Bit depth">
            <option value={16}>16 bit</option>
            <option value={24}>24 bit</option>
          </select>
          {#if pg.exporting}
            <progress max="1" value={pg.exporting.progress} aria-label="Export progress"></progress>
            <button onclick={() => pg.cancelExport()}>Cancel</button>
          {:else}
            <button class="go" data-guide="wav" onclick={exportWav} disabled={!exportBars} title="Render the song (faster than real time) and save the WAV">Export {exportBars ? `${exportBars} bar${exportBars === 1 ? "" : "s"}` : ""}</button>
          {/if}
        </div>
        <p class="note">The song's tracks, as arranged on the timeline, with the delay and reverb ringing out. The Play view's drum loop and step sequencer aren't in it: send them to the song to keep them.</p>
        {#if wavMessage}<p class="song-msg" class:bad={!wavMessage.ok}>{wavMessage.text}</p>{/if}
      </div>
      <div class="wav-record" data-guide="wav-record" role="group" aria-label="Record what you hear">
        <h3>Record what you hear</h3>
        <div class="wav-row">
          <button class="rec-out" class:on={!!pg.outputRec} onclick={() => pg.toggleOutputRecording()} title="Record the app's output as you hear it, toys and all, in real time">
            ● {pg.outputRec ? "Stop" : "Record"}
          </button>
          <span class="time">{duration(pg.outputRec?.seconds ?? 0)}</span>
          <meter min="-60" max="0" low="-12" high="-3" optimum="-20" value={Math.max(-60, pg.outputRec?.level ?? -60)} aria-label="Level"></meter>
          {#if pg.recordedWav && !pg.outputRec}
            <button class:go={!pg.recordedWav.saved} onclick={() => pg.saveRecording()} title="Save the recording as a WAV file">{pg.recordedWav.saved ? "Save again" : "Save"} ({duration(pg.recordedWav.seconds)})</button>
            <button onclick={() => confirm("Throw the recording away?") && pg.discardRecording()} title="Throw the recording away">Discard</button>
          {/if}
        </div>
        <p class="note">Everything you hear, live: the song, the toys and your playing. It keeps recording in the other views. When you stop, save it here or with Save in the transport.</p>
      </div>
    </div>
  {/if}
  {#if songList}
    <div class="song-list">
      <div>
        <h3>Your songs</h3>
        <ul>
          {#each pg.songs as s (s.id)}
            <li class:open={s.id === pg.songId}>
              <button class="open-song" onclick={() => { void pg.openSong(s.id); songList = false; }} disabled={s.id === pg.songId} title={s.id === pg.songId ? "The open song" : "Open this song"}>
                <span class="nm">{s.name}</span>
                <span class="dt">{s.id === pg.songId ? "open" : when(s.modified)}</span>
              </button>
              <button class="del" onclick={() => deleteSong(s.id, s.name)} aria-label="Delete {s.name}" title="Delete this song">✕</button>
            </li>
          {/each}
        </ul>
      </div>
      <div>
        <h3>Examples</h3>
        <ul>
          {#each EXAMPLE_SONGS as ex, i (ex.name)}
            <li>
              <button class="open-song" onclick={() => { pg.openExample(i); songList = false; }} title="Open a copy among your songs">
                <span class="nm">{ex.name}</span>
                <span class="dt">{ex.about}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
  <div class="head">
    <h2>Tracks</h2>
    <button onclick={() => pg.addSongTrack()} data-guide="add-track" disabled={!pg.canAddSongTrack} title={pg.canAddSongTrack ? "A new synth track with a sound of its own" : `Up to ${MAX_SYNTH_TRACKS} synth tracks`}>+ Synth track</button>
    <span class="count">{synthCount} of {MAX_SYNTH_TRACKS} synth tracks</span>
    <span class="history" data-guide="song-undo">
      <button disabled={!pg.canUndoSong} onclick={() => pg.undoSong()} aria-label="Undo in the song" title={pg.songUndoLabel ? `Undo ${pg.songUndoLabel} (Ctrl+Z)` : "Nothing to undo in the song"}>↶</button>
      <button disabled={!pg.canRedoSong} onclick={() => pg.redoSong()} aria-label="Redo in the song" title={pg.songRedoLabel ? `Redo ${pg.songRedoLabel} (Ctrl+Shift+Z)` : "Nothing to redo in the song"}>↷</button>
    </span>
  </div>
  {#if pg.explain}
    <p class="explain">
      New to making songs? <strong>Lessons</strong> (above) teaches the Song view step by step, from what a beat is to an exported song.
      Each track has a sound of its own. Select a track to edit its sound (the Synth view and the presets follow it) and to play it from the keys. With the drums
      selected, the keys from C to G play the drum kit. The mixer sets how loud each track is and where it sits left to right; <strong>M</strong> mutes a track,
      <strong>S</strong> plays only the soloed ones.
      Below each track are its <strong>clips</strong>: short patterns that loop. ▶ plays a clip on its track (from the next bar while the music plays; ■ stops it at the
      next bar). Send the Play view's drum loop or step sequence here with <strong>Send to song</strong>, or make a new clip with <strong>+</strong>. Click a clip's
      name to open it: a note clip opens in the <strong>piano roll</strong>, where you draw its notes; a step clip in the step sequencer's panel. The Play view's drums and
      step sequencer keep playing on top of the song.
      To <strong>record</strong>, arm a track with its red ● and press ● Record: what you play on the keys (or the pads, for the drums) goes into its clip, time
      round after time round. Overdub adds each time; Replace starts from an empty clip.
      The <strong>looper</strong> (Lessons ▾ has a tutorial: Live looping) builds a song up live, a layer at a time: each track has a pad (the square beside M and S; on a MiniLab, pad 1 is the top
      track). Click it to select the track, again to get it ready, then play: your first note starts recording (and the music, if it was stopped). Click the pad
      to end the take, and the loop plays on while you go to the next track. The first loop's length (1, 2, 4 or 8 bars) is every loop's length, so they fit
      together. Click a playing loop's pad to stop it at the next bar, again to bring it back in. Hold a pad to record more onto its loop; Shift + click undoes its
      last take (on a MiniLab, a click on the encoder undoes the last take, and bank B's pads mute their track, held, solo it). <strong>Capture to arrangement</strong> writes what you played onto the timeline, as it happened, so it becomes a song to edit and export.
      The song is <strong>saved</strong> in this browser as you work, with each track's sound (so changing or deleting a preset later doesn't change it) and the
      wavetables it uses. <strong>Songs</strong> lists your songs and three examples; <strong>Export</strong> makes a file you can open on another computer. <strong>WAV</strong> makes an audio file of the song (or its loop region), or records everything you hear as you play.
    </p>
  {/if}

  <div class="rec-bar" class:recording={!!pg.take} role="group" aria-label="Recording">
    <button class="rec" data-guide="record" class:on={!!pg.take} onclick={() => pg.toggleRecord()} title={pg.take ? "Stop recording (the music plays on)" : `Record into the armed track's clip${pg.hw(" (● on the MiniLab)")}`}>
      ● {pg.take ? "Stop recording" : "Record"}
    </button>
    <span class="rec-status">{recStatus()}</span>
    <label title="A bar of clicks before the music starts (when recording starts it)"><input type="checkbox" checked={pg.rec.countIn} onchange={(e) => pg.setRec({ countIn: e.currentTarget.checked })} /> Count-in</label>
    <label title="A click on every beat while recording (never in the song itself)">
      <input type="checkbox" checked={pg.rec.metronome} onchange={(e) => pg.setRec({ metronome: e.currentTarget.checked })} /> Click
      <input class="click-vol" type="range" min="0" max="1" step="0.05" value={pg.rec.click} oninput={(e) => pg.setRec({ click: +e.currentTarget.value })} aria-label="Click volume" />
    </label>
    <select value={pg.rec.mode} data-guide="rec-mode" onchange={(e) => pg.setRec({ mode: e.currentTarget.value as "overdub" | "replace" })} aria-label="Overdub or replace" title="Overdub adds to the clip each time round; Replace clears it first">
      <option value="overdub">Overdub</option>
      <option value="replace">Replace</option>
    </select>
    <label data-guide="rec-quantize" title="Pull played notes onto the grid as they are recorded (the piano roll can quantize afterwards either way)">
      Quantize
      <select value={pg.rec.quantize} onchange={(e) => pg.setRec({ quantize: +e.currentTarget.value })}>
        <option value={-1}>Off</option>
        {#each GRIDS as g, i (g.name)}<option value={i}>{g.name}</option>{/each}
      </select>
      {#if pg.rec.quantize >= 0}
        <select value={pg.rec.strength} onchange={(e) => pg.setRec({ strength: +e.currentTarget.value })} aria-label="Quantize strength">
          {#each [1, 0.75, 0.5, 0.25] as v (v)}<option value={v}>{v * 100}%</option>{/each}
        </select>
      {/if}
    </label>
    <label title="How hard the computer keys and the screen's keys play (a MiniLab sends its own)">
      Velocity <input class="vel" type="number" min="1" max="127" value={pg.rec.velocity} onchange={(e) => pg.setRec({ velocity: Math.max(1, Math.min(127, Math.round(+e.currentTarget.value || 100))) })} />
    </label>
    <label title="The length of a new clip made to record into (when the track has no note clip selected or playing)">
      New clips
      <select value={pg.rec.bars} onchange={(e) => pg.setRec({ bars: +e.currentTarget.value })}>
        {#each [1, 2, 4, 8] as n (n)}<option value={n}>{n} bar{n > 1 ? "s" : ""}</option>{/each}
      </select>
    </label>
  </div>

  <div class="looper-bar" data-guide="looper" class:live={!!pg.take || !!pg.loopReady} role="group" aria-label="Looper">
    <strong>Looper</strong>
    <label data-guide="loop-length" title="Every loop has this length, so they fit together. With 'First take', the first loop you record sets it (rounded to 1, 2, 4 or 8 bars)">
      Loops
      <select value={pg.loopGrid?.bars ?? 0} onchange={(e) => pg.setLoopBars(+e.currentTarget.value || null)}>
        <option value={0}>Set by the first take</option>
        {#each LOOP_LENGTHS as n (n)}<option value={n}>{n} bar{n > 1 ? "s" : ""}</option>{/each}
      </select>
    </label>
    <span class="loop-status">{loopStatus()}</span>
    {#if pg.loopCount()}
      {@const count = pg.loopCount()!}
      <span class="big-count" title={count.what === "end" ? "Beats until the take ends" : "Beats to the next bar"} aria-live="off">{count.beats}</span>
    {/if}
    <button data-guide="capture" onclick={() => pg.captureToArrangement()} disabled={!pg.canCapture} title="Write what the launcher played since ▶ onto the timeline, as it happened, from the start bar{pg.hw(' (⟲ loop button on the MiniLab)')}">Capture to arrangement</button>
  </div>

  <ol class="tracks">
    {#each pg.songTracks as t, i (t.id)}
      {@const ps = pg.padStateOf(t.id)}
      {@const auto = frame >= 0 && pg.playing ? pg.songTrackStrip(t.id)?.automatedAt(pg.engine.ctx.currentTime) : null}
      {@const k = (kind: string) => `${kind} ${guideKey(kind, t.name)}`}
      <li class="track" class:selected={pg.selectedSongTrack === t.id} class:silent={t.mute || (anySolo && !t.solo)} style:--track={css(t.color)}>
        <button class="swatch" data-guide={k("swatch")} onclick={() => pg.cycleSongTrackColor(t.id)} aria-label="Colour of {t.name}" title="Change the colour"></button>
        <button class="select" data-guide={k("select")} onclick={() => pg.selectSongTrack(t.id)} aria-pressed={pg.selectedSongTrack === t.id} title={t.kind === "synth" ? "Select: edit this sound and play it from the keys" : "Select: the keys from C to G play the drum kit"}>
          {pg.selectedSongTrack === t.id ? "●" : "○"}
        </button>
        <input class="name" data-guide={k("track-name")} value={t.name} maxlength="16" aria-label="Track name" onchange={(e) => rename(t, e.currentTarget)} onfocus={() => pg.selectSongTrack(t.id)} />

        <div class="sound" data-guide={k("sound")}>
          {#if t.kind === "synth"}
            <button class="step" onclick={() => { pg.selectSongTrack(t.id); pg.stepPreset(-1); }} aria-label="Previous preset">◀</button>
            <button class="preset" onclick={(e) => browse(t, e)} title={soundTitle(t.id)}>
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

        <label class="slider vol" data-guide={k("volume")} class:automated={auto?.volume != null} title="Volume (double-click: 0 dB){auto?.volume != null ? '. A clip automates it now: it follows the clip' : ''}">
          <input type="range" min={VOLUME_MIN} max={VOLUME_MAX} step="0.5" value={auto?.volume ?? t.volume} oninput={(e) => pg.setSongTrack(t.id, { volume: +e.currentTarget.value })} ondblclick={() => pg.setSongTrack(t.id, { volume: 0 })} aria-label="Volume of {t.name}" />
          <span class="val">{volumeText(auto?.volume ?? t.volume)}</span>
        </label>
        <label class="slider pan" data-guide={k("pan")} class:automated={auto?.pan != null} title="Pan: left to right (double-click: centre){auto?.pan != null ? '. A clip automates it now: it follows the clip' : ''}">
          <input type="range" min="-1" max="1" step="0.02" value={auto?.pan ?? t.pan} oninput={(e) => pg.setSongTrack(t.id, { pan: +e.currentTarget.value })} ondblclick={() => pg.setSongTrack(t.id, { pan: 0 })} aria-label="Pan of {t.name}" />
          <span class="val">{panText(auto?.pan ?? t.pan)}</span>
        </label>
        <div class="ms">
          <button class="mute" data-guide={k("mute")} class:on={t.mute} onclick={() => pg.setSongTrack(t.id, { mute: !t.mute })} aria-pressed={t.mute} title="Mute">M</button>
          <button class="solo" data-guide={k("solo")} class:on={t.solo} onclick={() => pg.setSongTrack(t.id, { solo: !t.solo })} aria-pressed={t.solo} title="Solo: hear only the soloed tracks">S</button>
          <button
            class="pad {ps}"
            data-guide={k("pad")}
            class:blink={frame >= 0 && pg.padBlinks(t.id)}
            onpointerdown={(e) => padDown(t, e)}
            onpointerup={(e) => padUp(t, e)}
            onpointerleave={() => clearTimeout(padTimer)}
            oncontextmenu={(e) => e.preventDefault()}
            aria-label="Looper pad of {t.name}: {ps}"
            title="Looper pad ({PAD_WORDS[ps]}). Hold: ready to record onto its loop. Shift + click: undo its last take.{pg.hw(` On the MiniLab: pad ${i + 1} (bank B: mute, held: solo); the encoder's click undoes the last take.`)}"
          ></button>
          <button class="arm" data-guide={k("arm")} class:on={pg.armedTrack === t.id} class:live={pg.take?.track === t.id} onclick={() => pg.armTrack(t.id)} aria-pressed={pg.armedTrack === t.id} aria-label="Arm {t.name} to record" title="Arm: record on this track (it is selected, and ● records into its clip)">●</button>
        </div>
        <canvas class="meter" data-guide={k("meter")} use:surface={meter(t.id)} aria-hidden="true"></canvas>

        <div class="order">
          <button onclick={() => pg.moveSongTrack(t.id, -1)} disabled={i === 0} aria-label="Move {t.name} up">↑</button>
          <button onclick={() => pg.moveSongTrack(t.id, 1)} disabled={i === pg.songTracks.length - 1} aria-label="Move {t.name} down">↓</button>
          {#if t.kind === "synth"}
            <button class="remove" data-guide={k("remove")} onclick={() => remove(t)} aria-label="Remove {t.name}" title="Remove the track">✕</button>
          {:else}
            <span class="remove"></span>
          {/if}
        </div>

        <div class="clips" data-guide={k("clips")} role="group" aria-label="Clips of {t.name}">
          {#each pg.clipsOf(t.id) as c (c.id)}
            {@const st = launchState(c)}
            <div class="clip" class:selected={pg.selectedClip === c.id} class:chosen={st.chosen} class:playing={st.playing} class:waiting={st.waiting} class:stopping={st.stopping}>
              <button
                class="launch"
                data-guide="launch {guideKey('launch', c.name)}"
                onclick={() => pg.launchClip(c.id)}
                aria-label="{st.playing && !st.stopping ? 'Stop' : 'Play'} {c.name}"
                title={st.waiting ? "Starts on the next bar (click to cancel)" : st.playing && !st.stopping ? "Stop this track at the next bar" : pg.playing ? "Play on this track from the next bar" : "Play"}
              >{st.playing && !st.stopping ? "■" : "▶"}</button>
              <button
                class="clip-name"
                draggable="true"
                ondragstart={(e) => {
                  clipDrag.id = c.id;
                  e.dataTransfer?.setData("text/plain", c.name);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
                }}
                ondragend={() => (clipDrag.id = null)}
                onclick={() => pg.selectClip(pg.selectedClip === c.id ? null : c.id)}
                title="{CLIP_KIND_NAMES[c.kind]} · {c.bars} bar{c.bars > 1 ? 's' : ''} · {summary(c)}{pg.clipUses(c.id) ? ` · on the timeline ${pg.clipUses(c.id)}×` : ''} (drag it onto the arrangement)"
              >
                {c.name}
              </button>
              {#if st.playing}<span class="progress" style:width="{progress(c) * 100}%"></span>{/if}
            </div>
          {/each}
          {#if t.kind === "drums"}
            <button class="add-clip" data-guide="add-drum-clip" onclick={() => pg.addClip(t.id)} title="A new empty drum clip">+ Drum clip</button>
          {:else}
            <button class="add-clip" onclick={() => pg.addClip(t.id, "notes")} title="A new empty note clip, to write in the piano roll">+ Note clip</button>
            <button class="add-clip" data-guide={k("add-step-clip")} onclick={() => pg.addClip(t.id, "steps")} title="A new step clip: 8 steps, like the Play view's step sequencer">+ Step clip</button>
          {/if}
        </div>
      </li>
    {/each}
  </ol>

  <Arrangement {pg} />

  {#if clip && clipTrack}
    <section class="clip-panel" style:--track={css(clipTrack.color)} aria-label="Clip">
      <span class="kind">{CLIP_KIND_NAMES[clip.kind]} · {clipTrack.name}</span>
      <input class="clip-title" value={clip.name} maxlength="16" aria-label="Clip name" onchange={(e) => renameClip(clip!, e.currentTarget)} />
      <label class="bars" data-guide="clip-length">
        Length
        <select value={clip.bars} onchange={(e) => pg.setClipBars(clip!.id, +e.currentTarget.value)}>
          {#each Array.from({ length: MAX_BARS[clip.kind] }, (_, k) => k + 1) as n (n)}<option value={n}>{n} bar{n > 1 ? "s" : ""}</option>{/each}
        </select>
      </label>
      <span class="summary">{summary(clip)}</span>
      <span class="push"></span>
      {#if clip.kind === "steps"}
        <button data-guide="convert" onclick={() => pg.convertToNotes(clip!.id)} title="Turn it into a note clip that sounds the same, to edit in the piano roll (undo turns it back)">Convert to notes</button>
      {/if}
      {#if clip.kind !== "notes"}
        <button data-guide="edit-in-play" onclick={() => pg.editInPlay(clip!.id)} title={clip.kind === "drums" ? "Change it in the Play view's drum loop (and with the pads)" : "Change it in the Play view's step sequencer (and on the MiniLab)"}>Edit in Play</button>
      {/if}
      <button data-guide="duplicate" onclick={() => pg.duplicateClip(clip!.id)} title="A copy of this clip on the same track">Duplicate</button>
      <button class="danger" onclick={() => removeClip(clip!)} title="Delete this clip">Delete</button>
      <button class="close" onclick={() => pg.selectClip(null)} aria-label="Close">✕</button>
    </section>
    {#if clip.kind === "notes"}
      <PianoRoll {pg} {clip} color={css(clipTrack.color)} />
    {:else if clip.kind === "steps" && pg.editClipId === clip.id}
      <SequencerPanel {pg} />
    {/if}
  {/if}
</section>

<style>
  .song { display: flex; flex-direction: column; gap: 8px; }
  .song-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
  .song-bar button { font-size: 12px; padding: 3px 10px; }
  .song-name { font: inherit; font-size: 15px; font-weight: 600; width: 16em; max-width: 100%; min-width: 0; padding: 2px 6px; background: transparent; color: inherit; border: 1px solid transparent; border-radius: 4px; }
  .song-name:hover, .song-name:focus { border-color: var(--line); }
  .saved { font-size: 11px; color: var(--dim); }
  .saved.unsaved { color: #ffb15c; }
  .song-bar .go { border-color: var(--accent); color: var(--accent); }
  .song-msg { font-size: 12px; color: var(--accent); }
  .song-msg.bad { color: #ff8a80; }
  .lesson-list { margin-bottom: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; display: grid; gap: 6px; }
  .lesson-list h4 { margin: 4px 0 0; font-size: 13px; color: var(--accent); }
  .lessons-btn.on { border-color: var(--accent); color: var(--text); }
  .song-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
  .song-list h3 { margin: 0 0 4px; font-size: 12px; color: var(--dim); font-weight: 600; }
  .song-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 260px; overflow-y: auto; }
  .song-list li { display: flex; gap: 3px; }
  .open-song { flex: 1; min-width: 0; display: grid; text-align: left; gap: 1px; padding: 4px 8px; }
  .open-song:disabled { opacity: 1; border-color: var(--accent); }
  .open-song .nm { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-song .dt { font-size: 11px; color: var(--dim); }
  .song-list .del { padding: 0 8px; color: var(--dim); }
  .song-list .del:hover { color: #ff8a80; border-color: #ff8a80; }
  .wav-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
  .wav-panel h3 { margin: 0 0 6px; font-size: 12px; color: var(--dim); font-weight: 600; }
  .wav-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
  .wav-row button { font-size: 12px; padding: 3px 10px; }
  .wav-row .go { border-color: var(--accent); color: var(--accent); }
  .wav-row progress { flex: 1 1 100px; min-width: 80px; }
  .wav-panel .note { margin: 6px 0 0; font-size: 11px; color: var(--dim); }
  .rec-out { color: #ff6b6b; }
  .rec-out.on { background: #ff6b6b; color: #fff; }
  .time { font: 13px var(--mono); min-width: 3.5em; }
  .wav-row meter { flex: 1 1 80px; min-width: 60px; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 14px; }
  .head button { font-size: 12px; padding: 3px 10px; }
  .count { font-size: 12px; color: var(--dim); }
  .history { margin-left: auto; display: flex; gap: 2px; }
  .history button { padding: 3px 10px; }
  .explain { margin: 0; font-size: 12px; color: #a9b6ba; line-height: 1.45; max-width: 900px; }

  .rec-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: #101416; font-size: 12px; }
  .rec-bar.recording { border-color: #ff5c5c; }
  .rec-bar label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
  .rec-bar select { padding: 2px 4px; font-size: 12px; }
  .rec-bar .rec { font-size: 12px; padding: 3px 10px; color: #ff7a7a; }
  .rec-bar .rec.on { background: #ff5c5c; border-color: #ff5c5c; color: #0b1314; }
  .rec-status { flex: 1 1 200px; min-width: 0; color: var(--dim); }
  .recording .rec-status { color: #ffb0a8; }
  .click-vol { width: 70px; padding: 0; accent-color: #7fe0d0; }
  .vel { width: 52px; padding: 2px 4px; }
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
  .slider.automated .val { color: #ffcf6b; }
  .ms { display: flex; gap: 3px; }
  .ms button { width: 28px; padding: 3px 0; font-size: 12px; font-weight: 600; }
  .mute.on { background: #ffb347; border-color: #ffb347; color: #0b1314; }
  .solo.on { background: #7fe0d0; border-color: #7fe0d0; color: #0b1314; }
  .arm { color: #a05050; }
  .arm.on { background: #5a1f1f; border-color: #ff5c5c; color: #ff7a7a; }
  .arm.live { background: #ff5c5c; color: #0b1314; }
  .meter { width: 70px; height: 8px; border-radius: 2px; }
  .pad { width: 28px; padding: 0; border-radius: 5px; background: #1c2326; border-color: #2c3539; touch-action: none; }
  .pad.selected { background: #4a1a1a; }
  .pad.ready { background: #9a2a2a; }
  .pad.recording { background: #ff3b3b; border-color: #ff3b3b; }
  .pad.playing { background: #3fd46a; border-color: #3fd46a; }
  .pad.stopped { background: #1d4a2a; }
  .pad.blink { animation: blink 0.4s steps(2, jump-none) infinite; }

  .looper-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: #101416; font-size: 12px; }
  .looper-bar.live { border-color: #ff5c5c; }
  .looper-bar label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
  .looper-bar select, .looper-bar button { padding: 2px 8px; font-size: 12px; }
  .loop-status { flex: 1 1 200px; min-width: 0; color: var(--dim); }
  .looper-bar.live .loop-status { color: #ffb0a8; }
  .big-count { font: 600 28px/1 var(--mono); color: #ff7a7a; min-width: 1.2em; text-align: center; }
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
    .clip button, .add-clip, .clip-panel button, .rec-bar .rec, .rec-bar select { min-height: 36px; }
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
    .song-list, .wav-panel { grid-template-columns: 1fr; }
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
