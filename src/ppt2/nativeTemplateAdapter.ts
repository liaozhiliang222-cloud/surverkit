/**
 * 原生 PPT 模板适配器（Native Template Adapter）
 *
 * 第五阶段：支持用户上传企业 PPT 模板，通过占位符替换生成报告。
 *
 * 工作原理：
 * 1. 用户在 PowerPoint 中设计模板，在文本框中写入占位符（如 {{PAGE_TITLE}}）
 * 2. 将 .pptx 文件上传到系统
 * 3. 系统解析模板中的占位符，建立占位符 → SlideContent 字段的映射
 * 4. 生成报告时，pptx-automizer 加载模板，替换占位符为实际内容
 *
 * 占位符规范：
 * - 使用双花括号包裹，全大写加下划线：{{FIELD_NAME}}
 * - 通用字段：PAGE_TITLE, SUBTITLE, CORE_MESSAGE, PAGE_NUMBER
 * - 列表字段：ITEM_1, ITEM_2, ... ITEM_N（最多 8 条）
 * - 引用字段：QUOTE_TEXT, QUOTE_SPEAKER, QUOTE_SOURCE
 * - 对比字段：LEFT_TITLE, LEFT_ITEM_1...; RIGHT_TITLE, RIGHT_ITEM_1...
 * - 可视化字段：VISUAL_LABEL_1, VISUAL_DESC_1...
 * - 元信息：REPORT_TITLE, REPORT_DATE, CHAPTER_LABEL
 *
 * 安全原则：
 * - AI 不直接生成坐标或修改模板结构
 * - 占位符替换由代码控制，AI 只输出 SlidePlan 内容
 * - 模板中的样式、布局、颜色完全由模板作者控制
 */
import type { SlidePlan, SlideType } from "./schemas/slidePlan";

// ====================================================================
// 一、占位符定义
// ====================================================================

/**
 * 占位符类型分类
 */
export const PlaceholderCategory = {
  COMMON: "通用字段",     // 所有页面通用
  LIST: "列表字段",       // items 列表
  QUOTE: "引用字段",      // 原话引用
  COMPARE: "对比字段",    // 左右栏对比
  VISUAL: "可视化字段",   // 可视化元素
  META: "元信息字段",     // 报告级元信息
} as const;

/**
 * 标准占位符定义
 * 模板作者在 PowerPoint 中使用这些占位符
 */
export interface PlaceholderDef {
  /** 占位符文本（不含花括号） */
  token: string;
  /** 分类 */
  category: keyof typeof PlaceholderCategory;
  /** 人类可读说明 */
  description: string;
  /** 对应 SlideContent 中的字段路径（用点分隔） */
  contentPath?: string;
  /** 是否为列表型（需要展开为 ITEM_1, ITEM_2...） */
  isList?: boolean;
  /** 列表最大展开数量 */
  maxListItems?: number;
}

export const STANDARD_PLACEHOLDERS: PlaceholderDef[] = [
  // 通用字段
  { token: "PAGE_TITLE", category: "COMMON", description: "页面标题", contentPath: "title" },
  { token: "SUBTITLE", category: "COMMON", description: "副标题", contentPath: "subtitle" },
  { token: "CORE_MESSAGE", category: "COMMON", description: "核心信息/结论", contentPath: "coreMessage" },
  { token: "PAGE_NUMBER", category: "COMMON", description: "页码（自动填充）" },
  { token: "TOTAL_PAGES", category: "COMMON", description: "总页数（自动填充）" },
  { token: "CHAPTER_LABEL", category: "COMMON", description: "章节标签", contentPath: "chapterLabel" },

  // 列表字段（自动展开为 ITEM_1 ~ ITEM_8）
  { token: "ITEM", category: "LIST", description: "要点列表（自动展开为 ITEM_1 到 ITEM_8）", contentPath: "content.items", isList: true, maxListItems: 8 },

  // 引用字段
  { token: "QUOTE_TEXT", category: "QUOTE", description: "引用原话", contentPath: "content.quote" },
  { token: "QUOTE_SPEAKER", category: "QUOTE", description: "说话人", contentPath: "content.quoteSpeaker" },
  { token: "QUOTE_SOURCE", category: "QUOTE", description: "引用来源", contentPath: "content.quoteSource" },

  // 对比字段（自动展开为 LEFT_ITEM_1 ~ LEFT_ITEM_4, RIGHT_ITEM_1 ~ RIGHT_ITEM_4）
  { token: "LEFT_ITEM", category: "COMPARE", description: "左栏要点（自动展开）", contentPath: "content.leftColumn", isList: true, maxListItems: 4 },
  { token: "RIGHT_ITEM", category: "COMPARE", description: "右栏要点（自动展开）", contentPath: "content.rightColumn", isList: true, maxListItems: 4 },

  // 可视化字段（自动展开为 VISUAL_LABEL_1 ~ VISUAL_LABEL_6）
  { token: "VISUAL_LABEL", category: "VISUAL", description: "可视化元素标签（自动展开）", contentPath: "content.visualItems", isList: true, maxListItems: 6 },

  // 元信息字段
  { token: "REPORT_TITLE", category: "META", description: "报告标题（全局）" },
  { token: "REPORT_DATE", category: "META", description: "报告日期（自动填充）" },
  { token: "REPORT_AUTHOR", category: "META", description: "报告作者" },
];

