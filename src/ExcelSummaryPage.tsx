/**
 * Excel 小结独立页面（含生成小结与导出）
 *
 * 完整功能：
 * - 导入 Excel 小结模板（自动识别维度/受访者列，含 AI 识别回退）
 * - 查看/编辑分析维度（增删改、AI 推荐、恢复默认）
 * - 上传访谈笔录文件（支持 .txt / .docx，自动解析角色与段落）
 * - 一键生成小结（AI 按维度为每位受访者生成结构化小结）
 * - 预览结果表格 + 导出 Excel（有模板则保留原样式回填，无模板则新建标准表）
 * - 下载示例模板
 * - 预览已导入模板信息
 *
 * 不绑定任何项目，模板按 "__global__" 全局存储。
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { db } from "./db";
import {
  getAiHealth,
  recognizeTemplateWithAi,
  generateSummaryWithAi,
  type AiHealth,
} from "./aiClient";
import { useStore } from "./store";
import { parseTranscript } from "./correction";
import type {
  SummaryTemplate,
  SummaryTemplateDimension,
  Interview,
  Respondent,
  Segment,
  Project,
} from "./types";
import {
  sheetToGrid,
  guessStructure,
  extractTemplateContent,
  gridToPromptText,
  type ParsedGrid,
} from "./summaryTemplateParser";

// ====== 常量 ======

const GLOBAL_PROJECT_ID = "__global__";

const defaultDimensions = [
  "购买动机",
  "使用痛点",
  "价格态度",
  "品牌认知",
  "使用场景",
  "尝试意愿",
];

/** 上传的笔录解析结果 */
interface UploadedTranscript {
  id: string;
  file: File;
  name: string;
  /** 原始文本（用于 AI 上下文） */
  rawText: string;
  /** 解析出的段落（仅受访者发言，用于 AI 分析） */
  segments: Array<{ role: string; speakerId: string; text: string }>;
}

/** 生成的小结行 */
interface SummaryRow {
  respondentId: string;
  respondentCode: string;
  dimensions: Array<{ name: string; content: string }>;
}

// ====== 组件 ======

