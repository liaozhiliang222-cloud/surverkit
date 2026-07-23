/**
 * PPT 生成器主入口
 *
 * 流程：SlidePlan[] → 容量检查 → 压缩 → 按模板渲染 → 输出 PPTX
 *
 * 关键原则：
 * - AI 不输出坐标，所有布局由 templateRegistry + designSystem 控制
 * - 每个页面类型对应一个渲染器函数
 * - 容量超限时自动压缩，不无限缩小字号
 */
import type { SlidePlan } from "./schemas/slidePlan";
import { designSystem } from "./designSystem";
import { validateAndCompress } from "./capacityValidator";
import { selectTemplateForPlan } from "./templateRegistry";
import { ensureLayoutDiversity } from "./layoutDiversity";
import { processAllSlides } from "./contentProcessor";
import {
  renderCover01,
  renderSectionDivider01,
  renderExecutiveSummary01,
  renderKeyFinding01,
} from "./templates/coverSectionExecKey";
import {
  renderInsightEvidence01,
  renderThreeInsights01,
  renderTwoColumnCompare01,
  renderQuote01,
  renderRecommendations01,
} from "./templates/insightCompareQuoteRec";
import {
  renderCauseAnalysis01,
  renderCauseAnalysis02,
  renderPainPointMatrix01,
  renderOpportunityMatrix01,
  renderProcess01,
  renderJourney01,
  renderJourney02,
  renderAgenda01,
  renderConclusion01,
  renderAppendix01,
} from "./templates/matrixProcessJourney";
import {
  renderPyramid01,
  renderDecisionPath01,
  renderProductHouse01,
} from "./templates/structuredVisuals";
import { isGraphicSlideType, renderVisualImage, type VisualImage } from "./visualRenderer";

// 渲染器映射表：renderer 字段名 → 函数
const RENDERERS: Record<string, (pptx: any, slide: any, plan: SlidePlan, ctx?: any) => void> = {
  renderCover01,
  renderSectionDivider01,
  renderExecutiveSummary01,
  renderKeyFinding01,
  renderInsightEvidence01,
  renderThreeInsights01,
  renderTwoColumnCompare01,
  renderQuote01,
  renderRecommendations01,
  // 第二阶段新增
  renderCauseAnalysis01,
  renderCauseAnalysis02,
  renderPainPointMatrix01,
  renderOpportunityMatrix01,
  renderProcess01,
  renderJourney01,
  renderJourney02,
  renderAgenda01,
  renderConclusion01,
  renderAppendix01,
  // 第一阶段新增：结构化图形渲染器
  renderPyramid01,
  renderDecisionPath01,
  renderProductHouse01,
};

export interface GeneratePptxOptions {
  /** 覆盖主题色（HEX，6位，不带#） */
  accentColor?: string;
  /** 是否启用容量自动压缩（默认 true） */
  autoCompress?: boolean;
  /** 文件名 */
  fileName?: string;
  /** 是否触发下载（默认 true） */
  download?: boolean;
}

export interface GeneratePptxResult {
  blob: Blob;
  slideCount: number;
  capacityResults: ReturnType<typeof validateAndCompress>["results"];
  compressed: boolean;
}

/**
 * 根据 SlidePlan[] 生成专业 PPT
 */
