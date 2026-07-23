/**
 * 结构化图形渲染桥接层（Visual Renderer）
 *
 * 打通"经典版 SVG 图形"与"专业版 ppt2 渲染管线"之间的断裂：
 * - 复用 svgDiagrams.ts 中已画好的 pyramid / decision-path / product-house /
 *   experience-map 四个高质量 SVG 图形
 * - 通过 SVG → Canvas → PNG 转为 PptxGenJS 可嵌入的 data URL
 * - 渲染器（structuredVisuals.ts）调用本模块拿到图形后 addImage 嵌入幻灯片
 *
 * 这是短期方案（SVG→PNG 嵌入），清晰度高且复用成本最低；
 * 后续可替换为纯 pptxgenjs 原生 shape 以获得可编辑矢量。
 */
import type { SlideType } from "./schemas/slidePlan";
import {
  renderDiagramToPng,
  type DiagramItem,
} from "../svgDiagrams";

// slideType → svgDiagrams 的图形类型映射
const TYPE_TO_DIAGRAM: Partial<Record<SlideType, DiagramItem["type"]>> = {
  PYRAMID_HIERARCHY: "pyramid",
  DECISION_PATH: "decision-path",
  PRODUCT_HOUSE: "product-house",
};

// 需要图形渲染的 slideType 集合
export const GRAPHIC_SLIDE_TYPES: SlideType[] = [
  "PYRAMID_HIERARCHY",
  "DECISION_PATH",
  "PRODUCT_HOUSE",
];

export function isGraphicSlideType(t: SlideType): boolean {
  return GRAPHIC_SLIDE_TYPES.includes(t);
}

export interface VisualImage {
  dataUrl: string; // data:image/png;base64,...
  width: number;   // 英寸（已按 2x 高清折算）
  height: number;  // 英寸
}

/**
 * 根据 slideType + visualItems 渲染结构化图形为 PNG。
 * 复用 svgDiagrams.ts 的成熟绘制逻辑，保证图形质量与经典版一致。
 *
 * @returns 渲染成功返回 VisualImage；失败/不支持返回 null（调用方需有文本兜底）
 */
export async function renderVisualImage(
  slideType: SlideType,
  items: string[],
): Promise<VisualImage | null> {
  const diagramType = TYPE_TO_DIAGRAM[slideType];
  if (!diagramType) return null;
  if (!items || items.length === 0) return null;

  try {
    const result = await renderDiagramToPng({ type: diagramType, items });
    if (!result) return null;
    return { dataUrl: result.dataUrl, width: result.width, height: result.height };
  } catch (err) {
    console.warn(`[visualRenderer] 图形渲染失败 (${slideType}):`, err);
    return null;
  }
}
