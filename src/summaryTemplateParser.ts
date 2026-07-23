import * as XLSX from "xlsx";
import type {
  SummaryTemplateColumn,
  SummaryTemplateDimension,
} from "./types";

/**
 * 通用 Excel 小结模板结构解析器
 * 目标：识别任意模板的「表头行 / 表侧维度列(可多列层级) / 受访者|分组列」，
 * 兼容深访单人列（被访者:XX / P1 / 受访者A）与座谈分组列（城市名等任意文本）。
 *
 * 策略：先提取「合并区已填充」的完整网格，再用启发式打分定位结构；
 * 启发式结果置信度不足时由调用方回退到 AI 识别（见 SummaryPage）。
 */

export interface GridCell {
  r: number; // 0-based
  c: number; // 0-based
  v: string; // 文本（合并区已向下/向右填充）
}

export interface ParsedGrid {
  rows: number; // 总行数
  cols: number; // 总列数
  // grid[r][c] = 文本（含合并区填充），空串表示空
  grid: string[][];
  merges: XLSX.Range[];
}

/** 读取工作表为「合并区已填充」的二维网格 */
export function sheetToGrid(ws: XLSX.WorkSheet): ParsedGrid {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ""),
  );
  const readCell = (r: number, c: number): string => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return "";
    const v = cell.v ?? cell.w ?? "";
    return String(v).trim();
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      grid[r][c] = readCell(r, c);
    }
  }
  const merges: XLSX.Range[] = (ws["!merges"] || []).map((m) => ({
    s: { r: m.s.r, c: m.s.c },
    e: { r: m.e.r, c: m.e.c },
  }));
  // 合并区填充：用合并区左上角值填满整个区域（便于层级维度取值）。
  // 注意：仅做「纵向/同列」填充用于层级维度向下传递；横向合并（如分节标题
  // 横跨受访者列）不做填充，否则会污染受访者内容列。
  for (const m of merges) {
    const topLeft = grid[m.s.r]?.[m.s.c] ?? "";
    if (!topLeft) continue;
    const isVertical = m.e.r > m.s.r && m.e.c === m.s.c; // 单列纵向合并
    if (isVertical) {
      for (let r = m.s.r; r <= m.e.r; r += 1) {
        if (!grid[r][m.s.c]) grid[r][m.s.c] = topLeft;
      }
    }
  }
  return { rows, cols, grid, merges };
}

const META_HEADER_RE =
  /(时间|主要问题|关键追问|研究目的|出示物料|出示|物料|备注|说明|时长|分钟|大纲|模块|部分|序号|题目|问题|追问)/;
const STOP_LABEL_RE = /^(★|备注|说明|填写说明|注[:：]?)/;

/** 判断一个表头标签是否像「受访者/分组列」（而非维度列或元信息列） */
function looksLikeRespondentLabel(label: string): boolean {
  if (!label) return false;
  if (STOP_LABEL_RE.test(label)) return false;
  if (META_HEADER_RE.test(label)) return false;
  // 典型受访者列：被访者:XX / 受访者A / P1 / R1 / User1
  if (/被访者|受访者|访谈对象|嘉宾|用户\s*\w/i.test(label)) return true;
  if (/^[PRU]\s*\d+/i.test(label)) return true;
  if (/^Respondent/i.test(label)) return true;
  // 分组列（座谈会城市/组别）：短文本、不含维度词
  if (label.length <= 8 && !/[？?，,。、；;：:]/.test(label)) return true;
  return false;
}

/** 判断一个表头标签是否像「维度/元信息列」（应作为表侧） */
function looksLikeMetaLabel(label: string): boolean {
  if (!label) return false;
  return META_HEADER_RE.test(label);
}

/** 强受访者信号：标签本身即可判定为受访者列（无需内容长度验证） */
function isStrongRespondentLabel(label: string): boolean {
  return (
    /被访者|受访者|访谈对象|嘉宾|用户\s*\w/i.test(label) ||
    /^[PRU]\s*\d+/i.test(label) ||
    /^Respondent/i.test(label)
  );
}

export interface StructureGuess {
  headerRow0: number; // 0-based 表头行
  dimensionCols: number[]; // 0-based 维度层级列（从左到右父->子）
  leafDimensionCol: number; // 0-based 末级维度列
  respondentCols: number[]; // 0-based 受访者/分组列
  dataStartRow0: number; // 0-based 第一个数据行
  confidence: number; // 0..1
  kind: "single" | "group";
}