export async function generateProReportPptx(
  slides: SlidePlan[],
  options: GeneratePptxOptions = {},
): Promise<GeneratePptxResult> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx: any = new PptxGenJS();

  // 配置
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ResearchBox";
  pptx.subject = "专业研究报告";
  pptx.title = "ResearchBox 专业研究报告";
  pptx.company = "ResearchBox";

  // 主题色覆盖
  if (options.accentColor) {
    const color = options.accentColor.replace("#", "").toUpperCase();
    designSystem.colors.accent = color;
    designSystem.colors.primary = color;
    designSystem.colors.accentLight = `${color}33`;
  }

  // 内容处理：标题压缩 + 长段落转要点 + 自动拆页
  // 这一阶段可能在超量时拆出更多页面，所以必须在版式多样性检查之前执行
  const shouldProcess = options.autoCompress !== false;
  const { slides: processedSlides, processed: contentProcessed, report: processReport } =
    shouldProcess ? processAllSlides(slides) : { slides, processed: false, report: [] };
  if (contentProcessed) {
    const splitCount = processReport.filter(r => r.split).length;
    if (splitCount > 0) {
      console.log(`[pptGenerator] 内容处理：压缩并拆分了 ${splitCount} 页，总页数 ${slides.length} → ${processedSlides.length}`);
    }
  }

  // 容量检查与压缩（基础压缩，处理残余超量）
  const shouldCompress = options.autoCompress !== false;
  const { slides: compressedSlides, results, compressed } = shouldCompress
    ? validateAndCompress(processedSlides)
    : { slides: processedSlides, results: [], compressed: false };

  // 版式多样性检查：连续 3 页相同版式自动切换
  const { fixedSlides: diverseSlides, fixedCount: diversityFixedCount } =
    ensureLayoutDiversity(compressedSlides);
  if (diversityFixedCount > 0) {
    console.log(`[pptGenerator] 版式多样性修复：切换了 ${diversityFixedCount} 页的版式以避免连续重复`);
  }

  const finalSlides = diverseSlides;
  const totalPages = finalSlides.length;

  // 预渲染结构化图形（金字塔/决策路径/产品屋）：在批量渲染前一次性生成 PNG，
  // 避免在 forEach 中混用 async，并集中处理图形渲染失败。
  const visualImages: Record<string, VisualImage | null> = {};
  for (const plan of finalSlides) {
    if (isGraphicSlideType(plan.slideType)) {
      const items = plan.content.visualItems || [];
      visualImages[plan.slideId] = await renderVisualImage(plan.slideType, items);
    }
  }

  // 逐页渲染
  finalSlides.forEach((plan, idx) => {
    const slide = pptx.addSlide();
    const pageNumber = idx + 1;

    // 图形类页面：若无明确 templateId，按是否存在侧注内容自动选 layout 变体
    let effectivePlan = plan;
    if (isGraphicSlideType(plan.slideType)) {
      const hasSideContent = !!(plan.content.visualTree && plan.content.visualTree.length > 0)
        || !!(plan.content.items && plan.content.items.length > 0);
      const annotatedId = ({
        PYRAMID_HIERARCHY: "PYR_02",
        DECISION_PATH: "DP_02",
        PRODUCT_HOUSE: "PH_02",
      } as Record<string, string>)[plan.slideType];
      if (annotatedId && hasSideContent && !plan.templateId.endsWith("_02")) {
        effectivePlan = { ...plan, templateId: annotatedId };
      }
    }

    // 内容感知模板选择：templateId 为空时，按内容结构挑选最佳 layout 变体
    // （JOURNEY 有泳道数据→JRN_02；CAUSE 有因果链→CA_02；其余取默认）
    if (!effectivePlan.templateId) {
      const sel = selectTemplateForPlan(effectivePlan);
      if (sel) effectivePlan = { ...effectivePlan, templateId: sel.templateId };
    }

    // 根据模板选择渲染器
    const rendererName = getRendererNameForSlide(effectivePlan);
    const renderer = RENDERERS[rendererName];

    if (renderer) {
      renderer(pptx, slide, effectivePlan, {
        pageNumber,
        totalPages,
        visualImage: visualImages[effectivePlan.slideId] ?? null,
      });
    } else {
      // 兜底：未知类型用执行摘要模板
      console.warn(`[pptGenerator] 未知 slideType: ${plan.slideType}，使用 EXECUTIVE_SUMMARY 兜底`);
      renderExecutiveSummary01(pptx, slide, {
        ...plan,
        slideType: "EXECUTIVE_SUMMARY",
        title: plan.title || "未命名页面",
      }, { pageNumber, totalPages });
    }
  });

  // 生成 Blob
  const blob = await pptx.write({ outputType: "blob" }) as Blob;

  // 下载
  if (options.download !== false) {
    const { saveAs } = await import("file-saver");
    const fileName = options.fileName || `ResearchBox-专业报告-${Date.now()}.pptx`;
    saveAs(blob, fileName);
  }

  return {
    blob,
    slideCount: totalPages,
    capacityResults: results,
    compressed,
  };
}

