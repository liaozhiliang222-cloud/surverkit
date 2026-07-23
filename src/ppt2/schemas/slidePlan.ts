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
  // ====== 第一阶段新增：结构化图形类型（让 visualType 真正生效）======
  "PYRAMID_HIERARCHY",   // 需求金字塔 / 层级分析
  "DECISION_PATH",       // 购买决策路径
  "PRODUCT_HOUSE",       // 品牌 / 产品屋
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

// ====== 层级节点（用于金字塔 / 产品屋 / 决策路径的多级结构）======
// 主论点 → 子论点 → 证据
export interface VisualNode {
  text: string;
  children?: VisualNode[];
}

// ====== 旅程阶段（JOURNEY 泳道式使用）======
export interface JourneyStage {
  stage: string;
  behavior: string;
  touchpoint: string;
  emotion: string;
  painPoint: string;
}

// ====== 矩阵单元格（PAIN_POINT_MATRIX / OPPORTUNITY_MATRIX 使用）======
export interface MatrixCell {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  priority: "high" | "medium" | "low";
}

// ====== 因果链（CAUSE_ANALYSIS 三级因果 / 多因一果使用）======
export interface CausalChain {
  effect: string;
  surfaceCauses: string[];
  rootCauses: string[];
}
export const VisualNodeSchema: z.ZodType<VisualNode> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(VisualNodeSchema).optional(),
  }),
);

function contentItemToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  const title = item.title || item.stage || item.name || item.label || item.effect || "";
  const description = item.description || item.summary || item.text || item.behavior || item.detail || "";
  if (title && description) return `${String(title)}：${String(description)}`;
  if (title || description) return String(title || description);
  return Object.values(item).filter((part) => typeof part === "string").join("：");
}

const FlexibleStringArraySchema = z.preprocess((value) => {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(contentItemToText).filter(Boolean);
}, z.array(z.string()).default([]));

const FlexibleRecommendationsSchema = z.preprocess((value) => {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry) => {
    if (typeof entry === "string") {
      return { title: entry, description: "", priority: "medium" };
    }
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const priority = ["high", "medium", "low"].includes(String(item.priority))
      ? String(item.priority)
      : "medium";
    return {
      title: String(item.title || item.name || item.action || "行动建议"),
      description: String(item.description || item.detail || item.expectedImpact || ""),
      priority,
    };
  });
}, z.array(z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
})).default([]));

export const SlideContentSchema = z.object({
  items: FlexibleStringArraySchema,
  leftColumn: FlexibleStringArraySchema,
  rightColumn: FlexibleStringArraySchema,
  quote: z.string().default(""),
  quoteSpeaker: z.string().default(""),
  quoteSource: z.string().default(""),
  metric: z.string().default(""),
  metricLabel: z.string().default(""),
  visualItems: FlexibleStringArraySchema,
  // 层级结构（金字塔的层 / 产品屋的支柱 / 决策路径的阶段），
  // 每个节点可带 children 表达"主论点→子论点→证据"的多级关系。
  // 可选：不填则渲染器仅依据 visualItems 平铺绘制。
  visualTree: z.array(VisualNodeSchema).optional(),
  // ====== 第二阶段新增：结构化内容字段（让矩阵/旅程/因果真正结构化）======
  // 旅程阶段：每阶段可挂行为 / 触点 / 情绪 / 痛点 多层信息（JOURNEY 泳道式使用）
  journeyStages: z.array(z.object({
    stage: z.string(),
    behavior: z.string().default(""),
    touchpoint: z.string().default(""),
    emotion: z.string().default(""),
    painPoint: z.string().default(""),
  })).optional(),
  // 矩阵单元格：每格从"标题：描述"字符串升级为结构化对象，带严重度/优先级
  matrixCells: z.array(z.object({
    title: z.string(),
    description: z.string().default(""),
    severity: z.enum(["high", "medium", "low"]).default("medium"),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
  })).optional(),
  // 因果链：现象→表层原因→深层根因 三级；多条链可共享同一 effect（多因一果）
  causalChains: z.array(z.object({
    effect: z.string(),
    surfaceCauses: z.array(z.string()).default([]),
    rootCauses: z.array(z.string()).default([]),
  })).optional(),
  recommendations: FlexibleRecommendationsSchema,
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
    error: [
      ...result.error.issues.slice(0, 8).map(i => `${i.path.join(".")}: ${i.message}`),
      ...(result.error.issues.length > 8 ? [`另有 ${result.error.issues.length - 8} 项格式问题`] : []),
    ].join("; "),
  };
}