/** 统计某列作为「文本列」的特征：内容行的平均长度、非空率 */
function columnStats(grid: ParsedGrid, c: number, fromRow: number) {
  let nonEmpty = 0;
  let totalLen = 0;
  let longCells = 0; // 长度>30 的单元格数（像小结内容）
  for (let r = fromRow; r < grid.rows; r += 1) {
    const v = grid.grid[r][c];
    if (v) {
      nonEmpty += 1;
      totalLen += v.length;
      if (v.length > 30) longCells += 1;
    }
  }
  const dataRows = Math.max(1, grid.rows - fromRow);
  return {
    nonEmpty,
    fillRate: nonEmpty / dataRows,
    avgLen: totalLen / Math.max(1, nonEmpty),
    longCells,
  };
}

/**
 * 启发式识别模板结构。返回 null 表示无法识别。
 */
export function guessStructure(grid: ParsedGrid): StructureGuess | null {
  const { rows, cols, grid: g } = grid;
  if (rows < 2 || cols < 2) return null;

  // 1) 定位表头行：在前 6 行中，找出「受访者列命中数 + 这些列下方是长文本内容」得分最高的一行。
  //    关键判据：真正的受访者列表头标签短、而其下方数据行是长小结文本；维度词/短内容不会满足此特征。
  let headerRow0 = -1;
  let bestScore = -1;
  const scanRows = Math.min(6, rows);
  for (let r = 0; r < scanRows; r += 1) {
    let respHits = 0;
    let metaHits = 0;
    const candidateCols: number[] = [];
    for (let c = 0; c < cols; c += 1) {
      const v = g[r][c];
      if (!v) continue;
      if (looksLikeRespondentLabel(v)) {
        respHits += 1;
        candidateCols.push(c);
      }
      if (looksLikeMetaLabel(v)) metaHits += 1;
    }
    if (respHits === 0) continue;
    // 验证候选列是否真是受访者内容列。
    // 强信号列（被访者/受访者/P/R+数字）标签本身即可判定，无需内容长度验证；
    // 弱信号列（城市名等短文本）需下方出现明显长于标签的小结内容。
    let contentScore = 0;
    for (const c of candidateCols) {
      const label = g[r][c];
      if (isStrongRespondentLabel(label)) {
        contentScore += 1;
        continue;
      }
      const labelLen = label.length;
      let longBelow = 0;
      for (let br = r + 1; br < Math.min(rows, r + 8); br += 1) {
        const bv = g[br][c];
        if (bv && bv.length > labelLen + 4) longBelow += 1;
      }
      if (longBelow >= 1) contentScore += 1;
    }
    // 表头行应当有 >=1 个受访者列；contentScore 是决定性证据（标签短内容长）
    const nonEmpty = g[r].filter((x) => x).length;
    const score =
      contentScore * 5 +
      respHits * 2 +
      metaHits +
      Math.min(nonEmpty, 4) * 0.2 -
      r * 0.1; // 同行数下偏好靠上的表头
    if (score > bestScore) {
      bestScore = score;
      headerRow0 = r;
    }
  }
  if (headerRow0 < 0) return null;

  // 2) 在表头行上划分列角色
  const respondentCols: number[] = [];
  const metaCols: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    const v = g[headerRow0][c];
    if (looksLikeRespondentLabel(v)) respondentCols.push(c);
    else if (v && looksLikeMetaLabel(v)) metaCols.push(c);
  }
  if (respondentCols.length === 0) return null;

  const firstResp = Math.min(...respondentCols);
  const dataStartRow0 = headerRow0 + 1;

  // 3) 维度列 = 第一个受访者列左侧的「短文本」列。
  //    深访模板（增城）：A~D 是维度层级（短文本），E 是「关键追问」（长文本提问），
  //    F 起是受访者列。维度列应排除追问/说明/物料这类长文本列。
  //    判定：该列数据行平均文本长度 <= 阈值（维度是短语，追问是长句）。
  const dimensionCols: number[] = [];
  for (let c = 0; c < firstResp; c += 1) {
    const head = g[headerRow0][c];
    if (STOP_LABEL_RE.test(head)) continue;
    // 明确是追问/说明/物料/备注表头的列，直接排除
    if (/(关键追问|追问|出示|物料|研究目的|备注|说明|时长)/.test(head)) continue;
    const stats = columnStats(grid, c, dataStartRow0);
    // 维度列是短文本：平均长度应较小（层级词/短语）。长文本列(追问)平均很长。
    if (stats.nonEmpty > 0 && stats.avgLen > 45) continue;
    dimensionCols.push(c);
  }

  // 座谈模板（黄豆酱）：表头行 A 列为空或是维度标题，B..E 是城市。
  // 此时 firstResp=1，dimensionCols=[0]，正确。

  if (dimensionCols.length === 0) return null;

  // 4) 末级维度列：在 dimensionCols 中，数据行内容「区分度最高/最像叶子维度」的列。
  //    经验：叶子维度列每个数据行都有值且文本较短；父级列因合并而大量重复。
  let leafDimensionCol = dimensionCols[dimensionCols.length - 1];
  let bestLeaf = -1;
  for (const c of dimensionCols) {
    // 叶子列：非空率高、且「相邻行重复率」低（合并父列重复率高）
    let nonEmpty = 0;
    let repeats = 0;
    let prev = "";
    for (let r = dataStartRow0; r < rows; r += 1) {
      const v = g[r][c];
      if (v) {
        nonEmpty += 1;
        if (v === prev) repeats += 1;
        prev = v;
      }
    }
    const dataRows = Math.max(1, rows - dataStartRow0);
    const fillRate = nonEmpty / dataRows;
    const repeatRate = nonEmpty > 1 ? repeats / nonEmpty : 1;
    // 叶子列倾向：填充率高但重复率低
    const score = fillRate * (1 - repeatRate);
    if (score > bestLeaf) {
      bestLeaf = score;
      leafDimensionCol = c;
    }
  }

  // 5) 判定模板类型：受访者列标签是否含「被访者/受访者/P/R+数字」→ single；否则 group
  const singleLike = respondentCols.some((c) =>
    /被访者|受访者|^[PRU]\s*\d+|^Respondent/i.test(g[headerRow0][c]),
  );
  const kind: "single" | "group" = singleLike ? "single" : "group";

  // 6) 置信度：受访者列数、维度列非空率、表头明确度
  const leafStats = columnStats(grid, leafDimensionCol, dataStartRow0);
  let confidence = 0.4;
  confidence += Math.min(respondentCols.length, 6) * 0.06; // 受访者列越多越可信
  confidence += Math.min(leafStats.fillRate, 1) * 0.25;
  if (singleLike) confidence += 0.05;
  confidence = Math.min(confidence, 0.98);

  return {
    headerRow0,
    dimensionCols,
    leafDimensionCol,
    respondentCols,
    dataStartRow0,
    confidence,
    kind,
  };
}

