// The course's chapters, in order. More come in slices 25-28.

import { CHAPTER_1 } from "./chapter1";
import type { Chapter, Lesson } from "./lesson";

export const CHAPTERS: Chapter[] = [CHAPTER_1];

/** Every page, in course order, with its chapter. */
export const PAGES: { chapter: Chapter; lesson: Lesson }[] = CHAPTERS.flatMap((chapter) => chapter.lessons.map((lesson) => ({ chapter, lesson })));