/**
 * 生成列表型占位符的实际 token
 * 例如：ITEM → ["ITEM_1", "ITEM_2", ..., "ITEM_8"]
 */
export function expandListToken(token: string, maxItems: number): string[] {
  return Array.from({ length: maxItems }, (_, i) => `${token}_${i + 1}`);
}

/**
 * 获取所有实际占位符 token（含展开后的列表 token）
 */
export function getAllPlaceholderTokens(): string[] {
  const tokens: string[] = [];
  for (const def of STANDARD_PLACEHOLDERS) {
    if (def.isList && def.maxListItems) {
      tokens.push(...expandListToken(def.token, def.maxListItems));
    } else {
      tokens.push(def.token);
    }
  }
  return tokens;
}

// ====================================================================
// 二、原生模板定义
// ====================================================================

/**
 * 原生模板元数据
 * 描述一个 .pptx 模板文件的基本信息和适用场景
 */
export interface NativeTemplateMeta {
  /** 模板 ID（文件名去扩展名） */
  templateId: string;
  /** 显示名称 */
  name: string;
  /** 模板文件名（含扩展名） */
  fileName: string;
  /** 适用的 slideType 列表 */
  slideTypes: SlideType[];
  /** 模板描述 */
  description: string;
  /** 模板中的幻灯片页数 */
  slideCount: number;
  /** 检测到的占位符列表 */
  detectedPlaceholders: string[];
  /** 是否为用户上传（false 表示内置） */
  isCustom: boolean;
  /** 上传时间（ISO 字符串） */
  uploadedAt?: string;
  /** 文件大小（字节） */
  fileSize: number;
}

/**
 * 内置原生模板注册表
 * 这些模板随系统提供，用户也可以上传自己的模板
 */
export const BUILTIN_NATIVE_TEMPLATES: NativeTemplateMeta[] = [
  {
    templateId: "native-cover-01",
    name: "企业封面模板",
    fileName: "native-cover-01.pptx",
    slideTypes: ["COVER"],
    description: "标准企业报告封面，含报告标题、副标题、日期、作者占位符",
    slideCount: 1,
    detectedPlaceholders: ["REPORT_TITLE", "SUBTITLE", "REPORT_DATE", "REPORT_AUTHOR"],
    isCustom: false,
    fileSize: 0,
  },
  {
    templateId: "native-keyfinding-01",
    name: "关键发现模板",
    fileName: "native-keyfinding-01.pptx",
    slideTypes: ["KEY_FINDING", "EXECUTIVE_SUMMARY"],
    description: "单页关键发现，含标题、核心信息、要点列表占位符",
    slideCount: 1,
    detectedPlaceholders: ["PAGE_TITLE", "CORE_MESSAGE", "ITEM_1", "ITEM_2", "ITEM_3", "ITEM_4", "ITEM_5"],
    isCustom: false,
    fileSize: 0,
  },
  {
    templateId: "native-compare-01",
    name: "双栏对比模板",
    fileName: "native-compare-01.pptx",
    slideTypes: ["TWO_COLUMN_COMPARE", "CAUSE_ANALYSIS"],
    description: "左右双栏对比布局，各含标题和 4 条要点占位符",
    slideCount: 1,
    detectedPlaceholders: [
      "PAGE_TITLE", "LEFT_ITEM_1", "LEFT_ITEM_2", "LEFT_ITEM_3", "LEFT_ITEM_4",
      "RIGHT_ITEM_1", "RIGHT_ITEM_2", "RIGHT_ITEM_3", "RIGHT_ITEM_4",
    ],
    isCustom: false,
    fileSize: 0,
  },
  {
    templateId: "native-quote-01",
    name: "专家引用模板",
    fileName: "native-quote-01.pptx",
    slideTypes: ["QUOTE", "INSIGHT_EVIDENCE"],
    description: "全页引用版式，含原话、说话人、来源占位符",
    slideCount: 1,
    detectedPlaceholders: ["QUOTE_TEXT", "QUOTE_SPEAKER", "QUOTE_SOURCE", "PAGE_TITLE"],
    isCustom: false,
    fileSize: 0,
  },
];

// ====================================================================
// 三、占位符替换器
// ====================================================================

/**
 * 替换上下文：包含全局元信息和当前页信息
 */
export interface PlaceholderContext {
  /** 当前幻灯片规划 */
  slide: SlidePlan;
  /** 页码（从 1 开始） */
  pageNumber: number;
  /** 总页数 */
  totalPages: number;
  /** 报告标题（全局） */
  reportTitle?: string;
  /** 报告作者 */
  reportAuthor?: string;
  /** 报告日期（YYYY-MM-DD） */
  reportDate?: string;
}

