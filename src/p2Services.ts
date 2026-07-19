import { saveAs } from "file-saver";
import { db, now } from "./db";
import type {
  Insight,
  Interview,
  MemberRole,
  Project,
  Quote,
  ReportTemplate,
  Respondent,
  Segment,
  Tag,
  Term,
} from "./types";

export const permissions: Record<MemberRole, string[]> = {
  所有者: ["read", "write", "delete", "manageMembers", "export"],
  管理员: ["read", "write", "delete", "manageMembers", "export"],
  研究员: ["read", "write", "export"],
  访客: ["read"],
};
export const can = (role: MemberRole, action: string) =>
  permissions[role].includes(action);

interface ProjectBundle {
  version: 1;
  exportedAt: string;
  project: Project;
  respondents: Respondent[];
  interviews: Interview[];
  segments: Segment[];
  tags: Tag[];
  terms: Term[];
  quotes: Quote[];
  insights: Insight[];
}

export async function exportProjectBundle(projectId: string) {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("项目不存在");
  const interviews = await db.interviews
    .where("projectId")
    .equals(projectId)
    .toArray();
  const interviewIds = interviews.map((item) => item.id);
  const bundle: ProjectBundle = {
    version: 1,
    exportedAt: now(),
    project,
    respondents: await db.respondents
      .where("projectId")
      .equals(projectId)
      .toArray(),
    interviews,
    segments: await db.segments
      .where("interviewId")
      .anyOf(interviewIds.length ? interviewIds : ["none"])
      .toArray(),
    tags: await db.tags.where("projectId").equals(projectId).toArray(),
    terms: await db.terms.where("projectId").equals(projectId).toArray(),
    quotes: await db.quotes.where("projectId").equals(projectId).toArray(),
    insights: await db.insights.where("projectId").equals(projectId).toArray(),
  };
  saveAs(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
    `${project.name}-ResearchBox备份.json`,
  );
}

export async function importProjectBundle(file: File) {
  const bundle = JSON.parse(await file.text()) as ProjectBundle;
  if (
    bundle.version !== 1 ||
    !bundle.project?.id ||
    !Array.isArray(bundle.interviews)
  )
    throw new Error("不是有效的 ResearchBox 项目备份");
  await db.transaction(
    "rw",
    [
      db.projects,
      db.respondents,
      db.interviews,
      db.segments,
      db.tags,
      db.terms,
      db.quotes,
      db.insights,
    ],
    async () => {
      await db.projects.put({ ...bundle.project, updatedAt: now() });
      await db.respondents.bulkPut(bundle.respondents || []);
      await db.interviews.bulkPut(bundle.interviews || []);
      await db.segments.bulkPut(bundle.segments || []);
      await db.tags.bulkPut(bundle.tags || []);
      await db.terms.bulkPut(bundle.terms || []);
      await db.quotes.bulkPut(bundle.quotes || []);
      await db.insights.bulkPut(bundle.insights || []);
    },
  );
  return bundle.project;
}

// ====== Markdown parsing helpers ======

interface MdTable {
  headers: string[];
  rows: string[][];
}

interface MdQuote {
  text: string;
  source?: string;
}

interface DiagramBlock {
  type: "pyramid" | "flowchart" | "product-house" | "decision-path" | "experience-map";
  items: string[];
}

interface MdContent {
  paragraphs: string[];
  bullets: string[];
  numberedItems: string[];
  tables: MdTable[];
  quotes: MdQuote[];
  boldLabels: Array<{ label: string; text: string }>;
  diagrams: DiagramBlock[];
}

interface MdSection {
  level: number;
  title: string;
  body: string[];
  subsections: MdSection[];
  content: MdContent;
}

function emptyContent(): MdContent {
  return { paragraphs: [], bullets: [], numberedItems: [], tables: [], quotes: [], boldLabels: [], diagrams: [] };
}

