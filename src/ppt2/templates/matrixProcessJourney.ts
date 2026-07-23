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
// 矩阵辅助：解析单元格数据（支持结构化 matrixCells 或字符串回退）
// ====================================================================
interface MatrixCellData {
  title: string;
  desc: string;
  level: "high" | "medium" | "low";
  levelLabel: string;
}

function resolveMatrixCells(plan: SlidePlan): MatrixCellData[] {
  const cells = plan.content.matrixCells || [];
  if (cells.length > 0) {
    return cells.map(c => ({
      title: c.title,
      desc: c.description || "",
      level: (c.severity || c.priority || "medium") as "high" | "medium" | "low",
      levelLabel: "",
    }));
  }
  // 回退：解析 "标题：描述" 字符串（最多 9 格，支持 2×2 / 2×3 / 3×3）
  const raw = plan.content.visualItems || plan.content.items || [];
  return raw.slice(0, 9).map(item => {
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const title = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 25);
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";
    return { title, desc, level: "medium" as const, levelLabel: "" };
  });
}

/** 根据单元格数确定弹性网格：4→2×2，6→3×2，9→3×3，其余就近 */
function computeGrid(n: number): { cols: number; rows: number } {
  if (n <= 4) return { cols: 2, rows: Math.ceil(n / 2) };
  if (n <= 6) return { cols: 3, rows: Math.ceil(n / 3) };
  return { cols: 3, rows: Math.ceil(n / 3) };
}

/**
 * 渲染矩阵（痛点/机会共用）
 * @param tone "pain" 用警告橙红 + 严重度；"opp" 用正向绿 + 优先级
 */
