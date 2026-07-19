/**
 * 洞察提取 Schema
 * 对应模块：Insight Extractor
 * AI 第一次调用返回此结构
 */
import { z } from "zod";

export const ResearchContextSchema = z.object({
  projectName: z.string().default(""),
  researchObjective: z.string().default(""),
  respondentProfile: z.string().default(""),
  industry: z.string().default(""),
});

export const QuoteSchema = z.object({
  speaker: z.string().default("受访者"),
  quote: z.string(),
  segmentId: z.string().default(""),
  fileName: z.string().default(""),
});

export const FindingSchema = z.object({
  findingId: z.string(),
  topicId: z.string().default(""),
  headline: z.string(),
  description: z.string(),
  importance: z.enum(["high", "medium", "low"]).default("medium"),
  confidence: z.number().min(0).max(1).default(0.8),
  evidenceSegmentIds: z.array(z.string()).default([]),
  quotes: z.array(QuoteSchema).default([]),
  implications: z.array(z.string()).default([]),
  isInference: z.boolean().default(false),
});

export const TopicSchema = z.object({
  topicId: z.string(),
  name: z.string(),
  summary: z.string().default(""),
});

export const RecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  relatedFindingIds: z.array(z.string()).default([]),
  expectedImpact: z.string().default(""),
});

export const InsightPackSchema = z.object({
  researchContext: ResearchContextSchema,
  topics: z.array(TopicSchema).min(1),
  findings: z.array(FindingSchema).min(1),
  painPoints: z.array(FindingSchema).default([]),
  causes: z.array(FindingSchema).default([]),
  opportunities: z.array(FindingSchema).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  contradictions: z.array(z.object({
    description: z.string(),
    findingIds: z.array(z.string()).default([]),
  })).default([]),
  informationGaps: z.array(z.string()).default([]),
});

export type ResearchContext = z.infer<typeof ResearchContextSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type InsightPack = z.infer<typeof InsightPackSchema>;

/**
 * 从 JSON 解析 InsightPack，失败时抛出 ZodError
 */
export function parseInsightPack(json: unknown): InsightPack {
  return InsightPackSchema.parse(json);
}

/**
 * 安全解析，失败时返回 { error } 而非抛出
 */
export function safeParseInsightPack(json: unknown):
  { success: true; data: InsightPack } | { success: false; error: string } {
  const result = InsightPackSchema.safeParse(json);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