export function ExcelSummaryPage() {
  const [dimensions, setDimensions] = useState<string[]>(defaultDimensions);
  const [newDimension, setNewDimension] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [error, setError] = useState("");

  // ---- 笔录上传 & 生成小结 ----
  const [transcripts, setTranscripts] = useState<UploadedTranscript[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);

  const addToast = useStore((s) => s.addToast);

  // AI 健康检测
  useEffect(() => {
    let active = true;
    getAiHealth()
      .then((h) => { if (active) setAiHealth(h); })
      .catch(() => { if (active) setAiHealth(null); });
    return () => { active = false; };
  }, []);

  // 全局模板查询
  const globalTemplate = useLiveQuery(
    async (): Promise<SummaryTemplate | undefined> =>
      db.summaryTemplates.where("projectId").equals(GLOBAL_PROJECT_ID).first(),
    [],
  );

  const aiOnline = !!aiHealth?.configured;

  // ---- 维度操作 ----

  function addDimension() {
    const value = newDimension.trim();
    if (!value) return;
    if (dimensions.includes(value)) {
      addToast("该维度已存在", "info");
      setNewDimension("");
      return;
    }
    setDimensions((prev) => [...prev, value]);
    setNewDimension("");
  }

  function removeDimension(name: string) {
    setDimensions((prev) => prev.filter((d) => d !== name));
  }

  // ---- 模板导入 ----

  async function importTemplate(file?: File) {
    if (!file) return;
    setTemplateBusy(true);
    setError("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      let best: {
        sheetName: string;
        grid: ParsedGrid;
        guess: NonNullable<ReturnType<typeof guessStructure>>;
      } | null = null;
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        if (!ws) continue;
        const grid = sheetToGrid(ws);
        const guess = guessStructure(grid);
        if (guess && (!best || guess.respondentCols.length > best.guess.respondentCols.length)) {
          best = { sheetName, grid, guess };
        }
      }

      let usedAi = false;
      if (!best || best.guess.confidence < 0.6) {
        const aiGuess = await tryAiRecognize(workbook);
        if (aiGuess) { best = aiGuess; usedAi = true; }
      }
      if (!best) {
        throw new Error("未能识别模板结构。请确认表格左侧为分析维度、右侧每列为一位受访者/一个分组，且存在表头行。");
      }
      const { sheetName, grid, guess } = best;
      const { dimensions: dims, columns } = extractTemplateContent(grid, guess);
      if (!columns.length) throw new Error("未识别到受访者/分组列");
      if (!dims.length) throw new Error("未识别到可填写的分析维度行");

      const duplicateNames = dims.map((item) => item.name)
        .filter((name, index, list) => list.indexOf(name) !== index);
      const filledCount = columns.filter((c) => c.hasContent).length;
      const warnings = [
        ...new Set(duplicateNames.map((n) => `存在重复分析维度：${n}`)),
        ...(filledCount > 0 ? [`检测到 ${filledCount} 列已填写内容，生成时将作为风格样例学习`] : []),
        ...(usedAi ? ["模板结构由 AI 辅助识别，请核对维度与受访者列"] : []),
      ];

      const item: SummaryTemplate = {
        id: globalTemplate?.id || crypto.randomUUID(),
        projectId: GLOBAL_PROJECT_ID,
        name: file.name.replace(/\.xlsx?$/i, ""),
        fileName: file.name,
        sheetName,
        dimensionColumn: guess.leafDimensionCol + 1,
        dimensionColumns: guess.dimensionCols.map((c) => c + 1),
        respondentColumns: columns,
        dimensions: dims,
        headerRow: guess.headerRow0 + 1,
        dataStartRow: guess.dataStartRow0 + 1,
        templateKind: guess.kind,
        validationWarnings: warnings,
        fileData: data,
        createdAt: new Date().toISOString(),
      };
      if (globalTemplate) await db.summaryTemplates.put(item);
      else await db.summaryTemplates.add(item);

      setDimensions(dims.map((d) => d.name));
      addToast(
        `已导入模板：${dims.length} 个维度，${columns.length} 个${guess.kind === "group" ? "分组" : "受访者"}列` +
          (filledCount > 0 ? `（含 ${filledCount} 列已有内容）` : ""),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "模板解析失败";
      setError(message);
      addToast(message, "error");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function tryAiRecognize(
    workbook: XLSX.WorkBook,
  ): Promise<{
    sheetName: string;
    grid: ParsedGrid;
    guess: NonNullable<ReturnType<typeof guessStructure>>;
  } | null> {
    if (!aiHealth?.configured) return null;
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const grid = sheetToGrid(ws);
      if (grid.rows < 2 || grid.cols < 2) continue;
      try {
        const resp = await recognizeTemplateWithAi(gridToPromptText(grid));
        const s = resp.data;
        if (!s || s.headerRow == null || !s.respondentCols?.length) continue;
        const headerRow0 = Math.max(0, s.headerRow - 1);
        const dimensionCols = (s.dimensionCols?.length
          ? s.dimensionCols
          : [s.dimensionCol ?? 1]
        ).map((c) => c - 1);
        const leafDimensionCol = (s.leafDimensionCol ?? dimensionCols[dimensionCols.length - 1]) - 1;
        const guess = {
          headerRow0,
          dimensionCols,
          leafDimensionCol,
          respondentCols: s.respondentCols.map((c) => c - 1),
          dataStartRow0: headerRow0 + 1,
          confidence: 0.7,
          kind: (s.kind === "group" ? "group" : "single") as "single" | "group",
        };
        return { sheetName, grid, guess };
      } catch {
        continue;
      }
    }
    return null;
  }

  // ---- AI 推荐维度 ----

  async function aiSuggestDimensions() {
    if (!aiOnline) {
      addToast("AI 服务暂不可用", "error");
      return;
    }
    setTemplateBusy(true);
    try {
      const resp = await fetch("/api/analyze/dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            id: GLOBAL_PROJECT_ID,
            name: "Excel 小结通用模板",
            objective: "定性访谈小结整理",
            researchType: "用户访谈",
            targetGroup: "消费者 / 用户",
            researchQuestions: dimensions.slice(0, 3),
          },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const suggested: string[] = json.data?.dimensions || [];
      if (suggested.length === 0) {
        addToast("AI 未返回维度建议", "info");
        return;
      }
      const merged = [...new Set([...dimensions, ...suggested])];
      setDimensions(merged);
      addToast(`AI 推荐了 ${suggested.length} 个维度，已合并到列表`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "维度推荐失败";
      addToast(msg, "error");
    } finally {
      setTemplateBusy(false);
    }
  }

  // ====== 笔录上传 ======

  async function handleUploadTranscripts(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) =>
      f.name.endsWith(".txt") || f.name.endsWith(".docx"),
    );
    if (arr.length === 0) {
      addToast("请选择 .txt 或 .docx 格式的笔录文件", "info");
      return;
    }
    setUploadBusy(true);
    setError("");
    const added: UploadedTranscript[] = [];
    for (const file of arr) {
      try {
        const rawText = await readTranscriptFile(file);
        const parsed = parseTranscript(rawText);
        // 仅保留受访者发言段作为 AI 分析素材
        const respondentSegments = parsed
          .filter((s) => s.role === "受访者")
          .map((s) => ({ role: s.role, speakerId: s.speakerId, text: s.text }));
        if (respondentSegments.length === 0) {
          addToast(`「${file.name}」未检测到受访者发言，已跳过`, "info");
          continue;
        }
        added.push({
          id: crypto.randomUUID(),
          file,
          name: file.name.replace(/\.(txt|docx)$/i, ""),
          rawText,
          segments: respondentSegments,
        });
      } catch (e) {
        addToast(`读取「${file.name}」失败：${e instanceof Error ? e.message : "未知错误"}`, "error");
      }
    }
    if (added.length > 0) {
      setTranscripts((prev) => [...prev, ...added]);
      addToast(`已添加 ${added.length} 份笔录（共 ${transcripts.length + added.length} 份）`);
    }
    setUploadBusy(false);
  }

  /** 从 File 对象读取纯文本（txt 直接读，docx 用 mammoth） */
  async function readTranscriptFile(file: File): Promise<string> {
    if (file.name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }
    return await file.text();
  }

  function removeTranscript(id: string) {
    setTranscripts((prev) => prev.filter((t) => t.id !== id));
  }

  function clearAllTranscripts() {
    setTranscripts([]);
    setSummaries([]);
  }

  // ====== 生成小结 ======

  async function handleGenerate() {
    if (transcripts.length === 0) {
      addToast("请先上传笔录文件", "info");
      return;
    }
    if (dimensions.length === 0) {
      addToast("请至少保留一个分析维度", "info");
      return;
    }
    if (!aiOnline) {
      addToast("AI 服务暂不可用，请稍后重试", "error");
      return;
    }
    const confirmed = window.confirm(
      `将把 ${transcripts.length} 份笔录发送至 AI 服务生成访谈小结（${dimensions.length} 个维度）。是否继续？`,
    );
    if (!confirmed) return;

    setGenerating(true);
    setError("");
    setSummaries([]);

    try {
      // 构造虚拟项目对象（不存 DB，仅供 API 调用）
      const virtualProject: Project = {
        id: GLOBAL_PROJECT_ID,
        name: "Excel 小结",
        description: `从 ${transcripts.length} 份笔录生成定性小结`,
        researchType: "用户访谈",
        objective: "定性访谈小结整理",
        targetGroup: "消费者 / 用户",
        status: "进行中",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 每份笔录 = 一位受访者 + 一次访谈
      const respondents: Respondent[] = transcripts.map((t, i) => ({
        id: t.id,
        projectId: GLOBAL_PROJECT_ID,
        code: t.name || `受访者${i + 1}`,
        name: t.name || `受访者${i + 1}`,
        tags: [],
        notes: `来源文件：${t.file.name}`,
        createdAt: new Date().toISOString(),
      }));

      const interviews: Interview[] = transcripts.map((t, i) => ({
        id: `${t.id}-int`,
        projectId: GLOBAL_PROJECT_ID,
        respondentId: t.id,
        title: t.name || `访谈${i + 1}`,
        sourceType: (t.file.name.endsWith(".docx") ? "DOCX" : "文本") as "文本" | "DOCX",
        fileName: t.file.name,
        transcriptStatus: "原始笔录",
        analysisStatus: "未分析",
        durationMinutes: Math.ceil(t.rawText.length / 200),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // 所有段落统一编号
      const allSegments: Segment[] = [];
      for (let ti = 0; ti < transcripts.length; ti++) {
        const t = transcripts[ti];
        const intId = interviews[ti].id;
        for (let si = 0; si < t.segments.length; si++) {
          const seg = t.segments[si];
          allSegments.push({
            id: `${t.id}-seg-${si}`,
            interviewId: intId,
            start: 0,
            end: seg.text.length,
            speakerId: seg.speakerId,
            role: seg.role as "研究员" | "受访者" | "主持人" | "专家" | "客户" | "其他",
            text: seg.text,
            correctedText: seg.text,
            confidence: 1,
            tags: [],
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 构造风格样例（如果模板有已填写列）
      let styleExample = null;
      if (globalTemplate) {
        const sampleCol = globalTemplate.respondentColumns.find((c) => c.hasContent);
        if (sampleCol) {
          styleExample = {
            respondentCode: sampleCol.label || "样例",
            dimensions: globalTemplate.dimensions.slice(0, 5).map((d) => ({
              name: d.name,
              path: d.path,
              content: `[${d.name}] （样例写法，AI 将模仿此风格）`,
            })),
          };
        }
      }

      // 按受访者分批（每批 1 位，避免超上下文）
      const BATCH_SIZE = 1;
      const allRows: SummaryRow[] = [];
      let model = "";
      for (let b = 0; b < transcripts.length; b += BATCH_SIZE) {
        const batch = transcripts.slice(b, b + BATCH_SIZE);
        const batchIds = new Set(batch.map((t) => t.id));
        const batchRespondents = respondents.filter((r) => batchIds.has(r.id));
        const batchInterviews = interviews.filter((i) => i.respondentId && batchIds.has(i.respondentId));
        const batchSegs = allSegments.filter((s) => batchIds.has(s.interviewId.replace("-int", "")));

        const response = await generateSummaryWithAi(
          virtualProject,
          batchRespondents,
          batchInterviews,
          batchSegs,
          dimensions,
          styleExample,
        );
        model = response.model || "";
        const rows: SummaryRow[] = response.data?.summaries || [];
        allRows.push(...rows);
        // 增量更新预览
        setSummaries([...allRows]);
      }

      if (allRows.length === 0) throw new Error("AI 未返回可用的小结内容");
      setSummaries(allRows);
      addToast(`${model} 已生成 ${allRows.length} 位受访者的访谈小结`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "生成小结失败";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setGenerating(false);
    }
  }

  // ====== 导出 Excel ======

  const handleExportExcel = useCallback(() => {
    if (summaries.length === 0) return;

    // 有模板 → 保留样式回填
    if (globalTemplate) {
      const wb = XLSX.read(globalTemplate.fileData, { type: "array", cellStyles: true });
      const ws = wb.Sheets[globalTemplate.sheetName];
      if (!ws) {
        addToast("模板工作表已损坏", "error");
        return;
      }
      const tplCols = [...globalTemplate.respondentColumns];
      const headerRow0 = (globalTemplate.headerRow || 1) - 1;

      // 列扩容
      if (summaries.length > tplCols.length) {
        const extra = summaries.length - tplCols.length;
        const lastCol0 = tplCols[tplCols.length - 1].column - 1;
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
        const colsArr = (ws["!cols"] = ws["!cols"] || []);
        for (let k = 1; k <= extra; k += 1) {
          const targetCol0 = lastCol0 + k;
          colsArr[targetCol0] = colsArr[lastCol0] ? { ...colsArr[lastCol0] } : { wch: 40 };
          const srcHeaderAddr = XLSX.utils.encode_cell({ r: headerRow0, c: lastCol0 });
          const dstHeaderAddr = XLSX.utils.encode_cell({ r: headerRow0, c: targetCol0 });
          ws[dstHeaderAddr] = { ...(ws[srcHeaderAddr] || { t: "s", v: "" }), v: "" };
          for (const dim of globalTemplate.dimensions) {
            const srcAddr = XLSX.utils.encode_cell({ r: dim.row - 1, c: lastCol0 });
            const dstAddr = XLSX.utils.encode_cell({ r: dim.row - 1, c: targetCol0 });
            ws[dstAddr] = { ...(ws[srcAddr] || {}), v: "", w: undefined };
          }
          range.e.c = Math.max(range.e.c, targetCol0);
        }
        ws["!ref"] = XLSX.utils.encode_range(range);
        for (let k = 1; k <= extra; k += 1) {
          tplCols.push({ column: lastCol0 + k + 1, label: "", role: "respondent" });
        }
      }

      // 维度名 -> 行号
      const findDimRow = (dimName: string): number | null => {
        const d = globalTemplate.dimensions.find((x) => x.name === dimName || x.path === dimName);
        return d ? d.row : null;
      };

      // 写入数据
      globalTemplate.dimensions.forEach((dimension) => {
        summaries.forEach((row, index) => {
          const col = tplCols[index];
          if (!col) return;
          const cellAddress = XLSX.utils.encode_cell({ r: dimension.row - 1, c: col.column - 1 });
          const content =
            row.dimensions.find((d) => d.name === dimension.name)?.content ||
            "本次访谈未涉及";
          const existing = ws[cellAddress] || {};
          existing.t = "s";
          existing.v = content;
          delete existing.w;
          ws[cellAddress] = existing;
        });
      });

      // 补列表头
      summaries.forEach((row, index) => {
        const col = tplCols[index];
        if (!col || col.label) return;
        const addr = XLSX.utils.encode_cell({ r: headerRow0, c: col.column - 1 });
        const cell = ws[addr] || { t: "s" };
        cell.t = "s";
        cell.v = row.respondentCode;
        ws[addr] = cell;
      });

      const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Excel小结-${new Date().toLocaleDateString()}.xlsx`);
      addToast("已按导入模板导出 Excel（保留原样式）");
      return;
    }

    // 无模板 → 新建标准表
    const header: string[] = ["分析维度", ...summaries.map((r) => r.respondentCode)];
    const body: string[][] = dimensions.map((dim) => [
      dim,
      ...summaries.map((r) => r.dimensions.find((d) => d.name === dim)?.content || ""),
    ]);
    const aoa: string[][] = [header, ...body];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, ...summaries.map(() => ({ wch: 50 }))];
    XLSX.utils.book_append_sheet(wb, ws, "定性小结");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `Excel小结-${new Date().toLocaleDateString()}.xlsx`);
    addToast("已导出 Excel 小结");
  }, [summaries, dimensions, globalTemplate]);

  // ---- 辅助函数 ----

  async function downloadSampleTemplate() {
    try {
      const resp = await fetch("/templates/summary_template.xlsx");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      saveAs(blob, "访谈小结示例模板.xlsx");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "下载示例模板失败";
      addToast(msg, "error");
    }
  }

  async function removeTemplate() {
    if (!globalTemplate) return;
    await db.summaryTemplates.delete(globalTemplate.id);
    addToast("已移除模板");
  }

  function exportBlankTemplate() {
    const header: string[] = ["分析维度"];
    if (globalTemplate) {
      header.push(...globalTemplate.respondentColumns.map((c) => c.label || "（待填）"));
    } else {
      header.push("受访者 1", "受访者 2", "受访者 3");
    }
    const body: string[][] = dimensions.map((dim) => [dim, ...header.slice(1).map(() => "")]);
    const aoa: string[][] = [header, ...body];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, ...header.slice(1).map(() => ({ wch: 50 }))];
    XLSX.utils.book_append_sheet(wb, ws, "定性小结");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), "Excel小结-维度模板.xlsx");
    addToast("已导出维度模板");
  }

  // ====== 渲染 ======

  const totalSegments = transcripts.reduce((sum, t) => sum + t.segments.length, 0);

  return (
    <section className="space-y-6">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <span>结果交付</span>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">Excel 小结</span>
      </nav>

      {/* 标题 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Excel 小结</h1>
        <p className="mt-2 text-slate-500">
          上传笔录与小结模板，配置分析维度后一键生成结构化小结，直接导出 Excel。
        </p>
      </div>

      {/* AI 健康状态 */}
      <div className={`rounded-xl border p-3 text-sm ${
        aiOnline
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}>
        {aiOnline
          ? `AI 服务已连接（${aiHealth.model}），可辅助识别模板结构与生成小结。`
          : "AI 服务暂不可用，模板导入与基础功能仍可正常使用。"}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button className="ml-3 font-medium text-red-600 hover:underline" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      {/* ====== 笔录上传区 ====== */}
      <div className="card p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-lg font-semibold">访谈笔录</h3>
            <p className="mt-1 text-sm text-slate-500">
              上传访谈笔录文件（.txt / .docx），系统自动解析角色与发言段落。
              每份文件视为一位受访者的访谈记录。
            </p>
          </div>
          <label className="btn-primary cursor-pointer whitespace-nowrap">
            {uploadBusy ? "解析中..." : "上传笔录"}
            <input
              type="file"
              accept=".txt,.docx"
              multiple
              disabled={uploadBusy}
              className="hidden"
              onChange={(e) => void handleUploadTranscripts(e.target.files || [])}
            />
          </label>
        </div>

        {/* 已上传笔录列表 */}
        {transcripts.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                已上传 {transcripts.length} 份笔录（共 {totalSegments} 条受访者发言段落）
              </span>
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:underline"
                onClick={clearAllTranscripts}
              >
                清空全部
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {transcripts.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-medium text-slate-800">{t.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{t.segments.length} 条段落</span>
                  </div>
                  <button
                    type="button"
                    className="ml-2 shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => removeTranscript(t.id)}
                    aria-label={`移除 ${t.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* 生成小结按钮 */}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={generating || transcripts.length === 0 || !aiOnline}
                onClick={() => void handleGenerate()}
              >
                {generating ? "生成中..." : "生成小结"}
              </button>
              {generating && (
                <span className="text-sm text-slate-500">
                  正在为 {transcripts.length} 位受访者生成小结，请稍候…
                </span>
              )}
            </div>
          </div>
        )}

        {/* 未上传时的引导 */}
        {transcripts.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
            支持批量上传 .txt 或 .docx 格式的访谈笔录。
            系统会自动识别「研究员/主持人」与「受访者」角色，提取受访者发言用于 AI 小结生成。
          </div>
        )}
      </div>

      {/* ====== 结果预览区 ====== */}
      {summaries.length > 0 && (
        <div className="card p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-semibold">生成结果</h3>
              <p className="mt-1 text-sm text-slate-500">
                已生成 {summaries.length} 位受访者的{dimensions.length} 维度小结，可预览或导出 Excel。
              </p>
            </div>
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={handleExportExcel}
            >
              导出小结 Excel
            </button>
          </div>

          {/* 结果表格 */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 z-10 min-w-[100px] border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 bg-slate-100">
                    分析维度
                  </th>
                  {summaries.map((row) => (
                    <th key={row.respondentId} className="min-w-[180px] max-w-[280px] border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      <span className="block truncate" title={row.respondentCode}>{row.respondentCode}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dimensions.map((dim) => (
                  <tr key={dim} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 font-medium text-brand-700 bg-white whitespace-nowrap">
                      {dim}
                    </td>
                    {summaries.map((row) => {
                      const content = row.dimensions.find((d) => d.name === dim)?.content || "";
                      return (
                        <td key={`${row.respondentId}-${dim}`} className="max-w-[280px] border-b border-r border-slate-200 px-3 py-2 align-top text-slate-600">
                          <span className="line-clamp-4" title={content}>{content || "—"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== 模板与维度区 ====== */}
      <div className="card p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-lg font-semibold">Excel 小结模板与分析维度</h3>
            <p className="mt-1 text-sm text-slate-500">
              导入模板后自动读取分析维度与受访者列，生成结果会按原样式回填导出。
              此页面不绑定项目，模板全局共享。
            </p>
          </div>
          <label className="btn-ghost cursor-pointer whitespace-nowrap">
            {templateBusy
              ? "解析中..."
              : globalTemplate
                ? "更换模板"
                : "导入 Excel 模板"}
            <input
              type="file"
              accept=".xlsx"
              disabled={templateBusy}
              className="hidden"
              onChange={(event) => void importTemplate(event.target.files?.[0])}
            />
          </label>
        </div>

        {/* 已导入模板信息卡 */}
        {globalTemplate && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{globalTemplate.name}</b> ·{" "}
                {globalTemplate.dimensions.length} 个维度 ·{" "}
                {globalTemplate.respondentColumns.length} 个{globalTemplate.templateKind === "group" ? "分组" : "受访者"}列
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost text-xs" onClick={() => void exportBlankTemplate()}>
                  导出模板
                </button>
                <button className="text-xs font-medium text-red-600" onClick={() => void removeTemplate()}>
                  移除模板
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-green-700">
              工作表：{globalTemplate.sheetName}；类型：
              {globalTemplate.templateKind === "group" ? "分组小结（每列一组）" : "单人小结（每列一位受访者）"}；列：
              {globalTemplate.respondentColumns.map((item) => item.label || "（空）").join("、")}
            </p>
            {(() => {
              const sample = globalTemplate.respondentColumns.find((c) => c.hasContent);
              return sample ? (
                <p className="mt-1 rounded bg-brand-50 px-2 py-1 text-xs text-brand-800">
                  已检测到「{sample.label}」列有手写小结，生成时 AI 将学习其写法应用到其他列。
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  提示：在模板中先写好第一个用户/第一组的小结再导入，AI 会学习其写法应用到后续小结。
                </p>
              );
            })()}
            {!!globalTemplate.validationWarnings?.length && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                {globalTemplate.validationWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {!globalTemplate && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
            支持任意 Excel 小结模板：自动识别表头、左侧分析维度（支持多列层级）与右侧受访者/分组列；
            生成结果将严格遵循笔录（未涉及维度填&quot;本次访谈未涉及&quot;，每条小结附原话佐证），并保留原模板的表头、颜色、列宽、行高、合并单元格和冻结窗格。
            <button
              type="button"
              className="ml-2 font-medium text-brand-700 underline"
              onClick={() => void downloadSampleTemplate()}
            >
              下载示例模板
            </button>
          </div>
        )}

        {/* 维度 chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {dimensions.map((d) => (
            <span key={d} className="chip bg-brand-50 text-brand-800">
              {d}
              <button
                type="button"
                onClick={() => removeDimension(d)}
                className="ml-1 text-brand-500 hover:text-brand-800"
                aria-label={`删除维度 ${d}`}
              >
                ×
              </button>
            </span>
          ))}
          {dimensions.length === 0 && (
            <span className="text-sm text-slate-400">暂无维度，请在下方添加。</span>
          )}
        </div>

        {/* 维度编辑栏 */}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="输入新维度名称，如：决策因素"
            value={newDimension}
            onChange={(e) => setNewDimension(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addDimension(); }
            }}
          />
          <button className="btn-ghost" onClick={addDimension}>添加维度</button>
          <button
            className="btn-ghost"
            disabled={templateBusy || !aiOnline}
            onClick={() => void aiSuggestDimensions()}
          >
            {templateBusy ? "推荐中..." : "AI 推荐维度"}
          </button>
          <button className="btn-ghost" onClick={() => setDimensions(defaultDimensions)}>
            恢复默认
          </button>
          <button className="btn-ghost" onClick={() => void exportBlankTemplate()}>
            导出模板
          </button>
        </div>
      </div>

      {/* 使用指引 */}
      <div className="card p-5">
        <h3 className="text-lg font-semibold">使用流程</h3>
        <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal pl-5">
          <li><strong>上传笔录</strong> — 点击「上传笔录」按钮，选择 .txt 或 .docx 格式的访谈笔录文件（可多选）。系统自动解析角色。</li>
          <li><strong>导入模板（可选）</strong> — 上传 Excel 小结模板，系统自动识别维度与受访者列。不导入模板也可生成，导出时会新建标准格式。</li>
          <li><strong>核对维度</strong> — 系统自动从模板提取或使用默认维度，可手动增删或点击「AI 推荐维度」补充。</li>
          <li><strong>生成小结</strong> — 点击「生成小结」，AI 将根据笔录内容为每位受访者按维度生成结构化小结。</li>
          <li><strong>导出结果</strong> — 点击「导出小结 Excel」，有模板则保留原样式回填，无模板则新建标准表。</li>
        </ol>
      </div>
    </section>
  );
}
