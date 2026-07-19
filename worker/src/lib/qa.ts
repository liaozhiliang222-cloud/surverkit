/**
 * 规则质检引擎（QA Rule Checker）- TypeScript 版
 *
 * 从 Python ai-proxy/qa_engine.py 完整迁移。
 * 对 SlidePlan[] 执行 13 条基于规则的质量检查，输出每页得分和问题列表。
 */

// ====================================================================
// 类型定义
// ====================================================================

export type Severity = "high" | "medium" | "low";

export interface QAIssue {
  type: string;
  severity: Severity;
  description: string;
  suggestion: string;
}

export interface SlideCheckResult {
  slideId: string;
  slideType: string;
  score: number;
  issues: QAIssue[];
  recommendation: "ok" | "optimize" | "fix" | "switch_template";
}

export interface QACheckResult {
  results: SlideCheckResult[];
  overallScore: number;
  summary: string;
  totalIssues: number;
  highIssues: number;
  mediumIssues: number;
}

// ====================================================================
// 模板容量映射（与前端 templateRegistry 保持一致）
// ====================================================================

interface TemplateCapacity {
  titleMax: number;
  subtitleMax: number;
  maxItems: number;
  itemMax: number;
  quoteMax: number;
  minFontSize: number;
}

const TEMPLATE_CAPACITY: Record<string, TemplateCapacity> = {
  COVER: { titleMax: 30, subtitleMax: 60, maxItems: 4, itemMax: 30, quoteMax: 0, minFontSize: 12 },
  AGENDA: { titleMax: 20, subtitleMax: 50, maxItems: 6, itemMax: 80, quoteMax: 0, minFontSize: 12 },
  SECTION_DIVIDER: { titleMax: 20, subtitleMax: 80, maxItems: 0, itemMax: 0, quoteMax: 0, minFontSize: 16 },
  EXECUTIVE_SUMMARY: { titleMax: 30, subtitleMax: 50, maxItems: 5, itemMax: 80, quoteMax: 0, minFontSize: 12 },
  KEY_FINDING: { titleMax: 40, subtitleMax: 60, maxItems: 4, itemMax: 70, quoteMax: 100, minFontSize: 14 },
  INSIGHT_EVIDENCE: { titleMax: 36, subtitleMax: 50, maxItems: 4, itemMax: 80, quoteMax: 120, minFontSize: 12 },
  THREE_INSIGHTS: { titleMax: 34, subtitleMax: 40, maxItems: 3, itemMax: 100, quoteMax: 0, minFontSize: 12 },
  TWO_COLUMN_COMPARE: { titleMax: 32, subtitleMax: 40, maxItems: 4, itemMax: 80, quoteMax: 0, minFontSize: 12 },
  QUOTE: { titleMax: 20, subtitleMax: 40, maxItems: 0, itemMax: 0, quoteMax: 160, minFontSize: 14 },
  PROCESS: { titleMax: 32, subtitleMax: 50, maxItems: 5, itemMax: 90, quoteMax: 0, minFontSize: 11 },
  JOURNEY: { titleMax: 32, subtitleMax: 50, maxItems: 5, itemMax: 100, quoteMax: 0, minFontSize: 11 },
  CAUSE_ANALYSIS: { titleMax: 36, subtitleMax: 50, maxItems: 4, itemMax: 80, quoteMax: 0, minFontSize: 12 },
  PAIN_POINT_MATRIX: { titleMax: 32, subtitleMax: 50, maxItems: 6, itemMax: 100, quoteMax: 0, minFontSize: 11 },
  OPPORTUNITY_MATRIX: { titleMax: 32, subtitleMax: 50, maxItems: 6, itemMax: 100, quoteMax: 0, minFontSize: 11 },
  RECOMMENDATIONS: { titleMax: 30, subtitleMax: 40, maxItems: 5, itemMax: 90, quoteMax: 0, minFontSize: 12 },
  CONCLUSION: { titleMax: 30, subtitleMax: 60, maxItems: 4, itemMax: 80, quoteMax: 0, minFontSize: 13 },
  APPENDIX: { titleMax: 20, subtitleMax: 50, maxItems: 6, itemMax: 90, quoteMax: 0, minFontSize: 12 },
};

const DEFAULT_CAPACITY: TemplateCapacity = {
  titleMax: 40, subtitleMax: 60, maxItems: 5, itemMax: 80, quoteMax: 100, minFontSize: 12,
};