/**
 * 根据上下文构建占位符 → 实际值的映射表
 *
 * 返回的 map 键为占位符 token（不含花括号），值为替换文本。
 * 列表型占位符已展开为 ITEM_1, ITEM_2 等。
 *
 * @returns Map<string, string> 占位符 token → 替换值
 */
export function buildPlaceholderValues(ctx: PlaceholderContext): Map<string, string> {
  const values = new Map<string, string>();
  const { slide, pageNumber, totalPages, reportTitle, reportAuthor, reportDate } = ctx;

  // 通用字段
  values.set("PAGE_TITLE", slide.title || "");
  values.set("SUBTITLE", slide.subtitle || "");
  values.set("CORE_MESSAGE", slide.coreMessage || "");
  values.set("PAGE_NUMBER", String(pageNumber));
  values.set("TOTAL_PAGES", String(totalPages));
  values.set("CHAPTER_LABEL", slide.chapterLabel || "");

  // 元信息字段
  values.set("REPORT_TITLE", reportTitle || slide.title || "");
  values.set("REPORT_DATE", reportDate || new Date().toISOString().slice(0, 10));
  values.set("REPORT_AUTHOR", reportAuthor || "ResearchBox");

  // 列表字段：items → ITEM_1 ~ ITEM_8
  const items = slide.content.items || [];
  for (let i = 0; i < 8; i++) {
    values.set(`ITEM_${i + 1}`, items[i] || "");
  }

  // 引用字段
  values.set("QUOTE_TEXT", slide.content.quote || "");
  values.set("QUOTE_SPEAKER", slide.content.quoteSpeaker || "");
  values.set("QUOTE_SOURCE", slide.content.quoteSource || "");

  // 对比字段：leftColumn → LEFT_ITEM_1 ~ LEFT_ITEM_4
  const leftCol = slide.content.leftColumn || [];
  for (let i = 0; i < 4; i++) {
    values.set(`LEFT_ITEM_${i + 1}`, leftCol[i] || "");
  }

  // 对比字段：rightColumn → RIGHT_ITEM_1 ~ RIGHT_ITEM_4
  const rightCol = slide.content.rightColumn || [];
  for (let i = 0; i < 4; i++) {
    values.set(`RIGHT_ITEM_${i + 1}`, rightCol[i] || "");
  }

  // 可视化字段：visualItems → VISUAL_LABEL_1 ~ VISUAL_LABEL_6
  const visualItems = slide.content.visualItems || [];
  for (let i = 0; i < 6; i++) {
    values.set(`VISUAL_LABEL_${i + 1}`, visualItems[i] || "");
  }

  return values;
}

/**
 * 从文本中检测所有占位符 token
 *
 * @param text 要搜索的文本
 * @returns 匹配到的占位符 token 列表（不含花括号，去重）
 */
export function detectPlaceholders(text: string): string[] {
  const regex = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.add(match[1]);
  }
  return Array.from(tokens);
}

/**
 * 将占位符文本替换为实际值
 *
 * @param text 原始文本（含 {{PLACEHOLDER}}）
 * @param values 占位符值映射表
 * @returns 替换后的文本
 */
export function replacePlaceholders(text: string, values: Map<string, string>): string {
  if (!text) return "";
  return text.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (full, token: string) => {
    const val = values.get(token);
    // 未找到值或值为空时，保留占位符原文（方便模板作者调试）
    return val !== undefined && val !== "" ? escapeXml(val) : full;
  });
}

/**
 * XML 特殊字符转义
 * pptx-automizer 的 modifyText 回调需要处理 XML 文本
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ====================================================================
// 四、模板选择与匹配
// ====================================================================

/**
 * 为幻灯片选择最合适的原生模板
 *
 * 选择策略：
 * 1. 优先匹配 slideType 完全一致的模板
 * 2. 如果没有完全匹配，查找 slideTypes 包含该类型的模板
 * 3. 仍无匹配返回 undefined（回退到代码模板）
 */
export function selectNativeTemplate(
  slideType: SlideType,
  availableTemplates: NativeTemplateMeta[],
): NativeTemplateMeta | undefined {
  // 完全匹配
  const exact = availableTemplates.find(t => t.slideTypes.includes(slideType));
  if (exact) return exact;

  // 回退：COVERAGE 类型的模板可以用于大多数内容页
  const fallback = availableTemplates.find(t =>
    t.slideTypes.includes("KEY_FINDING") || t.slideTypes.includes("EXECUTIVE_SUMMARY")
  );
  return fallback;
}

/**
 * 检查模板是否适用于指定 slideType
 */
export function isTemplateApplicable(template: NativeTemplateMeta, slideType: SlideType): boolean {
  return template.slideTypes.includes(slideType);
}

/**
 * 获取模板使用统计
 * 统计每种 slideType 可用的原生模板数量
 */
export function getTemplateCoverageStats(templates: NativeTemplateMeta[]): Map<SlideType, number> {
  const stats = new Map<SlideType, number>();
  for (const t of templates) {
    for (const st of t.slideTypes) {
      stats.set(st, (stats.get(st) || 0) + 1);
    }
  }
  return stats;
}
