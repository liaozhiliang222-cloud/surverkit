/**
 * PPT 基础组件
 *
 * 所有页面模板共享的基础渲染函数。
 * 每个函数返回的是操作 slide 的函数，不返回值。
 * 所有坐标和样式从 designSystem 读取，不硬编码。
 */
import type { DesignSystem } from "./designSystem";
import { designSystem } from "./designSystem";

export interface RenderContext {
  pptx: any;
  slide: any;
  ds: DesignSystem;
  pageNumber?: number;
  totalPages?: number;
  chapterLabel?: string;
  sourceNote?: string;
}

// ====== 页面标题 ======
export function addPageTitle(ctx: RenderContext, title: string, kicker?: string): void {
  const { slide, ds } = ctx;
  if (kicker) {
    slide.addText(kicker, {
      x: ds.layout.sectionLabel.x, y: ds.layout.sectionLabel.y,
      w: ds.layout.sectionLabel.w, h: ds.layout.sectionLabel.h,
      fontSize: ds.font.size.caption, bold: ds.font.weight.bold,
      color: ds.colors.accent, align: "left", valign: "middle",
      margin: 0, charSpacing: 1.5,
    });
  }
  slide.addText(title, {
    x: ds.layout.pageTitle.x, y: ds.layout.pageTitle.y,
    w: ds.layout.pageTitle.w, h: ds.layout.pageTitle.h,
    fontSize: ds.font.size.pageTitle, bold: ds.font.weight.bold,
    color: ds.colors.text, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });
  // 标题下装饰线
  slide.addShape(ctx.pptx.ShapeType.rect, {
    x: ds.layout.titleAccent.x, y: ds.layout.titleAccent.y,
    w: ds.layout.titleAccent.w, h: ds.layout.titleAccent.h,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
}

// ====== 结论型标题（用于 KEY_FINDING 等页面）======
export function addConclusionTitle(ctx: RenderContext, title: string, kicker?: string): void {
  const { slide, ds } = ctx;
  if (kicker) {
    slide.addText(kicker, {
      x: ds.layout.sectionLabel.x, y: ds.layout.sectionLabel.y,
      w: ds.layout.sectionLabel.w, h: ds.layout.sectionLabel.h,
      fontSize: ds.font.size.caption, bold: ds.font.weight.bold,
      color: ds.colors.accent, align: "left", valign: "middle",
      margin: 0, charSpacing: 1.5,
    });
  }
  slide.addText(title, {
    x: ds.layout.pageTitle.x, y: 0.65,
    w: ds.layout.pageTitle.w, h: 0.9,
    fontSize: ds.font.size.headline, bold: ds.font.weight.bold,
    color: ds.colors.text, fontFace: ds.font.family,
    align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.1,
  });
  // 装饰线
  slide.addShape(ctx.pptx.ShapeType.rect, {
    x: ds.layout.titleAccent.x, y: 1.6,
    w: ds.layout.titleAccent.w, h: ds.layout.titleAccent.h,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
}

// ====== 核心信息（大标题下方的一句话结论）======
export function addCoreMessage(ctx: RenderContext, message: string, y?: number): void {
  const { slide, ds } = ctx;
  slide.addText(message, {
    x: ds.layout.coreMessage.x, y: y ?? ds.layout.coreMessage.y,
    w: ds.layout.coreMessage.w, h: ds.layout.coreMessage.h,
    fontSize: ds.font.size.subhead, bold: ds.font.weight.bold,
    color: ds.colors.accentDark, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });
}

// ====== 页脚 ======
export function addFooter(ctx: RenderContext): void {
  const { slide, ds } = ctx;
  slide.addText("ResearchBox · 专业研究报告", {
    x: ds.footer.x, y: ds.footer.y, w: 6, h: ds.footer.h,
    fontSize: ds.footer.fontSize, color: ds.footer.color,
    align: "left", valign: "middle", margin: 0,
  });
}

// ====== 页码 ======
export function addPageNumber(ctx: RenderContext): void {
  const { slide, ds, pageNumber, totalPages } = ctx;
  if (!pageNumber) return;
  const text = totalPages ? `${pageNumber} / ${totalPages}` : String(pageNumber);
  slide.addText(text, {
    x: ds.layout.pageNumber.x, y: ds.layout.pageNumber.y,
    w: ds.layout.pageNumber.w, h: ds.layout.pageNumber.h,
    fontSize: ds.footer.fontSize, color: ds.footer.color,
    align: "right", valign: "middle", margin: 0,
  });
}

// ====== 来源注释 ======
export function addSourceNote(ctx: RenderContext, note: string): void {
  const { slide, ds } = ctx;
  slide.addText(note, {
    x: ds.layout.sourceNote.x, y: ds.layout.sourceNote.y,
    w: ds.layout.sourceNote.w, h: ds.layout.sourceNote.h,
    fontSize: ds.font.size.footnote, color: ds.colors.lightText,
    align: "left", valign: "middle", margin: 0,
  });
}

// ====== 引用块 ======
export function addQuoteBlock(
  ctx: RenderContext,
  quote: string,
  speaker: string,
  source: string,
  x: number, y: number, w: number, h: number,
): void {
  const { slide, ds, pptx } = ctx;
  // 左侧色条
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: 0.06, h,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
  // 引号
  slide.addText("“", {
    x: x + 0.15, y: y - 0.05, w: 0.5, h: 0.5,
    fontSize: 36, bold: true, color: ds.colors.accentLight,
    align: "left", valign: "top", margin: 0,
  });
  // 引用文字
  slide.addText(quote, {
    x: x + 0.25, y: y + 0.1, w: w - 0.4, h: h - 0.6,
    fontSize: ds.font.size.body, color: ds.colors.text,
    fontFace: ds.font.family, italic: true,
    align: "left", valign: "top", margin: 4, lineSpacingMultiple: 1.3,
  });
  // 来源
  const sourceText = source ? `${speaker} — ${source}` : speaker;
  slide.addText(sourceText, {
    x: x + 0.25, y: y + h - 0.4, w: w - 0.4, h: 0.3,
    fontSize: ds.font.size.caption, color: ds.colors.secondaryText,
    align: "left", valign: "middle", margin: 0,
  });
}

// ====== 洞察块（带编号和标题）======
export function addInsightBlock(
  ctx: RenderContext,
  index: number,
  title: string,
  description: string,
  x: number, y: number, w: number, h: number,
): void {
  const { slide, ds, pptx } = ctx;
  // 背景卡片
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: ds.colors.softBackground },
    line: { color: ds.colors.lightBorder, width: 0.5 },
  });
  // 编号徽章
  slide.addText(String(index).padStart(2, "0"), {
    x: x + 0.15, y: y + 0.15, w: 0.45, h: 0.3,
    fontSize: ds.font.size.caption, bold: true,
    color: ds.colors.white, align: "center", valign: "middle",
    margin: 0, fill: { color: ds.colors.accent }, rectRadius: 0.04,
  });
  // 标题
  slide.addText(title, {
    x: x + 0.7, y: y + 0.15, w: w - 0.85, h: 0.3,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.text, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });
  // 描述
  slide.addText(description, {
    x: x + 0.2, y: y + 0.55, w: w - 0.4, h: h - 0.7,
    fontSize: ds.font.size.body, color: ds.colors.secondaryText,
    fontFace: ds.font.family,
    align: "left", valign: "top", margin: 2, lineSpacingMultiple: 1.3,
  });
}

// ====== 分隔线 ======
export function addDivider(ctx: RenderContext, x: number, y: number, w: number): void {
  const { slide, ds, pptx } = ctx;
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h: 0.02,
    fill: { color: ds.colors.border }, line: { color: ds.colors.border },
  });
}

// ====== 指标（大数字 + 标签）======
export function addMetric(
  ctx: RenderContext,
  metric: string,
  label: string,
  x: number, y: number, w: number,
): void {
  const { slide, ds } = ctx;
  slide.addText(metric, {
    x, y, w, h: 0.8,
    fontSize: 36, bold: true, color: ds.colors.accent,
    fontFace: ds.font.family,
    align: "center", valign: "middle", margin: 0,
  });
  slide.addText(label, {
    x, y: y + 0.8, w, h: 0.3,
    fontSize: ds.font.size.caption, color: ds.colors.secondaryText,
    align: "center", valign: "middle", margin: 0,
  });
}