/**
 * 基于结构guess，抽取维度（含层级路径）与列定义、以及已有的风格样例。
 */
export function extractTemplateContent(
  grid: ParsedGrid,
  guess: StructureGuess,
): {
  dimensions: SummaryTemplateDimension[];
  columns: SummaryTemplateColumn[];
} {
  const { rows, grid: g } = grid;
  const dataStartRow0 = guess.dataStartRow0;

  // 维度：逐数据行读取「维度层级列」拼接 path；末级列为 name。
  // 合并区已被填充，因此父级在每行都有值；相邻重复的行视为同一合并块，仅首行作为写入行。
  // 分节标题行（该行所有受访者列均无内容）不视为可填维度，跳过。
  const dimensions: SummaryTemplateDimension[] = [];
  const seenPaths = new Set<string>();
  let prevPath = "";
  const respondentHasContent = (r: number) =>
    guess.respondentCols.some((c) => (g[r][c] ?? "").trim().length >= 4);
  for (let r = dataStartRow0; r < rows; r += 1) {
    const parts = guess.dimensionCols
      .map((c) => g[r][c])
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter((s) => s && !STOP_LABEL_RE.test(s));
    if (parts.length === 0) {
      prevPath = "";
      continue;
    }
    const leaf = parts[parts.length - 1];
    const path = parts.join(" / ");
    if (path === prevPath) continue;
    prevPath = path;
    if (seenPaths.has(path)) continue;
    // 分节/标题行：任何受访者列都没有内容 -> 不是可填维度
    if (!respondentHasContent(r)) continue;
    seenPaths.add(path);
    dimensions.push({ row: r + 1, name: leaf, path, merged: false });
  }

  // 列定义 + 风格样例
  const columns: SummaryTemplateColumn[] = guess.respondentCols.map((c) => {
    const label = g[guess.headerRow0][c] || `列${c + 1}`;
    const styleSample: Record<string, string> = {};
    let hasContent = false;
    for (const dim of dimensions) {
      const v = g[dim.row - 1]?.[c] ?? "";
      if (v && v.length >= 8) {
        styleSample[dim.path || dim.name] = v;
        hasContent = true;
      }
    }
    return {
      column: c + 1,
      label,
      role: "respondent",
      hasContent,
      styleSample: hasContent ? styleSample : undefined,
    };
  });

  return { dimensions, columns };
}

/** 供 AI 兜底识别：把网格前若干行压缩成可读文本 */
export function gridToPromptText(grid: ParsedGrid, maxRows = 25): string {
  const lines: string[] = [];
  const R = Math.min(grid.rows, maxRows);
  for (let r = 0; r < R; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < grid.cols; c += 1) {
      let v = grid.grid[r][c];
      if (v.length > 18) v = v.slice(0, 18) + "…";
      cells.push(v || "·");
    }
    lines.push(`R${r + 1}: ${cells.join(" | ")}`);
  }
  return lines.join("\n");
}
