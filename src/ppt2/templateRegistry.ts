/**
 * 模板注册中心（Template Registry）
 *
 * 统一管理所有页面模板的容量限制和布局配置。
 * 渲染器函数名通过 renderer 字段关联，实际渲染器在 templates/ 目录下。
 *
 * 原则：
 * - 所有坐标由 registry 控制，业务代码不硬编码
 * - 同一 slideType 可对应多个 templateId
 * - 支持按内容长度自动选择合适容量的模板
 */
import type { SlideType, SlidePlan } from "./schemas/slidePlan";
import type { TemplateDefinition, TemplateCapacity } from "./schemas/template";

// ====== 容量预设 ======
const CAPACITY: Record<string, Partial<TemplateCapacity>> = {
  cover: { titleMaxChars: 30, subtitleMaxChars: 60, bodyMaxChars: 200, maxItems: 4, itemMaxChars: 30, minFontSize: 12 },
  sectionDivider: { titleMaxChars: 20, subtitleMaxChars: 80, bodyMaxChars: 0, maxItems: 0, itemMaxChars: 0, minFontSize: 16 },
  executiveSummary: { titleMaxChars: 30, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 5, itemMaxChars: 80, minFontSize: 12 },
  keyFinding: { titleMaxChars: 40, subtitleMaxChars: 60, bodyMaxChars: 250, maxItems: 4, itemMaxChars: 70, quoteMaxChars: 100, minFontSize: 14 },
  insightEvidence: { titleMaxChars: 36, subtitleMaxChars: 50, bodyMaxChars: 300, maxItems: 4, itemMaxChars: 80, quoteMaxChars: 120, minFontSize: 12 },
  threeInsights: { titleMaxChars: 34, subtitleMaxChars: 40, bodyMaxChars: 360, maxItems: 3, itemMaxChars: 100, minFontSize: 12 },
  twoColumnCompare: { titleMaxChars: 32, subtitleMaxChars: 40, bodyMaxChars: 500, maxItems: 4, itemMaxChars: 80, minFontSize: 12 },
  quote: { titleMaxChars: 20, subtitleMaxChars: 40, bodyMaxChars: 0, maxItems: 0, itemMaxChars: 0, quoteMaxChars: 160, minFontSize: 14 },
  recommendations: { titleMaxChars: 30, subtitleMaxChars: 40, bodyMaxChars: 450, maxItems: 5, itemMaxChars: 90, minFontSize: 12 },
  // 第二阶段新增容量预设
  causeAnalysis: { titleMaxChars: 36, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 4, itemMaxChars: 80, minFontSize: 12 },
  painPointMatrix: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 480, maxItems: 6, itemMaxChars: 100, minFontSize: 11 },
  opportunityMatrix: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 480, maxItems: 6, itemMaxChars: 100, minFontSize: 11 },
  process: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 5, itemMaxChars: 90, minFontSize: 11 },
  journey: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 500, maxItems: 5, itemMaxChars: 100, minFontSize: 11 },
  journeySwimlane: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 500, maxItems: 8, itemMaxChars: 100, minFontSize: 11 },
  causeTree: { titleMaxChars: 36, subtitleMaxChars: 50, bodyMaxChars: 600, maxItems: 6, itemMaxChars: 90, minFontSize: 12 },
  agenda: { titleMaxChars: 20, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 6, itemMaxChars: 80, minFontSize: 12 },
  conclusion: { titleMaxChars: 30, subtitleMaxChars: 60, bodyMaxChars: 320, maxItems: 4, itemMaxChars: 80, minFontSize: 13 },
  appendix: { titleMaxChars: 20, subtitleMaxChars: 50, bodyMaxChars: 500, maxItems: 6, itemMaxChars: 90, minFontSize: 12 },
  // 第一阶段新增：结构化图形类型容量预设
  pyramid: { titleMaxChars: 30, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 4, itemMaxChars: 80, minFontSize: 12 },
  decisionPath: { titleMaxChars: 32, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 6, itemMaxChars: 90, minFontSize: 12 },
  productHouse: { titleMaxChars: 30, subtitleMaxChars: 50, bodyMaxChars: 400, maxItems: 4, itemMaxChars: 80, minFontSize: 12 },
};