// 空泛标题关键词（应避免）
const EMPTY_TITLE_KEYWORDS = [
  "用户反馈分析", "主要发现", "访谈结果", "核心洞察", "痛点分析",
  "机会分析", "建议总结", "研究结论", "数据分析", "访谈纪要",
  "调研报告", "总结", "概述", "分析",
];

// ====================================================================
// 质检主函数
// ====================================================================

export function checkSlides(slides: Array<Record<string, any>>): QACheckResult {
  const results: SlideCheckResult[] = [];
  let totalScore = 0;

  for (let idx = 0; idx < slides.length; idx++) {
    const slideResult = checkSingleSlide(slides[idx], idx, slides);
    results.push(slideResult);
    totalScore += slideResult.score;
  }

  const overallScore = results.length > 0 ? Math.floor(totalScore / results.length) : 0;

  // 汇总
  const allIssues: QAIssue[] = [];
  for (const r of results) {
    allIssues.push(...r.issues);
  }

  const highCount = allIssues.filter(i => i.severity === "high").length;
  const mediumCount = allIssues.filter(i => i.severity === "medium").length;

  let summary = `共检查 ${results.length} 页，平均得分 ${overallScore}。`;
  if (highCount > 0) {
    summary += ` 发现 ${highCount} 个严重问题需要立即修复。`;
  }
  if (mediumCount > 0) {
    summary += ` ${mediumCount} 个中等问题建议优化。`;
  }
  if (highCount === 0 && mediumCount === 0) {
    summary += " 未发现明显问题。";
  }

  return {
    results,
    overallScore,
    summary,
    totalIssues: allIssues.length,
    highIssues: highCount,
    mediumIssues: mediumCount,
  };
}

// ====================================================================
// 单页检查
// ====================================================================

