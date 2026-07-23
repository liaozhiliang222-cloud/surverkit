/**
 * 内容压缩与拆页（Content Compressor & Splitter）
 *
 * 第三阶段强化：标题压缩、长段落转要点、自动拆页
 *
 * 处理顺序（对应需求文档）：
 * 1. 压缩冗余文字（compressText，已实现）
 * 2. 删除次要证据
 * 3. 将长段落改成要点
 * 4. 切换到高容量模板
 * 5. 拆分为两页
 * 6. 仍然不允许时给出错误提示
 *
 * 禁止简单地不断缩小字体。
 * 正文最小字号建议不低于 14pt，注释和来源文字不低于 9pt。
 */
import type { SlidePlan, SlideContent } from "./schemas/slidePlan";
import type { TemplateDefinition } from "./schemas/template";
import { compressText } from "./capacityValidator";
import { getTemplate, selectTemplate, getTemplatesByType } from "./templateRegistry";
import { estimateLines } from "./designSystem";

// ====================================================================
// 一、标题压缩专用算法
// ====================================================================

/**
 * 标题压缩：保留结论，删除背景解释
 *
 * 策略：
 * 1. 如果标题含逗号/分号分隔，优先保留前半部分（通常是结论）
 * 2. 删除背景解释词："基于...的分析"、"在...背景下"、"从...来看"
 * 3. 删除冗余连接词："而"、"并"、"且"、"以及"
 * 4. 超过两行时必须改写（按模板宽度估算）
 *
 * @param title 原始标题
 * @param maxChars 最大字数（来自模板容量）
 * @param maxLines 最大行数（通常为 2）
 * @param titleWidth 标题文本框宽度（英寸，用于行数估算）
 * @param titleFontSize 标题字号
 */
export function compressTitle(
  title: string,
  maxChars: number,
  maxLines = 2,
  titleWidth = 11.93,
  titleFontSize = 24,
): { compressed: string; wasCompressed: boolean; linesEstimate: number } {
  if (!title) return { compressed: "", wasCompressed: false, linesEstimate: 0 };

  let result = title;
  const wasCompressed = false;

  // 策略1：删除背景解释短语
  const backgroundPatterns = [
    /基于[^，,。；;]*的[分析研究观察调查发现][，,]?/g,
    /在[^，,。；;]*背景下[，,]?/g,
    /从[^，,。；;]*来看[，,]?/g,
    /就[^，,。；;]*而言[，,]?/g,
    /针对[^，,。；;]*的[分析观察][，,]?/g,
    /通过[^，,。；;]*发现[，,]?/g,
  ];
  for (const pattern of backgroundPatterns) {
    result = result.replace(pattern, "");
  }
  result = result.replace(/^[，,\s]+/, "").trim();

  // 策略2：如果仍超长，按标点切分保留核心结论
  if (result.length > maxChars) {
    // 按中文/英文逗号、分号切分
    const parts = result.split(/[，,；;]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      // 尝试只保留第一部分（通常是核心结论）
      if (parts[0].length <= maxChars) {
        result = parts[0];
      } else {
        // 第一部分也过长，尝试保留前两部分
        result = parts.slice(0, 2).join("，");
      }
    }
  }

  // 策略3：如果仍超长，使用通用压缩
  if (result.length > maxChars) {
    result = compressText(result, maxChars);
  }

  // 策略4：行数估算，超过 maxLines 时进一步压缩
  let linesEstimate = estimateLines(result, titleFontSize, titleWidth);
  let attempts = 0;
  while (linesEstimate > maxLines && result.length > 10 && attempts < 3) {
    // 删除最后一个分句
    const lastSep = Math.max(result.lastIndexOf("，"), result.lastIndexOf(","));
    if (lastSep > 10) {
      result = result.slice(0, lastSep);
    } else {
      // 硬截断
      result = compressText(result, Math.floor(result.length * 0.8));
    }
    linesEstimate = estimateLines(result, titleFontSize, titleWidth);
    attempts++;
  }

  const wasActuallyCompressed = result !== title;
  return {
    compressed: result,
    wasCompressed: wasActuallyCompressed,
    linesEstimate,
  };
}

