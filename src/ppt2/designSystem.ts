/**
 * 设计系统（Design System）
 *
 * 统一管理所有 PPT 的颜色、字号、间距、布局坐标。
 * 所有模板渲染器必须从 designSystem 读取配置，禁止硬编码。
 *
 * 原则：
 * - 咨询报告风格：扁平、简洁、留白充足
 * - 避免大面积渐变和立体效果
 * - 阴影仅在必要时使用
 * - 正文使用深灰而非纯黑
 */

export const designSystem = {
  // ====== 幻灯片尺寸（16:9）======
  slide: {
    width: 13.333,
    height: 7.5,
  },

  // ====== 字体 ======
  font: {
    family: "Microsoft YaHei",
    familyFallback: "微软雅黑",
    size: {
      coverTitle: 32,
      sectionTitle: 28,
      pageTitle: 24,
      headline: 20,
      subhead: 16,
      body: 14,
      caption: 11,
      footnote: 9,
    },
    weight: {
      regular: false,
      bold: true,
    },
  },

  // ====== 颜色 ======
  colors: {
    // 主色（蓝色系，专业咨询风格）
    primary: "2563EB",
    primaryDark: "1E3A8A",
    primaryLight: "DBEAFE",

    // 文字
    text: "253043",        // 深灰（正文）
    secondaryText: "667085", // 次要文字
    lightText: "98A2B3",   // 辅助文字
    white: "FFFFFF",

    // 背景
    background: "FFFFFF",
    softBackground: "F5F8FC",
    sectionBackground: "F1F5F9",

    // 边框
    border: "D0D5DD",
    lightBorder: "E4E7EC",

    // 语义色
    positive: "16A34A",
    warning: "F59E0B",
    negative: "DC2626",
    info: "0EA5E9",

    // 强调色（用于重点结论）
    accent: "2563EB",
    accentDark: "1E40AF",
    accentLight: "DBEAFE",
  },

  // ====== 间距 ======
  spacing: {
    pageLeft: 0.7,
    pageRight: 0.7,
    pageTop: 0.45,
    pageBottom: 0.4,
    blockGap: 0.25,
    itemGap: 0.15,
  },

  // ====== 页面内容区 ======
  contentArea: {
    x: 0.7,
    y: 1.55,         // 标题下方
    w: 11.93,        // 13.333 - 0.7*2
    h: 5.05,         // 7.5 - 1.55 - 0.9（页脚区）
    maxWidth: 11.93,
  },

  // ====== 页脚区 ======
  footer: {
    x: 0.7,
    y: 7.05,
    w: 11.93,
    h: 0.3,
    fontSize: 9,
    color: "98A2B3",
  },

  // ====== 阴影（仅在必要时使用）======
  shadow: {
    soft: { type: "outer" as const, color: "1E3A8A", blur: 4, offset: 2, angle: 90, opacity: 0.12 },
    medium: { type: "outer" as const, color: "1E3A8A", blur: 6, offset: 3, angle: 90, opacity: 0.18 },
  },

  // ====== 预设布局坐标 ======
  layout: {
    // 标准页面标题区
    pageTitle: {
      x: 0.7,
      y: 0.5,
      w: 11.93,
      h: 0.7,
    },
    // 章节标签（kicker）
    sectionLabel: {
      x: 0.7,
      y: 0.35,
      w: 6,
      h: 0.25,
    },
    // 标题下装饰线
    titleAccent: {
      x: 0.7,
      y: 1.25,
      w: 1.2,
      h: 0.04,
    },
    // 核心结论（大标题下方）
    coreMessage: {
      x: 0.7,
      y: 1.35,
      w: 11.93,
      h: 0.4,
    },
    // 正文区
    body: {
      x: 0.7,
      y: 1.85,
      w: 11.93,
      h: 4.7,
    },
    // 页码
    pageNumber: {
      x: 12.3,
      y: 7.05,
      w: 0.7,
      h: 0.3,
    },
    // 来源注释
    sourceNote: {
      x: 0.7,
      y: 7.05,
      w: 8,
      h: 0.3,
    },
  },
};

export type DesignSystem = typeof designSystem;

/**
 * 主题色覆盖（支持后续用户自定义）
 */
export function createTheme(overrides: Partial<typeof designSystem.colors> = {}) {
  return {
    ...designSystem,
    colors: { ...designSystem.colors, ...overrides },
  };
}

/**
 * 计算文本在指定宽度下需要的行数（近似）
 * 中文字符约 1 字符/字宽，英文约 0.5 字符/字宽
 */
export function estimateLines(text: string, fontSize: number, widthInches: number): number {
  if (!text) return 0;
  // 近似：每行可容纳的字符数 = widthInches * 72 / fontSize * 0.9（中文字符宽度≈fontSize）
  const charsPerLine = Math.floor((widthInches * 72) / fontSize * 0.85);
  const cjkChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - cjkChars;
  const effectiveLength = cjkChars + otherChars * 0.55;
  return Math.max(1, Math.ceil(effectiveLength / charsPerLine));
}

/**
 * 计算文本所需高度
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,
  widthInches: number,
  lineHeightRatio = 1.4,
): number {
  const lines = estimateLines(text, fontSize, widthInches);
  return lines * (fontSize / 72) * lineHeightRatio;
}