/**
 * 根据 SlidePlan 获取渲染器名称
 */
function getRendererNameForSlide(plan: SlidePlan): string {
  // 如果 plan 指定了 templateId 且对应渲染器存在，直接用
  if (plan.templateId) {
    const templateRenderers: Record<string, string> = {
      "COVER_01": "renderCover01",
      "SD_01": "renderSectionDivider01",
      "ES_01": "renderExecutiveSummary01",
      "KF_01": "renderKeyFinding01",
      "IE_01": "renderInsightEvidence01",
      "TI_01": "renderThreeInsights01",
      "TCC_01": "renderTwoColumnCompare01",
      "QT_01": "renderQuote01",
      "REC_01": "renderRecommendations01",
      // 第二阶段新增
      "CA_01": "renderCauseAnalysis01",
      "CA_02": "renderCauseAnalysis02",
      "PPM_01": "renderPainPointMatrix01",
      "OM_01": "renderOpportunityMatrix01",
      "PROC_01": "renderProcess01",
      "JRN_01": "renderJourney01",
      "JRN_02": "renderJourney02",
      "AG_01": "renderAgenda01",
      "CON_01": "renderConclusion01",
      "APX_01": "renderAppendix01",
      // 第一阶段新增：结构化图形
      "PYR_01": "renderPyramid01",
      "PYR_02": "renderPyramid01",
      "DP_01": "renderDecisionPath01",
      "DP_02": "renderDecisionPath01",
      "PH_01": "renderProductHouse01",
      "PH_02": "renderProductHouse01",
    };
    const name = templateRenderers[plan.templateId];
    if (name && RENDERERS[name]) return name;
  }

  // 按 slideType 选默认渲染器
  const typeRendererMap: Record<string, string> = {
    "COVER": "renderCover01",
    "AGENDA": "renderAgenda01",
    "SECTION_DIVIDER": "renderSectionDivider01",
    "EXECUTIVE_SUMMARY": "renderExecutiveSummary01",
    "KEY_FINDING": "renderKeyFinding01",
    "INSIGHT_EVIDENCE": "renderInsightEvidence01",
    "THREE_INSIGHTS": "renderThreeInsights01",
    "TWO_COLUMN_COMPARE": "renderTwoColumnCompare01",
    "QUOTE": "renderQuote01",
    "PROCESS": "renderProcess01",
    "JOURNEY": "renderJourney01",
    "CAUSE_ANALYSIS": "renderCauseAnalysis01",
    "PAIN_POINT_MATRIX": "renderPainPointMatrix01",
    "OPPORTUNITY_MATRIX": "renderOpportunityMatrix01",
    "RECOMMENDATIONS": "renderRecommendations01",
    "CONCLUSION": "renderConclusion01",
    "APPENDIX": "renderAppendix01",
    // 第一阶段新增：结构化图形
    "PYRAMID_HIERARCHY": "renderPyramid01",
    "DECISION_PATH": "renderDecisionPath01",
    "PRODUCT_HOUSE": "renderProductHouse01",
  };
  return typeRendererMap[plan.slideType] || "renderExecutiveSummary01";
}

/**
 * 构建 RenderContext（供渲染器使用）
 */
export function buildRenderContext(
  pptx: any,
  slide: any,
  pageNumber?: number,
  totalPages?: number,
  chapterLabel?: string,
) {
  return {
    pptx,
    slide,
    ds: designSystem,
    pageNumber,
    totalPages,
    chapterLabel,
  };
}