function parseMarkdown(md: string): { title: string; sections: MdSection[] } {
  const lines = md.split("\n");
  let mainTitle = "";
  const sections: MdSection[] = [];
  let currentH2: MdSection | null = null;
  let currentH3: MdSection | null = null;

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      mainTitle = line.replace(/^#\s+/, "").trim();
    } else if (line.startsWith("## ")) {
      currentH3 = null;
      currentH2 = { level: 2, title: line.replace(/^##\s+/, "").trim(), body: [], subsections: [], content: emptyContent() };
      sections.push(currentH2);
    } else if (line.startsWith("### ")) {
      currentH3 = { level: 3, title: line.replace(/^###\s+/, "").trim(), body: [], subsections: [], content: emptyContent() };
      if (currentH2) currentH2.subsections.push(currentH3);
    } else if (currentH3) {
      currentH3.body.push(line);
    } else if (currentH2) {
      currentH2.body.push(line);
    }
  }

  // Parse content for each section and subsection
  for (const sec of sections) {
    parseContentLines(sec.body, sec.content);
    for (const sub of sec.subsections) {
      parseContentLines(sub.body, sub.content);
    }
  }

  return { title: mainTitle, sections };
}

function parseContentLines(lines: string[], content: MdContent) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith("### ")) { i++; continue; }
    if (trimmed === "---" || trimmed === "===") { i++; continue; }

    // Diagram block detection: ::: type ... :::
    if (trimmed.startsWith(":::")) {
      const typeMatch = trimmed.match(/^:::\s*(pyramid|flowchart|product-house|decision-path|experience-map)\s*$/);
      if (typeMatch) {
        const diagramType = typeMatch[1] as DiagramBlock["type"];
        const items: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== ":::") {
          const lineText = lines[i].trim();
          if (lineText) items.push(lineText);
          i++;
        }
        if (i < lines.length) i++;
        if (items.length > 0) content.diagrams.push({ type: diagramType, items });
        continue;
      }
    }

    // Fallback: emoji-based diagram detection (📊 图表名)
    // 当 AI 未使用 ::: 围栏时，识别 📊 开头的图表标记
    if (/^📊\s*/.test(trimmed)) {
      const emojiMappings: Array<{ keywords: string[]; type: DiagramBlock["type"] }> = [
        { keywords: ["金字塔"], type: "pyramid" },
        { keywords: ["产品屋"], type: "product-house" },
        { keywords: ["决策路径", "购买决策"], type: "decision-path" },
        { keywords: ["体验地图", "旅程地图", "用户旅程"], type: "experience-map" },
        { keywords: ["流程图"], type: "flowchart" },
      ];
      let diagramType: DiagramBlock["type"] | null = null;
      for (const m of emojiMappings) {
        if (m.keywords.some((kw) => trimmed.includes(kw))) {
          diagramType = m.type;
          break;
        }
      }
      if (diagramType) {
        const items: string[] = [];
        i++;
        // 收集后续条目（跳过空行），遇到结构性标记时停止
        let blankCount = 0;
        while (i < lines.length) {
          const lineText = lines[i].trim();
          if (!lineText) {
            blankCount++;
            // 连续 2 个空行视为块结束
            if (blankCount >= 2 && items.length > 0) break;
            i++;
            continue;
          }
          blankCount = 0;
          // 遇到以下标记时停止收集
          if (lineText.startsWith("📊") || lineText.startsWith("#") ||
              lineText.startsWith(":::") || lineText.startsWith(">") ||
              lineText.startsWith("|") || lineText.startsWith("- ") ||
              lineText.startsWith("* ") || /^\d+\.\s/.test(lineText)) {
            break;
          }
          // 遇到已知段落标记时停止
          if (/^(业务启示|分析解读|差异对比|洞察概述|证据与表现|原话佐证|核心结论|行动建议|研究限制|报告生成)/.test(lineText)) {
            break;
          }
          items.push(lineText);
          i++;
        }
        if (items.length > 0) content.diagrams.push({ type: diagramType, items });
        continue;
      }
    }

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split("|").map(s => s.trim()).filter(s => s);
        const dataStart = tableLines[1].includes("---") ? 2 : 1;
        const rows = tableLines.slice(dataStart).map(r =>
          r.split("|").map(s => s.trim()).filter(s => s)
        );
        content.tables.push({ headers, rows });
      }
      continue;
    }

    // Blockquote detection (each > line is a separate quote)
    if (trimmed.startsWith(">")) {
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        const qText = lines[i].trim().replace(/^>\s*/, "");
        if (qText) {
          const sourceMatch = qText.match(/\u2014\s*(.+)$/);
          if (sourceMatch) {
            content.quotes.push({
              text: qText.replace(/\u2014\s*.+$/, "").trim(),
              source: sourceMatch[1].trim(),
            });
          } else {
            content.quotes.push({ text: qText });
          }
        }
        i++;
      }
      continue;
    }

    // Numbered list detection: "N. text" or "N. **bold**: text"
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const rest = numMatch[2];
      const boldInNum = rest.match(/^\*\*(.+?)\*\*\s*[:\uff1a]?\s*(.*)$/);
      if (boldInNum) {
        content.boldLabels.push({
          label: `${numMatch[1]}. ${boldInNum[1]}`,
          text: boldInNum[2],
        });
      } else {
        content.numberedItems.push(`${numMatch[1]}. ${rest}`);
      }
      i++;
      continue;
    }

    // Bullet list detection
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        content.bullets.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      continue;
    }

    // Bold label detection: **label** text or **label**: text
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[:\uff1a]?\s*(.*)$/);
    if (boldMatch) {
      content.boldLabels.push({ label: boldMatch[1].trim(), text: boldMatch[2].trim() });
      i++;
      continue;
    }

    // Regular paragraph
    content.paragraphs.push(trimmed);
    i++;
  }
}

function cleanMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

// ====== PPT export ======

