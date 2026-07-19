/**
 * SVG 结构化图形渲染模块
 *
 * 原理：用 SVG 字符串绘制高质量图形 → Canvas 中转 → base64 PNG → PptxGenJS addImage
 * 优势：贝塞尔曲线、渐变、滤镜、精确文字布局，渲染质量远超原生形状
 */

// ── 颜色常量（与 p2Services 保持一致）──
const C = {
  accent: "#0D9488",
  navy: "#102A43",
  ink: "#243B53",
  muted: "#627D98",
  pale: "#F0F4F8",
  lightAccent: "#E6F4F1",
  white: "#FFFFFF",
  positive: "#16A34A",
  neutral: "#D97706",
  negative: "#DC2626",
  lineGray: "#9FB3C8",
  borderGray: "#D9E2EC",
};

export interface DiagramItem {
  type: "pyramid" | "flowchart" | "product-house" | "decision-path" | "experience-map";
  items: string[];
}

/**
 * SVG 字符串 → base64 PNG
 * @param svgText SVG 源码
 * @param width 输出像素宽（建议 2x 高清）
 * @param height 输出像素高
 */
export function svgToPng(svgText: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context 不可用"));
        return;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 转图片失败"));
    };
    img.src = url;
  });
}

// ── HTML 转义 ──
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── 文字截断 ──
function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── 文字自动换行（按字符数）──
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    current += ch;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines - 1).concat(lines[maxLines - 1].slice(0, maxCharsPerLine - 1) + "…");
  }
  return lines;
}

// ══════════════════════════════════════
//  体验地图
// ══════════════════════════════════════

interface ExperienceStage {
  name: string;
  emotion: "positive" | "neutral" | "negative";
  desc: string;
}

function parseExperienceStages(items: string[]): ExperienceStage[] {
  return items.slice(0, 6).map((item) => {
    const parts = item.split("|").map((p) => p.trim());
    const name = parts[0] || "";
    const emotionRaw = parts[1] || "";
    const desc = parts[2] || "";
    const emotion: ExperienceStage["emotion"] = emotionRaw.includes("正面")
      ? "positive"
      : emotionRaw.includes("负面")
        ? "negative"
        : "neutral";
    return { name, emotion, desc };
  });
}