function renderMatrixGrid(
  pptx: any, slide: any, plan: SlidePlan,
  tone: "pain" | "opp",
  c: ReturnType<typeof makeCtx>,
  ds: typeof designSystem,
): void {
  const cells = resolveMatrixCells(plan);
  if (cells.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const { cols, rows } = computeGrid(cells.length);
  const startY = plan.subtitle ? 2.2 : 1.95;
  const totalW = 11.93;
  const gap = 0.3;
  const cardW = (totalW - gap * (cols - 1)) / cols;
  const cardH = Math.min(2.4, (6.6 - startY - 0.3) / rows - 0.15);

  // 严重度/优先级 → 颜色与文案
  const toneColor =
    tone === "pain" ? ds.colors.warning : ds.colors.positive;
  const bgColor = tone === "pain" ? "FFF7ED" : "F0FDF4";
  const levelColor: Record<string, string> = tone === "pain"
    ? { high: ds.colors.negative, medium: ds.colors.warning, low: ds.colors.lightText }
    : { high: ds.colors.positive, medium: ds.colors.info, low: ds.colors.lightText };
  const levelText: Record<string, string> = tone === "pain"
    ? { high: "严重", medium: "中等", low: "轻微" }
    : { high: "高优先", medium: "中优先", low: "低优先" };

  cells.forEach((cell, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 0.7 + col * (cardW + gap);
    const y = startY + row * (cardH + 0.15);
    const lvl = cell.level || "medium";

    // 卡片背景
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH, rectRadius: 0.06,
      fill: { color: bgColor },
      line: { color: toneColor, width: 0.75 },
    });

    // 顶部色条（按严重度/优先级变色）
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: cardW, h: 0.08,
      fill: { color: levelColor[lvl] }, line: { color: levelColor[lvl] },
    });

    // 编号徽章
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2, y: y + 0.22, w: 0.35, h: 0.35,
      fill: { color: toneColor }, line: { color: toneColor },
    });
    slide.addText(tone === "pain" ? "!" : String(idx + 1), {
      x: x + 0.2, y: y + 0.22, w: 0.35, h: 0.35,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.white, align: "center", valign: "middle", margin: 0,
    });

    // 标题
    slide.addText(cell.title, {
      x: x + 0.7, y: y + 0.14, w: cardW - 1.5, h: 0.5,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.0,
    });

    // 严重度/优先级标签（右上角）
    slide.addText(levelText[lvl], {
      x: x + cardW - 0.95, y: y + 0.18, w: 0.8, h: 0.3,
      fontSize: 9, bold: true, color: levelColor[lvl],
      fontFace: ds.font.family, align: "right", valign: "middle", margin: 0,
    });

    // 描述
    if (cell.desc) {
      slide.addText(cell.desc, {
        x: x + 0.25, y: y + 0.72, w: cardW - 0.5, h: cardH - 0.85,
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
// CA_02: 因果链版（现象→表层原因→深层根因 三级 + 多因一果聚合）
// 读取 causalChains 结构化字段；同 effect 的多条链自动聚合为"多因一果"
// 无 causalChains 时回退到 CA_01 双栏版
// ====================================================================
export function renderCauseAnalysis02(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "ROOT CAUSE");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const chains = plan.content.causalChains || [];
  if (chains.length === 0) {
    // 回退：双栏现象→根因
    renderCauseAnalysis01(pptx, slide, plan, ctx);
    return;
  }

  // 多因一果：按 effect 聚合表层原因与深层根因
  const byEffect = new Map<string, { surface: string[]; root: string[] }>();
  for (const ch of chains) {
    const key = ch.effect || "（未命名现象）";
    const agg = byEffect.get(key) || { surface: [], root: [] };
    agg.surface.push(...(ch.surfaceCauses || []));
    agg.root.push(...(ch.rootCauses || []));
    byEffect.set(key, agg);
  }
  const effects = Array.from(byEffect.entries());

  const startY = plan.coreMessage ? 2.2 : 1.95;
  const blockGap = 0.25;
  const blockH = Math.min(3.6, (6.7 - startY - 0.2) / effects.length - blockGap);

  // 三列布局：左=深层根因，中=表层原因，右=现象/结果
  const rootX = 0.7;
  const rootW = 3.5;
  const surfaceX = 4.55;
  const surfaceW = 3.5;
  const effectX = 8.4;
  const effectW = 4.2;
  const arrowGap = 0.3;

  effects.forEach(([effect, agg], ci) => {
    const by = startY + ci * (blockH + blockGap);

    // 列卡片绘制函数
    const drawCol = (x: number, w: number, header: string, headerColor: string, items: string[]) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: by, w, h: blockH, rectRadius: 0.06,
        fill: { color: ds.colors.softBackground },
        line: { color: headerColor, width: 0.75 },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x, y: by, w, h: 0.45,
        fill: { color: headerColor }, line: { color: headerColor },
      });
      slide.addText(header, {
        x: x + 0.15, y: by, w: w - 0.3, h: 0.45,
        fontSize: ds.font.size.subhead, bold: true,
        color: ds.colors.white, align: "left", valign: "middle", margin: 0,
      });
      const list = items.slice(0, 5);
      list.forEach((it, ii) => {
        const iy = by + 0.6 + ii * ((blockH - 0.6) / Math.max(list.length, 1));
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + 0.2, y: iy + 0.1, w: 0.09, h: 0.09,
          fill: { color: headerColor }, line: { color: headerColor },
        });
        slide.addText(it, {
          x: x + 0.42, y: iy, w: w - 0.6, h: (blockH - 0.6) / Math.max(list.length, 1) - 0.05,
          fontSize: ds.font.size.body, color: ds.colors.text,
          fontFace: ds.font.family, align: "left", valign: "top", margin: 0,
          lineSpacingMultiple: 1.2,
        });
      });
    };

    drawCol(rootX, rootW, "深层根因", ds.colors.accent, agg.root);
    drawCol(surfaceX, surfaceW, "表层原因", ds.colors.warning, agg.surface);
    drawCol(effectX, effectW, "现象 / 结果", ds.colors.negative, [effect]);

    // 箭头：深层→表层，表层→现象
    const arrowY = by + blockH / 2 - 0.12;
    const drawArrow = (fromX: number, toX: number) => {
      slide.addShape(pptx.ShapeType.chevron, {
        x: fromX, y: arrowY, w: toX - fromX, h: 0.24,
        fill: { color: ds.colors.border }, line: { color: ds.colors.border },
      });
    };
    drawArrow(rootX + rootW, surfaceX - arrowGap + arrowGap);
    drawArrow(surfaceX + surfaceW, effectX - arrowGap + arrowGap);
  });

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// PPM_01: 痛点矩阵版（弹性 2×2 / 2×3 / 3×3，支持结构化单元格 + 严重度）
// ====================================================================
export function renderPainPointMatrix01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "PAIN POINTS");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  renderMatrixGrid(pptx, slide, plan, "pain", c, ds);
}