// ====================================================================
// 二、长段落自动转要点
// ====================================================================

/**
 * 检测字符串是否为长段落（应转为要点）
 */
export function isLongParagraph(text: string, threshold = 60): boolean {
  return text.length > threshold && !text.includes("\n") &&
    // 不是"标题：描述"格式（已是有结构的）
    !(text.indexOf("：") > 0 && text.indexOf("：") < 20);
}

/**
 * 将长段落转为要点列表
 *
 * 策略：
 * 1. 按句号/分号切分
 * 2. 每句作为一条要点
 * 3. 过滤过短的片段（<5字）
 * 4. 每条要点前可加编号
 */
export function paragraphToBullets(
  paragraph: string,
  maxBullets = 5,
  maxCharsPerBullet = 80,
): string[] {
  if (!paragraph) return [];

  // 按句号、分号、换行切分
  const sentences = paragraph
    .split(/[。；;\n]/)
    .map(s => s.trim())
    .filter(s => s.length >= 5);

  const bullets: string[] = [];
  for (const sentence of sentences) {
    if (bullets.length >= maxBullets) break;
    // 如果句子仍过长，进一步压缩
    const bullet = sentence.length > maxCharsPerBullet
      ? compressText(sentence, maxCharsPerBullet)
      : sentence;
    bullets.push(bullet);
  }

  return bullets;
}

/**
 * 检查 content 中的长段落并转为要点
 */
export function convertLongParagraphsToBullets(
  content: SlideContent,
  maxBullets = 5,
  maxCharsPerBullet = 80,
): { content: SlideContent; converted: boolean } {
  let converted = false;
  const newContent: SlideContent = { ...content };

  // 检查 items 中的长段落
  if (newContent.items) {
    const newItems: string[] = [];
    for (const item of newContent.items) {
      if (isLongParagraph(item)) {
        const bullets = paragraphToBullets(item, maxBullets, maxCharsPerBullet);
        if (bullets.length > 1) {
          newItems.push(...bullets);
          converted = true;
          continue;
        }
      }
      newItems.push(item);
    }
    newContent.items = newItems;
  }

  // 检查 coreMessage 中的长段落（如果过长，提取关键句）
  const coreMsg = newContent.coreMessage as string;
  if (coreMsg && typeof coreMsg === "string" && isLongParagraph(coreMsg, 120)) {
    const bullets = paragraphToBullets(coreMsg, 1, 100);
    if (bullets.length > 0) {
      newContent.coreMessage = bullets[0];
      converted = true;
    }
  }

  return { content: newContent, converted };
}

// ====================================================================
// 三、自动拆页逻辑
// ====================================================================

/**
 * 拆页结果
 */
export interface SplitResult {
  /** 拆页后的所有幻灯片（含原页和拆出的新页） */
  slides: SlidePlan[];
  /** 是否触发了拆页 */
  split: boolean;
  /** 拆页详情 */
  details: Array<{
    originalSlideId: string;
    newSlideIds: string[];
    reason: string;
  }>;
}

/**
 * 生成唯一 slideId
 */
let slideIdCounter = 0;
function generateSlideId(originalId: string, suffix: string): string {
  slideIdCounter++;
  return `${originalId}_${suffix}_${slideIdCounter}`;
}

/**
 * 将一个幻灯片拆分为两个
 *
 * 拆分策略（按 slideType）：
 * - EXECUTIVE_SUMMARY / KEY_FINDING / INSIGHT_EVIDENCE：items 超量时对半拆
 * - RECOMMENDATIONS：recommendations 超量时对半拆
 * - PAIN_POINT_MATRIX / OPPORTUNITY_MATRIX：visualItems 超量时对半拆
 * - TWO_COLUMN_COMPARE：左右栏超量时拆为两页对比
 * - 其他类型：不拆，返回原页
 */
