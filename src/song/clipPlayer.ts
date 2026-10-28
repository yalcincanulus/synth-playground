// The clip player: each track plays its part of the arrangement, or loops a clip chosen for it in the clip
// launcher instead (until that is stopped), planned at exact audio times on the drum Sequencer's lookahead
// clock (like the step sequencer and the arpeggiator), so clips and the Play view's toys keep one time. A
// clip chosen while the transport plays starts on the next bar; on Play every chosen clip starts together
// from bar 1, and the arrangement from the start bar. Plain code, so it is tested without a browser.

import { TRACKS as DRUMS, STEPS } from "../audio/sequencer";
import { NoteSequencer } from "../audio/stepSequencer";
import { placementEnd, SongClock, type Placement } from "./arrangement";
import { BEATS_PER_BAR, clipBeats, TICKS_PER_BEAT, type Clip, type NoteClip, type StepClip } from "./clips";

/** Where a clip's sound goes. */
export interface ClipOut {
  noteOn(track: string, note: number, velocity: number, time: number, slide: boolean): void;
  noteOff(track: string, note: number, time: number): void;
  /** Move a sounding note to another pitch at once (a step clip at legato speed). */
  pitchTo(track: string, from: number, to: number, time: number): void;
  /** The song's drum kit. */
  drum(pad: number, velocity: number, time: number): void;
}

/** Steps of a drum clip: a 16th each. */
const DRUM_STEP_BEATS = BEATS_PER_BAR / STEPS;
const EPS = 1e-9;

/** One track's place in its clip. */
interface Lane {
  /** The clip chosen for the track (null: none). */
  clip: string | null;
  /** A clip chosen while playing, to start on the next bar (null: stop the track). Undefined: no change waiting. */
  next?: string | null;
  /** Beat (since Play) the clip's current time round started on. */
  start: number;
  /** Notes sounding (note clips), with the beat each ends on and the audio time it starts at. */
  held: { note: number; end: number; at: number }[];
  /** When each note a step clip plays last started (a note-off never goes before its note-on). */
  stepOns: Map<number, number>;
  /** The step clip's sequencer, made when the track first plays one, and the clip it was last set up for. */
  steps: NoteSequencer | null;
  stepsClip: string | null;
  /** Step clips: note-offs are kept to this audio time, the end of the time round (or the bar a new clip starts on). */
  cut: number;
  /** Playing the arrangement (no clip chosen): what plays now, and the transport beat it stops at. */
  seg: Segment | null;
  /** Semitones the clip playing now is moved by (its placement's). */
  transpose: number;
}

/** A stretch of a track's arrangement: one time round of a placement's clip (or a gap), up to a change. */
interface Segment {
  /** The placement and where its time round started (it is a new segment when either changes). */
  key: string;
  clip: string | null;
  /** Transport beat the clip's time round started on. */
  start: number;
  /** Transport beat it stops at. */
  end: number;
  transpose: number;
}

export class ClipPlayer {
  /** A step clip's step, as it is planned (to light the step sequencer's lamps while it is edited). */
  onStep: (track: string, clip: string, step: number, time: number) => void = () => {};
  /** The clip heard on a track changes at `time` (a waiting clip started, or the track stopped). */
  onChange: (track: string, clip: string | null, time: number) => void = () => {};
  /** The note a step clip plays (scale lock moves it into the scale, as in the step sequencer). */
  pitch: (note: number) => number = (note) => note;

  /** The arrangement: each track's placements, in order of bar, as they are now (edits are heard at once). */
  arrangement: () => ReadonlyMap<string, readonly Placement[]> = () => new Map();
  /** Where the song is: Play starts it from `from`, and the loop region jumps it back. */
  readonly clock = new SongClock();
  /** The song beat Play starts from. */
  from = 0;

  private lanes = new Map<string, Lane>();
  private playing = false;

  constructor(
    private out: ClipOut,
    /** The clip with this id, as it is now (edits are heard at once); undefined once deleted. */
    private clipOf: (id: string) => Clip | undefined,
  ) {}