function makeCapacity(preset: keyof typeof CAPACITY): TemplateCapacity {
  return {
    titleMaxChars: 40, subtitleMaxChars: 60, bodyMaxChars: 300,
    maxItems: 5, itemMaxChars: 80, quoteMaxChars: 120,
    minFontSize: 14, maxVisuals: 1, maxImages: 0,
    ...CAPACITY[preset],
  } as TemplateCapacity;
}

// ====== 模板定义 ======
export const TEMPLATES: TemplateDefinition[] = [
  {
    templateId: "COVER_01",
    slideType: "COVER",
    name: "标准封面",
    description: "深色背景 + 报告标题 + 副标题 + 元信息",
    version: "1.0.0",
    capacity: makeCapacity("cover"),
    layout: {},
    renderer: "renderCover01",
  },
  {
    templateId: "SD_01",
    slideType: "SECTION_DIVIDER",
    name: "章节分隔页",
    description: "大号章节编号 + 章节标题 + 核心信息",
    version: "1.0.0",
    capacity: makeCapacity("sectionDivider"),
    layout: {},
    renderer: "renderSectionDivider01",
  },
  {
    templateId: "ES_01",
    slideType: "EXECUTIVE_SUMMARY",
    name: "执行摘要-编号列表",
    description: "标题 + 3-5 条编号要点",
    version: "1.0.0",
    capacity: makeCapacity("executiveSummary"),
    layout: {},
    renderer: "renderExecutiveSummary01",
  },
  {
    templateId: "KF_01",
    slideType: "KEY_FINDING",
    name: "单洞察大标题版",
    description: "结论型标题 + 核心信息 + 详细描述 + 可选引用",
    version: "1.0.0",
    capacity: makeCapacity("keyFinding"),
    layout: {},
    renderer: "renderKeyFinding01",
  },
  {
    templateId: "IE_01",
    slideType: "INSIGHT_EVIDENCE",
    name: "洞察+证据双栏版",
    description: "左侧洞察描述 + 右侧原话证据",
    version: "1.0.0",
    capacity: makeCapacity("insightEvidence"),
    layout: {},
    renderer: "renderInsightEvidence01",
  },
  {
    templateId: "TI_01",
    slideType: "THREE_INSIGHTS",
    name: "三栏洞察并列版",
    description: "三个洞察卡片横向并列",
    version: "1.0.0",
    capacity: makeCapacity("threeInsights"),
    layout: {},
    renderer: "renderThreeInsights01",
  },
  {
    templateId: "TCC_01",
    slideType: "TWO_COLUMN_COMPARE",
    name: "双栏对比版",
    description: "左栏 vs 右栏对比，各含标题和要点",
    version: "1.0.0",
    capacity: makeCapacity("twoColumnCompare"),
    layout: {},
    renderer: "renderTwoColumnCompare01",
  },
  {
    templateId: "QT_01",
    slideType: "QUOTE",
    name: "大引用版",
    description: "全页专家原话 + 说话人 + 溯源",
    version: "1.0.0",
    capacity: makeCapacity("quote"),
    layout: {},
    renderer: "renderQuote01",
  },
  {
    templateId: "REC_01",
    slideType: "RECOMMENDATIONS",
    name: "建议列表版",
    description: "标题 + 3-5 条编号建议（含优先级）",
    version: "1.0.0",
    capacity: makeCapacity("recommendations"),
    layout: {},
    renderer: "renderRecommendations01",
  },
  // ====== 第二阶段新增模板 ======
  {
    templateId: "CA_01",
    slideType: "CAUSE_ANALYSIS",
    name: "现象-根因双栏版",
    description: "左栏表层现象 + 箭头连接 + 右栏根本原因，含 AI 推断标记",
    version: "1.0.0",
    capacity: makeCapacity("causeAnalysis"),
    layout: {},
    renderer: "renderCauseAnalysis01",
  },
  {
    templateId: "CA_02",
    slideType: "CAUSE_ANALYSIS",
    name: "三级因果链版",
    description: "深层根因→表层原因→现象/结果 三级因果链，多因一果自动聚合，读取 causalChains 结构化字段",
    version: "1.1.0",
    capacity: makeCapacity("causeTree"),
    layout: {},
    renderer: "renderCauseAnalysis02",
  },
  {
    templateId: "PPM_01",
    slideType: "PAIN_POINT_MATRIX",
    name: "痛点矩阵版",
    description: "2x3 矩阵布局，每个痛点含编号、标题、描述，橙色警示色",
    version: "1.0.0",
    capacity: makeCapacity("painPointMatrix"),
    layout: {},
    renderer: "renderPainPointMatrix01",
  },
  {
    templateId: "OM_01",
    slideType: "OPPORTUNITY_MATRIX",
    name: "机会矩阵版",
    description: "2x3 矩阵布局，每个机会含编号、标题、描述，绿色正向色",
    version: "1.0.0",
    capacity: makeCapacity("opportunityMatrix"),
    layout: {},
    renderer: "renderOpportunityMatrix01",
  },
  {
    templateId: "PROC_01",
    slideType: "PROCESS",
    name: "横向流程图版",
    description: "chevron 箭头流程，最多 5 步，每步含编号、标题、描述卡片",
    version: "1.0.0",
    capacity: makeCapacity("process"),
    layout: {},
    renderer: "renderProcess01",
  },
  {
    templateId: "JRN_01",
    slideType: "JOURNEY",
    name: "横向旅程图版",
    description: "时间轴节点 + 阶段卡片，弹性 3-8 阶段，每阶段含行为/触点/情绪",
    version: "1.1.0",
    capacity: makeCapacity("journey"),
    layout: {},
    renderer: "renderJourney01",
  },
  {
    templateId: "JRN_02",
    slideType: "JOURNEY",
    name: "泳道式旅程图版",
    description: "三泳道（行为/触点/情绪）+ 阶段标签，读取 journeyStages 结构化字段，适合多层级旅程",
    version: "1.1.0",
    capacity: makeCapacity("journeySwimlane"),
    layout: {},
    renderer: "renderJourney02",
  },
  {
    templateId: "AG_01",
    slideType: "AGENDA",
    name: "目录列表版",
    description: "大号编号 + 章节标题 + 核心信息，最多 6 章",
    version: "1.0.0",
    capacity: makeCapacity("agenda"),
    layout: {},
    renderer: "renderAgenda01",
  },
  {
    templateId: "CON_01",
    slideType: "CONCLUSION",
    name: "深色结论页",
    description: "深色背景 + 标题 + 核心信息 + 编号启示列表 + 底部标语",
    version: "1.0.0",
    capacity: makeCapacity("conclusion"),
    layout: {},
    renderer: "renderConclusion01",
  },
  {
    templateId: "APX_01",
    slideType: "APPENDIX",
    name: "附录双栏版",
    description: "左栏研究方法 + 右栏研究限制，或单栏列表",
    version: "1.0.0",
    capacity: makeCapacity("appendix"),
    layout: {},
    renderer: "renderAppendix01",
  },
  // ====== 第一阶段新增：结构化图形模板（让 visualType 真正生效）======
  {
    templateId: "PYR_01",
    slideType: "PYRAMID_HIERARCHY",
    name: "需求金字塔-居中版",
    description: "金字塔图形居中铺满，适合需求/价值层级分析（最多4层）",
    version: "1.1.0",
    capacity: makeCapacity("pyramid"),
    layout: {},
    renderer: "renderPyramid01",
  },
  {
    templateId: "PYR_02",
    slideType: "PYRAMID_HIERARCHY",
    name: "需求金字塔-带侧注版",
    description: "图形居左 + 右侧层级说明/证据面板，适合需要补充子论点或证据的层级分析",
    version: "1.1.0",
    capacity: makeCapacity("pyramid"),
    layout: {},
    renderer: "renderPyramid01",
  },
  {
    templateId: "DP_01",
    slideType: "DECISION_PATH",
    name: "购买决策路径-横向版",
    description: "chevron 箭头从左到右铺满，适合购买决策/行为路径（最多6步）",
    version: "1.1.0",
    capacity: makeCapacity("decisionPath"),
    layout: {},
    renderer: "renderDecisionPath01",
  },
  {
    templateId: "DP_02",
    slideType: "DECISION_PATH",
    name: "购买决策路径-带侧注版",
    description: "图形居左 + 右侧每步要点/证据面板，适合需要标注各阶段细节的决策路径",
    version: "1.1.0",
    capacity: makeCapacity("decisionPath"),
    layout: {},
    renderer: "renderDecisionPath01",
  },
  {
    templateId: "PH_01",
    slideType: "PRODUCT_HOUSE",
    name: "产品屋-居中版",
    description: "屋顶（核心价值）+ 支柱 + 基座（基础保障）居中铺满，最多1屋顶3支柱1基座",
    version: "1.1.0",
    capacity: makeCapacity("productHouse"),
    layout: {},
    renderer: "renderProductHouse01",
  },
  {
    templateId: "PH_02",
    slideType: "PRODUCT_HOUSE",
    name: "产品屋-带侧注版",
    description: "图形居左 + 右侧支柱/基座说明面板，适合需要展开支撑逻辑的 product house",
    version: "1.1.0",
    capacity: makeCapacity("productHouse"),
    layout: {},
    renderer: "renderProductHouse01",
  },
];