export function splitSlide(
  slide: SlidePlan,
  template: TemplateDefinition,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  const cap = template.capacity;
  const items = slide.content.items || [];
  const recs = slide.content.recommendations || [];
  const visualItems = slide.content.visualItems || [];
  const leftCol = slide.content.leftColumn || [];
  const rightCol = slide.content.rightColumn || [];
  const journeyStages = slide.content.journeyStages || [];
  const matrixCells = slide.content.matrixCells || [];
  const causalChains = slide.content.causalChains || [];

  // 判断是否需要拆页
  const needsSplit =
    (items.length > cap.maxItems && items.length >= 4) ||
    (recs.length > cap.maxItems && recs.length >= 4) ||
    (visualItems.length > cap.maxItems && visualItems.length >= 4) ||
    (leftCol.length > cap.maxItems && leftCol.length >= 4) ||
    (journeyStages.length > cap.maxItems && journeyStages.length >= 4) ||
    (matrixCells.length > cap.maxItems && matrixCells.length >= 4) ||
    (causalChains.length > cap.maxItems && causalChains.length >= 4);

  if (!needsSplit) {
    return { slides: [slide], split: false, reason: "" };
  }

  // 按 slideType 执行拆分
  switch (slide.slideType) {
    case "EXECUTIVE_SUMMARY":
    case "KEY_FINDING":
    case "INSIGHT_EVIDENCE":
    case "THREE_INSIGHTS":
      return splitByItems(slide, items, cap.maxItems);

    case "RECOMMENDATIONS":
      return splitByRecommendations(slide, recs, cap.maxItems);

    case "PAIN_POINT_MATRIX":
    case "OPPORTUNITY_MATRIX":
      // 优先按结构化 matrixCells 拆分；否则按 visualItems 回退
      return matrixCells.length > 0
        ? splitByMatrixCells(slide, matrixCells, cap.maxItems)
        : splitByVisualItems(slide, visualItems, cap.maxItems);

    case "JOURNEY":
      return splitByJourneyStages(slide, journeyStages, cap.maxItems);

    case "CAUSE_ANALYSIS":
      return splitByCausalChains(slide, causalChains, cap.maxItems);

    case "TWO_COLUMN_COMPARE":
      return splitTwoColumnCompare(slide, leftCol, rightCol, cap.maxItems);

    default:
      // 其他类型不拆页
      return { slides: [slide], split: false, reason: `${slide.slideType} 类型不支持自动拆页` };
  }
}

/**
 * 按 items 对半拆分
 */