  /** The clip chosen for a track, and the one waiting to start (undefined: none waiting). */
  state(track: string): { clip: string | null; next?: string | null } {
    const lane = this.lanes.get(track);
    return { clip: lane?.clip ?? null, next: lane?.next };
  }

  /**
   * Beats into clip `clip` on a track at transport beat `beat` (as heard: a little behind what is planned), or -1
   * when the track isn't playing it.
   */
  position(track: string, clip: string, beat: number): number {
    const lane = this.lanes.get(track);
    const c = this.clipOf(clip);
    if (!this.playing || beat < 0 || !lane || !c) return -1;
    const start = lane.clip === clip ? lane.start : lane.clip === null && lane.seg?.clip === clip ? lane.seg.start : null;
    if (start === null) return -1;
    const len = clipBeats(c);
    return (((beat - start) % len) + len) % len;
  }

  /** The song beat at a transport beat (-1 when stopped). */
  songBeat(beat: number): number {
    return this.playing && beat >= 0 ? this.clock.songAt(beat) : -1;
  }

  /** The chosen clip of every track that has one. */
  get chosen(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [track, lane] of this.lanes) {
      const clip = lane.next !== undefined ? lane.next : lane.clip;
      if (clip) out[track] = clip;
    }
    return out;
  }

  /**
   * Choose a track's clip (null: none). While playing it starts on the next bar; stopped, it is simply chosen
   * and starts with the others on Play.
   */
  launch(track: string, clip: string | null) {
    const lane = this.lane(track);
    if (this.playing) {
      lane.next = clip === lane.clip ? undefined : clip;
      return;
    }
    lane.clip = clip;
    lane.next = undefined;
  }

  /** Forget a track (removed from the song): its notes stop at `time`. */
  removeTrack(track: string, time: number) {
    const lane = this.lanes.get(track);
    if (!lane) return;
    this.release(track, lane, time);
    this.lanes.delete(track);
  }

  /** Play: every chosen clip starts from its beginning at beat 0. */
  reset() {
    this.playing = true;
    this.clock.reset(this.from);
    for (const lane of this.lanes.values()) {
      if (lane.next !== undefined) lane.clip = lane.next;
      lane.next = undefined;
      lane.start = 0;
      lane.held = [];
      lane.seg = null;
      lane.steps?.reset();
    }
  }

  /** Stop: every sounding note ends at `time`. A clip still waiting becomes the chosen one. */
  stop(time: number) {
    this.playing = false;
    for (const [track, lane] of this.lanes) {
      this.release(track, lane, time);
      if (lane.next !== undefined) lane.clip = lane.next;
      lane.next = undefined;
      lane.seg = null;
    }
  }

  /**
   * Plan everything in [fromBeat, toBeat) (beats since Play). `timeAt` turns a beat into audio time. With
   * `skip` (that time has already passed) nothing starts, but notes still end, so none hangs.
   */
  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, secPerBeat: number, skip = false) {
    this.clock.plan(fromBeat, toBeat);
    const arrangement = this.arrangement();
    for (const track of arrangement.keys()) this.lane(track);
    for (const [track, lane] of this.lanes) {
      let b = fromBeat;
      for (;;) {
        if (lane.clip === null) {
          // The arrangement, until a clip chosen in the launcher starts.
          const change = lane.next !== undefined ? Math.ceil(b / BEATS_PER_BAR - EPS) * BEATS_PER_BAR : Infinity;
          const seg = this.segment(track, arrangement.get(track) ?? [], b);
          if (lane.seg && (seg.key !== lane.seg.key || b >= lane.seg.end - EPS)) {
            // A new time round, another placement, or a gap: what sounds ends.
            this.release(track, lane, timeAt(b));
            lane.steps?.reset();
          }
          // Taken again each time: a placement made shorter while it plays ends sooner.
          lane.seg = seg;
          lane.transpose = seg.transpose;
          if (change <= b + EPS) {
            this.release(track, lane, timeAt(b));
            lane.clip = lane.next ?? null;
            lane.next = undefined;
            lane.seg = null;
            lane.start = b;
            lane.transpose = 0;
            lane.steps?.reset();
            this.onChange(track, lane.clip, timeAt(b));
            continue;
          }
          if (b >= toBeat - EPS) break;
          const end = Math.min(lane.seg.end, change);
          const until = Math.min(end, toBeat);
          const clip = lane.seg.clip !== null ? this.clipOf(lane.seg.clip) : undefined;
          if (clip) {
            lane.start = lane.seg.start;
            this.play(track, lane, clip, b, until, end, timeAt, secPerBeat, skip);
          }
          b = until;
          continue;
        }
        const clip = lane.clip !== null ? this.clipOf(lane.clip) : undefined;
        if (!clip) {
          // Deleted while chosen: the track goes back to the arrangement.
          this.release(track, lane, timeAt(b));
          lane.clip = null;
          lane.seg = null;
          this.onChange(track, null, timeAt(b));
          continue;
        }
        const len = clipBeats(clip);
        if (lane.start + len < b - EPS) {
          // Shortened while playing, past where it is now: carry on in the time round that holds `b`.
          this.release(track, lane, timeAt(b));
          lane.start = b - ((b - lane.start) % len);
        }
        const change = lane.next !== undefined ? Math.ceil(b / BEATS_PER_BAR - EPS) * BEATS_PER_BAR : Infinity;
        const boundary = Math.min(lane.start + len, change);
        if (boundary <= b + EPS) {
          // A clip's end, or a bar where a waiting clip starts: what sounds ends, and the next time round begins.
          const time = timeAt(b);
          this.release(track, lane, time);
          if (change <= b + EPS) {
            lane.clip = lane.next ?? null;
            lane.next = undefined;
            lane.seg = null;
            this.onChange(track, lane.clip, time);
          }
          lane.start = b;
          lane.transpose = 0;
          lane.steps?.reset();
          continue;
        }
        if (b >= toBeat - EPS) break;
        const until = Math.min(boundary, toBeat);
        this.play(track, lane, clip, b, until, boundary, timeAt, secPerBeat, skip);
        b = until;
      }
    }
  }

  private lane(track: string): Lane {
    let lane = this.lanes.get(track);
    if (!lane) this.lanes.set(track, (lane = { clip: null, start: 0, held: [], steps: null, stepsClip: null, cut: Infinity, stepOns: new Map(), seg: null, transpose: 0 }));
    return lane;
  }

  /** What a track's arrangement plays from transport beat `b`: a time round of a placement's clip, or a gap, up to the next change. */
  private segment(track: string, placements: readonly Placement[], b: number): Segment {
    const s = this.clock.songAt(b);
    const jump = this.clock.nextJump(b);
    const bar = BEATS_PER_BAR;
    const p = placements.find((q) => q.bar * bar <= s + EPS && s < placementEnd(q) * bar - EPS);
    const clip = p ? this.clipOf(p.clip) : undefined;
    if (!p || !clip) {
      const next = placements.find((q) => q.bar * bar > s + EPS);
      const end = Math.min(jump, next ? b + (next.bar * bar - s) : Infinity, p ? b + (placementEnd(p) * bar - s) : Infinity);
      return { key: `gap:${track}`, clip: null, start: b, end, transpose: 0 };
    }
    const len = clipBeats(clip);
    const pos = (s - p.bar * bar) % len;
    // Within a hair of the time round's end: the next one starts here.
    const into = len - pos < EPS ? 0 : pos;
    const start = b - into;
    const end = Math.min(start + len, b + (placementEnd(p) * bar - s), jump);
    return { key: `${p.id}:${p.clip}:${Math.round((s - into) * 1e6)}`, clip: p.clip, start, end, transpose: p.transpose };
  }

  /** End every note the track sounds, at `time` (or as it starts, for one planned to start later: Stop comes before the lookahead runs out). */
  private release(track: string, lane: Lane, time: number) {
    for (const h of lane.held) this.out.noteOff(track, h.note, Math.max(time, h.at));
    lane.held = [];
    lane.steps?.release(time);
  }

  /** One clip, over [from, to) beats of the time round that started at lane.start and ends at `boundary`. */
  private play(track: string, lane: Lane, clip: Clip, from: number, to: number, boundary: number, timeAt: (beat: number) => number, secPerBeat: number, skip: boolean) {
    const p = lane.start;
    if (clip.kind === "drums") {
      for (let k = Math.ceil((from - p) / DRUM_STEP_BEATS - EPS); p + k * DRUM_STEP_BEATS < to - EPS; k++) {
        if (skip) continue;
        const bar = clip.patterns[Math.floor(k / STEPS)];
        if (!bar) break;
        for (let d = 0; d < DRUMS; d++) {
          const vel = bar[d][k % STEPS];
          if (vel > 0) this.out.drum(d, vel, timeAt(p + k * DRUM_STEP_BEATS));
        }
      }
    } else if (clip.kind === "steps") {
      const seq = this.stepsFor(track, lane, clip);
      lane.cut = timeAt(boundary);
      seq.schedule(from - p, to - p, (b) => timeAt(b + p), secPerBeat, skip);
    } else {
      // A step clip turned into notes while it plays: a note its sequencer holds (a slide) ends here.
      if (lane.stepsClip === clip.id) {
        lane.steps?.release(timeAt(from));
        lane.stepsClip = null;
      }
      this.playNotes(track, lane, clip, from, to, boundary, timeAt, skip);
    }
  }

  private playNotes(track: string, lane: Lane, clip: NoteClip, from: number, to: number, boundary: number, timeAt: (beat: number) => number, skip: boolean) {
    const p = lane.start;
    const ends = (upTo: number, inclusive: boolean) => {
      lane.held = lane.held.filter((h) => {
        if (h.end > upTo + EPS || (!inclusive && h.end > upTo - EPS)) return true;
        this.out.noteOff(track, h.note, timeAt(h.end));
        return false;
      });
    };
    for (const n of clip.notes) {
      const at = p + n.start / TICKS_PER_BEAT;
      if (at < from - EPS) continue;
      if (at >= to - EPS) break;
      // Notes that end by now end first, so a note played again right after itself starts fresh.
      ends(at, true);
      if (skip) continue;
      const pitch = Math.max(0, Math.min(127, n.pitch + lane.transpose));
      // The same pitch still sounding (overlapping notes): it ends where the new one starts.
      const same = lane.held.findIndex((h) => h.note === pitch);
      if (same >= 0) {
        this.out.noteOff(track, pitch, timeAt(at));
        lane.held.splice(same, 1);
      }
      this.out.noteOn(track, pitch, n.velocity, timeAt(at), false);
      lane.held.push({ note: pitch, end: Math.min(at + n.length / TICKS_PER_BEAT, boundary), at: timeAt(at) });
    }
    ends(to, false);
  }

  /** The track's step sequencer, playing into the track; its note-offs are kept inside the clip. */
  private stepsFor(track: string, lane: Lane, clip: StepClip): NoteSequencer {
    if (!lane.steps) {
      lane.steps = new NoteSequencer(clip.seq, {
        noteOn: (note, velocity, time, slide) => {
          lane.stepOns.set(note, time);
          this.out.noteOn(track, note, velocity, time, slide);
        },
        noteOff: (note, time) => this.out.noteOff(track, note, Math.max(Math.min(time, lane.cut), lane.stepOns.get(note) ?? -Infinity)),
        pitchTo: (from, to, time) => this.out.pitchTo(track, from, to, time),
      });
      lane.steps.pitch = (note) => this.pitch(Math.max(0, Math.min(127, note + lane.transpose)));
    }
    // The clip's settings object can be replaced (undo): the same clip goes on where it is, another starts from step 1.
    lane.steps.s = clip.seq;
    if (lane.stepsClip !== clip.id) {
      lane.stepsClip = clip.id;
      lane.steps.reset();
      lane.steps.onStep = (step, time) => this.onStep(track, clip.id, step, time);
    }
    return lane.steps;
  }
}
