/**
 * 结构化图形渲染器（第一阶段新增）
 *
 * 三种层级化图形页面，全部复用 svgDiagrams.ts 的成熟 SVG 绘制逻辑，
 * 经 visualRenderer 转 PNG 后嵌入幻灯片：
 *   - PYRAMID_HIERARCHY 需求金字塔 / 层级分析
 *   - DECISION_PATH      购买决策路径
 *   - PRODUCT_HOUSE      品牌 / 产品屋
 *
 * 每种类型提供 2 个 layout 变体：
 *   - *_01 基础版：图形居中铺满内容区
 *   - *_02 带侧注版：图形居左，右侧挂"子论点/证据"面板（来自 visualTree 或 items）
 *
 * 渲染器读取 ctx.visualImage（由 pptGenerator 预渲染传入）。
 * 若图形渲染失败，自动降级为文本卡片，保证不白页。
 */
import type { SlidePlan } from "../schemas/slidePlan";
import { designSystem } from "../designSystem";
import {
  addPageTitle,
  addCoreMessage,
  addFooter,
  addPageNumber,
  addSourceNote,
  type RenderContext,
} from "../components";
import type { VisualImage } from "../visualRenderer";

// 扩展 RenderContext：携带预渲染的图形 PNG
type Ctx = Partial<RenderContext> & { visualImage?: VisualImage | null };

// 幻灯片内容区基准
const PAGE_W = 13.333;
const LEFT = designSystem.spacing.pageLeft; // 0.7
const RIGHT = designSystem.spacing.pageRight; // 0.7
const CONTENT_W = PAGE_W - LEFT - RIGHT; // 11.93
const TITLE_BOTTOM = 1.7; // 标题区下沿
const PAGE_BOTTOM = 7.0;

/** 判断是否为"带侧注"布局变体 */
function isAnnotated(plan: SlidePlan): boolean {
  return plan.templateId.endsWith("_02");
}

/** 计算保持纵横比的目标尺寸（英寸），fit 进给定宽高 */
function fitToBox(
  img: VisualImage,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const ratio = img.width / img.height; // 纵横比
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

/** 居中放置图形 */
function placeCentered(
  pptx: any, slide: any, img: VisualImage,
  maxW: number, maxH: number, top: number,
): { x: number; y: number; w: number; h: number } {
  const { w, h } = fitToBox(img, maxW, maxH);
  const x = (PAGE_W - w) / 2;
  slide.addImage({ data: img.dataUrl, x, y: top, w, h });
  return { x, y: top, w, h };
}

/** 图形居左 + 右侧子论点/证据面板 */
function placeWithSidePanel(
  pptx: any, slide: any, plan: SlidePlan, img: VisualImage,
  ds: typeof designSystem,
): void {
  const graphicW = CONTENT_W * 0.56;
  const graphicH = PAGE_BOTTOM - TITLE_BOTTOM - 0.2;
  const { w, h } = fitToBox(img, graphicW, graphicH);
  const gx = LEFT;
  const gy = TITLE_BOTTOM + (graphicH - h) / 2;
  slide.addImage({ data: img.dataUrl, x: gx, y: gy, w, h });

  // 右侧面板
  const panelX = LEFT + graphicW + 0.4;
  const panelW = CONTENT_W - graphicW - 0.4;
  const panelY = TITLE_BOTTOM;
  const panelH = PAGE_BOTTOM - TITLE_BOTTOM;

  // 收集侧注内容：优先 visualTree（层级），其次 items
  const notes: string[] = [];
  const tree = plan.content.visualTree;
  if (tree && tree.length > 0) {
    for (const node of tree) {
      notes.push(node.text);
      for (const child of node.children || []) {
        notes.push(`• ${child.text}`);
      }
    }
  }
  if (notes.length === 0 && plan.content.items) {
    notes.push(...plan.content.items.slice(0, 6));
  }

  slide.addText("层级说明 / 证据", {
    x: panelX, y: panelY, w: panelW, h: 0.35,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.accent, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: panelX, y: panelY + 0.38, w: 0.6, h: 0.03,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });

  if (notes.length > 0) {
    const noteH = (panelH - 0.6) / notes.length;
    notes.forEach((note, idx) => {
      const y = panelY + 0.55 + idx * noteH;
      const isSub = note.startsWith("• ");
      slide.addText(isSub ? note.slice(2) : note, {
        x: panelX + (isSub ? 0.25 : 0), y, w: panelW - (isSub ? 0.25 : 0), h: noteH - 0.05,
        fontSize: isSub ? ds.font.size.caption : ds.font.size.body,
        color: isSub ? ds.colors.secondaryText : ds.colors.text,
        fontFace: ds.font.family, bold: !isSub,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
      if (!isSub && idx < notes.length - 1) {
        slide.addShape(pptx.ShapeType.rect, {
          x: panelX, y: y + noteH - 0.03, w: panelW, h: 0.012,
          fill: { color: ds.colors.lightBorder }, line: { color: ds.colors.lightBorder },
        });
      }
    });
  } else {
    slide.addText("（该图形可独立表达层级关系，无需额外文字说明）", {
      x: panelX, y: panelY + 0.6, w: panelW, h: 1,
      fontSize: ds.font.size.caption, color: ds.colors.lightText,
      fontFace: ds.font.family, align: "left", valign: "top", margin: 0,
    });
  }
}

/** 图形渲染失败时的文本降级 */
function fallbackTextCards(pptx: any, slide: any, plan: SlidePlan, ds: typeof designSystem): void {
  const items = plan.content.visualItems || plan.content.items || [];
  const startY = plan.coreMessage ? 2.2 : 1.95;
  const cols = items.length > 3 ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.25;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cardH = Math.min(1.3, (PAGE_BOTTOM - startY - 0.3) / rows - 0.1);
  items.slice(0, 8).forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = LEFT + col * (cardW + gap);
    const y = startY + row * (cardH + 0.1);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH, rectRadius: 0.06,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });
    slide.addText(item, {
      x: x + 0.2, y: y + 0.1, w: cardW - 0.4, h: cardH - 0.2,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family, align: "left", valign: "top", margin: 0,
      lineSpacingMultiple: 1.3,
    });
  });
}