// ====================================================================
// OM_01: 机会矩阵版（弹性 2×2 / 2×3 / 3×3，支持结构化单元格 + 优先级）
// ====================================================================
export function renderOpportunityMatrix01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "OPPORTUNITIES");
  if (plan.subtitle) addCoreMessage(c, plan.subtitle, 1.4);

  renderMatrixGrid(pptx, slide, plan, "opp", c, ds);
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
// JOURNEY 辅助：解析阶段数据
// 优先使用结构化 journeyStages；否则从 visualItems/items 解析"阶段名：描述"
// ====================================================================
interface JourneyStageData {
  stage: string;
  behavior: string;
  touchpoint: string;
  emotion: string;
  painPoint: string;
}

function resolveJourneyStages(plan: SlidePlan): JourneyStageData[] {
  const structured = plan.content.journeyStages || [];
  if (structured.length > 0) {
    return structured.map(s => ({
      stage: s.stage || "",
      behavior: s.behavior || "",
      touchpoint: s.touchpoint || "",
      emotion: s.emotion || "",
      painPoint: s.painPoint || "",
    }));
  }
  // 回退：解析字符串列表。支持 "阶段名：行为|触点|情绪" 富格式
  const raw = plan.content.visualItems || plan.content.items || [];
  return raw.slice(0, 8).map(item => {
    const cnColon = item.indexOf("：");
    const enColon = item.indexOf(":");
    const colonIdx = cnColon >= 0 ? cnColon : enColon;
    const stage = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item.slice(0, 15);
    const rest = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";
    const parts = rest.split(/[|｜]/).map(p => p.trim());
    return {
      stage,
      behavior: "",
      touchpoint: parts[0] || rest,
      emotion: parts[1] || "",
      painPoint: parts[2] || "",
    };
  });
}

// ====================================================================
// JRN_01: 旅程图版（弹性 3-8 阶段横向时间轴）
// 每个阶段含阶段名 + 阶段描述卡片，阶段数自适应宽度
// ====================================================================
export function renderJourney01(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "JOURNEY");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const stages = resolveJourneyStages(plan);
  if (stages.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const stageCount = Math.min(stages.length, 8); // 弹性上限 8 阶段
  const startY = plan.coreMessage ? 2.3 : 2.0;
  const totalW = 11.93;
  const stageW = totalW / stageCount;
  const timelineY = startY + 0.5;

  // 横向时间轴主线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: timelineY, w: totalW, h: 0.04,
    fill: { color: ds.colors.border }, line: { color: ds.colors.border },
  });

  // 阶段数越多字号越小（弹性）
  const stageNameSize = stageCount > 6 ? ds.font.size.caption : ds.font.size.subhead;
  const descSize = stageCount > 6 ? 9 : ds.font.size.caption;

  for (let idx = 0; idx < stageCount; idx++) {
    const item = stages[idx];
    const x = 0.7 + idx * stageW;
    const centerX = x + stageW / 2;

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
    slide.addText(item.stage, {
      x: x + 0.08, y: startY, w: stageW - 0.16, h: 0.4,
      fontSize: stageNameSize, bold: true,
      color: ds.colors.text, fontFace: ds.font.family,
      align: "center", valign: "bottom", margin: 0,
    });

    // 阶段描述卡片（节点下方）
    const cardY = timelineY + 0.6;
    const cardH = 3.2;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.12, y: cardY, w: stageW - 0.24, h: cardH, rectRadius: 0.06,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });

    // 卡片内容：行为 / 触点 / 情绪（优先结构化字段）
    const lines: Array<{ label: string; text: string; color: string }> = [];
    const touch = item.touchpoint || item.behavior;
    if (touch) lines.push({ label: "行为/触点", text: touch, color: ds.colors.text });
    if (item.emotion) lines.push({ label: "情绪", text: item.emotion, color: ds.colors.accent });
    if (item.painPoint) lines.push({ label: "痛点", text: item.painPoint, color: ds.colors.warning });

    if (lines.length > 0) {
      const lineH = (cardH - 0.3) / lines.length;
      lines.forEach((ln, li) => {
        const ly = cardY + 0.15 + li * lineH;
        slide.addText(ln.label, {
          x: x + 0.27, y: ly, w: stageW - 0.42, h: 0.22,
          fontSize: 9, bold: true, color: ds.colors.secondaryText,
          fontFace: ds.font.family, align: "left", valign: "middle", margin: 0,
        });
        slide.addText(ln.text, {
          x: x + 0.27, y: ly + 0.22, w: stageW - 0.42, h: lineH - 0.28,
          fontSize: descSize, color: ln.color,
          fontFace: ds.font.family, align: "left", valign: "top", margin: 0,
          lineSpacingMultiple: 1.2,
        });
      });
    }
  }

  addFooter(c);
  addPageNumber(c);
}

