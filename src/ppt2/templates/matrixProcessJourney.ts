/**
 * 模板渲染器：原因分析 / 矩阵 / 流程 / 旅程 / 目录 / 结论 / 附录
 *
 * 第二阶段新增的高频结构化页面渲染器，全部使用 PptxGenJS 原生形状，
 * 每个元素都是独立可编辑对象。
 */
import type { SlidePlan } from "../schemas/slidePlan";
import { designSystem, type DesignSystem } from "../designSystem";
import {
  addPageTitle,
  addConclusionTitle,
  addCoreMessage,
  addFooter,
  addPageNumber,
  addSourceNote,
  addDivider,
} from "../components";
import type { RenderContext } from "../components";

function makeCtx(pptx: any, slide: any, pageNumber?: number, totalPages?: number): RenderContext {
  return { pptx, slide, ds: designSystem as unknown as DesignSystem, pageNumber, totalPages };
}

// ====================================================================
// CA_01: 原因分析版（现象 → 根因）
// 左栏：表层现象列表；右栏：根本原因列表，中间用箭头连接
// ====================================================================
export function renderCauseAnalysis01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "ROOT CAUSE");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const startY = plan.coreMessage ? 2.2 : 1.9;
  const colH = 4.3;
  const leftX = 0.7;
  const rightX = 7.6;
  const colW = 5.2;
  const arrowX = 6.15;

  // 左栏：表层现象（灰色卡片）
  slide.addShape(pptx.ShapeType.roundRect, {
    x: leftX, y: startY, w: colW, h: colH, rectRadius: 0.06,
    fill: { color: ds.colors.softBackground },
    line: { color: ds.colors.lightBorder, width: 0.5 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: leftX, y: startY, w: colW, h: 0.5,
    fill: { color: ds.colors.secondaryText }, line: { color: ds.colors.secondaryText },
  });
  slide.addText("表层现象", {
    x: leftX + 0.2, y: startY, w: colW - 0.4, h: 0.5,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.white, align: "left", valign: "middle", margin: 0,
  });

  const phenomena = plan.content.leftColumn || [];
  phenomena.slice(0, 4).forEach((item, idx) => {
    const y = startY + 0.7 + idx * 0.85;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: leftX + 0.2, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: ds.colors.secondaryText }, line: { color: ds.colors.secondaryText },
    });
    slide.addText(item, {
      x: leftX + 0.45, y, w: colW - 0.65, h: 0.75,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // 中间箭头连接（4 个箭头对应 4 行）
  const rowCount = Math.min(phenomena.length, 4);
  for (let i = 0; i < rowCount; i++) {
    const y = startY + 0.7 + i * 0.85 + 0.2;
    slide.addShape(pptx.ShapeType.chevron, {
      x: arrowX, y, w: 0.6, h: 0.3,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
      rotate: 0,
    });
  }

  // 右栏：根本原因（强调色卡片）
  slide.addShape(pptx.ShapeType.roundRect, {
    x: rightX, y: startY, w: colW, h: colH, rectRadius: 0.06,
    fill: { color: ds.colors.accentLight },
    line: { color: ds.colors.accent, width: 0.5 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: rightX, y: startY, w: colW, h: 0.5,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });
  slide.addText("根本原因", {
    x: rightX + 0.2, y: startY, w: colW - 0.4, h: 0.5,
    fontSize: ds.font.size.subhead, bold: true,
    color: ds.colors.white, align: "left", valign: "middle", margin: 0,
  });

  const causes = plan.content.rightColumn || [];
  causes.slice(0, 4).forEach((item, idx) => {
    const y = startY + 0.7 + idx * 0.85;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: rightX + 0.2, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    slide.addText(item, {
      x: rightX + 0.45, y, w: colW - 0.65, h: 0.75,
      fontSize: ds.font.size.body, color: ds.colors.text,
      fontFace: ds.font.family, bold: idx === 0,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // 推断标记
  if (plan.content.metric === "inference" || plan.speakerNotes?.includes("inference")) {
    slide.addText("AI 推断", {
      x: 11.0, y: 0.5, w: 1.5, h: 0.3,
      fontSize: ds.font.size.footnote, bold: true,
      color: ds.colors.warning, align: "right", valign: "middle", margin: 0,
    });
  }

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// PPM_01: 痛点矩阵版
// 2x2 或 2x3 矩阵布局，每个格子是一个痛点卡片
// 使用 visualItems 承载"标题：描述"格式的痛点
// ====================================================================
export function renderPainPointMatrix01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "PAIN POINTS");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  const painPoints = plan.content.visualItems || plan.content.items || [];
  if (painPoints.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  // 矩阵布局：最多 6 个痛点，2 列 x 3 行
  const maxItems = 6;
  const items = painPoints.slice(0, maxItems);
  const cols = 2;
  const rows = Math.ceil(items.length / cols);

  const startY = plan.subtitle ? 2.2 : 1.95;
  const totalW = 11.93;
  const gap = 0.3;
  const cardW = (totalW - gap * (cols - 1)) / cols;
  const cardH = Math.min(1.4, (6.5 - startY - 0.3) / rows - 0.15);

  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 0.7 + col * (cardW + gap);
    const y = startY + row * (cardH + 0.15);

    // 解析"标题：描述"
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const title = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 25);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // 卡片背景（警告色边框）
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH, rectRadius: 0.06,
      fill: { color: "FFF7ED" }, // 浅橙色背景
      line: { color: ds.colors.warning, width: 0.75 },
    });

    // 左侧色条
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: cardH,
      fill: { color: ds.colors.warning }, line: { color: ds.colors.warning },
    });

    // 痛点编号 + 警示图标
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2, y: y + 0.18, w: 0.35, h: 0.35,
      fill: { color: ds.colors.warning }, line: { color: ds.colors.warning },
    });
    slide.addText("!", {
      x: x + 0.2, y: y + 0.18, w: 0.35, h: 0.35,
      fontSize: ds.font.size.headline, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    // 标题
    slide.addText(title, {
      x: x + 0.7, y: y + 0.12, w: cardW - 0.85, h: 0.35,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });

    // 描述
    if (desc) {
      slide.addText(desc, {
        x: x + 0.7, y: y + 0.5, w: cardW - 0.85, h: cardH - 0.6,
        fontSize: ds.font.size.body, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.25,
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// OM_01: 机会矩阵版
// 结构同痛点矩阵，但使用正向绿色配色
// ====================================================================
export function renderOpportunityMatrix01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "OPPORTUNITIES");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  const opportunities = plan.content.visualItems || plan.content.items || [];
  if (opportunities.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const maxItems = 6;
  const items = opportunities.slice(0, maxItems);
  const cols = 2;
  const rows = Math.ceil(items.length / cols);

  const startY = plan.subtitle ? 2.2 : 1.95;
  const totalW = 11.93;
  const gap = 0.3;
  const cardW = (totalW - gap * (cols - 1)) / cols;
  const cardH = Math.min(1.4, (6.5 - startY - 0.3) / rows - 0.15);

  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 0.7 + col * (cardW + gap);
    const y = startY + row * (cardH + 0.15);

    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const title = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 25);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // 卡片背景（浅绿色）
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH, rectRadius: 0.06,
      fill: { color: "F0FDF4" }, // 浅绿色背景
      line: { color: ds.colors.positive, width: 0.75 },
    });

    // 左侧色条
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: cardH,
      fill: { color: ds.colors.positive }, line: { color: ds.colors.positive },
    });

    // 机会编号 + 星标
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2, y: y + 0.18, w: 0.35, h: 0.35,
      fill: { color: ds.colors.positive }, line: { color: ds.colors.positive },
    });
    slide.addText(String(idx + 1), {
      x: x + 0.2, y: y + 0.18, w: 0.35, h: 0.35,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    // 标题
    slide.addText(title, {
      x: x + 0.7, y: y + 0.12, w: cardW - 0.85, h: 0.35,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });

    if (desc) {
      slide.addText(desc, {
        x: x + 0.7, y: y + 0.5, w: cardW - 0.85, h: cardH - 0.6,
        fontSize: ds.font.size.body, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.25,
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// PROC_01: 流程图版
// 横向 chevron 箭头流程，每个步骤含编号、标题、描述
// 使用 visualItems 承载"步骤标题：描述"
// ====================================================================
export function renderProcess01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "PROCESS");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const steps = plan.content.visualItems || plan.content.items || [];
  if (steps.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const maxSteps = 5;
  const items = steps.slice(0, maxSteps);
  const stepCount = items.length;

  // 横向布局
  const startY = plan.coreMessage ? 2.4 : 2.1;
  const totalW = 11.93;
  const gap = 0.15;
  const chevronW = (totalW - gap * (stepCount - 1)) / stepCount;
  const chevronH = 1.2;
  const descH = 2.5;

  items.forEach((item, idx) => {
    const x = 0.7 + idx * (chevronW + gap);

    // 解析步骤
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const title = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 15);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // chevron 箭头形状（第一个不是箭头，后续都是）
    const shapeType = idx === 0 ? pptx.ShapeType.rect : pptx.ShapeType.chevron;
    slide.addShape(shapeType, {
      x, y: startY, w: chevronW, h: chevronH,
      fill: { color: idx % 2 === 0 ? ds.colors.accent : ds.colors.accentDark },
      line: { color: idx % 2 === 0 ? ds.colors.accent : ds.colors.accentDark },
    });

    // 步骤编号
    slide.addText(`STEP ${idx + 1}`, {
      x: x + 0.1, y: startY + 0.1, w: chevronW - 0.3, h: 0.25,
      fontSize: ds.font.size.footnote, bold: true,
      color: ds.colors.accentLight, align: "center", valign: "middle", margin: 0,
    });

    // 步骤标题
    slide.addText(title, {
      x: x + 0.1, y: startY + 0.35, w: chevronW - 0.3, h: 0.75,
      fontSize: ds.font.size.body, bold: true,
      color: ds.colors.white, fontFace: ds.font.family,
      align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.1,
    });

    // 描述卡片（在 chevron 下方）
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: startY + chevronH + 0.2, w: chevronW, h: descH, rectRadius: 0.06,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });

    // 连接线
    slide.addShape(pptx.ShapeType.rect, {
      x: x + chevronW / 2 - 0.01, y: startY + chevronH, w: 0.02, h: 0.2,
      fill: { color: ds.colors.border }, line: { color: ds.colors.border },
    });

    if (desc) {
      slide.addText(desc, {
        x: x + 0.15, y: startY + chevronH + 0.35, w: chevronW - 0.3, h: descH - 0.5,
        fontSize: ds.font.size.caption, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.35,
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// JRN_01: 旅程图版
// 横向阶段时间轴，每个阶段含阶段名、感受、关键触点
// 使用 visualItems 承载"阶段名：描述"，items 承载触点列表
// ====================================================================
export function renderJourney01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "JOURNEY");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const stages = plan.content.visualItems || plan.content.items || [];
  if (stages.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const maxStages = 5;
  const items = stages.slice(0, maxStages);
  const stageCount = items.length;

  const startY = plan.coreMessage ? 2.3 : 2.0;
  const totalW = 11.93;
  const stageW = totalW / stageCount;
  const timelineY = startY + 0.5;

  // 横向时间轴主线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: timelineY, w: totalW, h: 0.04,
    fill: { color: ds.colors.border }, line: { color: ds.colors.border },
  });

  items.forEach((item, idx) => {
    const x = 0.7 + idx * stageW;
    const centerX = x + stageW / 2;

    // 解析阶段
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const stageName = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 15);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // 阶段节点（圆圈）
    const nodeR = 0.22;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: centerX - nodeR, y: timelineY - nodeR + 0.02, w: nodeR * 2, h: nodeR * 2,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.white, width: 2 },
    });
    slide.addText(String(idx + 1), {
      x: centerX - nodeR, y: timelineY - nodeR + 0.02, w: nodeR * 2, h: nodeR * 2,
      fontSize: ds.font.size.caption, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    // 阶段名（节点上方）
    slide.addText(stageName, {
      x: x + 0.1, y: startY, w: stageW - 0.2, h: 0.4,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "center", valign: "bottom", margin: 0,
    });

    // 阶段描述卡片（节点下方）
    const cardY = timelineY + 0.6;
    const cardH = 3.2;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.15, y: cardY, w: stageW - 0.3, h: cardH, rectRadius: 0.06,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });

    if (desc) {
      slide.addText(desc, {
        x: x + 0.3, y: cardY + 0.2, w: stageW - 0.6, h: cardH - 0.4,
        fontSize: ds.font.size.caption, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.35,
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// AG_01: 目录页
// 列出报告章节，每章含编号、标题、一句话核心信息
// ====================================================================
export function renderAgenda01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title || "报告目录", plan.chapterLabel || "AGENDA");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  const items = plan.content.items || [];
  const startY = plan.subtitle ? 2.2 : 1.95;
  const itemH = Math.min(0.85, (6.5 - startY - 0.3) / Math.max(items.length, 1));

  items.forEach((item, idx) => {
    const y = startY + idx * (itemH + 0.08);

    // 解析"章节标题：核心信息"
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const chapterTitle = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item;
    const chapterMsg = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";

    // 大号编号
    slide.addText(String(idx + 1).padStart(2, "0"), {
      x: 0.7, y, w: 1.0, h: itemH,
      fontSize: 32, bold: true,
      color: ds.colors.accentLight, fontFace: ds.font.family,
      align: "center", valign: "middle", margin: 0,
    });

    // 章节标题
    slide.addText(chapterTitle, {
      x: 1.9, y: y + 0.05, w: 10.5, h: 0.4,
      fontSize: ds.font.size.headline, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });

    // 核心信息
    if (chapterMsg) {
      slide.addText(chapterMsg, {
        x: 1.9, y: y + 0.45, w: 10.5, h: itemH - 0.5,
        fontSize: ds.font.size.body, color: ds.colors.secondaryText,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
    }

    // 分隔线
    if (idx < items.length - 1) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.9, y: y + itemH + 0.02, w: 10.5, h: 0.015,
        fill: { color: ds.colors.lightBorder }, line: { color: ds.colors.lightBorder },
      });
    }
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// CON_01: 结论页
// 报告总结收尾，含核心结论、关键启示、后续建议
// ====================================================================
export function renderConclusion01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  // 深色背景
  slide.background = { color: ds.colors.primaryDark };

  // 章节标签
  if (plan.chapterLabel) {
    slide.addText(plan.chapterLabel, {
      x: 0.7, y: 0.6, w: 6, h: 0.3,
      fontSize: ds.font.size.caption, bold: true,
      color: ds.colors.accentLight, align: "left", valign: "middle",
      margin: 0, charSpacing: 1.5,
    });
  }

  // 主标题
  slide.addText(plan.title, {
    x: 0.7, y: 1.0, w: 11.93, h: 0.8,
    fontSize: ds.font.size.pageTitle, bold: true,
    color: ds.colors.white, fontFace: ds.font.family,
    align: "left", valign: "middle", margin: 0,
  });

  // 装饰线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 1.85, w: 1.2, h: 0.04,
    fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
  });

  // 核心信息
  if (plan.coreMessage) {
    slide.addText(plan.coreMessage, {
      x: 0.7, y: 2.1, w: 11.93, h: 0.6,
      fontSize: ds.font.size.headline,
      color: ds.colors.accentLight, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.2,
    });
  }

  // 关键启示列表
  const items = plan.content.items || [];
  const startY = plan.coreMessage ? 3.0 : 2.6;
  items.slice(0, 4).forEach((item, idx) => {
    const y = startY + idx * 0.7;

    // 编号圆点
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.7, y: y + 0.1, w: 0.25, h: 0.25,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    slide.addText(String(idx + 1), {
      x: 0.7, y: y + 0.1, w: 0.25, h: 0.25,
      fontSize: ds.font.size.caption, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    slide.addText(item, {
      x: 1.15, y, w: 11.0, h: 0.55,
      fontSize: ds.font.size.body, color: ds.colors.white,
      fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // 底部标语
  slide.addText("— ResearchBox · 专业研究报告 —", {
    x: 0.7, y: 6.8, w: 11.93, h: 0.4,
    fontSize: ds.font.size.footnote,
    color: ds.colors.lightText, align: "center", valign: "middle", margin: 0,
  });

  // 页码（深色版）
  if (ctx?.pageNumber) {
    const text = ctx.totalPages ? `${ctx.pageNumber} / ${ctx.totalPages}` : String(ctx.pageNumber);
    slide.addText(text, {
      x: 12.3, y: 7.05, w: 0.7, h: 0.3,
      fontSize: ds.font.size.footnote, color: ds.colors.lightText,
      align: "right", valign: "middle", margin: 0,
    });
  }
}

// ====================================================================
// APX_01: 附录页
// 研究方法、限制说明、致谢等补充信息
// ====================================================================
export function renderAppendix01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title || "附录", plan.chapterLabel || "APPENDIX");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  const items = plan.content.items || [];
  const leftCol = plan.content.leftColumn || [];
  const rightCol = plan.content.rightColumn || [];

  const startY = plan.subtitle ? 2.2 : 1.95;

  // 模式1：双栏（研究方法 + 限制说明）
  if (leftCol.length > 0 || rightCol.length > 0) {
    const colW = 5.7;
    const colH = 4.3;
    const leftX = 0.7;
    const rightX = 6.9;

    // 左栏：研究方法
    slide.addText("研究方法", {
      x: leftX, y: startY, w: colW, h: 0.4,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.accent, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: leftX, y: startY + 0.42, w: 0.6, h: 0.03,
      fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
    });
    leftCol.forEach((item, idx) => {
      const y = startY + 0.6 + idx * 0.7;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: leftX + 0.05, y: y + 0.1, w: 0.08, h: 0.08,
        fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
      });
      slide.addText(item, {
        x: leftX + 0.25, y, w: colW - 0.25, h: 0.65,
        fontSize: ds.font.size.body, color: ds.colors.text,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
    });

    // 右栏：研究限制
    slide.addText("研究限制", {
      x: rightX, y: startY, w: colW, h: 0.4,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.warning, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: rightX, y: startY + 0.42, w: 0.6, h: 0.03,
      fill: { color: ds.colors.warning }, line: { color: ds.colors.warning },
    });
    rightCol.forEach((item, idx) => {
      const y = startY + 0.6 + idx * 0.7;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: rightX + 0.05, y: y + 0.1, w: 0.08, h: 0.08,
        fill: { color: ds.colors.warning }, line: { color: ds.colors.warning },
      });
      slide.addText(item, {
        x: rightX + 0.25, y, w: colW - 0.25, h: 0.65,
        fontSize: ds.font.size.body, color: ds.colors.text,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
    });
  } else if (items.length > 0) {
    // 模式2：单栏列表
    items.forEach((item, idx) => {
      const y = startY + idx * 0.7;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.75, y: y + 0.1, w: 0.1, h: 0.1,
        fill: { color: ds.colors.accent }, line: { color: ds.colors.accent },
      });
      slide.addText(item, {
        x: 1.0, y, w: 11.0, h: 0.65,
        fontSize: ds.font.size.body, color: ds.colors.text,
        fontFace: ds.font.family,
        align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.3,
      });
    });
  }

  // 来源注释
  if (plan.content.quoteSource) {
    addSourceNote(c, plan.content.quoteSource);
  }

  addFooter(c);
  addPageNumber(c);
}
