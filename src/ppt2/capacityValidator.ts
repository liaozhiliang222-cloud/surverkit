/**
 * 容量检查器（Content Capacity Validator）
 *
 * 在生成 PPT 前检查每页内容是否超出模板容量。
 * 超出时按策略处理：压缩 → 切换模板 → 拆页。
 * 禁止无限缩小字号。
 */
import type { SlidePlan } from "./schemas/slidePlan";
import type { TemplateDefinition, TemplateCapacity } from "./schemas/template";
import { getTemplate, selectTemplate } from "./templateRegistry";

export interface CapacityIssue {
  slideId: string;
  field: string;
  severity: "high" | "medium" | "low";
  description: string;
  currentLength: number;
  maxLength: number;
  suggestion: string;
}

export interface CapacityCheckResult {
  slideId: string;
  passed: boolean;
  issues: CapacityIssue[];
  recommendation: "ok" | "compress" | "switch_template" | "split";
}

/**
 * 文本压缩：保留结论，删除冗余修饰词
 */
export function compressText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // 策略1：删除常见冗余词
  let compressed = text
    .replace(/(换句话说|也就是说|简而言之|总的来说|综上所述|由此可见|需要注意的是|值得指出的是)[，,]?/g, "")
    .replace(/(非常|十分|特别|尤其|相对|比较|一定程度上)[，,]?/g, "")
    .replace(/[，,]\s*[，,]/g, "，")
    .trim();

  if (compressed.length <= maxChars) return compressed;

  // 策略2：按句截断，保留完整句子
  const sentences = compressed.split(/[。！？；]/).filter(s => s.trim());
  let result = "";
  for (const s of sentences) {
    const candidate = result ? result + "。" + s : s;
    if (candidate.length > maxChars) break;
    result = candidate;
  }
  if (result) return result + "。";

  // 策略3：硬截断 + 省略号
  return text.slice(0, Math.max(0, maxChars - 1)) + "…";
}

/**
 * 检查单个 slide 的内容容量
 */
