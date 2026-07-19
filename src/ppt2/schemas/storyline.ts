/**
 * 报告故事线 Schema
 * 对应模块：Storyline Planner
 * AI 第二次调用（第一步）返回此结构
 */
import { z } from "zod";

export const ChapterSchema = z.object({
  chapterId: z.string(),
  chapterTitle: z.string(),
  chapterMessage: z.string(),
  findingIds: z.array(z.string()).default([]),
});

export const StorylineSchema = z.object({
  reportTitle: z.string(),
  reportSubtitle: z.string().default(""),
  executiveSummary: z.array(z.string()).default([]),
  chapters: z.array(ChapterSchema).min(1),
  recommendedSlideCount: z.number().int().min(5).max(30).default(10),
  storyLogic: z.string().default("现状—问题—原因—机会—建议"),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type Storyline = z.infer<typeof StorylineSchema>;

export function parseStoryline(json: unknown): Storyline {
  return StorylineSchema.parse(json);
}

export function safeParseStoryline(json: unknown):
  { success: true; data: Storyline } | { success: false; error: string } {
  const result = StorylineSchema.safeParse(json);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