function splitByItems(
  slide: SlidePlan,
  items: string[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (items.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(items.length / 2);
  const firstHalf = items.slice(0, midPoint);
  const secondHalf = items.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, items: firstHalf },
    title: slide.title,
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };

  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    title: slide.title,
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
    // 第二页不再重复引用
    content: {
      ...slide.content,
      items: secondHalf,
      quote: "",  // 引用只在第一页保留
      quoteSpeaker: "",
      quoteSource: "",
    },
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `items 超量（${items.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 按 recommendations 对半拆分
 */
function splitByRecommendations(
  slide: SlidePlan,
  recs: { title: string; description: string; priority: "high" | "medium" | "low" }[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (recs.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(recs.length / 2);
  const firstHalf = recs.slice(0, midPoint);
  const secondHalf = recs.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, recommendations: firstHalf },
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };

  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: { ...slide.content, recommendations: secondHalf },
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `recommendations 超量（${recs.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 按 visualItems 对半拆分（矩阵类）
 */
function splitByVisualItems(
  slide: SlidePlan,
  visualItems: string[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (visualItems.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(visualItems.length / 2);
  const firstHalf = visualItems.slice(0, midPoint);
  const secondHalf = visualItems.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, visualItems: firstHalf },
    title: slide.title,
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };

  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: { ...slide.content, visualItems: secondHalf },
    title: slide.title,
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `visualItems 超量（${visualItems.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 按 matrixCells 对半拆分（结构化矩阵类）
 */
function splitByMatrixCells(
  slide: SlidePlan,
  cells: { title: string; description: string; severity: "high" | "medium" | "low"; priority: "high" | "medium" | "low" }[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (cells.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(cells.length / 2);
  const firstHalf = cells.slice(0, midPoint);
  const secondHalf = cells.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, matrixCells: firstHalf, visualItems: [] },
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };
  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: { ...slide.content, matrixCells: secondHalf, visualItems: [] },
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `matrixCells 超量（${cells.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 按 journeyStages 对半拆分（旅程类）
 */
function splitByJourneyStages(
  slide: SlidePlan,
  stages: { stage: string; behavior: string; touchpoint: string; emotion: string; painPoint: string }[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (stages.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(stages.length / 2);
  const firstHalf = stages.slice(0, midPoint);
  const secondHalf = stages.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, journeyStages: firstHalf, visualItems: [] },
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };
  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: { ...slide.content, journeyStages: secondHalf, visualItems: [] },
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `journeyStages 超量（${stages.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 按 causalChains 对半拆分（因果类）
 */
function splitByCausalChains(
  slide: SlidePlan,
  chains: { effect: string; surfaceCauses: string[]; rootCauses: string[] }[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (chains.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.ceil(chains.length / 2);
  const firstHalf = chains.slice(0, midPoint);
  const secondHalf = chains.slice(midPoint);

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: { ...slide.content, causalChains: firstHalf },
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };
  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: { ...slide.content, causalChains: secondHalf },
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `causalChains 超量（${chains.length} > ${maxItems}），对半拆分为两页`,
  };
}

/**
 * 双栏对比拆分（左右栏各自超量时，拆为两个对比页）
 */
function splitTwoColumnCompare(
  slide: SlidePlan,
  leftCol: string[],
  rightCol: string[],
  maxItems: number,
): { slides: SlidePlan[]; split: boolean; reason: string } {
  if (leftCol.length <= maxItems && rightCol.length <= maxItems) {
    return { slides: [slide], split: false, reason: "" };
  }

  const midPoint = Math.max(
    Math.ceil(leftCol.length / 2),
    Math.ceil(rightCol.length / 2),
  );

  const slide1: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "a"),
    content: {
      ...slide.content,
      leftColumn: leftCol.slice(0, midPoint),
      rightColumn: rightCol.slice(0, midPoint),
    },
    subtitle: slide.subtitle ? `${slide.subtitle}（上）` : "（上）",
  };

  const slide2: SlidePlan = {
    ...slide,
    slideId: generateSlideId(slide.slideId, "b"),
    content: {
      ...slide.content,
      leftColumn: leftCol.slice(midPoint),
      rightColumn: rightCol.slice(midPoint),
    },
    subtitle: slide.subtitle ? `${slide.subtitle}（下）` : "（下）",
  };

  return {
    slides: [slide1, slide2],
    split: true,
    reason: `双栏内容超量（左${leftCol.length}/右${rightCol.length} > ${maxItems}），对半拆分为两页`,
  };
}

// ====================================================================
// 四、综合处理：压缩 + 转要点 + 拆页
// ====================================================================

/**
 * 综合处理单页内容
 *
 * 处理顺序：
 * 1. 压缩冗余文字
 * 2. 长段落转要点
 * 3. 切换到高容量模板（如果有）
 * 4. 拆页（如果仍超量）
 */
export function processSlideContent(
  slide: SlidePlan,
  template?: TemplateDefinition,
): {
  slides: SlidePlan[];
  processed: boolean;
  actions: string[];
} {
  const tpl = template || getTemplate(slide.templateId) || selectTemplate(slide.slideType);
  if (!tpl) {
    return { slides: [slide], processed: false, actions: ["未找到模板，跳过处理"] };
  }

  const actions: string[] = [];
  let currentSlide = { ...slide };
  const cap = tpl.capacity;

  // 步骤1：标题压缩
  const titleResult = compressTitle(
    currentSlide.title,
    cap.titleMaxChars,
    2, // 最多 2 行
  );
  if (titleResult.wasCompressed) {
    currentSlide.title = titleResult.compressed;
    actions.push(`标题压缩：${slide.title.length} → ${currentSlide.title.length} 字`);
  }

  // 步骤2：压缩冗余文字
  currentSlide = {
    ...currentSlide,
    subtitle: compressText(currentSlide.subtitle, cap.subtitleMaxChars),
    coreMessage: compressText(currentSlide.coreMessage, cap.bodyMaxChars),
    content: {
      ...currentSlide.content,
      items: (currentSlide.content.items || [])
        .slice(0, cap.maxItems + 2)  // 先允许略多，后面转要点或拆页处理
        .map(item => compressText(item, cap.itemMaxChars + 20)),  // 略宽容，后面再处理
      quote: compressText(currentSlide.content.quote, cap.quoteMaxChars),
      leftColumn: (currentSlide.content.leftColumn || [])
        .slice(0, cap.maxItems + 2)
        .map(item => compressText(item, cap.itemMaxChars + 20)),
      rightColumn: (currentSlide.content.rightColumn || [])
        .slice(0, cap.maxItems + 2)
        .map(item => compressText(item, cap.itemMaxChars + 20)),
    },
  };
  actions.push("压缩冗余文字");

  // 步骤3：长段落转要点
  const { content: bulletContent, converted } = convertLongParagraphsToBullets(
    currentSlide.content,
    cap.maxItems,
    cap.itemMaxChars,
  );
  if (converted) {
    currentSlide.content = bulletContent;
    actions.push("长段落转为要点");
  }

  // 步骤4：再次压缩到容量限制
  currentSlide = {
    ...currentSlide,
    content: {
      ...currentSlide.content,
      items: (currentSlide.content.items || [])
        .slice(0, cap.maxItems)
        .map(item => compressText(item, cap.itemMaxChars)),
      leftColumn: (currentSlide.content.leftColumn || [])
        .slice(0, cap.maxItems)
        .map(item => compressText(item, cap.itemMaxChars)),
      rightColumn: (currentSlide.content.rightColumn || [])
        .slice(0, cap.maxItems)
        .map(item => compressText(item, cap.itemMaxChars)),
    },
  };

  // 步骤5：检查是否仍超量，尝试拆页
  const items = currentSlide.content.items || [];
  const recs = currentSlide.content.recommendations || [];
  const visualItems = currentSlide.content.visualItems || [];
  const leftCol = currentSlide.content.leftColumn || [];
  const rightCol = currentSlide.content.rightColumn || [];

  const stillOverCapacity =
    items.length > cap.maxItems ||
    recs.length > cap.maxItems ||
    visualItems.length > cap.maxItems ||
    leftCol.length > cap.maxItems ||
    rightCol.length > cap.maxItems;

  if (stillOverCapacity) {
    const splitResult = splitSlide(currentSlide, tpl);
    if (splitResult.split) {
      actions.push(splitResult.reason);
      return {
        slides: splitResult.slides,
        processed: true,
        actions,
      };
    }
    actions.push("内容超量但无法自动拆页，请人工检查");
  }

  return {
    slides: [currentSlide],
    processed: actions.length > 0,
    actions,
  };
}

/**
 * 批量处理所有幻灯片
 *
 * 对每个幻灯片执行：压缩 → 转要点 → 拆页
 * 返回处理后的幻灯片列表（可能比输入多）
 */
export function processAllSlides(slides: SlidePlan[]): {
  slides: SlidePlan[];
  processed: boolean;
  report: Array<{ slideId: string; actions: string[]; split: boolean }>;
} {
  const report: Array<{ slideId: string; actions: string[]; split: boolean }> = [];
  const result: SlidePlan[] = [];
  let anyProcessed = false;

  for (const slide of slides) {
    const { slides: processedSlides, processed, actions } = processSlideContent(slide);
    if (processed) anyProcessed = true;

    report.push({
      slideId: slide.slideId,
      actions,
      split: processedSlides.length > 1,
    });

    result.push(...processedSlides);
  }

  return {
    slides: result,
    processed: anyProcessed,
    report,
  };
}
