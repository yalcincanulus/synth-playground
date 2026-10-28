// The song export: the arrangement rendered offline, faster than real time, in an OfflineAudioContext with an
// engine of its own (the same voices, effects, mixer strips and master as live). The live app plans notes on
// a worker clock, a little ahead of the audio; an offline render has no such clock, so it stops itself every
// half second of audio (OfflineAudioContext.suspend) and the clip player plans the next stretch then, in the
// same slices as live. Only the song's tracks are in it: the Play view's toys are live playing, not the song.

import { Engine } from "../audio/engine";
import type { ParamValues } from "../audio/params";
import { cut, tailEnd } from "../audio/wav";
import { BEATS_PER_BAR, type Clip } from "./clips";
import { ClipPlayer } from "./clipPlayer";
import { sortPlacements, type Placement } from "./arrangement";
import { audible, type Track } from "./song";

export interface SongRenderInput {
  tracks: Track[];
  /** Each synth track's sound. */
  sounds: Record<string, ParamValues>;
  clips: Clip[];
  placements: Placement[];
  tempo: number;
  /** The Keys part's sound: the drums get a little of its reverb, live and here alike. */
  keys: ParamValues;
  /** A step clip's notes moved into the scale (scale lock), as live. */
  pitch: (note: number) => number;
  /** The bars to render, [from, to). */
  from: number;
  to: number;
}

/** The first note sounds this long into the file, like Play's lead. */
const START_S = 0.05;
/** The delay and reverb ring out for at most this long after the last bar, then the file ends at silence. */
export const TAIL_S = 8;
/** The render stops this often (in audio time) to plan the next stretch. */
const CHUNK_S = 0.5;
/** Planned this far past the next stop, like the live lookahead. */
const LOOKAHEAD_S = 0.1;
/** Planning slice, in beats (a drum step, as live). */
const SLICE = 0.25;

/**
 * Render bars [from, to) of the song. `progress` gets 0..1 as it goes. Aborting `signal` makes it throw an
 * AbortError (the rest renders without planning, quickly, and is thrown away).
 */
export async function renderSong(song: SongRenderInput, sampleRate: number, progress: (done: number) => void = () => {}, signal?: AbortSignal): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const secPerBeat = 60 / song.tempo;
  const beats = (song.to - song.from) * BEATS_PER_BAR;
  const songEnd = START_S + beats * secPerBeat;
  const total = songEnd + TAIL_S;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  // The engine is written for a live AudioContext; offline it only lacks resume(), which isn't called here.
  const engine = new Engine(ctx as unknown as AudioContext);
  await engine.ready;
  engine.setBpm(song.tempo);
  engine.setParams(song.keys, "keys");
  for (const t of song.tracks) {
    if (t.kind !== "synth" || !song.sounds[t.id]) continue;
    engine.addPart(t.id, song.sounds[t.id]).voiceCap = t.voices;
    engine.parts[t.id].fx.strip.set(t.volume, t.pan, !audible(t, song.tracks));
  }
  const drums = engine.addDrumTrack();
  const drumTrack = song.tracks.find((t) => t.kind === "drums");
  if (drumTrack) drums.strip.set(drumTrack.volume, drumTrack.pan, !audible(drumTrack, song.tracks));
  engine.fx.settle();
  // Let the wavetables and settings reach the audio thread before rendering starts.
  await new Promise((r) => setTimeout(r, 50));
  await engine.flush();

  const player = new ClipPlayer(
    {
      noteOn: (track, note, velocity, time, slide) => engine.noteOn(note, velocity, time, slide, track),
      noteOff: (track, note, time) => engine.noteOff(note, time, track),
      pitchTo: (track, from, to, time) => engine.pitchTo(from, to, time, track),
      drum: (pad, velocity, time) => drums.drums.trigger(pad, velocity, time),
    },
    (id) => song.clips.find((c) => c.id === id),
  );
  player.pitch = song.pitch;
  const trackOf = new Map(song.clips.map((c) => [c.id, c.track]));
  const arrangement = new Map<string, Placement[]>();
  for (const p of sortPlacements([...song.placements])) {
    const track = trackOf.get(p.clip);
    if (track) arrangement.set(track, [...(arrangement.get(track) ?? []), p]);
  }
  player.arrangement = () => arrangement;
  player.from = song.from * BEATS_PER_BAR;
  player.reset();

  const timeAt = (b: number) => START_S + b * secPerBeat;
  let beat = 0;
  let ended = false;
  /** Plan everything that starts before `time`; at the song's end, every note still held ends there. */
  const planUntil = (time: number) => {
    while (beat < beats && timeAt(beat) < time) {
      player.schedule(beat, Math.min(beats, beat + SLICE), timeAt, secPerBeat, false);
      beat += SLICE;
    }
    if (beat >= beats && !ended) {
      player.stop(songEnd);
      ended = true;
    }
  };

  planUntil(CHUNK_S + LOOKAHEAD_S);
  await engine.flush();
  for (let at = CHUNK_S; at < total; at += CHUNK_S) {
    const stop = at;
    void ctx.suspend(stop).then(async () => {
      progress(stop / total);
      if (!signal?.aborted && !ended) {
        planUntil(stop + CHUNK_S + LOOKAHEAD_S);
        // Notes are messages to the audio thread: let them arrive before going on.
        await engine.flush();
      }
      void ctx.resume();
    });
  }
  const buffer = await ctx.startRendering();
  if (signal?.aborted) throw new DOMException("The export was cancelled.", "AbortError");
  progress(1);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const end = tailEnd(channels, Math.round(songEnd * sampleRate), sampleRate);
  return { channels: cut(channels, end, sampleRate), sampleRate };
}
