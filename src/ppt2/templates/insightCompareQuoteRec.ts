/**
 * 模板渲染器：洞察+证据 / 三栏洞察 / 双栏对比 / 引用 / 建议
 */
import type { SlidePlan } from "../schemas/slidePlan";
import { designSystem, type DesignSystem } from "../designSystem";
import { addPageTitle, addConclusionTitle, addCoreMessage, addFooter, addPageNumber, addSourceNote, addQuoteBlock, addInsightBlock, addDivider } from "../components";
import type { RenderContext } from "../components";

function makeCtx(pptx: any, slide: any, pageNumber?: number, totalPages?: number): RenderContext {
  return { pptx, slide, ds: designSystem as unknown as DesignSystem, pageNumber, totalPages };
}

// ====== IE_01: 洞察+证据双栏版 ======
export function renderInsightEvidence01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "INSIGHT & EVIDENCE");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const startY = plan.coreMessage ? 2.1 : 1.8;

  // 左栏：洞察描述
  const leftX = 0.7;
  const leftW = 6.8;
  const items = plan.content.items || [];

  // 左栏标签
  slide.addText("洞察解读", {
    x: leftX, y: startY, w: leftW, h: 0.35,
    fontSize: ds.font.size.caption, bold: true,
    color: ds.colors.accent, align: "left", valign: "middle",
    margin: 0, charSpacing: 1.5,
  });

  items.forEach((item, idx) => {
    const y = startY + 0.45 + idx * 0.7;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: leftX + 0.05, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    slide.addText(item, {
      x: leftX + 0.3, y, w: leftW - 0.3, h: 0.6,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // 中间分隔线
  addDivider(c, 7.75, startY, 0.02);

  // 右栏：原话证据
  const rightX = 8.0;
  const rightW = 4.6;

  slide.addText("受访者原话", {
    x: rightX, y: startY, w: rightW, h: 0.35,
    fontSize: ds.font.size.caption, bold: true,
    color: ds.colors.accent, align: "left", valign: "middle",
    margin: 0, charSpacing: 1.5,
  });

  if (plan.content.quote) {
    addQuoteBlock(c, plan.content.quote, plan.content.quoteSpeaker || "受访者",
      plan.content.quoteSource, rightX, startY + 0.5, rightW, 3.5);
  } else {
    // 如果没有引用，用次要洞察填充
    const rightItems = plan.content.rightColumn || [];
    rightItems.forEach((item, idx) => {
      const y = startY + 0.5 + idx * 0.8;
      slide.addText(item, {
        x: rightX, y, w: rightW, h: 0.7,
        fontSize: ds.font.size.body, color: ds.colors.secondaryText,
        fontFace: ds.font.family, italic: true,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
    });
  }

  addFooter(c);
  addPageNumber(c);
}

// ====== TI_01: 三栏洞察并列版 ======
export function renderThreeInsights01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "KEY INSIGHTS");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle);

  const items = plan.content.items || [];
  const colCount = Math.min(items.length, 3);
  if (colCount === 0) return;

  const colGap = 0.3;
  const colW = (11.93 - (colCount - 1) * colGap) / colCount;
  const colY = plan.subtitle ? 2.2 : 1.9;
  const colH = 4.3;

  items.slice(0, 3).forEach((item, idx) => {
    const x = 0.7 + idx * (colW + colGap);

    // 卡片背景
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: colY, w: colW, h: colH, rectRadius: 0.08,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });

    // 顶部色带
    slide.addShape(pptx.ShapeType.rect, {
      x, y: colY, w: colW, h: 0.08,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });

    // 编号
    slide.addText(`0${idx + 1}`, {
      x: x + 0.2, y: colY + 0.2, w: 0.8, h: 0.5,
      fontSize: 28, bold: true, color: ds.colors.accent,
      fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });

    // 解析标题和描述（item 格式："标题：描述" 或 "标题: 描述"）
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const title = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 20);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // 标题
    slide.addText(title, {
      x: x + 0.2, y: colY + 0.8, w: colW - 0.4, h: 0.6,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.2,
    });

    // 描述
    if (desc) {
      slide.addText(desc, {
        x: x + 0.2, y: colY + 1.5, w: colW - 0.4, h: colH - 1.7,
        fontSize: ds.font.size.body, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.4,
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====== TCC_01: 双栏对比版 ======
export function renderTwoColumnCompare01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "COMPARISON");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const startY = plan.coreMessage ? 2.2 : 1.9;
  const colH = 4.3;
  const leftX = 0.7;
  const rightX = 6.95;
  const colW = 5.65;

  const leftTitle = plan.content.metricLabel || "现状";
  const rightTitle = plan.content.metric || "期望";

  // 左栏卡片
  slide.addShape(pptx.ShapeType.roundRect, {
    x: leftX, y: startY, w: colW, h: colH, rectRadius: 0.06,
    fill: { color: ds.colors.softBackground },
    line: { color: ds.colors.lightBorder, width: 0.5 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: leftX, y: startY, w: colW, h: 0.5,
    fill: { color: ds.colors.secondaryText }, line: { color: ds.colors.secondaryText },
  });
  slide.addText(leftTitle, {
    x: leftX + 0.2, y: startY, w: colW - 0.4, h: 0.5,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.white, align: "left", valign: "middle", margin: 0,
  });

  // 左栏要点
  (plan.content.leftColumn || []).forEach((item, idx) => {
    const y = startY + 0.7 + idx * 0.7;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: leftX + 0.2, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: ds.colors.secondaryText }, line: { color: ds.colors.secondaryText },
    });
    slide.addText(item, {
      x: leftX + 0.45, y, w: colW - 0.65, h: 0.6,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // 右栏卡片
  slide.addShape(pptx.ShapeType.roundRect, {
    x: rightX, y: startY, w: colW, h: colH, rectRadius: 0.06,
    fill: { color: ds.colors.accentLight },
    line: { color: ds.colors.accent, width: 0.5 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: rightX, y: startY, w: colW, h: 0.5,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
  slide.addText(rightTitle, {
    x: rightX + 0.2, y: startY, w: colW - 0.4, h: 0.5,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.white, align: "left", valign: "middle", margin: 0,
  });

  // 右栏要点
  (plan.content.rightColumn || []).forEach((item, idx) => {
    const y = startY + 0.7 + idx * 0.7;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: rightX + 0.2, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    slide.addText(item, {
      x: rightX + 0.45, y, w: colW - 0.65, h: 0.6,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  addFooter(c);
  addPageNumber(c);
}

// ====== QT_01: 大引用版 ======
export function renderQuote01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  slide.background = { color: ds.colors.softBackground };

  // 章节标签
  if (plan.chapterLabel) {
    slide.addText(plan.chapterLabel, {
      x: 0.7, y: 0.8, w: 6, h: 0.3,
      fontSize: ds.font.size.caption, bold: true,
      color: ds.colors.accent, align: "left", valign: "middle",
      margin: 0, charSpacing: 1.5,
    });
  }

  // 巨大引号
  slide.addText("\u201C", {
    x: 0.7, y: 1.3, w: 2, h: 1.5,
    fontSize: 120, bold: true, color: ds.colors.accentLight,
    align: "left", valign: "top", margin: 0,
  });

  // 引用文字
  slide.addText(plan.content.quote || plan.coreMessage, {
    x: 1.5, y: 2.5, w: 10.5, h: 3.0,
    fontSize: 24, color: ds.colors.text, fontFace: ds.font.family,
    italic: true,
    align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.4,
  });

  // 说话人
  slide.addText(plan.content.quoteSpeaker || "受访者", {
    x: 1.5, y: 5.7, w: 8, h: 0.4,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.accent, align: "left", valign: "middle", margin: 0,
  });

  // 来源
  if (plan.content.quoteSource) {
    slide.addText(plan.content.quoteSource, {
      x: 1.5, y: 6.1, w: 8, h: 0.35,
      fontSize: ds.font.size.caption, color: ds.colors.secondaryText,
      align: "left", valign: "middle", margin: 0,
    });
  }

  // 装饰线
  slide.addShape(pptx.ShapeType.rect, {
    x: 1.5, y: 5.55, w: 0.8, h: 0.04,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });

  addFooter(c);
  addPageNumber(c);
}

// ====== REC_01: 建议列表版 ======
export function renderRecommendations01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "RECOMMENDATIONS");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle);

  const recommendations = plan.content.recommendations || [];
  const items = plan.content.items || [];

  // 优先使用结构化 recommendations，否则降级到 items
  const useStructured = recommendations.length > 0;
  const list = useStructured ? recommendations : items.map((item, idx) => ({
    title: item.split(/[：:]/)[0] || `建议 ${idx + 1}`,
    description: item.split(/[：:]/).slice(1).join(":").trim() || item,
    priority: "medium" as const,
  }));

  const startY = plan.subtitle ? 2.2 : 1.9;
  const itemH = Math.min(0.95, (6.5 - startY) / Math.max(list.length, 1));

  list.slice(0, 5).forEach((rec, idx) => {
    const y = startY + idx * (itemH + 0.08);

    // 编号徽章
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.7, y: y + 0.1, w: 0.5, h: 0.5,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    slide.addText(String(idx + 1), {
      x: 0.7, y: y + 0.1, w: 0.5, h: 0.5,
      fontSize: ds.font.size.headline, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    // 建议标题
    slide.addText(rec.title, {
      x: 1.4, y: y + 0.05, w: 9.5, h: 0.35,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });

    // 优先级标签
    const priorityColor = rec.priority === "high" ? ds.colors.negative :
      rec.priority === "medium" ? ds.colors.warning : ds.colors.positive;
    const priorityText = rec.priority === "high" ? "高优先级" :
      rec.priority === "medium" ? "中优先级" : "低优先级";
    slide.addText(priorityText, {
      x: 11.0, y: y + 0.1, w: 1.5, h: 0.3,
      fontSize: ds.font.size.footnote, bold: true,
      color: priorityColor, align: "right", valign: "middle", margin: 0,
    });

    // 建议描述
    slide.addText(rec.description, {
      x: 1.4, y: y + 0.4, w: 11.0, h: itemH - 0.45,
      fontSize: ds.font.size.body, color: ds.colors.secondaryText,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });

    // 分隔线
    if (idx < list.length - 1) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.4, y: y + itemH + 0.02, w: 11.1, h: 0.015,
        fill: { color: ds.colors.lightBorder }, line: { color: ds.colors.lightBorder },
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}