export function renderExperienceMapSvg(items: string[]): string {
  const stages = parseExperienceStages(items);
  if (stages.length === 0) return "";

  const W = 1200;
  const H = 520;
  const padX = 70;
  const baselineY = 250;
  const barMaxH = 80;
  const barW = 36;
  const stepX = (W - padX * 2) / Math.max(stages.length - 1, 1);

  const emotionColor: Record<string, string> = {
    positive: C.positive,
    neutral: C.neutral,
    negative: C.negative,
  };
  const emotionLabel: Record<string, string> = {
    positive: "☺ 正面",
    neutral: "– 中性",
    negative: "☹ 负面",
  };

  // 计算每个阶段的柱体顶端 Y
  const barTops = stages.map((s) => {
    if (s.emotion === "positive") return baselineY - barMaxH;
    if (s.emotion === "negative") return baselineY + barMaxH;
    return baselineY - 15;
  });

  // 构建贝塞尔曲线路径
  let curvePath = "";
  stages.forEach((_, idx) => {
    const x = padX + idx * stepX;
    const y = barTops[idx];
    if (idx === 0) {
      curvePath = `M ${x} ${y}`;
    } else {
      const prevX = padX + (idx - 1) * stepX;
      const midX = (prevX + x) / 2;
      // 三次贝塞尔：控制点在中点，制造平滑过渡
      curvePath += ` C ${midX} ${barTops[idx - 1]}, ${midX} ${y}, ${x} ${y}`;
    }
  });

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

  // ── 定义渐变和滤镜 ──
  svg += `<defs>`;
  // 基准线渐变
  svg += `<linearGradient id="baseline" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${C.lineGray}" stop-opacity="0.3"/>
    <stop offset="50%" stop-color="${C.lineGray}" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="${C.lineGray}" stop-opacity="0.3"/>
  </linearGradient>`;
  // 柱体渐变（正面）
  svg += `<linearGradient id="grad-positive" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.positive}" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="${C.positive}" stop-opacity="0.6"/>
  </linearGradient>`;
  // 柱体渐变（负面）
  svg += `<linearGradient id="grad-negative" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.negative}" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="${C.negative}" stop-opacity="0.95"/>
  </linearGradient>`;
  // 柱体渐变（中性）
  svg += `<linearGradient id="grad-neutral" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.neutral}" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="${C.neutral}" stop-opacity="0.5"/>
  </linearGradient>`;
  // 阴影
  svg += `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
    <feOffset dx="0" dy="1.5" result="offsetblur"/>
    <feFlood flood-color="#102A43" flood-opacity="0.15"/>
    <feComposite in2="offsetblur" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  // 曲线渐变（根据情绪段变化）
  svg += `<linearGradient id="curve-gradient" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="${C.accent}" stop-opacity="0.6"/>
  </linearGradient>`;
  svg += `</defs>`;

  // ── 背景 ──
  svg += `<rect width="${W}" height="${H}" fill="${C.white}"/>`;

  // ── 基准线（渐变虚线）──
  svg += `<line x1="${padX}" y1="${baselineY}" x2="${W - padX}" y2="${baselineY}" stroke="url(#baseline)" stroke-width="2.5" stroke-dasharray="6 4"/>`;
  svg += `<text x="${W - padX + 12}" y="${baselineY + 4}" font-size="11" fill="${C.muted}" font-family="sans-serif">中性基准</text>`;

  // ── 情绪曲线（贝塞尔，带阴影）──
  svg += `<path d="${curvePath}" fill="none" stroke="url(#curve-gradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7" filter="url(#shadow)"/>`;

  // ── 每个阶段 ──
  stages.forEach((stage, idx) => {
    const x = padX + idx * stepX;
    const color = emotionColor[stage.emotion];
    const gradId = `grad-${stage.emotion}`;

    // 阶段编号徽章
    svg += `<rect x="${x - 22}" y="15" width="44" height="26" rx="6" fill="${C.lightAccent}"/>`;
    svg += `<text x="${x}" y="33" font-size="13" font-weight="700" fill="${C.accent}" text-anchor="middle" font-family="sans-serif">${String(idx + 1).padStart(2, "0")}</text>`;

    // 情绪柱体（渐变 + 圆角）
    let barY: number, barH: number;
    if (stage.emotion === "positive") {
      barY = baselineY - barMaxH;
      barH = barMaxH;
    } else if (stage.emotion === "negative") {
      barY = baselineY;
      barH = barMaxH;
    } else {
      barY = baselineY - 15;
      barH = 15;
    }
    svg += `<rect x="${x - barW / 2}" y="${barY}" width="${barW}" height="${Math.max(barH, 4)}" rx="5" fill="url(#${gradId})" filter="url(#shadow)"/>`;

    // 情绪标签
    const labelY = stage.emotion === "negative" ? barY + barH + 14 : barY - 10;
    svg += `<text x="${x}" y="${labelY}" font-size="12" font-weight="700" fill="${color}" text-anchor="middle" font-family="sans-serif">${emotionLabel[stage.emotion]}</text>`;

    // 基准线圆点（白底 + 彩色描边）
    svg += `<circle cx="${x}" cy="${baselineY}" r="8" fill="${C.white}" stroke="${color}" stroke-width="2.5"/>`;
    svg += `<circle cx="${x}" cy="${baselineY}" r="3" fill="${color}"/>`;

    // 阶段名称卡片
    const cardW = 120;
    const cardY = baselineY + 30;
    svg += `<rect x="${x - cardW / 2}" y="${cardY}" width="${cardW}" height="30" rx="6" fill="${C.pale}" stroke="${C.borderGray}" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${cardY + 20}" font-size="13" font-weight="700" fill="${C.navy}" text-anchor="middle" font-family="sans-serif">${esc(trunc(stage.name, 10))}</text>`;

    // 描述文字（自动换行）
    if (stage.desc) {
      const lines = wrapText(trunc(stage.desc, 50), 14, 3);
      lines.forEach((line, lineIdx) => {
        svg += `<text x="${x}" y="${cardY + 50 + lineIdx * 16}" font-size="11" fill="${C.muted}" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
      });
    }
  });

  // ── 底部说明 ──
  svg += `<text x="${W / 2}" y="${H - 15}" font-size="10" fill="${C.muted}" text-anchor="middle" font-family="sans-serif" opacity="0.6">用户体验地图 · 情绪走势分析</text>`;

  svg += `</svg>`;
  return svg;
}

// ══════════════════════════════════════
//  金字塔
// ══════════════════════════════════════

export function renderPyramidSvg(items: string[]): string {
  const layers = items.slice(0, 4).map((item) => {
    const colonIdx = item.indexOf(":");
    const label = colonIdx > 0 ? item.slice(0, colonIdx).trim() : "";
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : item;
    return { label, desc };
  });
  if (layers.length === 0) return "";

  const W = 1000;
  const H = 580;
  const layerH = 95;
  const layerGap = 8;
  const maxW = 720;
  const minW = 260;
  const centerX = W / 2;
  const startY = 40;

  // 由浅到深的渐变色
  const layerColors = [
    { fill: "#E6F4F1", stroke: "#9ECFC9", text: C.accent, badge: C.white, badgeText: C.accent },
    { fill: "#9ECFC9", stroke: "#5BB5A8", text: C.ink, badge: C.white, badgeText: C.ink },
    { fill: "#0D9488", stroke: "#0A7A6E", text: C.white, badge: C.lightAccent, badgeText: C.accent },
    { fill: "#102A43", stroke: "#0A1E33", text: C.white, badge: C.lightAccent, badgeText: C.accent },
  ];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

  // ── 定义 ──
  svg += `<defs>`;
  svg += `<filter id="pyramid-shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
    <feOffset dx="0" dy="3" result="offsetblur"/>
    <feFlood flood-color="#102A43" flood-opacity="0.2"/>
    <feComposite in2="offsetblur" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  // 每层渐变
  layerColors.forEach((lc, idx) => {
    svg += `<linearGradient id="py-grad-${idx}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lc.fill}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${lc.stroke}" stop-opacity="0.8"/>
    </linearGradient>`;
  });
  svg += `</defs>`;

  // ── 背景 ──
  svg += `<rect width="${W}" height="${H}" fill="${C.white}"/>`;

  // ── 每层 ──
  layers.forEach((layer, idx) => {
    const ratio = layers.length === 1 ? 1 : idx / (layers.length - 1);
    const width = minW + (maxW - minW) * ratio;
    const x = centerX - width / 2;
    const y = startY + idx * (layerH + layerGap);
    const lc = layerColors[Math.min(idx, layerColors.length - 1)];
    const gradId = `py-grad-${idx}`;

    // 形状：顶层三角形，其余梯形
    if (idx === 0) {
      const points = `${centerX},${y} ${x + width},${y + layerH} ${x},${y + layerH}`;
      svg += `<polygon points="${points}" fill="url(#${gradId})" stroke="${C.white}" stroke-width="2" filter="url(#pyramid-shadow)"/>`;
    } else {
      // 梯形：上窄下宽
      const prevRatio = layers.length === 1 ? 1 : (idx - 1) / (layers.length - 1);
      const prevWidth = minW + (maxW - minW) * prevRatio;
      const prevX = centerX - prevWidth / 2;
      const inset = (width - prevWidth) / 2;
      // 上边比下边窄一点（视觉层次）
      const topInset = inset * 0.6;
      const points = `${x + topInset},${y} ${x + width - topInset},${y} ${x + width},${y + layerH} ${x},${y + layerH}`;
      svg += `<polygon points="${points}" fill="url(#${gradId})" stroke="${C.white}" stroke-width="2" filter="url(#pyramid-shadow)"/>`;
    }

    // 标签徽章
    if (layer.label) {
      const badgeW = Math.min(width * 0.5, 160);
      const badgeH = 26;
      const badgeX = centerX - badgeW / 2;
      const badgeY = y + 10;
      svg += `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="5" fill="${lc.badge}" opacity="0.9"/>`;
      svg += `<text x="${centerX}" y="${badgeY + 18}" font-size="13" font-weight="700" fill="${lc.badgeText}" text-anchor="middle" font-family="sans-serif">${esc(layer.label)}</text>`;

      // 描述文字
      const descLines = wrapText(trunc(layer.desc, 60), Math.floor(width / 14), 2);
      descLines.forEach((line, lineIdx) => {
        svg += `<text x="${centerX}" y="${badgeY + badgeH + 22 + lineIdx * 18}" font-size="13" font-weight="600" fill="${lc.text}" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
      });
    } else {
      const lines = wrapText(trunc(layer.desc, 60), Math.floor(width / 14), 2);
      lines.forEach((line, lineIdx) => {
        svg += `<text x="${centerX}" y="${y + layerH / 2 + idx * 6 + lineIdx * 18}" font-size="14" font-weight="700" fill="${lc.text}" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
      });
    }
  });

  // ── 底部说明 ──
  svg += `<text x="${W / 2}" y="${H - 15}" font-size="10" fill="${C.muted}" text-anchor="middle" font-family="sans-serif" opacity="0.6">金字塔模型 · 层次结构分析</text>`;

  svg += `</svg>`;
  return svg;
}

// ══════════════════════════════════════
//  购买决策路径
// ══════════════════════════════════════

export function renderDecisionPathSvg(items: string[]): string {
  const stages = items.slice(0, 6).map((item) => {
    // 支持 "name: desc"、"name | desc"、"label：name | desc" 等格式
    const pipeIdx = item.indexOf("|");
    let name = item, desc = "";
    if (pipeIdx > 0) {
      let beforePipe = item.slice(0, pipeIdx).trim();
      desc = item.slice(pipeIdx + 1).trim();
      // 如果 beforePipe 含有 "label：name" 格式，提取实际 name
      const cnColon = beforePipe.indexOf("：");
      const enColon = beforePipe.indexOf(":");
      const colonIdx = cnColon >= 0 ? cnColon : enColon;
      if (colonIdx > 0 && colonIdx < beforePipe.length - 1) {
        beforePipe = beforePipe.slice(colonIdx + 1).trim();
      }
      name = beforePipe;
    } else {
      const cnColon = item.indexOf("：");
      const enColon = item.indexOf(":");
      const colonIdx = cnColon >= 0 ? cnColon : enColon;
      if (colonIdx > 0) {
        name = item.slice(0, colonIdx).trim();
        desc = item.slice(colonIdx + 1).trim();
      }
    }
    return { name, desc };
  });
  if (stages.length === 0) return "";

  const W = 1200;
  const H = 320;
  const chevronW = 200;
  const chevronH = 90;
  const overlap = 30;
  const totalW = stages.length * chevronW - (stages.length - 1) * overlap;
  const startX = (W - totalW) / 2;
  const y = 100;

  const colors = ["#E6F4F1", "#9ECFC9", "#0D9488", "#0A7A6E", "#102A43", "#0A1E33"];
  const textColors = [C.accent, C.ink, C.white, C.white, C.white, C.white];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<defs><filter id="chevron-shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
    <feOffset dx="0" dy="2" result="offsetblur"/>
    <feFlood flood-color="#102A43" flood-opacity="0.15"/>
    <feComposite in2="offsetblur" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>`;
  svg += `<rect width="${W}" height="${H}" fill="${C.white}"/>`;

  stages.forEach((stage, idx) => {
    const x = startX + idx * (chevronW - overlap);
    const color = colors[Math.min(idx, colors.length - 1)];
    const textColor = textColors[Math.min(idx, textColors.length - 1)];
    const isLast = idx === stages.length - 1;
    const notchDepth = isLast ? 0 : 25;

    // Chevron 路径
    const path = `M ${x} ${y}
                  L ${x + chevronW - notchDepth} ${y}
                  L ${x + chevronW} ${y + chevronH / 2}
                  L ${x + chevronW - notchDepth} ${y + chevronH}
                  L ${x} ${y + chevronH}
                  L ${x + notchDepth} ${y + chevronH / 2}
                  Z`;
    svg += `<path d="${path}" fill="${color}" stroke="${C.white}" stroke-width="2" filter="url(#chevron-shadow)"/>`;

    // 步骤编号
    svg += `<text x="${x + chevronW / 2 - overlap / 2}" y="${y + 28}" font-size="11" font-weight="700" fill="${textColor}" opacity="0.7" text-anchor="middle" font-family="sans-serif">STEP ${idx + 1}</text>`;

    // 阶段名称
    svg += `<text x="${x + chevronW / 2 - overlap / 2}" y="${y + 50}" font-size="15" font-weight="700" fill="${textColor}" text-anchor="middle" font-family="sans-serif">${esc(trunc(stage.name, 8))}</text>`;

    // 描述
    if (stage.desc) {
      const lines = wrapText(trunc(stage.desc, 40), 12, 2);
      lines.forEach((line, lineIdx) => {
        svg += `<text x="${x + chevronW / 2 - overlap / 2}" y="${y + 70 + lineIdx * 15}" font-size="10" fill="${textColor}" opacity="0.85" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
      });
    }
  });

  svg += `<text x="${W / 2}" y="${H - 15}" font-size="10" fill="${C.muted}" text-anchor="middle" font-family="sans-serif" opacity="0.6">购买决策路径 · 流程分析</text>`;
  svg += `</svg>`;
  return svg;
}