// ====================================================================
// PYRAMID_HIERARCHY：需求金字塔 / 层级分析
// ====================================================================
export function renderPyramid01(pptx: any, slide: any, plan: SlidePlan, ctx?: Ctx): void {
  const c = { pptx, slide, ds: designSystem, pageNumber: ctx?.pageNumber, totalPages: ctx?.totalPages };
  const ds = designSystem;
  addPageTitle(c as RenderContext, plan.title, plan.chapterLabel || "PYRAMID");
  if (plan.coreMessage) addCoreMessage(c as RenderContext, plan.coreMessage, 1.4);

  const img = ctx?.visualImage || null;
  if (!img) {
    fallbackTextCards(pptx, slide, plan, ds);
    if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
    addFooter(c as RenderContext);
    addPageNumber(c as RenderContext);
    return;
  }

  if (isAnnotated(plan)) {
    placeWithSidePanel(pptx, slide, plan, img, ds);
  } else {
    placeCentered(pptx, slide, img, CONTENT_W * 0.78, PAGE_BOTTOM - TITLE_BOTTOM - 0.3, TITLE_BOTTOM + 0.1);
  }

  if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
  addFooter(c as RenderContext);
  addPageNumber(c as RenderContext);
}

// ====================================================================
// DECISION_PATH：购买决策路径
// ====================================================================
export function renderDecisionPath01(pptx: any, slide: any, plan: SlidePlan, ctx?: Ctx): void {
  const c = { pptx, slide, ds: designSystem, pageNumber: ctx?.pageNumber, totalPages: ctx?.totalPages };
  const ds = designSystem;
  addPageTitle(c as RenderContext, plan.title, plan.chapterLabel || "DECISION PATH");
  if (plan.coreMessage) addCoreMessage(c as RenderContext, plan.coreMessage, 1.4);

  const img = ctx?.visualImage || null;
  if (!img) {
    fallbackTextCards(pptx, slide, plan, ds);
    if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
    addFooter(c as RenderContext);
    addPageNumber(c as RenderContext);
    return;
  }

  if (isAnnotated(plan)) {
    placeWithSidePanel(pptx, slide, plan, img, ds);
  } else {
    // 横向铺满，居中
    placeCentered(pptx, slide, img, CONTENT_W, PAGE_BOTTOM - TITLE_BOTTOM - 0.4, TITLE_BOTTOM + 0.2);
  }

  if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
  addFooter(c as RenderContext);
  addPageNumber(c as RenderContext);
}

// ====================================================================
// PRODUCT_HOUSE：品牌 / 产品屋
// ====================================================================
export function renderProductHouse01(pptx: any, slide: any, plan: SlidePlan, ctx?: Ctx): void {
  const c = { pptx, slide, ds: designSystem, pageNumber: ctx?.pageNumber, totalPages: ctx?.totalPages };
  const ds = designSystem;
  addPageTitle(c as RenderContext, plan.title, plan.chapterLabel || "PRODUCT HOUSE");
  if (plan.coreMessage) addCoreMessage(c as RenderContext, plan.coreMessage, 1.4);

  const img = ctx?.visualImage || null;
  if (!img) {
    fallbackTextCards(pptx, slide, plan, ds);
    if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
    addFooter(c as RenderContext);
    addPageNumber(c as RenderContext);
    return;
  }

  if (isAnnotated(plan)) {
    placeWithSidePanel(pptx, slide, plan, img, ds);
  } else {
    placeCentered(pptx, slide, img, CONTENT_W * 0.72, PAGE_BOTTOM - TITLE_BOTTOM - 0.3, TITLE_BOTTOM + 0.1);
  }

  if (plan.content.quoteSource) addSourceNote(c as RenderContext, plan.content.quoteSource);
  addFooter(c as RenderContext);
  addPageNumber(c as RenderContext);
}
