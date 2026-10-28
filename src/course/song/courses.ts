// The courses the guide panel follows beside the Song view.

import type { GuideCourse } from "./guide";
import { SONG_LESSONS } from "./lessons";
import { LOOP_LESSONS } from "./looping";

export const SONG_COURSE: GuideCourse = {
  id: "song",
  title: "Make a song",
  about: "Putting sounds together into music, in the Song view: beats and bars, clips, the piano roll, recording, arranging, mixing and exporting.",
  lessons: SONG_LESSONS,
  storageKey: "minilab3.songCourse",
};

export const LOOP_COURSE: GuideCourse = {
  id: "loop",
  title: "Live looping",
  about: "Building music live, a layer at a time, from the MiniLab's pads (or the screen's): your first loop, layers on top, fixing a take, and a jam captured as a song.",
  lessons: LOOP_LESSONS,
  storageKey: "minilab3.loopCourse",
};

export const COURSES = [SONG_COURSE, LOOP_COURSE];