// ====================================================================
// JRN_02: 旅程图-泳道式
// 三泳道：上=行为 / 中=触点 / 下=情绪曲线；读取 journeyStages 结构化字段
// ====================================================================
export function renderJourney02(pptx: any, slide: any, plan: SlidePlan, ctx?: Partial<RenderContext>): void {
  const c = makeCtx(pptx, slide, ctx?.pageNumber, ctx?.totalPages);
  const ds = designSystem;

  addPageTitle(c, plan.title, plan.chapterLabel || "JOURNEY");
  if (plan.coreMessage) addCoreMessage(c, plan.coreMessage, 1.4);

  const stages = resolveJourneyStages(plan);
  if (stages.length === 0) {
    addFooter(c);
    addPageNumber(c);
    return;
  }

  const stageCount = Math.min(stages.length, 8);
  const startY = plan.coreMessage ? 2.2 : 1.95;
  const totalW = 11.93;
  const laneX = 2.1;          // 泳道内容起始 X（左侧留给泳道标签）
  const laneW = totalW - laneX + 0.7; // 实际泳道宽度
  const stageW = laneW / stageCount;

  // 泳道定义
  const lanes = [
    { label: "行为", color: ds.colors.accent, field: "behavior" as const },
    { label: "触点", color: ds.colors.info, field: "touchpoint" as const },
    { label: "情绪", color: ds.colors.positive, field: "emotion" as const },
  ];
  const laneH = 1.35;
  const laneGap = 0.18;
  const lanesTop = startY + 0.15;

  lanes.forEach((lane, li) => {
    const ly = lanesTop + li * (laneH + laneGap);
    // 泳道标签
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.7, y: ly + 0.1, w: 1.25, h: laneH - 0.2, rectRadius: 0.06,
      fill: { color: lane.color }, line: { color: lane.color },
    });
    slide.addText(lane.label, {
      x: 0.7, y: ly + 0.1, w: 1.25, h: laneH - 0.2,
      fontSize: ds.font.size.subhead, bold: true,
      color: ds.colors.white, fontFace: ds.font.family,
      align: "center", valign: "middle", margin: 0,
    });

    // 泳道底框
    slide.addShape(pptx.ShapeType.roundRect, {
      x: laneX, y: ly, w: laneW, h: laneH, rectRadius: 0.06,
      fill: { color: ds.colors.softBackground },
      line: { color: ds.colors.lightBorder, width: 0.5 },
    });

    for (let idx = 0; idx < stageCount; idx++) {
      const x = laneX + idx * stageW;
      const text = stages[idx][lane.field] || "";
      slide.addText(text, {
        x: x + 0.1, y: ly + 0.1, w: stageW - 0.2, h: laneH - 0.2,
        fontSize: ds.font.size.caption, color: ds.colors.text,
        fontFace: ds.font.family, align: "center", valign: "middle", margin: 0,
        lineSpacingMultiple: 1.2,
      });
      // 阶段分隔线
      if (idx > 0) {
        slide.addShape(pptx.ShapeType.rect, {
          x: x, y: ly + 0.15, w: 0.012, h: laneH - 0.3,
          fill: { color: ds.colors.lightBorder }, line: { color: ds.colors.lightBorder },
        });
      }
    }
  });

  // 阶段标签行（最下方）
  const stageLabelY = lanesTop + lanes.length * (laneH + laneGap) + 0.05;
  for (let idx = 0; idx < stageCount; idx++) {
    const x = laneX + idx * stageW;
    slide.addText(`${idx + 1}. ${stages[idx].stage}`, {
      x: x + 0.1, y: stageLabelY, w: stageW - 0.2, h: 0.35,
      fontSize: ds.font.size.caption, bold: true, color: ds.colors.secondaryText,
      fontFace: ds.font.family, align: "center", valign: "middle", margin: 0,
      lineSpacingMultiple: 1.0,
    });
  }

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