// ══════════════════════════════════════
//  产品屋
// ══════════════════════════════════════

interface HousePart {
  role: "roof" | "pillar" | "base";
  label: string;
  desc: string;
}

function parseHouseParts(items: string[]): { roof: HousePart; pillars: HousePart[]; base: HousePart } | null {
  let roof: HousePart | null = null;
  let base: HousePart | null = null;
  const pillars: HousePart[] = [];

  for (const item of items) {
    const colonIdx = item.search(/[:：]/);
    const label = colonIdx > 0 ? item.slice(0, colonIdx).trim() : item;
    const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";
    if (label.includes("屋顶") || label.includes("核心")) {
      roof = { role: "roof", label, desc };
    } else if (label.includes("基座") || label.includes("基础")) {
      base = { role: "base", label, desc };
    } else if (label.includes("支柱") || label.includes("支撑")) {
      pillars.push({ role: "pillar", label, desc });
    }
  }
  if (!roof || !base) return null;
  return { roof, pillars: pillars.slice(0, 3), base };
}

export function renderProductHouseSvg(items: string[]): string {
  const house = parseHouseParts(items);
  if (!house) return "";

  const W = 1000;
  const H = 580;
  const centerX = W / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

  // ── 定义 ──
  svg += `<defs>`;
  svg += `<filter id="house-shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
    <feOffset dx="0" dy="2.5" result="offsetblur"/>
    <feFlood flood-color="#102A43" flood-opacity="0.18"/>
    <feComposite in2="offsetblur" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  // 屋顶渐变（深色三角顶）
  svg += `<linearGradient id="roof-grad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.navy}" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="${C.ink}" stop-opacity="0.85"/>
  </linearGradient>`;
  // 支柱渐变
  svg += `<linearGradient id="pillar-grad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.9"/>
    <stop offset="100%" stop-color="#0A7A6E" stop-opacity="0.8"/>
  </linearGradient>`;
  // 基座渐变
  svg += `<linearGradient id="base-grad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#9ECFC9" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="#5BB5A8" stop-opacity="0.85"/>
  </linearGradient>`;
  svg += `</defs>`;

  // ── 背景 ──
  svg += `<rect width="${W}" height="${H}" fill="${C.white}"/>`;

  const pillarCount = Math.max(house.pillars.length, 1);
  const pillarW = 140;
  const pillarH = 200;
  const pillarGap = 30;
  const pillarsTotalW = pillarCount * pillarW + (pillarCount - 1) * pillarGap;
  const pillarStartX = centerX - pillarsTotalW / 2;
  const pillarY = 175;
  const pillarEndY = pillarY + pillarH;

  // ── 屋顶（三角形）──
  const roofW = pillarsTotalW + 80;
  const roofLeft = centerX - roofW / 2;
  const roofRight = centerX + roofW / 2;
  const roofTop = 35;
  const roofBottom = pillarY;
  const roofPoints = `${centerX},${roofTop} ${roofRight},${roofBottom} ${roofLeft},${roofBottom}`;
  svg += `<polygon points="${roofPoints}" fill="url(#roof-grad)" stroke="${C.white}" stroke-width="2" filter="url(#house-shadow)"/>`;

  // 屋顶标签
  svg += `<text x="${centerX}" y="${roofTop + 32}" font-size="13" font-weight="700" fill="${C.lightAccent}" text-anchor="middle" font-family="sans-serif" opacity="0.8">核心价值</text>`;
  // 屋顶文字
  const roofLines = wrapText(trunc(house.roof.desc || house.roof.label, 40), 16, 2);
  roofLines.forEach((line, idx) => {
    svg += `<text x="${centerX}" y="${roofTop + 60 + idx * 22}" font-size="15" font-weight="700" fill="${C.white}" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
  });

  // ── 支柱 ──
  house.pillars.forEach((pillar, idx) => {
    const px = pillarStartX + idx * (pillarW + pillarGap);
    svg += `<rect x="${px}" y="${pillarY}" width="${pillarW}" height="${pillarH}" rx="8" fill="url(#pillar-grad)" stroke="${C.white}" stroke-width="2" filter="url(#house-shadow)"/>`;

    // 支柱编号
    svg += `<rect x="${px + pillarW / 2 - 18}" y="${pillarY + 10}" width="36" height="24" rx="5" fill="${C.white}" opacity="0.25"/>`;
    svg += `<text x="${px + pillarW / 2}" y="${pillarY + 27}" font-size="13" font-weight="700" fill="${C.white}" text-anchor="middle" font-family="sans-serif">${idx + 1}</text>`;

    // 标签
    const pillarLabel = pillar.label.replace(/支柱\d*/, "").replace(/[:：]/, "").trim() || pillar.label;
    svg += `<text x="${px + pillarW / 2}" y="${pillarY + 55}" font-size="14" font-weight="700" fill="${C.white}" text-anchor="middle" font-family="sans-serif">${esc(trunc(pillarLabel, 10))}</text>`;

    // 描述
    const descLines = wrapText(trunc(pillar.desc, 40), 10, 4);
    descLines.forEach((line, lineIdx) => {
      svg += `<text x="${px + pillarW / 2}" y="${pillarY + 85 + lineIdx * 18}" font-size="11" fill="${C.white}" text-anchor="middle" font-family="sans-serif" opacity="0.9">${esc(line)}</text>`;
    });
  });

  // ── 基座 ──
  const baseW = pillarsTotalW + 40;
  const baseLeft = centerX - baseW / 2;
  const baseH = 70;
  svg += `<rect x="${baseLeft}" y="${pillarEndY + 8}" width="${baseW}" height="${baseH}" rx="8" fill="url(#base-grad)" stroke="${C.white}" stroke-width="2" filter="url(#house-shadow)"/>`;

  // 基座标签
  svg += `<text x="${centerX}" y="${pillarEndY + 28}" font-size="12" font-weight="700" fill="${C.ink}" text-anchor="middle" font-family="sans-serif" opacity="0.7">基础保障</text>`;
  const baseLines = wrapText(trunc(house.base.desc || house.base.label, 45), 18, 2);
  baseLines.forEach((line, idx) => {
    svg += `<text x="${centerX}" y="${pillarEndY + 52 + idx * 18}" font-size="14" font-weight="700" fill="${C.ink}" text-anchor="middle" font-family="sans-serif">${esc(line)}</text>`;
  });

  // ── 底部说明 ──
  svg += `<text x="${W / 2}" y="${H - 15}" font-size="10" fill="${C.muted}" text-anchor="middle" font-family="sans-serif" opacity="0.6">产品屋模型 · 价值架构分析</text>`;

  svg += `</svg>`;
  return svg;
}

