/**
 * 版式多样性检查与自动修复
 *
 * 对应需求：连续 3 页禁止使用完全相同布局（LAYOUT_REPETITIVE）
 *
 * 策略：
 * 1. 扫描 slides，检测连续 3 页 slideType 相同的情况
 * 2. 对第 3 页尝试切换到"同类可替换模板"
 * 3. 如无同类可替换模板，尝试切换到语义相近的 slideType
 * 4. 保留 COVER、SECTION_DIVIDER、CONCLUSION 等结构页不切换
 */
import type { SlidePlan, SlideType } from "./schemas/slidePlan";
import { getTemplatesByType } from "./templateRegistry";

/**
 * 语义相近的 slideType 映射（用于自动切换）
 * 当连续 3 页相同且无同类模板时，按此表切换
 */
const SIMILAR_TYPES: Record<SlideType, SlideType[]> = {
  COVER: [],
  AGENDA: [],
  SECTION_DIVIDER: [],
  EXECUTIVE_SUMMARY: ["KEY_FINDING", "THREE_INSIGHTS"],
  KEY_FINDING: ["INSIGHT_EVIDENCE", "THREE_INSIGHTS"],
  INSIGHT_EVIDENCE: ["KEY_FINDING", "THREE_INSIGHTS"],
  THREE_INSIGHTS: ["KEY_FINDING", "INSIGHT_EVIDENCE"],
  TWO_COLUMN_COMPARE: ["CAUSE_ANALYSIS", "THREE_INSIGHTS"],
  QUOTE: ["KEY_FINDING", "INSIGHT_EVIDENCE"],
  PROCESS: ["JOURNEY"],
  JOURNEY: ["PROCESS"],
  CAUSE_ANALYSIS: ["TWO_COLUMN_COMPARE", "PAIN_POINT_MATRIX"],
  PAIN_POINT_MATRIX: ["OPPORTUNITY_MATRIX", "CAUSE_ANALYSIS"],
  OPPORTUNITY_MATRIX: ["PAIN_POINT_MATRIX", "RECOMMENDATIONS"],
  RECOMMENDATIONS: ["CONCLUSION", "OPPORTUNITY_MATRIX"],
  CONCLUSION: [],
  APPENDIX: [],
};

/**
 * 不应被自动切换的结构页（封面、章节分隔、结论等）
 */
const PROTECTED_TYPES = new Set<SlideType>([
  "COVER",
  "AGENDA",
  "SECTION_DIVIDER",
  "CONCLUSION",
  "APPENDIX",
]);

export interface LayoutDiversityIssue {
  slideIndex: number;
  slideId: string;
  originalType: SlideType;
  newType?: SlideType;
  originalTemplateId: string;
  newTemplateId?: string;
  reason: string;
  fixed: boolean;
}

export interface LayoutDiversityResult {
  issues: LayoutDiversityIssue[];
  fixedSlides: SlidePlan[];
  fixedCount: number;
}

/**
 * 检测并修复连续 3 页相同版式
 *
 * @param slides 原始页面规划
 * @returns 修复结果（含修复后的 slides 和问题列表）
 */
export function ensureLayoutDiversity(slides: SlidePlan[]): LayoutDiversityResult {
  const issues: LayoutDiversityIssue[] = [];
  const fixedSlides: SlidePlan[] = slides.map(s => ({ ...s }));

  // 滑动窗口检测连续相同 slideType
  for (let i = 2; i < fixedSlides.length; i++) {
    const prev2 = fixedSlides[i - 2];
    const prev1 = fixedSlides[i - 1];
    const current = fixedSlides[i];

    // 检测连续 3 页 slideType 相同
    if (
      current.slideType === prev1.slideType &&
      current.slideType === prev2.slideType
    ) {
      // 跳过受保护的结构页
      if (PROTECTED_TYPES.has(current.slideType)) {
        issues.push({
          slideIndex: i,
          slideId: current.slideId,
          originalType: current.slideType,
          originalTemplateId: current.templateId,
          reason: `连续 3 页使用 ${current.slideType}，但该类型为结构页不自动切换`,
          fixed: false,
        });
        continue;
      }

      // 尝试切换到同类模板（同 slideType 不同 templateId）
      const sameTypeTemplates = getTemplatesByType(current.slideType);
      const currentTemplateId = current.templateId;
      const alternativeTemplate = sameTypeTemplates.find(
        t => t.templateId !== currentTemplateId
      );

      if (alternativeTemplate) {
        // 切换到同类模板
        fixedSlides[i] = {
          ...current,
          templateId: alternativeTemplate.templateId,
        };
        issues.push({
          slideIndex: i,
          slideId: current.slideId,
          originalType: current.slideType,
          originalTemplateId: currentTemplateId,
          newTemplateId: alternativeTemplate.templateId,
          reason: `连续 3 页使用 ${current.slideType}，已切换到同类模板 ${alternativeTemplate.templateId}`,
          fixed: true,
        });
      } else {
        // 无同类模板，尝试切换到语义相近的 slideType
        const similarTypes = SIMILAR_TYPES[current.slideType] || [];
        // 选择一个不会导致新的连续 3 页相同的类型
        let switched = false;
        for (const candidateType of similarTypes) {
          // 检查切换后是否会导致新的连续相同
          const newPrev1 = fixedSlides[i - 1]?.slideType;
          const newNext = fixedSlides[i + 1]?.slideType;
          if (candidateType === newPrev1 && candidateType === newNext) continue;
          if (i >= 2 && candidateType === newPrev1 && candidateType === fixedSlides[i - 2]?.slideType) continue;

          const candidateTemplates = getTemplatesByType(candidateType);
          if (candidateTemplates.length > 0) {
            fixedSlides[i] = {
              ...current,
              slideType: candidateType,
              templateId: candidateTemplates[0].templateId,
            };
            issues.push({
              slideIndex: i,
              slideId: current.slideId,
              originalType: current.slideType,
              newType: candidateType,
              originalTemplateId: currentTemplateId,
              newTemplateId: candidateTemplates[0].templateId,
              reason: `连续 3 页使用 ${current.slideType}，已切换到相近类型 ${candidateType}`,
              fixed: true,
            });
            switched = true;
            break;
          }
        }

        if (!switched) {
          issues.push({
            slideIndex: i,
            slideId: current.slideId,
            originalType: current.slideType,
            originalTemplateId: currentTemplateId,
            reason: `连续 3 页使用 ${current.slideType}，但无可用替代模板`,
            fixed: false,
          });
        }
      }
    }
  }

  return {
    issues,
    fixedSlides,
    fixedCount: issues.filter(i => i.fixed).length,
  };
}

/**
 * 仅检测不修复（用于诊断报告）
 */
export function detectLayoutRepetition(slides: SlidePlan[]): LayoutDiversityIssue[] {
  return ensureLayoutDiversity(slides).issues;
}