export async function exportResearchPptx(
  project: Project,
  interviews: Interview[],
  insights: Insight[],
  quotes: Quote[],
  template?: ReportTemplate,
  download = true,
  respondents: Respondent[] = [],
  tags: Tag[] = [],
  segments: Segment[] = [],
  markdownContent?: string,
) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx: any = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ResearchBox";
  pptx.subject = "定性研究报告";
  pptx.title = `${project.name} 研究报告`;
  pptx.company = "ResearchBox";
  const accent = (template?.accentColor || "#0d9488").replace("#", "").toUpperCase();
  const navy = "102A43";
  const ink = "243B53";
  const muted = "627D98";
  const pale = "F0F4F8";
  const lightAccent = "E6F4F1";
  const white = "FFFFFF";
  const warnBg = "FFF4E6";
  const warnBorder = "F0A500";

  const titleFn = (slide: any, text: string, kicker: string) => {
    slide.addText(kicker, { x: 0.65, y: 0.35, w: 6, h: 0.25, fontSize: 10, bold: true, color: accent, charSpacing: 1.5, margin: 0 });
    slide.addText(text, { x: 0.65, y: 0.72, w: 11.9, h: 0.55, fontFace: "Microsoft YaHei", fontSize: 24, bold: true, color: navy, margin: 0 });
    slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 1.32, w: 1.2, h: 0.04, fill: { color: accent }, line: { color: accent } });
    slide.addText("ResearchBox · 定性研究报告", { x: 10.6, y: 7.05, w: 2, h: 0.18, fontSize: 8, color: muted, align: "right", margin: 0 });
  };

  // ====== Diagram rendering functions ======
  // 所有图表均使用 PptxGenJS 原生形状，每个元素（形状、标签、描述）都是独立可编辑对象

  // 通用阴影配置
  const shadowSoft = { type: "outer" as const, color: "102A43", blur: 4, offset: 2, angle: 90, opacity: 0.18 };
  const shadowMed = { type: "outer" as const, color: "102A43", blur: 5, offset: 3, angle: 90, opacity: 0.22 };

  const renderPyramid = (slide: any, block: DiagramBlock, yPos: number): number => {
    const layers = block.items.slice(0, 4).map((item) => {
      const cnColon = item.indexOf("：");
      const enColon = item.indexOf(":");
      const colonIdx = cnColon >= 0 ? cnColon : enColon;
      const label = colonIdx > 0 ? item.slice(0, colonIdx).trim() : "";
      const desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : item;
      return { label, desc };
    });
    const layerHeight = 0.95;
    const layerGap = 0.08;
    const maxWidth = 9.2;
    const minWidth = 3.6;
    const centerX = 6.67;
    // 由浅到深的精致配色（青绿→深青→深蓝→藏青）
    const fills = ["B8E0DA", "5BB5A8", "0D9488", "102A43"];
    const textColors = [accent, ink, white, white];
    const badgeFills = [white, white, lightAccent, lightAccent];
    const badgeTextColors = [accent, ink, accent, accent];

    layers.forEach((layer, idx) => {
      const ratio = layers.length === 1 ? 1 : idx / (layers.length - 1);
      const width = minWidth + (maxWidth - minWidth) * ratio;
      const x = centerX - width / 2;
      const y = yPos + idx * (layerHeight + layerGap);
      const fillColor = fills[Math.min(idx, fills.length - 1)];
      const textColor = textColors[Math.min(idx, textColors.length - 1)];
      const shapeType = idx === 0 ? pptx.ShapeType.triangle : pptx.ShapeType.trapezoid;

      // 层形状（独立可编辑）—— 带阴影
      slide.addShape(shapeType, {
        x, y, w: width, h: layerHeight,
        fill: { color: fillColor },
        line: { color: white, width: 2 },
        shadow: shadowSoft,
      });

      // 层级编号（独立文本框，左上角）
      const badgeX = x + width * 0.08;
      slide.addText(String(idx + 1).padStart(2, "0"), {
        x: badgeX, y: y + 0.12, w: 0.4, h: 0.28,
        fontSize: 11, bold: true, color: textColor, align: "center", valign: "middle",
        margin: 0, fill: { color: badgeFills[Math.min(idx, 3)] }, rectRadius: 0.06,
      });

      // 标签徽章（独立文本框，居中）
      if (layer.label) {
        const badgeW = Math.min(width * 0.4, 2.0);
        slide.addText(layer.label, {
          x: centerX - badgeW / 2, y: y + 0.12, w: badgeW, h: 0.28,
          fontSize: 10, bold: true, color: badgeTextColors[Math.min(idx, 3)],
          align: "center", valign: "middle", margin: 0,
          fill: { color: badgeFills[Math.min(idx, 3)] }, rectRadius: 0.06,
        });
      }

      // 描述文字（独立文本框，主体）
      slide.addText(truncate(layer.desc || layer.label, 50), {
        x: x + width * 0.1, y: y + 0.48, w: width * 0.8, h: layerHeight - 0.55,
        fontSize: 11, bold: true, color: textColor, align: "center", valign: "middle", margin: 2,
      });
    });
    return yPos + layers.length * (layerHeight + layerGap) + 0.25;
  };

  const renderFlowchart = (slide: any, block: DiagramBlock, yPos: number): number => {
    let steps: string[] = [];
    if (block.items.length === 1 && block.items[0].includes("\u2192")) {
      steps = block.items[0].split("\u2192").map(s => s.trim()).filter(Boolean);
    } else {
      steps = block.items;
    }
    const stepCount = Math.min(steps.length, 6);
    const isVertical = stepCount > 4;
    const boxW = isVertical ? 9 : Math.min(2.2, 11 / stepCount - 0.3);
    const boxH = 0.65;
    const gap = 0.3;
    const startX = isVertical ? 2.17 : 0.65;

    steps.slice(0, stepCount).forEach((step, idx) => {
      const colonIdx = step.indexOf(":");
      const label = colonIdx > 0 ? step.slice(0, colonIdx).trim() : step;
      const desc = colonIdx > 0 ? step.slice(colonIdx + 1).trim() : "";
      if (isVertical) {
        const y = yPos + idx * (boxH + gap + 0.15);
        slide.addShape(pptx.ShapeType.roundRect, { x: startX, y, w: boxW, h: boxH, rectRadius: 0.06, fill: { color: idx % 2 === 0 ? accent : pale }, line: { color: accent, width: 1 }, shadow: shadowSoft });
        slide.addText(truncate(label, 15), { x: startX + 0.15, y: y + 0.02, w: 1.5, h: boxH - 0.04, fontSize: 11, bold: true, color: idx % 2 === 0 ? white : ink, valign: "middle", margin: 0 });
        if (desc) slide.addText(truncate(desc, 80), { x: startX + 1.7, y: y + 0.02, w: boxW - 1.85, h: boxH - 0.04, fontSize: 9, color: ink, valign: "middle", margin: 0 });
        if (idx < stepCount - 1) slide.addShape(pptx.ShapeType.downArrow, { x: startX + boxW / 2 - 0.12, y: y + boxH, w: 0.24, h: gap, fill: { color: accent }, line: { color: accent } });
      } else {
        const x = startX + idx * (boxW + gap);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: yPos, w: boxW, h: boxH, rectRadius: 0.06, fill: { color: idx % 2 === 0 ? accent : pale }, line: { color: accent, width: 1 }, shadow: shadowSoft });
        slide.addText(truncate(label, 12), { x, y: yPos + 0.02, w: boxW, h: 0.28, fontSize: 10, bold: true, color: idx % 2 === 0 ? white : ink, align: "center", valign: "middle", margin: 0 });
        if (desc) slide.addText(truncate(desc, 35), { x: x + 0.05, y: yPos + 0.32, w: boxW - 0.1, h: 0.28, fontSize: 8, color: ink, align: "center", valign: "top", margin: 0 });
        if (idx < stepCount - 1) slide.addShape(pptx.ShapeType.rightArrow, { x: x + boxW, y: yPos + boxH / 2 - 0.1, w: gap, h: 0.2, fill: { color: accent }, line: { color: accent } });
      }
    });
    return yPos + (isVertical ? stepCount * (boxH + gap + 0.15) : boxH + 0.3);
  };

  const renderProductHouse = (slide: any, block: DiagramBlock, yPos: number): number => {
    const houseWidth = 9.5;
    const houseX = 1.92;
    const roofHeight = 1.3;
    const bodyHeight = 2.4;
    const baseHeight = 0.6;
    let roof = "", roofLabel = "核心价值";
    let pillars: { label: string; desc: string }[] = [];
    let base = "", baseLabel = "基础保障";

    for (const item of block.items) {
      const cnColon = item.indexOf("：");
      const enColon = item.indexOf(":");
      const colonIdx = cnColon >= 0 ? cnColon : enColon;
      const key = colonIdx > 0 ? item.slice(0, colonIdx).trim().toLowerCase() : "";
      const val = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : item;
      if (key.includes("屋顶") || key.includes("roof") || key.includes("核心")) {
        roof = val;
      } else if (key.includes("基座") || key.includes("base") || key.includes("基础")) {
        base = val;
      } else if (key.includes("支柱") || key.includes("pillar") || key.includes("支撑")) {
        const label = key.replace(/支柱\d*/, "").replace(/[:：]/, "").trim();
        pillars.push({ label: label || key, desc: val });
      }
    }

    // 屋顶（独立三角形 + 标签 + 描述）
    slide.addShape(pptx.ShapeType.triangle, {
      x: houseX, y: yPos, w: houseWidth, h: roofHeight,
      fill: { color: navy }, line: { color: navy },
      shadow: shadowMed,
    });
    slide.addText(roofLabel, {
      x: houseX, y: yPos + 0.12, w: houseWidth, h: 0.25,
      fontSize: 9, bold: true, color: lightAccent, align: "center", valign: "middle",
      margin: 0, charSpacing: 1.5,
    });
    slide.addText(truncate(roof, 45), {
      x: houseX + 0.3, y: yPos + 0.38, w: houseWidth - 0.6, h: roofHeight - 0.5,
      fontSize: 13, bold: true, color: white, align: "center", valign: "middle", margin: 2,
    });

    // 支柱区背景（独立矩形）
    const bodyY = yPos + roofHeight;
    slide.addShape(pptx.ShapeType.rect, {
      x: houseX, y: bodyY, w: houseWidth, h: bodyHeight,
      fill: { color: pale }, line: { color: "D9E2EC", width: 1 },
    });

    // 每根支柱（独立形状 + 编号 + 标签 + 描述）
    const pillarCount = Math.min(pillars.length, 3);
    if (pillarCount > 0) {
      const pillarW = (houseWidth - 0.6) / pillarCount - 0.2;
      pillars.slice(0, 3).forEach((pillar, idx) => {
        const px = houseX + 0.3 + idx * (pillarW + 0.2);
        const py = bodyY + 0.15;
        const ph = bodyHeight - 0.3;

        // 支柱形状（独立圆角矩形 + 阴影）
        slide.addShape(pptx.ShapeType.roundRect, {
          x: px, y: py, w: pillarW, h: ph,
          rectRadius: 0.08,
          fill: { color: accent }, line: { color: "0A7A6E", width: 1 },
          shadow: shadowSoft,
        });

        // 支柱编号（独立圆形徽章）
        slide.addText(String(idx + 1), {
          x: px + pillarW / 2 - 0.18, y: py + 0.12, w: 0.36, h: 0.36,
          fontSize: 14, bold: true, color: accent, align: "center", valign: "middle",
          margin: 0, fill: { color: white }, rectRadius: 0.18,
        });

        // 支柱标签（独立文本框）
        const pillarLabel = pillar.label.replace(/支柱\d*/, "").trim();
        if (pillarLabel) {
          slide.addText(truncate(pillarLabel, 10), {
            x: px + 0.08, y: py + 0.55, w: pillarW - 0.16, h: 0.3,
            fontSize: 11, bold: true, color: white, align: "center", valign: "middle", margin: 0,
          });
        }

        // 支柱描述（独立文本框）
        slide.addText(truncate(pillar.desc, 35), {
          x: px + 0.1, y: py + 0.88, w: pillarW - 0.2, h: ph - 1.0,
          fontSize: 9, color: white, align: "center", valign: "top", margin: 2,
        });
      });
    }

    // 基座（独立矩形 + 标签 + 描述）
    const baseY = bodyY + bodyHeight;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: houseX, y: baseY, w: houseWidth, h: baseHeight,
      rectRadius: 0.06,
      fill: { color: "5BB5A8" }, line: { color: "0A7A6E", width: 1 },
      shadow: shadowSoft,
    });
    slide.addText(baseLabel + "：", {
      x: houseX + 0.3, y: baseY, w: 1.5, h: baseHeight,
      fontSize: 10, bold: true, color: white, align: "left", valign: "middle", margin: 0,
    });
    slide.addText(truncate(base, 40), {
      x: houseX + 1.7, y: baseY, w: houseWidth - 2.0, h: baseHeight,
      fontSize: 11, bold: true, color: white, align: "left", valign: "middle", margin: 0,
    });
    return baseY + baseHeight + 0.25;
  };

  const renderDecisionPath = (slide: any, block: DiagramBlock, yPos: number): number => {
    const defaultStages = ["需求触发", "信息搜集", "评估比较", "购买决策", "购后评价"];
    const stages: { name: string; desc: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const item = block.items[i] || "";
      // 支持 "name: desc"、"name | desc"、"label：name | desc" 等格式
      const pipeIdx = item.indexOf("|");
      let name = "", desc = "";
      if (pipeIdx > 0) {
        let beforePipe = item.slice(0, pipeIdx).trim();
        desc = item.slice(pipeIdx + 1).trim();
        const cnColon = beforePipe.indexOf("：");
        const enColon = beforePipe.indexOf(":");
        const colonIdx = cnColon >= 0 ? cnColon : enColon;
        if (colonIdx > 0 && colonIdx < beforePipe.length - 1) {
          beforePipe = beforePipe.slice(colonIdx + 1).trim();
        }
        name = beforePipe || defaultStages[i];
      } else {
        const cnColon = item.indexOf("：");
        const enColon = item.indexOf(":");
        const colonIdx = cnColon >= 0 ? cnColon : enColon;
        name = colonIdx > 0 ? item.slice(0, colonIdx).trim() : (item || defaultStages[i]);
        desc = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : "";
      }
      stages.push({ name, desc });
    }
    const chevronW = 2.4;
    const chevronH = 1.0;
    const overlap = 0.4;
    const startX = 0.7;
    // 由浅到深的精致配色
    const bgColors = [lightAccent, "B8E0DA", "5BB5A8", accent, navy];
    const fgColors = [accent, ink, white, white, white];

    stages.forEach((stage, idx) => {
      const x = startX + idx * (chevronW - overlap);
      const isLast = idx === 4;
      const shapeType = isLast ? pptx.ShapeType.roundRect : pptx.ShapeType.chevron;
      const shapeOpts: any = {
        x, y: yPos, w: chevronW, h: chevronH,
        fill: { color: bgColors[idx] },
        line: { color: bgColors[idx] },
        shadow: shadowSoft,
      };
      if (isLast) shapeOpts.rectRadius = 0.08;
      slide.addShape(shapeType, shapeOpts);

      // STEP 编号（独立文本框，顶部）
      slide.addText(`STEP ${idx + 1}`, {
        x: x + 0.1, y: yPos + 0.08, w: chevronW - 0.3, h: 0.22,
        fontSize: 8, bold: true, color: fgColors[idx], align: "center", valign: "middle",
        margin: 0, charSpacing: 1,
      });

      // 阶段名称（独立文本框，中部）
      slide.addText(truncate(stage.name, 8), {
        x: x + 0.1, y: yPos + 0.32, w: chevronW - 0.3, h: 0.3,
        fontSize: 13, bold: true, color: fgColors[idx], align: "center", valign: "middle", margin: 0,
      });

      // 描述（独立文本框，底部）
      if (stage.desc) {
        slide.addText(truncate(stage.desc, 30), {
          x: x + 0.1, y: yPos + 0.65, w: chevronW - 0.3, h: 0.3,
          fontSize: 8, color: fgColors[idx], align: "center", valign: "top", margin: 0,
        });
      }
    });
    return yPos + chevronH + 0.3;
  };

  const renderExperienceMap = (slide: any, block: DiagramBlock, yPos: number): number => {
    const stages = block.items.slice(0, 6).map(item => {
      const parts = item.split("|").map(p => p.trim());
      const name = parts[0] || "";
      const emotionRaw = parts[1] || "";
      const desc = parts[2] || "";
      const emotion = emotionRaw.includes("\u6B63\u9762") ? "positive" : emotionRaw.includes("\u8D1F\u9762") ? "negative" : "neutral";
      return { name, emotion, desc };
    });
    if (stages.length === 0) return yPos;

    const startX = 0.6;
    const endX = 12.7;
    const totalWidth = endX - startX;
    const stepWidth = totalWidth / Math.max(stages.length - 1, 1);
    const baselineY = yPos + 1.5;
    const emotionColors: Record<string, string> = { positive: "16A34A", neutral: "D97706", negative: "DC2626" };
    const emotionLabels: Record<string, string> = { positive: "\u263A \u6B63\u9762", neutral: "\u2013 \u4E2D\u6027", negative: "\u2639 \u8D1F\u9762" };

    // 1. 中性基准线 —— 粗实线 + 右侧标签
    slide.addShape(pptx.ShapeType.line, { x: startX, y: baselineY, w: totalWidth, h: 0, line: { color: "9FB3C8", width: 2.5 } });
    slide.addText("\u4E2D\u6027\u57FA\u51C6", {
      x: endX + 0.05, y: baselineY - 0.12, w: 0.8, h: 0.24,
      fontSize: 7, color: muted, align: "left", valign: "middle", margin: 0,
    });

    // 2. 情绪曲线连接线 —— 先画，让柱体覆盖在上方
    stages.forEach((stage, idx) => {
      if (idx === 0) return;
      const prevX = startX + (idx - 1) * stepWidth;
      const currX = startX + idx * stepWidth;
      const getBarTop = (emo: string) =>
        emo === "negative" ? baselineY + 0.8 : emo === "positive" ? baselineY - 0.8 : baselineY;
      const prevTop = getBarTop(stages[idx - 1].emotion);
      const currTop = getBarTop(stage.emotion);
      // 用实线 + 情绪色渐变（取两端较深的一端）
      const lineColor = emotionColors[stages[idx - 1].emotion === "negative" ? "negative" : stage.emotion === "negative" ? "negative" : stage.emotion];
      slide.addShape(pptx.ShapeType.line, {
        x: prevX, y: prevTop, w: currX - prevX, h: currTop - prevTop,
        line: { color: lineColor, width: 2, dashType: "sysDash" },
      });
    });

    // 3. 每个阶段的柱体 + 圆点 + 标签 + 描述
    stages.forEach((stage, idx) => {
      const x = startX + idx * stepWidth;
      const barW = 0.45;
      const barMaxH = 0.8;
      const color = emotionColors[stage.emotion];

      // 阶段编号徽章
      slide.addText(String(idx + 1).padStart(2, "0"), {
        x: x - 0.25, y: yPos, w: 0.5, h: 0.28,
        fontSize: 11, bold: true, color: accent, align: "center", valign: "middle", margin: 0,
        fill: { color: lightAccent }, rectRadius: 0.04,
      });

      // 情绪柱体 —— 正面向上，负面向下，中性在基准线上小幅上下
      let barY: number, barH: number;
      if (stage.emotion === "positive") {
        barY = baselineY - barMaxH;
        barH = barMaxH;
      } else if (stage.emotion === "negative") {
        barY = baselineY;
        barH = barMaxH;
      } else {
        barY = baselineY - 0.2;
        barH = 0.2;
      }
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x - barW / 2, y: barY, w: barW, h: barH,
        rectRadius: 0.05,
        fill: { color }, line: { color, width: 0.5 },
        shadow: shadowSoft,
      });

      // 情绪标签 —— 放在柱体顶端
      const labelY = stage.emotion === "negative" ? barY + barH + 0.03 : barY - 0.28;
      slide.addText(emotionLabels[stage.emotion], {
        x: x - 0.55, y: labelY, w: 1.1, h: 0.22,
        fontSize: 8, bold: true, color, align: "center", valign: "middle", margin: 0,
      });

      // 基准线上的圆点（白底 + 彩色描边）
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x - 0.09, y: baselineY - 0.09, w: 0.18, h: 0.18,
        fill: { color: white }, line: { color, width: 2 },
      });
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x - 0.04, y: baselineY - 0.04, w: 0.08, h: 0.08,
        fill: { color }, line: { color },
      });

      // 阶段名称卡片（独立圆角矩形 + 阴影）
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x - 0.55, y: baselineY + 0.35, w: 1.1, h: 0.32,
        rectRadius: 0.05,
        fill: { color: pale }, line: { color: "D9E2EC", width: 0.5 },
        shadow: shadowSoft,
      });
      slide.addText(truncate(stage.name, 8), {
        x: x - 0.55, y: baselineY + 0.35, w: 1.1, h: 0.32,
        fontSize: 9, bold: true, color: navy, align: "center", valign: "middle", margin: 0,
      });

      // 描述文字
      if (stage.desc) {
        slide.addText(truncate(stage.desc, 28), {
          x: x - 0.65, y: baselineY + 0.72, w: 1.3, h: 0.5,
          fontSize: 7, color: muted, align: "center", valign: "top", margin: 1,
        });
      }
    });

    return baselineY + 1.3;
  };

  // Render structured content onto a slide, returns new y position
  const renderContent = (slide: any, c: MdContent, yPos: number, maxPos: number): number => {
    let y = yPos;

    // Diagrams (render first, they're the visual highlight)
    for (const diagram of c.diagrams) {
      if (y > maxPos - 2.0) break;
      // 使用原生形状，每个元素独立可编辑
      switch (diagram.type) {
        case "pyramid":
          y = renderPyramid(slide, diagram, y);
          break;
        case "flowchart":
          y = renderFlowchart(slide, diagram, y);
          break;
        case "product-house":
          y = renderProductHouse(slide, diagram, y);
          break;
        case "decision-path":
          y = renderDecisionPath(slide, diagram, y);
          break;
        case "experience-map":
          y = renderExperienceMap(slide, diagram, y);
          break;
      }
      y += 0.15;
    }

    // Tables (max 1)
    if (c.tables.length > 0 && y < maxPos - 1) {
      const table = c.tables[0];
      const colCount = table.headers.length;
      if (colCount > 0 && table.rows.length > 0) {
        const tableRows: any[] = [
          table.headers.map(h => ({ text: truncate(cleanMd(h), 20), options: { bold: true, fill: { color: navy }, color: white, fontSize: 9 } })),
          ...table.rows.slice(0, 6).map(row =>
            row.map(cell => ({ text: truncate(cleanMd(cell), 40), options: { fontSize: 9, color: ink } }))
          ),
        ];
        const tableWidth = 12.05;
        const colW = Array(colCount).fill(tableWidth / colCount);
        const estimatedHeight = 0.35 * tableRows.length + 0.2;
        if (y + estimatedHeight < maxPos) {
          slide.addTable(tableRows, { x: 0.65, y, w: tableWidth, colW, border: { type: "solid", color: "D9E2EC", pt: 1 }, valign: "mid", rowH: 0.35 });
          y += estimatedHeight + 0.2;
        }
      }
    }

    // Bold labels (max 4)
    for (const bl of c.boldLabels.slice(0, 4)) {
      if (y > maxPos) break;
      const labelHeight = bl.text ? 0.68 : 0.32;
      slide.addShape(pptx.ShapeType.rect, { x: 0.65, y, w: 0.06, h: labelHeight, fill: { color: accent }, line: { color: accent } });
      slide.addText(cleanMd(bl.label), { x: 0.9, y, w: 11.5, h: 0.26, fontSize: 11, bold: true, color: accent, margin: 0 });
      if (bl.text) {
        slide.addText(truncate(cleanMd(bl.text), 200), { x: 0.9, y: y + 0.27, w: 11.5, h: 0.4, fontSize: 10, color: ink, margin: 0, valign: "top" });
      }
      y += labelHeight + 0.08;
    }

    // Numbered items (max 4)
    if (c.numberedItems.length > 0 && y < maxPos) {
      const numText = c.numberedItems.slice(0, 4).map(n => truncate(cleanMd(n), 150)).join("\n");
      slide.addText(numText, { x: 0.65, y, w: 12.05, h: 1.2, fontSize: 10, color: ink, lineSpacingMultiple: 1.4, margin: 0, valign: "top" });
      y += Math.min(c.numberedItems.length * 0.3 + 0.2, 1.4);
    }

    // Bullets (max 5)
    if (c.bullets.length > 0 && y < maxPos) {
      const bulletText = c.bullets.slice(0, 5).map(b => `\u2022 ${truncate(cleanMd(b), 150)}`).join("\n");
      slide.addText(bulletText, { x: 0.65, y, w: 12.05, h: 1.5, fontSize: 10, color: ink, lineSpacingMultiple: 1.4, margin: 0, valign: "top" });
      y += Math.min(c.bullets.length * 0.3 + 0.2, 1.7);
    }

    // Paragraphs (max 2)
    for (const p of c.paragraphs.slice(0, 2)) {
      if (y > maxPos) break;
      slide.addText(truncate(cleanMd(p), 300), { x: 0.65, y, w: 12.05, h: 0.55, fontSize: 10, color: ink, lineSpacingMultiple: 1.3, margin: 0, valign: "top" });
      y += 0.6;
    }

    // Quotes (max 1)
    if (c.quotes.length > 0 && y < maxPos - 0.8) {
      const q = c.quotes[0];
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y, w: 12.05, h: 0.9, rectRadius: 0.08, fill: { color: pale }, line: { color: "D9E2EC" } });
      slide.addText("\u201C", { x: 0.9, y: y + 0.02, w: 0.5, h: 0.5, fontSize: 26, bold: true, color: accent, margin: 0 });
      slide.addText(truncate(cleanMd(q.text), 180), { x: 1.45, y: y + 0.1, w: 10.5, h: 0.5, fontSize: 11, color: ink, italic: true, margin: 0, valign: "mid" });
      if (q.source) {
        slide.addText(`\u2014 ${cleanMd(q.source)}`, { x: 1.45, y: y + 0.62, w: 10, h: 0.22, fontSize: 9, color: muted, margin: 0 });
      }
      y += 1.0;
    }

    return y;
  };

  const confirmedInsights = insights.filter((i) => i.status === "已确认");

  // ====== Parse Markdown if available ======
  const hasMd = markdownContent && markdownContent.trim().length > 100;
  const parsed = hasMd ? parseMarkdown(markdownContent!) : null;

  // ====== Slide 1: Cover ======
  let slide = pptx.addSlide();
  slide.background = { color: navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: accent }, line: { color: accent } });
  slide.addText("QUALITATIVE RESEARCH REPORT", { x: 0.8, y: 0.75, w: 8, h: 0.3, color: "9FB3C8", fontSize: 12, bold: true, charSpacing: 2, margin: 0 });
  const coverTitle = parsed?.title || project.name;
  slide.addText(coverTitle, { x: 0.8, y: 1.55, w: 10.7, h: 1.3, color: white, fontFace: "Microsoft YaHei", fontSize: 32, bold: true, breakLine: false, margin: 0, valign: "mid" });
  slide.addText(project.objective, { x: 0.82, y: 3.15, w: 8.5, h: 1, color: "D9E2EC", fontSize: 16, breakLine: false, margin: 0, valign: "top" });
  const coverStats = [
    ["\u4F4D\u53D7\u8BBF\u8005", String(respondents.length)],
    ["\u4EFD\u8BBF\u8C08", String(interviews.length)],
    ["\u6761\u6D1E\u5BDF", String(confirmedInsights.length)],
    ["\u6761\u539F\u8BDD", String(quotes.length)],
  ];
  coverStats.forEach((_, idx) => {
    const x = 0.82 + idx * 2.6;
    slide.addText(coverStats[idx][1], { x, y: 4.8, w: 1.2, h: 0.55, color: accent, fontSize: 36, bold: true, align: "left", margin: 0 });
    slide.addText(coverStats[idx][0], { x, y: 5.4, w: 1.5, h: 0.25, color: "BCCCDC", fontSize: 11, margin: 0 });
  });
  slide.addText(new Date().toLocaleDateString("zh-CN"), { x: 0.82, y: 6.72, w: 3, h: 0.25, color: "9FB3C8", fontSize: 10, margin: 0 });

  // ====== Build content slides ======
  if (parsed && parsed.sections.length > 0) {
    let slideNum = 1;

    for (const section of parsed.sections) {
      // Decide whether to split subsections into individual slides
      // Split if: section has >2 subsections AND at least 2 have quotes (indicates findings with evidence)
      const subsectionsWithQuotes = section.subsections.filter(s => s.content.quotes.length > 0).length;
      const hasDiagram = section.subsections.some(s => s.content.diagrams.length > 0) || section.content.diagrams.length > 0;
      const shouldSplit = (section.subsections.length > 2 && subsectionsWithQuotes >= 2) || hasDiagram;

      if (shouldSplit) {
        // One slide per subsection
        for (const sub of section.subsections) {
          slideNum++;
          slide = pptx.addSlide();
          slide.background = { color: white };
          const kicker = `${String(slideNum).padStart(2, "0")} / FINDING`;
          titleFn(slide, truncate(cleanMd(sub.title), 60), kicker);
          renderContent(slide, sub.content, 1.55, 6.5);
        }
      } else {
        // One slide for the whole section (combine subsections)
        slideNum++;
        slide = pptx.addSlide();
        const isLight = slideNum % 2 === 0;
        slide.background = { color: isLight ? "F8FAFC" : white };
        const sectionTitle = truncate(cleanMd(section.title), 50);
        const kicker = `${String(slideNum).padStart(2, "0")} / ${sectionTitle.toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fff]/g, "").slice(0, 20)}`;
        titleFn(slide, sectionTitle, kicker);

        let yPos = 1.55;
        const maxPos = 6.5;

        // Render section's own body content first
        if (section.content.paragraphs.length > 0 || section.content.tables.length > 0 || section.content.boldLabels.length > 0) {
          yPos = renderContent(slide, section.content, yPos, maxPos);
        }

        // Render each subsection with its title as sub-header
        for (const sub of section.subsections) {
          if (yPos > maxPos) break;
          // Sub-header
          slide.addText(cleanMd(sub.title), { x: 0.65, y: yPos, w: 12.05, h: 0.28, fontSize: 13, bold: true, color: navy, margin: 0 });
          slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: yPos + 0.3, w: 0.8, h: 0.03, fill: { color: accent }, line: { color: accent } });
          yPos += 0.4;
          yPos = renderContent(slide, sub.content, yPos, maxPos);
          yPos += 0.15;
        }
      }
    }
  } else {
    // ====== Fallback: build from raw data (no Markdown available) ======
    // Executive Summary
    slide = pptx.addSlide();
    slide.background = { color: "F8FAFC" };
    titleFn(slide, "\u6267\u884C\u6458\u8981", "01 / EXECUTIVE SUMMARY");
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.65, w: 5.8, h: 5.0, rectRadius: 0.08, fill: { color: white }, line: { color: "D9E2EC", width: 1 } });
    slide.addText("\u5173\u952E\u53D1\u73B0", { x: 1.0, y: 1.85, w: 4, h: 0.35, fontSize: 16, bold: true, color: accent, margin: 0 });
    const findingsText = confirmedInsights.length ? confirmedInsights.slice(0, 5).map((ins, idx) => `${idx + 1}. ${ins.title}`).join("\n") : "\u6682\u65E0\u5DF2\u786E\u8BA4\u6D1E\u5BDF";
    slide.addText(findingsText, { x: 1.0, y: 2.35, w: 5.1, h: 3.8, fontSize: 13, color: ink, lineSpacingMultiple: 1.4, margin: 0, valign: "top" });
    slide.addShape(pptx.ShapeType.roundRect, { x: 6.85, y: 1.65, w: 5.8, h: 5.0, rectRadius: 0.08, fill: { color: lightAccent }, line: { color: accent, width: 1 } });
    slide.addText("\u6838\u5FC3\u5EFA\u8BAE", { x: 7.2, y: 1.85, w: 4, h: 0.35, fontSize: 16, bold: true, color: accent, margin: 0 });
    const recsText = confirmedInsights.length ? confirmedInsights.slice(0, 3).map((ins, idx) => {
      const action = ins.type === "\u75DB\u70B9\u5206\u6790" ? "\u8BC4\u4F30\u4FEE\u590D\u4F18\u5148\u7EA7\u5E76\u7EB3\u5165\u4EA7\u54C1\u8DEF\u7EBF" : ins.type === "\u9700\u6C42\u5206\u6790" ? "\u8BC4\u4F30\u9700\u6C42\u666E\u904D\u6027\u540E\u7EB3\u5165\u4EA7\u54C1\u89C4\u5212" : "\u7EB3\u5165\u7EC6\u5206\u4EBA\u7FA4\u7B56\u7565\u5236\u5B9A";
      return `${idx + 1}. \u9488\u5BF9\u201C${ins.title}\u201D\uFF0C${action}`;
    }).join("\n") : "\u5F85\u751F\u6210\u6D1E\u5BDF\u540E\u8865\u5145";
    slide.addText(recsText, { x: 7.2, y: 2.35, w: 5.1, h: 3.8, fontSize: 13, color: ink, lineSpacingMultiple: 1.4, margin: 0, valign: "top" });

    // Findings slides
    const topInsights = confirmedInsights.slice(0, 5);
    topInsights.forEach((insight, idx) => {
      slide = pptx.addSlide();
      slide.background = { color: white };
      titleFn(slide, insight.title, `0${idx + 3} / FINDING ${idx + 1}`);
      const typeColor = insight.type === "\u75DB\u70B9\u5206\u6790" ? warnBorder : insight.type === "\u9700\u6C42\u5206\u6790" ? accent : muted;
      const typeBg = insight.type === "\u75DB\u70B9\u5206\u6790" ? warnBg : insight.type === "\u9700\u6C42\u5206\u6790" ? lightAccent : pale;
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.55, w: 1.8, h: 0.35, rectRadius: 0.04, fill: { color: typeBg }, line: { color: typeColor, width: 1 } });
      slide.addText(insight.type, { x: 0.75, y: 1.58, w: 1.6, h: 0.28, fontSize: 10, bold: true, color: typeColor, align: "center", margin: 0 });
      slide.addText(insight.description, { x: 0.65, y: 2.1, w: 12, h: 1.2, fontSize: 14, color: ink, lineSpacingMultiple: 1.3, margin: 0, valign: "top" });
      const relatedQuotes = quotes.filter((q) => insight.relatedTags.some((t) => q.tags.includes(t))).slice(0, 1);
      if (relatedQuotes.length) {
        slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 3.5, w: 12.05, h: 1.4, rectRadius: 0.08, fill: { color: pale }, line: { color: "D9E2EC" } });
        slide.addText("\u201C", { x: 0.9, y: 3.55, w: 0.5, h: 0.5, fontSize: 30, bold: true, color: accent, margin: 0 });
        slide.addText(relatedQuotes[0].text, { x: 1.45, y: 3.75, w: 10.5, h: 0.8, fontSize: 13, color: ink, italic: true, margin: 0, valign: "mid" });
        slide.addText(`\u2014 ${relatedQuotes[0].respondentCode || relatedQuotes[0].speakerRole}`, { x: 1.45, y: 4.55, w: 10, h: 0.25, fontSize: 10, color: muted, margin: 0 });
      }
      const implication = insight.type === "\u75DB\u70B9\u5206\u6790"
        ? "\u9700\u8BC6\u522B\u8BE5\u969C\u788D\u7684\u6839\u672C\u539F\u56E0\uFF0C\u8BC4\u4F30\u4EA7\u54C1\u5C42\u9762\u7684\u4FEE\u590D\u4F18\u5148\u7EA7"
        : insight.type === "\u9700\u6C42\u5206\u6790"
        ? "\u53EF\u4F5C\u4E3A\u4EA7\u54C1\u8DEF\u7EBF\u56FE\u7684\u8F93\u5165\uFF0C\u8BC4\u4F30\u9700\u6C42\u7684\u666E\u904D\u6027\u4E0E\u5B9E\u73B0\u6210\u672C"
        : "\u53EF\u4F5C\u4E3A\u7EC6\u5206\u4EBA\u7FA4\u7B56\u7565\u7684\u4F9D\u636E\uFF0C\u8BC4\u4F30\u662F\u5426\u9700\u5DEE\u5F02\u5316\u8BBE\u8BA1";
      slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 5.15, w: 0.06, h: 1.2, fill: { color: accent }, line: { color: accent } });
      slide.addText("\u4E1A\u52A1\u542F\u793A", { x: 0.9, y: 5.2, w: 3, h: 0.3, fontSize: 12, bold: true, color: accent, margin: 0 });
      slide.addText(implication, { x: 0.9, y: 5.55, w: 11.5, h: 0.7, fontSize: 12, color: ink, margin: 0, valign: "top" });
    });
  }

  // ====== Closing slide ======
  slide = pptx.addSlide();
  slide.background = { color: navy };
  slide.addText("\u7814\u7A76\u9650\u5236\u4E0E\u5C55\u671B", { x: 0.8, y: 0.8, w: 8, h: 0.65, fontSize: 32, bold: true, color: white, margin: 0 });
  const limitations = [
    "\u5B9A\u6027\u7814\u7A76\u53D1\u73B0\u4E3A\u65B9\u5411\u6027\u6D1E\u5BDF\uFF0C\u4E0D\u4EE3\u8868\u7EDF\u8BA1\u603B\u4F53\u3002",
    `\u6837\u672C\u91CF ${respondents.length} \u4EBA\uFF0C\u7ED3\u8BBA\u7684\u53EF\u63A8\u5E7F\u6027\u9700\u8C28\u614E\u5BF9\u5F85\u3002`,
    "\u672A\u5728\u539F\u59CB\u6750\u6599\u4E2D\u51FA\u73B0\u7684\u4FE1\u606F\u4E0D\u4F1A\u4F5C\u4E3A\u7ED3\u8BBA\u4F9D\u636E\u3002",
    "\u5EFA\u8BAE\u7ED3\u5408\u5B9A\u91CF\u7814\u7A76\u9A8C\u8BC1\u5B9A\u6027\u53D1\u73B0\u7684\u666E\u904D\u6027\u3002",
  ];
  limitations.forEach((text, idx) => {
    const y = 1.9 + idx * 0.8;
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.9, y: y + 0.08, w: 0.2, h: 0.2, fill: { color: accent }, line: { color: accent } });
    slide.addText(text, { x: 1.35, y, w: 10, h: 0.5, fontSize: 15, color: "D9E2EC", margin: 0, valign: "mid" });
  });
  slide.addText("\u6240\u6709\u7ED3\u8BBA\u5747\u5E94\u56DE\u5230\u539F\u59CB\u7B14\u5F55\u590D\u6838\u540E\u518D\u7528\u4E8E\u51B3\u7B56\u3002", { x: 0.85, y: 6.2, w: 10, h: 0.3, fontSize: 11, color: "9FB3C8", margin: 0 });
  slide.addText("ResearchBox · 定性研究报告", { x: 9.5, y: 6.9, w: 3, h: 0.3, fontSize: 10, color: "9FB3C8", align: "right", margin: 0 });

  if (!download) return (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array;
  const blob = await pptx.write({ outputType: "blob" });
  saveAs(blob as Blob, `${project.name}-研究报告.pptx`);
  return blob as Blob;
}