// ====== 查询接口 ======
const templateByType = new Map<SlideType, TemplateDefinition[]>();
for (const t of TEMPLATES) {
  const list = templateByType.get(t.slideType as SlideType) || [];
  list.push(t);
  templateByType.set(t.slideType as SlideType, list);
}

export function getTemplatesByType(slideType: SlideType): TemplateDefinition[] {
  return templateByType.get(slideType) || [];
}

export function getTemplate(templateId: string): TemplateDefinition | undefined {
  return TEMPLATES.find(t => t.templateId === templateId);
}

export function getDefaultTemplate(slideType: SlideType): TemplateDefinition | undefined {
  const list = getTemplatesByType(slideType);
  return list[0];
}

export function listAllTemplates(): TemplateDefinition[] {
  return [...TEMPLATES];
}

/**
 * 根据内容长度选择最合适的模板
 * 第一阶段：同类型只有一个模板，直接返回默认
 * 第二阶段：可根据 bodyMaxChars 选择不同容量模板
 */
export function selectTemplate(slideType: SlideType, _contentLength = 0): TemplateDefinition | undefined {
  return getDefaultTemplate(slideType);
}

/**
 * 根据完整 SlidePlan 内容选择最合适的模板（内容感知版）
 *
 * 用于生成器在 plan.templateId 为空时自动挑选 layout 变体：
 * - JOURNEY：若 journeyStages 含行为/触点/情绪等多层信息 → 选 JRN_02 泳道式，否则 JRN_01
 * - CAUSE_ANALYSIS：若 causalChains 存在 → 选 CA_02 三级因果链，否则 CA_01 双栏
 * - 其他类型：返回默认模板
 */
export function selectTemplateForPlan(plan: SlidePlan): TemplateDefinition | undefined {
  const list = getTemplatesByType(plan.slideType);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];

  const content = (plan as SlidePlan).content || {};
  switch (plan.slideType) {
    case "JOURNEY": {
      const stages = content.journeyStages || [];
      const hasLanes = stages.some(
        s => s.behavior || s.touchpoint || s.emotion || s.painPoint,
      );
      return hasLanes ? list.find(t => t.templateId === "JRN_02") || list[0] : list[0];
    }
    case "CAUSE_ANALYSIS": {
      const chains = content.causalChains || [];
      return chains.length > 0
        ? list.find(t => t.templateId === "CA_02") || list[0]
        : list[0];
    }
    default:
      return list[0];
  }
}
