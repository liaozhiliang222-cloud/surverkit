/**
 * 幻灯片规划 Schema
 * 对应模块：Slide Planner
 * AI 第二次调用（第二步）返回此结构
 *
 * 关键原则：AI 只选择 slideType 和填写内容字段，
 * 不输出任何坐标、字号、颜色——这些由 templateRegistry 控制
 */
import { z } from "zod";

export const SlideTypeSchema = z.enum([
  "COVER",
  "AGENDA",
  "SECTION_DIVIDER",
  "EXECUTIVE_SUMMARY",
  "KEY_FINDING",
  "INSIGHT_EVIDENCE",
  "THREE_INSIGHTS",
  "TWO_COLUMN_COMPARE",
  "QUOTE",
  "PROCESS",
  "JOURNEY",
  "CAUSE_ANALYSIS",
  "PAIN_POINT_MATRIX",
  "OPPORTUNITY_MATRIX",
  "RECOMMENDATIONS",
  "CONCLUSION",
  "APPENDIX",
]);

export const VisualTypeSchema = z.enum([
  "none",
  "pyramid",
  "flowchart",
  "product-house",
  "decision-path",
  "experience-map",
  "matrix",
  "metric",
  "chart",
]);

export const SlideContentSchema = z.object({
  items: z.array(z.string()).default([]),
  leftColumn: z.array(z.string()).default([]),
  rightColumn: z.array(z.string()).default([]),
  quote: z.string().default(""),
  quoteSpeaker: z.string().default(""),
  quoteSource: z.string().default(""),
  metric: z.string().default(""),
  metricLabel: z.string().default(""),
  visualItems: z.array(z.string()).default([]),
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
  })).default([]),
}).passthrough();

export const SlidePlanSchema = z.object({
  slideId: z.string(),
  slideType: SlideTypeSchema,
  templateId: z.string().default(""),
  chapterId: z.string().default(""),
  chapterLabel: z.string().default(""),
  title: z.string(),
  subtitle: z.string().default(""),
  coreMessage: z.string().default(""),
  content: SlideContentSchema,
  findingIds: z.array(z.string()).default([]),
  evidenceSegmentIds: z.array(z.string()).default([]),
  visualType: VisualTypeSchema.default("none"),
  speakerNotes: z.string().default(""),
});

export const SlidePlanArraySchema = z.object({
  slides: z.array(SlidePlanSchema).min(1),
});

export type SlideType = z.infer<typeof SlideTypeSchema>;
export type VisualType = z.infer<typeof VisualTypeSchema>;
export type SlideContent = z.infer<typeof SlideContentSchema>;
export type SlidePlan = z.infer<typeof SlidePlanSchema>;

export function parseSlidePlans(json: unknown): SlidePlan[] {
  return SlidePlanArraySchema.parse(json).slides;
}

export function safeParseSlidePlans(json: unknown):
  { success: true; data: SlidePlan[] } | { success: false; error: string } {
  const result = SlidePlanArraySchema.safeParse(json);
  if (result.success) return { success: true, data: result.data.slides };
  return {
    success: false,
    error: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