// ══════════════════════════════════════
//  统一入口：根据类型渲染 SVG
// ══════════════════════════════════════

export function renderDiagramSvg(block: DiagramItem): string {
  switch (block.type) {
    case "experience-map":
      return renderExperienceMapSvg(block.items);
    case "pyramid":
      return renderPyramidSvg(block.items);
    case "decision-path":
      return renderDecisionPathSvg(block.items);
    case "product-house":
      return renderProductHouseSvg(block.items);
    default:
      return "";
  }
}

/**
 * 渲染图形并转为 base64 PNG，返回 PptxGenJS addImage 所需的 data URL
 */
export async function renderDiagramToPng(block: DiagramItem): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const svg = renderDiagramSvg(block);
  if (!svg) return null;

  // 根据图形类型确定输出尺寸（2x 高清）
  const sizeMap: Record<string, { w: number; h: number }> = {
    "experience-map": { w: 2400, h: 1040 },
    pyramid: { w: 2000, h: 1160 },
    "decision-path": { w: 2400, h: 640 },
    "product-house": { w: 2000, h: 1160 },
  };
  const size = sizeMap[block.type] || { w: 2000, h: 1000 };

  const dataUrl = await svgToPng(svg, size.w, size.h);
  return { dataUrl, width: size.w / 2, height: size.h / 2 };
}
