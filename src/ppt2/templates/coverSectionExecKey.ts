/**
 * 模板渲染器：封面 / 章节分隔 / 执行摘要 / 单洞察
 *
 * 每个渲染器接收 RenderContext 和 SlidePlan，操作 slide 对象。
 * 所有坐标从 designSystem 读取，不硬编码。
 */
import type { SlidePlan } from "../schemas/slidePlan";
import { designSystem, type DesignSystem } from "../designSystem";
import { addPageTitle, addConclusionTitle, addCoreMessage, addFooter, addPageNumber, addSourceNote, addQuoteBlock } from "../components";
import type { RenderContext } from "../components";

function makeCtx(pptx: any, slide: any, pageNumber?: number, totalPages?: number): RenderContext {
  return { pptx, slide, ds: designSystem as unknown as DesignSystem, pageNumber, totalPages };
}

// ====== COVER_01: 标准封面 ======
export function renderCover01(pptx: any, slide: any, plan: SlidePlan, _ctx?: Partial<RenderContext>): void {
  const ds = designSystem;
  // 深色背景
  slide.background = { color: ds.colors.primaryDark };

  // 左侧装饰色带
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.25, h: ds.slide.height,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });

  // 英文标签
  slide.addText("RESEARCH REPORT", {
    x: 0.8, y: 0.9, w: 8, h: 0.35,
    fontSize: ds.font.size.caption, bold: true,
    color: ds.colors.accentLight, align: "left", valign: "middle",
    margin: 0, charSpacing: 3,
  });

  // 报告主标题
  slide.addText(plan.title, {
    x: 0.8, y: 1.7, w: 11, h: 1.4,
    fontSize: ds.font.size.coverTitle, bold: true,
    color: ds.colors.white, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.1,
  });

  // 副标题
  if (plan.subtitle) {
    slide.addText(plan.subtitle, {
      x: 0.82, y: 3.2, w: 10.5, h: 0.7,
      fontSize: ds.font.size.subhead, color: ds.colors.lightBorder,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0,
    });
  }

  // 核心信息（一句话总结）
  if (plan.coreMessage) {
    slide.addText(plan.coreMessage, {
      x: 0.82, y: 4.1, w: 10.5, h: 0.8,
      fontSize: ds.font.size.body, color: ds.colors.lightText,
      fontFace: ds.font.family, italic: true,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.4,
    });
  }

  // 底部元信息（项目名/日期）
  const metaItems = plan.content.items || [];
  if (metaItems.length > 0) {
    metaItems.forEach((item, idx) => {
      slide.addText(item, {
        x: 0.82 + idx * 3.5, y: 6.4, w: 3.3, h: 0.4,
        fontSize: ds.font.size.footnote, color: ds.colors.lightText,
        align: "left", valign: "middle", margin: 0,
      });
    });
  }

  // 底部品牌
  slide.addText("ResearchBox · 专业研究报告", {
    x: 0.82, y: 7.0, w: 6, h: 0.3,
    fontSize: ds.font.size.footnote, color: ds.colors.lightText,
    align: "left", valign: "middle", margin: 0,
  });
}

// ====== SD_01: 章节分隔页 ======
export function renderSectionDivider01(pptx: any, slide: any, plan: SlidePlan, _ctx?: Partial<RenderContext>): void {
  const ds = designSystem;
  slide.background = { color: ds.colors.softBackground };

  // 大号章节编号
  const chapterNum = plan.content.metric || "01";
  slide.addText(chapterNum, {
    x: 0.7, y: 2.0, w: 4, h: 2.5,
    fontSize: 120, bold: true, color: ds.colors.accentLight,
    fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });

  // 章节标题
  slide.addText(plan.title, {
    x: 0.7, y: 4.5, w: 11.9, h: 1.0,
    fontSize: ds.font.size.sectionTitle, bold: true,
    color: ds.colors.text, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });

  // 章节核心信息
  if (plan.coreMessage) {
    slide.addText(plan.coreMessage, {
      x: 0.7, y: 5.5, w: 11.9, h: 0.6,
      fontSize: ds.font.size.subhead, color: ds.colors.secondaryText,
      fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });
  }

  // 装饰线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 5.3, w: 1.5, h: 0.05,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
}

// ====== ES_01: 执行摘要 ======
export function renderExecutiveSummary01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;
  addPageTitle(c, plan.title, "EXECUTIVE SUMMARY");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle);

  const items = plan.content.items || [];
  const startY = plan.subtitle ? 2.1 : 1.8;
  const itemH = Math.min(0.9, (6.5 - startY) / Math.max(items.length, 1));

  items.forEach((item, idx) => {
    const y = startY + idx * (itemH + 0.1);

    // 编号徽章
    slide.addText(String(idx + 1).padStart(2, "0"), {
      x: 0.7, y, w: 0.5, h: itemH,
      fontSize: ds.font.size.headline, bold: true,
      color: ds.colors.accent, align: "center", valign: "middle", margin: 0,
    });

    // 要点文字
    slide.addText(item, {
      x: 1.4, y, w: 11.2, h: itemH,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 4, lineSpacingMultiple: 1.3,
    });

    // 分隔线（非最后一项）
    if (idx < items.length - 1) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.4, y: y + itemH + 0.02, w: 11.2, h: 0.015,
        fill: { color: ds.colors.lightBorder }, line: { color: ds.colors.lightBorder },
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====== KF_01: 单洞察大标题版 ======
export function renderKeyFinding01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  // 结论型标题
  addConclusionTitle(c, plan.title, plan.chapterLabel || "KEY FINDING");

  // 核心信息（一句话结论）
  if (plan.coreMessage) {
    slide.addText(plan.coreMessage, {
      x: 0.7, y: 1.75, w: 11.9, h: 0.5,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.accentDark, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });
  }

  // 详细描述
  const items = plan.content.items || [];
  const hasQuote = !!plan.content.quote;
  const descY = 2.4;
  const descH = hasQuote ? 2.5 : 4.0;

  if (plan.coreMessage && items.length === 0) {
    // 仅有描述段落
    slide.addText(plan.coreMessage, {
      x: 0.7, y: descY, w: 11.9, h: descH,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.5,
    });
  }

  // 要点列表
  if (items.length > 0) {
    items.forEach((item, idx) => {
      const y = descY + idx * 0.65;
      // 要点圆点
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.75, y: y + 0.12, w: 0.12, h: 0.12,
        fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
      });
      // 要点文字
      slide.addText(item, {
        x: 1.0, y, w: 11.3, h: 0.55,
        fontSize: ds.font.size.body, color: ds.colors.text,
        fontFace: ds.font.family,
        align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.3,
      });
    });
  }

  // 引用块（底部）
  if (hasQuote) {
    addQuoteBlock(c, plan.content.quote, plan.content.quoteSpeaker || "受访者",
      plan.content.quoteSource, 0.7, 5.4, 11.9, 1.4);
  }

  addFooter(c);
  addPageNumber(c);
  if (plan.content.metric) addSourceNote(c, `数据来源：${plan.content.metric}`);
}