export function checkSlideCapacity(
  slide: SlidePlan,
  template?: TemplateDefinition,
): CapacityCheckResult {
  const tpl = template || getTemplate(slide.templateId) || selectTemplate(slide.slideType);
  if (!tpl) {
    return {
      slideId: slide.slideId,
      passed: false,
      issues: [{
        slideId: slide.slideId,
        field: "template",
        severity: "high",
        description: `未找到 slideType=${slide.slideType} 的模板`,
        currentLength: 0,
        maxLength: 0,
        suggestion: "请确认 templateRegistry 已注册此类型",
      }],
      recommendation: "ok",
    };
  }

  const cap = tpl.capacity;
  const issues: CapacityIssue[] = [];

  // 标题检查
  if (slide.title.length > cap.titleMaxChars) {
    issues.push({
      slideId: slide.slideId,
      field: "title",
      severity: slide.title.length > cap.titleMaxChars * 1.5 ? "high" : "medium",
      description: `标题过长（${slide.title.length}字 > ${cap.titleMaxChars}字）`,
      currentLength: slide.title.length,
      maxLength: cap.titleMaxChars,
      suggestion: "压缩标题，保留结论部分",
    });
  }

  // 副标题检查
  if (slide.subtitle && slide.subtitle.length > cap.subtitleMaxChars) {
    issues.push({
      slideId: slide.slideId,
      field: "subtitle",
      severity: "low",
      description: `副标题过长（${slide.subtitle.length}字 > ${cap.subtitleMaxChars}字）`,
      currentLength: slide.subtitle.length,
      maxLength: cap.subtitleMaxChars,
      suggestion: "压缩副标题",
    });
  }

  // 核心信息检查
  if (slide.coreMessage && slide.coreMessage.length > cap.bodyMaxChars) {
    issues.push({
      slideId: slide.slideId,
      field: "coreMessage",
      severity: "high",
      description: `核心信息过长（${slide.coreMessage.length}字 > ${cap.bodyMaxChars}字）`,
      currentLength: slide.coreMessage.length,
      maxLength: cap.bodyMaxChars,
      suggestion: "压缩核心信息或拆分页面",
    });
  }

  // items 数量和长度检查
  const items = slide.content.items || [];
  if (items.length > cap.maxItems) {
    issues.push({
      slideId: slide.slideId,
      field: "items.count",
      severity: "medium",
      description: `要点数量过多（${items.length} > ${cap.maxItems}）`,
      currentLength: items.length,
      maxLength: cap.maxItems,
      suggestion: "删除次要要点或拆分页面",
    });
  }
  items.forEach((item, idx) => {
    if (item.length > cap.itemMaxChars) {
      issues.push({
        slideId: slide.slideId,
        field: `items[${idx}]`,
        severity: "medium",
        description: `第${idx + 1}条要点过长（${item.length}字 > ${cap.itemMaxChars}字）`,
        currentLength: item.length,
        maxLength: cap.itemMaxChars,
        suggestion: "压缩该要点",
      });
    }
  });

  // 引用检查
  if (slide.content.quote && slide.content.quote.length > cap.quoteMaxChars) {
    issues.push({
      slideId: slide.slideId,
      field: "quote",
      severity: "low",
      description: `引用过长（${slide.content.quote.length}字 > ${cap.quoteMaxChars}字）`,
      currentLength: slide.content.quote.length,
      maxLength: cap.quoteMaxChars,
      suggestion: "截取关键部分",
    });
  }

  // 左右栏检查
  const leftItems = slide.content.leftColumn || [];
  const rightItems = slide.content.rightColumn || [];
  if (leftItems.length > cap.maxItems || rightItems.length > cap.maxItems) {
    issues.push({
      slideId: slide.slideId,
      field: "columns",
      severity: "medium",
      description: `栏内要点过多（左${leftItems.length}/右${rightItems.length} > ${cap.maxItems}）`,
      currentLength: Math.max(leftItems.length, rightItems.length),
      maxLength: cap.maxItems,
      suggestion: "减少栏内要点",
    });
  }

  // 推荐建议
  let recommendation: CapacityCheckResult["recommendation"] = "ok";
  const highSeverityCount = issues.filter(i => i.severity === "high").length;
  const mediumSeverityCount = issues.filter(i => i.severity === "medium").length;
  if (highSeverityCount > 0) {
    recommendation = mediumSeverityCount > 2 ? "split" : "switch_template";
  } else if (mediumSeverityCount > 1) {
    recommendation = "compress";
  }

  return {
    slideId: slide.slideId,
    passed: issues.length === 0,
    issues,
    recommendation,
  };
}

/**
 * 批量检查并自动压缩
 */
export function validateAndCompress(
  slides: SlidePlan[],
  templates?: Map<string, TemplateDefinition>,
): { slides: SlidePlan[]; results: CapacityCheckResult[]; compressed: boolean } {
  const results: CapacityCheckResult[] = [];
  const compressedSlides = slides.map(slide => {
    const tpl = templates?.get(slide.templateId) || getTemplate(slide.templateId);
    const result = checkSlideCapacity(slide, tpl);
    results.push(result);

    if (result.passed) return slide;

    // 自动压缩
    let newSlide = { ...slide };
    if (tpl) {
      const cap = tpl.capacity;
      newSlide = {
        ...newSlide,
        title: compressText(slide.title, cap.titleMaxChars),
        subtitle: compressText(slide.subtitle, cap.subtitleMaxChars),
        coreMessage: compressText(slide.coreMessage, cap.bodyMaxChars),
        content: {
          ...slide.content,
          items: (slide.content.items || []).slice(0, cap.maxItems)
            .map(item => compressText(item, cap.itemMaxChars)),
          quote: compressText(slide.content.quote, cap.quoteMaxChars),
          leftColumn: (slide.content.leftColumn || []).slice(0, cap.maxItems)
            .map(item => compressText(item, cap.itemMaxChars)),
          rightColumn: (slide.content.rightColumn || []).slice(0, cap.maxItems)
            .map(item => compressText(item, cap.itemMaxChars)),
        },
      };
    }
    return newSlide;
  });

  return {
    slides: compressedSlides,
    results,
    compressed: results.some(r => !r.passed),
  };
}
