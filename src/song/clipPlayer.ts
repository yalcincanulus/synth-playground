// The clip player: each track loops the clip chosen for it, planned at exact audio times on the drum
// Sequencer's lookahead clock (like the step sequencer and the arpeggiator), so clips and the Play view's
// toys keep one time. A clip chosen while the transport plays starts on the next bar; on Play every chosen
// clip starts together from bar 1. Plain code, so it is tested without a browser.

import { TRACKS as DRUMS, STEPS } from "../audio/sequencer";
import { NoteSequencer } from "../audio/stepSequencer";
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
}

export class ClipPlayer {
  /** A step clip's step, as it is planned (to light the step sequencer's lamps while it is edited). */
  onStep: (track: string, clip: string, step: number, time: number) => void = () => {};
  /** The clip heard on a track changes at `time` (a waiting clip started, or the track stopped). */
  onChange: (track: string, clip: string | null, time: number) => void = () => {};
  /** The note a step clip plays (scale lock moves it into the scale, as in the step sequencer). */
  pitch: (note: number) => number = (note) => note;

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
    if (!this.playing || beat < 0 || !lane || lane.clip !== clip || !c) return -1;
    const len = clipBeats(c);
    return (((beat - lane.start) % len) + len) % len;
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
    for (const lane of this.lanes.values()) {
      if (lane.next !== undefined) lane.clip = lane.next;
      lane.next = undefined;
      lane.start = 0;
      lane.held = [];
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
    }
  }

  /**
   * Plan everything in [fromBeat, toBeat) (beats since Play). `timeAt` turns a beat into audio time. With
   * `skip` (that time has already passed) nothing starts, but notes still end, so none hangs.
   */
  schedule(fromBeat: number, toBeat: number, timeAt: (beat: number) => number, secPerBeat: number, skip = false) {
    for (const [track, lane] of this.lanes) {
      let b = fromBeat;
      for (;;) {
        const clip = lane.clip !== null ? this.clipOf(lane.clip) : undefined;
        if (lane.clip !== null && !clip) {
          // Deleted while chosen: the track falls silent.
          this.release(track, lane, timeAt(b));
          lane.clip = null;
          this.onChange(track, null, timeAt(b));
        }
        if (!clip && lane.next === undefined) break;
        const len = clip ? clipBeats(clip) : Infinity;
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
            this.onChange(track, lane.clip, time);
          }
          lane.start = b;
          lane.steps?.reset();
          continue;
        }
        if (b >= toBeat - EPS) break;
        const until = Math.min(boundary, toBeat);
        if (clip) this.play(track, lane, clip, b, until, boundary, timeAt, secPerBeat, skip);
        b = until;
      }
    }
  }

  private lane(track: string): Lane {
    let lane = this.lanes.get(track);
    if (!lane) this.lanes.set(track, (lane = { clip: null, start: 0, held: [], steps: null, stepsClip: null, cut: Infinity, stepOns: new Map() }));
    return lane;
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
      // The same pitch still sounding (overlapping notes): it ends where the new one starts.
      const same = lane.held.findIndex((h) => h.note === n.pitch);
      if (same >= 0) {
        this.out.noteOff(track, n.pitch, timeAt(at));
        lane.held.splice(same, 1);
      }
      this.out.noteOn(track, n.pitch, n.velocity, timeAt(at), false);
      lane.held.push({ note: n.pitch, end: Math.min(at + n.length / TICKS_PER_BEAT, boundary), at: timeAt(at) });
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
      lane.steps.pitch = (note) => this.pitch(note);
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