function checkSingleSlide(
  slide: Record<string, any>,
  idx: number,
  allSlides: Array<Record<string, any>>,
): SlideCheckResult {
  const issues: QAIssue[] = [];
  const slideId = slide.slideId || `slide_${idx + 1}`;
  const slideType: string = slide.slideType || "";
  const title: string = slide.title || "";
  const subtitle: string = slide.subtitle || "";
  const coreMessage: string = slide.coreMessage || "";
  const content: Record<string, any> = slide.content || {};

  const cap = TEMPLATE_CAPACITY[slideType] || DEFAULT_CAPACITY;

  const items: any[] = content.items || [];
  const leftCol: any[] = content.leftColumn || [];
  const rightCol: any[] = content.rightColumn || [];
  const quote: string = content.quote || "";
  const quoteSpeaker: string = content.quoteSpeaker || "";
  const visualItems: any[] = content.visualItems || [];
  const recs: any[] = content.recommendations || [];
  const chapterLabel: string = slide.chapterLabel || "";

  // 规则1：标题超过两行
  const titleMaxCharsPerLine = Math.floor(11.93 * 72 / 24 * 0.85);
  const titleLines = Math.max(1, Math.ceil(title.length / titleMaxCharsPerLine));
  if (titleLines > 2) {
    issues.push({
      type: "TITLE_TOO_LONG",
      severity: "high",
      description: `标题超过两行（估计 ${titleLines} 行），当前 ${title.length} 字`,
      suggestion: "压缩标题，保留结论，删除背景解释",
    });
  }

  // 规则2：标题超过模板容量
  if (title.length > cap.titleMax) {
    issues.push({
      type: "TITLE_EXCEEDS_CAPACITY",
      severity: "medium",
      description: `标题长度 ${title.length} 超过模板容量 ${cap.titleMax}`,
      suggestion: `压缩到 ${cap.titleMax} 字以内`,
    });
  }

  // 规则3：空泛标题
  for (const keyword of EMPTY_TITLE_KEYWORDS) {
    if (title.includes(keyword)) {
      issues.push({
        type: "EMPTY_TITLE",
        severity: "high",
        description: `标题包含空泛关键词「${keyword}」，缺少具体结论`,
        suggestion: "改写为结论型标题，如「新鲜感是首要入口，而非功能诉求」",
      });
      break;
    }
  }

  // 规则4：items 超量
  if (items.length > 0 && items.length > cap.maxItems) {
    issues.push({
      type: "TEXT_OVERFLOW",
      severity: "high",
      description: `要点数量 ${items.length} 超过模板容量 ${cap.maxItems}`,
      suggestion: "删除次要要点或拆分为两页",
    });
  }

  // 规则5：单条要点过长
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === "string" && item.length > cap.itemMax) {
      issues.push({
        type: "ITEM_TOO_LONG",
        severity: "medium",
        description: `第 ${i + 1} 条要点长度 ${item.length} 超过限制 ${cap.itemMax}`,
        suggestion: "压缩该要点或拆分为多条",
      });
      break;
    }
  }

  // 规则6：引用过长
  if (quote && quote.length > cap.quoteMax && cap.quoteMax > 0) {
    issues.push({
      type: "QUOTE_TOO_LONG",
      severity: "medium",
      description: `引用长度 ${quote.length} 超过限制 ${cap.quoteMax}`,
      suggestion: "截取关键部分或分段展示",
    });
  }

  // 规则7：页面内容过密
  const totalContentCount = items.length + leftCol.length + rightCol.length + visualItems.length + recs.length;
  if (totalContentCount > cap.maxItems * 2) {
    issues.push({
      type: "SLIDE_TOO_DENSE",
      severity: "medium",
      description: `页面内容元素总数 ${totalContentCount} 过多`,
      suggestion: "删除次要内容或将详细内容移至下一页",
    });
  }

  // 规则8：页面过空
  const isStructural = ["COVER", "SECTION_DIVIDER", "QUOTE"].includes(slideType);
  if (!isStructural && totalContentCount === 0 && !quote) {
    issues.push({
      type: "SLIDE_TOO_EMPTY",
      severity: "medium",
      description: "页面内容为空，缺少支撑材料",
      suggestion: "增加证据、原话或相关要点",
    });
  }

  // 规则9：连续多页相同版式
  if (idx >= 2) {
    const prev1 = allSlides[idx - 1].slideType || "";
    const prev2 = allSlides[idx - 2].slideType || "";
    if (slideType === prev1 && slideType === prev2) {
      issues.push({
        type: "LAYOUT_REPETITIVE",
        severity: "medium",
        description: `连续 3 页使用 ${slideType} 版式`,
        suggestion: "在不改变故事线的情况下切换同类模板",
      });
    }
  }

  // 规则10：三个以上互相竞争的视觉重点
  const competingFocuses = [
    items.length > 0 ? 1 : 0,
    quote ? 1 : 0,
    visualItems.length > 0 ? 1 : 0,
    recs.length > 0 ? 1 : 0,
    (leftCol.length > 0 || rightCol.length > 0) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (competingFocuses >= 4 && slideType !== "INSIGHT_EVIDENCE") {
    issues.push({
      type: "TOO_MANY_FOCUSES",
      severity: "low",
      description: `页面有 ${competingFocuses} 个视觉重点互相竞争`,
      suggestion: "精简为 1-2 个核心视觉重点",
    });
  }

  // 规则11：图表缺少结论标题
  const visualType: string = slide.visualType || "none";
  if (visualType && visualType !== "none") {
    if (!coreMessage && !title) {
      issues.push({
        type: "CHART_NO_CONCLUSION",
        severity: "medium",
        description: "图表页缺少结论标题",
        suggestion: "添加一句话总结图表发现的核心结论",
      });
    }
  }

  // 规则12：章节标签缺失
  if (!["COVER", "APPENDIX"].includes(slideType) && !chapterLabel) {
    issues.push({
      type: "MISSING_CHAPTER_LABEL",
      severity: "low",
      description: "页面缺少章节标签（kicker）",
      suggestion: "添加章节标签以增强结构感",
    });
  }

  // 规则13：引用缺少说话人
  if (quote && !quoteSpeaker) {
    issues.push({
      type: "QUOTE_NO_SPEAKER",
      severity: "low",
      description: "引用缺少说话人信息",
      suggestion: "标注受访者编号或角色",
    });
  }

  // 计算得分
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "high") score -= 15;
    else if (issue.severity === "medium") score -= 8;
    else score -= 3;
  }
  score = Math.max(0, score);

  // 推荐动作
  const highIssues = issues.filter(i => i.severity === "high");
  const mediumIssues = issues.filter(i => i.severity === "medium");
  let recommendation: SlideCheckResult["recommendation"] = "ok";
  if (highIssues.length >= 2) {
    recommendation = "switch_template";
  } else if (highIssues.length >= 1) {
    recommendation = "fix";
  } else if (mediumIssues.length >= 2) {
    recommendation = "optimize";
  }

  return {
    slideId,
    slideType,
    score,
    issues,
    recommendation,
  };
}
