// The course's chapters, in order. Chapter 5 comes in slice 28.

import { CHAPTER_1 } from "./chapter1";
import { CHAPTER_2 } from "./chapter2";
import { CHAPTER_3 } from "./chapter3";
import { CHAPTER_4 } from "./chapter4";
import type { Chapter, Lesson } from "./lesson";

export const CHAPTERS: Chapter[] = [CHAPTER_1, CHAPTER_2, CHAPTER_3, CHAPTER_4];

/** Every page, in course order, with its chapter. */
export const PAGES: { chapter: Chapter; lesson: Lesson }[] = CHAPTERS.flatMap((chapter) => chapter.lessons.map((lesson) => ({ chapter, lesson })));
