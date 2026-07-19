import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { db } from "./db";
import { generateSummaryWithAi, getAiHealth, suggestDimensionsWithAi, type AiHealth } from "./aiClient";
import { useStore } from "./store";
import type { Interview, Project, Respondent } from "./types";
import type { SummaryRun, SummaryTemplate } from "./types";

const defaultDimensions = [
  "购买动机",
  "使用痛点",
  "价格态度",
  "品牌认知",
  "使用场景",
  "尝试意愿",
];

interface SummaryRow {
  respondentId: string;
  respondentCode: string;
  dimensions: Array<{ name: string; content: string }>;
}

export function SummaryPage() {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<string[]>(
    [],
  );
  const [dimensions, setDimensions] = useState<string[]>(defaultDimensions);
  const [newDimension, setNewDimension] = useState("");
  const [generating, setGenerating] = useState(false);
  const [summaries, setSummaries] = useState<SummaryRow[] | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [error, setError] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");

  const addToast = useStore((s) => s.addToast);

  // 进入页面时主动检测一次 AI 服务状态
  useEffect(() => {
    let active = true;
    getAiHealth()
      .then((h) => {
        if (active) setAiHealth(h);
      })
      .catch(() => {
        if (active) setAiHealth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const projects = useLiveQuery(
    () => db.projects.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );

  const allInterviews = useLiveQuery(() => db.interviews.toArray(), [], []);

  const interviews = useLiveQuery(
    async () => {
      if (!selectedProjectId) return [];
      const items = await db.interviews
        .where("projectId")
        .equals(selectedProjectId)
        .toArray();
      return items.filter((i) => i.transcriptStatus === "已确认");
    },
    [selectedProjectId],
    [],
  );

  const respondents = useLiveQuery(
    () =>
      selectedProjectId
        ? db.respondents.where("projectId").equals(selectedProjectId).toArray()
        : Promise.resolve([] as Respondent[]),
    [selectedProjectId],
    [],
  );
  const summaryTemplate = useLiveQuery(
    async () =>
      selectedProjectId
        ? await db.summaryTemplates
            .where("projectId")
            .equals(selectedProjectId)
            .first()
        : undefined,
    [selectedProjectId],
  );
  const summaryRuns: SummaryRun[] = useLiveQuery(
    async (): Promise<SummaryRun[]> => selectedProjectId ? db.summaryRuns.where("projectId").equals(selectedProjectId).reverse().sortBy("createdAt") : [],
    [selectedProjectId],
    [],
  );

  const segments = useLiveQuery(
    async () => {
      if (selectedInterviewIds.length === 0) return [];
      return db.segments
        .where("interviewId")
        .anyOf(selectedInterviewIds)
        .toArray();
    },
    [selectedInterviewIds],
    [],
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const selectedInterviews = useMemo<Interview[]>(
    () => interviews.filter((i) => selectedInterviewIds.includes(i.id)),
    [interviews, selectedInterviewIds],
  );

  const involvedRespondents = useMemo<Respondent[]>(() => {
    const ids = new Set(
      selectedInterviews
        .map((i) => i.respondentId)
        .filter((v): v is string => Boolean(v)),
    );
    return respondents.filter((r) => ids.has(r.id));
  }, [selectedInterviews, respondents]);

  // 表格列：按受访者编号排序
  const columnRespondents = useMemo<SummaryRow[]>(() => {
    if (!summaries) return [];
    return [...summaries].sort((a, b) =>
      a.respondentCode.localeCompare(b.respondentCode, "zh"),
    );
  }, [summaries]);

  function selectProject(id: string) {
    setSelectedProjectId(id);
    setSelectedInterviewIds([]);
    setSummaries(null);
    setError("");
  }

  function backToProjects() {
    setSelectedProjectId("");
    setSelectedInterviewIds([]);
    setSummaries(null);
    setError("");
  }

  function toggleInterview(id: string) {
    setSelectedInterviewIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

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

  function getContent(respondentId: string, dimName: string): string {
    const row = summaries?.find((s) => s.respondentId === respondentId);
    if (!row) return "";
    const dim = row.dimensions.find((d) => d.name === dimName);
    return dim?.content || "";
  }

  function updateContent(respondentId: string, dimName: string, content: string) {
    setSummaries((current) => current?.map((row) => row.respondentId !== respondentId ? row : ({
      ...row,
      dimensions: row.dimensions.map((dimension) => dimension.name === dimName ? { ...dimension, content } : dimension),
    })) || null);
  }

  async function importTemplate(file?: File) {
    if (!file || !selectedProjectId) return;
    setTemplateBusy(true);
    setError("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames.includes("定性小结")
        ? "定性小结"
        : workbook.SheetNames[0];
      if (!sheetName) throw new Error("Excel 中没有可读取的工作表");
      const ws = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      let headerRow0 = 0;
      let dimensionCol0 = 0;
      for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          const value = String(cell?.v ?? cell?.w ?? "").trim();
          if (value.includes("分析维度")) {
            headerRow0 = r;
            dimensionCol0 = c;
          }
        }
      }
      const headerRow = headerRow0 + 1;
      const dimensionColumn = dimensionCol0 + 1;
      const respondentColumns: Array<{ column: number; label: string }> = [];
      for (let c = dimensionCol0 + 1; c <= range.e.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow0, c })];
        const label = String(cell?.v ?? cell?.w ?? "").trim();
        if (!label || label === "★" || label.includes("备注")) break;
        if (/受访者|^[PR]\d+/i.test(label))
          respondentColumns.push({ column: c + 1, label });
      }
      if (!respondentColumns.length)
        throw new Error(
          "未识别到受访者列，请确认表头包含 P1/P2 或“受访者”字样",
        );
      const dimensions: Array<{ row: number; name: string }> = [];
      for (let r = headerRow0 + 1; r <= range.e.r; r += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: dimensionCol0 })];
        const name = String(cell?.v ?? cell?.w ?? "").trim();
        if (
          name &&
          !name.includes("填写说明") &&
          !dimensions.some((item) => item.name === name)
        )
          dimensions.push({ row: r + 1, name });
      }
      if (!dimensions.length) throw new Error("未识别到分析维度行");
      const duplicateNames = dimensions.map((item) => item.name).filter((name, index, list) => list.indexOf(name) !== index);
      const warnings = [
        ...new Set(duplicateNames.map((name) => `存在重复分析维度：${name}`)),
        ...(respondentColumns.length < 2 ? ["模板受访者列少于 2 列，批量导出时可能不足"] : []),
      ];
      const item: SummaryTemplate = {
        id: summaryTemplate?.id || crypto.randomUUID(),
        projectId: selectedProjectId,
        name: file.name.replace(/\.xlsx?$/i, ""),
        fileName: file.name,
        sheetName,
        dimensionColumn,
        respondentColumns,
        dimensions,
        headerRow,
        validationWarnings: warnings,
        fileData: data,
        createdAt: new Date().toISOString(),
      };
      if (summaryTemplate) await db.summaryTemplates.put(item);
      else await db.summaryTemplates.add(item);
      setDimensions(dimensions.map((entry) => entry.name));
      setSummaries(null);
      addToast(
        `已导入模板：${dimensions.length} 个维度，${respondentColumns.length} 个受访者列`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "模板解析失败";
      setError(message);
      addToast(message, "error");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function handleGenerate() {
    if (!selectedProject) return;
    if (selectedInterviewIds.length === 0) {
      addToast("请至少选择一份访谈", "info");
      return;
    }
    if (dimensions.length === 0) {
      addToast("请至少保留一个分析维度", "info");
      return;
    }
    if (!aiHealth?.configured) {
      addToast("AI 服务暂不可用，请稍后重试", "error");
      return;
    }
    const confirmed = window.confirm(
      `将把选中的 ${selectedInterviewIds.length} 份访谈笔录发送至AI 服务生成访谈小结，是否继续？`,
    );
    if (!confirmed) return;

    setGenerating(true);
    setError("");
    setSummaries(null);
    const jobId = crypto.randomUUID();
    setActiveJobId(jobId);
    await db.aiJobs.put({
      id: jobId, projectId: selectedProject.id, kind: "summary", status: "running", progress: 10, attempts: 1,
      input: JSON.stringify({ interviewIds: selectedInterviewIds, dimensions }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    try {
      const response = await generateSummaryWithAi(
        selectedProject,
        involvedRespondents,
        selectedInterviews,
        segments,
        dimensions,
      );
      const rows: SummaryRow[] = response.data?.summaries || [];
      if (rows.length === 0) throw new Error("AI 未返回可用的小结内容");
      setSummaries(rows);
      const createdAt = new Date().toISOString();
      await db.aiJobs.update(jobId, { status: "completed", progress: 100, output: JSON.stringify(rows), updatedAt: createdAt });
      const previousVersion = Math.max(0, ...summaryRuns.map((run) => run.version));
      await db.summaryRuns.add({
        id: crypto.randomUUID(), projectId: selectedProject.id, version: previousVersion + 1, model: response.model,
        interviewIds: selectedInterviewIds, dimensions, summaries: JSON.stringify(rows), status: "草稿", createdAt,
      });
      addToast(`${response.model} 已生成 ${rows.length} 位受访者的访谈小结`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "生成小结失败";
      setError(msg);
      await db.aiJobs.update(jobId, { status: "failed", error: msg, updatedAt: new Date().toISOString() });
      addToast("生成小结失败", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function oneClickGenerate() {
    if (!selectedProject) return;
    if (interviews.length === 0) {
      addToast("该项目暂无已确认笔录", "info");
      return;
    }
    if (!aiHealth?.configured) {
      addToast("AI 服务暂不可用，请稍后重试", "error");
      return;
    }
    const allIds = interviews.map((i) => i.id);
    setSelectedInterviewIds(allIds);
    if (dimensions.length === 0) {
      addToast("请至少保留一个分析维度", "info");
      return;
    }
    const confirmed = window.confirm(
      `将自动选中全部 ${allIds.length} 份已确认访谈，按 ${dimensions.length} 个维度一键生成访谈小结，是否继续？`,
    );
    if (!confirmed) return;

    setGenerating(true);
    setError("");
    setSummaries(null);
    const jobId = crypto.randomUUID();
    setActiveJobId(jobId);
    const selectedInterviews = interviews;
    const involvedRespondents = respondents.filter((r) =>
      selectedInterviews.some((i) => i.respondentId === r.id),
    );
    const allSegments = await db.segments
      .where("interviewId")
      .anyOf(allIds)
      .toArray();
    await db.aiJobs.put({
      id: jobId, projectId: selectedProject.id, kind: "summary", status: "running", progress: 10, attempts: 1,
      input: JSON.stringify({ interviewIds: allIds, dimensions }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    try {
      const response = await generateSummaryWithAi(
        selectedProject,
        involvedRespondents,
        selectedInterviews,
        allSegments,
        dimensions,
      );
      const rows: SummaryRow[] = response.data?.summaries || [];
      if (rows.length === 0) throw new Error("AI 未返回可用的小结内容");
      setSummaries(rows);
      const createdAt = new Date().toISOString();
      await db.aiJobs.update(jobId, { status: "completed", progress: 100, output: JSON.stringify(rows), updatedAt: createdAt });
      const previousVersion = Math.max(0, ...summaryRuns.map((run) => run.version));
      await db.summaryRuns.add({
        id: crypto.randomUUID(), projectId: selectedProject.id, version: previousVersion + 1, model: response.model,
        interviewIds: allIds, dimensions, summaries: JSON.stringify(rows), status: "草稿", createdAt,
      });
      addToast(`${response.model} 已生成 ${rows.length} 位受访者的访谈小结，可前往洞察分析或定性报告继续`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "生成小结失败";
      setError(msg);
      await db.aiJobs.update(jobId, { status: "failed", error: msg, updatedAt: new Date().toISOString() });
      addToast("生成小结失败", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function aiSuggestDimensions() {
    if (!selectedProject) return;
    if (!aiHealth?.configured) {
      addToast("AI 服务暂不可用", "error");
      return;
    }
    setTemplateBusy(true);
    try {
      const response = await suggestDimensionsWithAi(selectedProject);
      const suggested = response.data?.dimensions || [];
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

  async function exportExcel() {
    if (!summaries || summaries.length === 0) return;
    if (summaryTemplate) {
      if (columnRespondents.length > summaryTemplate.respondentColumns.length) {
        addToast(
          `模板只有 ${summaryTemplate.respondentColumns.length} 个受访者列，当前结果有 ${columnRespondents.length} 位`,
          "error",
        );
        return;
      }
      const wb = XLSX.read(summaryTemplate.fileData, { type: "array" });
      const ws = wb.Sheets[summaryTemplate.sheetName];
      if (!ws) {
        addToast("模板工作表已损坏", "error");
        return;
      }
      summaryTemplate.dimensions.forEach((dimension) => {
        columnRespondents.forEach((respondent, index) => {
          const cellAddress = XLSX.utils.encode_cell({
            r: dimension.row - 1,
            c: summaryTemplate.respondentColumns[index].column - 1,
          });
          const content =
            getContent(respondent.respondentId, dimension.name) ||
            "本次访谈未涉及";
          const existing = ws[cellAddress] || {};
          existing.t = "s";
          existing.v = content;
          ws[cellAddress] = existing;
        });
      });
      const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${selectedProject?.name || "项目"}-${summaryTemplate.name}-访谈小结.xlsx`,
      );
      addToast("已按导入模板导出 Excel");
      return;
    }
    const header: string[] = [
      "分析维度",
      ...columnRespondents.map((r) => r.respondentCode),
    ];
    const body: string[][] = dimensions.map((dim) => [
      dim,
      ...columnRespondents.map((r) => getContent(r.respondentId, dim)),
    ]);
    const aoa: string[][] = [header, ...body];
    const wbPlain = XLSX.utils.book_new();
    const wsPlain = XLSX.utils.aoa_to_sheet(aoa);
    wsPlain["!cols"] = [{ wch: 14 }, ...columnRespondents.map(() => ({ wch: 50 }))];
    XLSX.utils.book_append_sheet(wbPlain, wsPlain, "定性小结");
    const buf = XLSX.write(wbPlain, { type: "array", bookType: "xlsx" });
    const projectName = selectedProject?.name || "项目";
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `${projectName}-访谈小结.xlsx`,
    );
    addToast("Excel 已导出");
  }

  async function downloadSampleTemplate() {
    try {
      const resp = await fetch("/templates/summary_template.xlsx");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      saveAs(
        blob,
        "访谈小结示例模板.xlsx",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "下载示例模板失败";
      addToast(msg, "error");
    }
  }

  const aiOnline = !!aiHealth?.configured;

  return (
    <section className="space-y-6">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <span>结果交付</span>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">访谈小结</span>
      </nav>

      <div>
        <h1 className="text-3xl font-bold text-slate-950">访谈小结整理</h1>
        <p className="mt-2 text-slate-500">
          选择项目与已确认笔录，自定义分析维度，由 AI
          为每位受访者逐维度生成访谈小结，支持表格预览与 Excel 导出。
        </p>
      </div>

      {/* AI 健康状态提示 */}
      <div
        className={`rounded-xl border p-3 text-sm ${
          aiOnline
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {aiOnline
          ? `AI 服务已连接（${aiHealth?.model}），可生成访谈小结。`
          : "AI 服务暂不可用，请稍后重试；笔录整理和人工编辑仍可继续使用。"}
      </div>

      {!selectedProjectId ? (
        <ProjectSelector
          projects={projects}
          allInterviews={allInterviews}
          onSelect={selectProject}
        />
      ) : (
        <>
          {/* 项目标题 + 返回 */}
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm text-slate-500">
                {selectedProject?.researchType}
              </p>
              <h2 className="text-2xl font-bold text-slate-950">
                {selectedProject?.name}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                {selectedProject?.objective}
              </p>
            </div>
            <button className="btn-ghost" onClick={backToProjects}>
              返回项目选择
            </button>
          </div>

          {/* 访谈选择区 */}
          <div className="card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">
                选择访谈（仅显示已确认笔录）
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <button
                  className="btn-ghost"
                  onClick={() =>
                    setSelectedInterviewIds(interviews.map((i) => i.id))
                  }
                >
                  全选
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setSelectedInterviewIds([])}
                >
                  清空
                </button>
                <span className="text-slate-500">
                  已选 {selectedInterviewIds.length}/{interviews.length}
                </span>
              </div>
            </div>

            {interviews.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                该项目暂无已确认笔录的访谈，请先在
                <Link
                  to="/correction"
                  className="font-medium text-brand-700 hover:underline"
                >
                  {" "}
                  笔录校正{" "}
                </Link>
                中完成确认。
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {interviews.map((i) => {
                  const respondent = respondents.find(
                    (r) => r.id === i.respondentId,
                  );
                  const checked = selectedInterviewIds.includes(i.id);
                  return (
                    <label
                      key={i.id}
                      className={`cursor-pointer rounded-lg border p-3 transition ${
                        checked
                          ? "border-brand-500 bg-brand-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInterview(i.id)}
                          className="mt-1 accent-brand-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {i.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {respondent?.code || "未关联受访者"} ·{" "}
                            {i.sourceType} · {i.interviewDate || "未填日期"}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* 分析维度编辑区 */}
          <div className="card p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Excel 小结模板与分析维度
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  导入模板后自动读取“分析维度”行和受访者列，生成结果会按原样式回填导出。
                </p>
              </div>
              <label className="btn-ghost cursor-pointer whitespace-nowrap">
                {templateBusy
                  ? "解析中..."
                  : summaryTemplate
                    ? "更换模板"
                    : "导入 Excel 模板"}
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={templateBusy}
                  className="hidden"
                  onChange={(event) =>
                    void importTemplate(event.target.files?.[0])
                  }
                />
              </label>
            </div>
            {summaryTemplate && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{summaryTemplate.name}</b> ·{" "}
                    {summaryTemplate.dimensions.length} 个维度 ·{" "}
                    {summaryTemplate.respondentColumns.length} 个受访者列
                  </span>
                  <button
                    className="text-xs font-medium text-red-600"
                    onClick={() =>
                      void db.summaryTemplates.delete(summaryTemplate.id)
                    }
                  >
                    移除模板
                  </button>
                </div>
                <p className="mt-1 text-xs text-green-700">
                  工作表：{summaryTemplate.sheetName}；受访者列：
                  {summaryTemplate.respondentColumns
                    .map((item) => item.label)
                    .join("、")}
                </p>
                {!!summaryTemplate.validationWarnings?.length && <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">{summaryTemplate.validationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              </div>
            )}
            {!summaryTemplate && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                支持 qual-excel
                结构：左侧为分析维度，右侧每列一位受访者；将保留原模板的表头、颜色、列宽、行高、合并单元格和冻结窗格。
                <button
                  type="button"
                  className="ml-2 font-medium text-brand-700 underline"
                  onClick={() => void downloadSampleTemplate()}
                >
                  下载示例模板
                </button>
              </div>
            )}
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
                <span className="text-sm text-slate-400">
                  暂无维度，请在下方添加。
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="input flex-1"
                placeholder="输入新维度名称，如：决策因素"
                value={newDimension}
                onChange={(e) => setNewDimension(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDimension();
                  }
                }}
              />
              <button className="btn-ghost" onClick={addDimension}>
                添加维度
              </button>
              <button
                className="btn-ghost"
                disabled={templateBusy || !aiOnline}
                onClick={() => void aiSuggestDimensions()}
              >
                {templateBusy ? "推荐中..." : "AI 推荐维度"}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setDimensions(defaultDimensions)}
              >
                恢复默认
              </button>
            </div>
          </div>

          {/* 生成小结 */}
          <div className="card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                已选{" "}
                <span className="font-semibold text-slate-900">
                  {selectedInterviewIds.length}
                </span>{" "}
                份访谈 ·{" "}
                <span className="font-semibold text-slate-900">
                  {dimensions.length}
                </span>{" "}
                个维度 · 涉及{" "}
                <span className="font-semibold text-slate-900">
                  {involvedRespondents.length}
                </span>{" "}
                位受访者
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost"
                  disabled={generating || interviews.length === 0 || !aiOnline}
                  onClick={() => void oneClickGenerate()}
                >
                  一键小结
                </button>
                <button
                  className="btn-primary"
                  disabled={
                    generating ||
                    selectedInterviewIds.length === 0 ||
                    dimensions.length === 0 ||
                    !aiOnline
                  }
                  onClick={() => void handleGenerate()}
                >
                  {generating ? "生成中..." : "生成小结"}
                </button>
              </div>
            </div>

            {generating && (
              <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
                AI 正在为 {selectedInterviewIds.length}{" "}
                份访谈生成小结，请稍候（任务 {activeJobId.slice(0, 8)} 已持久化，失败后可重新生成）...
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                生成失败：{error}
              </div>
            )}
          </div>

          {/* 结果预览 + 导出 */}
          {summaries && summaries.length > 0 && (
            <div className="card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold">小结预览</h3>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/insights/${selectedProjectId}`}
                    className="btn-ghost"
                  >
                    前往洞察分析
                  </Link>
                  <Link
                    to={`/reports/${selectedProjectId}`}
                    className="btn-ghost"
                  >
                    前往定性报告
                  </Link>
                  <button
                    className="btn-primary"
                    onClick={() => void exportExcel()}
                  >
                    导出 Excel
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                访谈小结已生成，可继续前往「洞察分析」生成跨访谈洞察，或前往「定性报告」一键生成研究报告。
              </div>
              <p className="mt-1 text-sm text-slate-500">
                行=分析维度，列=受访者（共 {columnRespondents.length}{" "}
                位）。单元格内容已保留换行。
              </p>
              {summaryRuns.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>历史版本：</span>{summaryRuns.slice(0, 6).map((run) => <button key={run.id} className="chip bg-slate-100" onClick={() => setSummaries(JSON.parse(run.summaries))}>v{run.version} · {new Date(run.createdAt).toLocaleString()}</button>)}</div>}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                        分析维度
                      </th>
                      {columnRespondents.map((r) => (
                        <th
                          key={r.respondentId}
                          className="min-w-[240px] border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700"
                        >
                          {r.respondentCode}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dimensions.map((dim) => (
                      <tr key={dim}>
                        <td className="sticky left-0 z-10 border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800">
                          {dim}
                        </td>
                        {columnRespondents.map((r) => {
                          const content = getContent(r.respondentId, dim);
                          return (
                            <td
                              key={r.respondentId}
                              className="border border-slate-200 px-3 py-2 align-top text-slate-700"
                            >
                              {content ? (
                                <textarea className="min-h-[160px] w-full resize-y bg-transparent text-sm outline-none" value={content} onChange={(event) => updateContent(r.respondentId, dim, event.target.value)} />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
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
        </>
      )}
    </section>
  );
}

function ProjectSelector({
  projects,
  allInterviews,
  onSelect,
}: {
  projects: Project[];
  allInterviews: Interview[];
  onSelect: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-6 text-center text-sm text-slate-600">
        还没有项目，先去
        <Link
          to="/upload"
          className="font-medium text-brand-700 hover:underline"
        >
          {" "}
          录音转写{" "}
        </Link>
        导入访谈资料吧。
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const confirmedCount = allInterviews.filter(
          (i) => i.projectId === p.id && i.transcriptStatus === "已确认",
        ).length;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="card p-5 text-left transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
              <span
                className={`badge ${
                  confirmedCount > 0
                    ? "bg-green-50 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {confirmedCount > 0 ? `${confirmedCount} 份已确认` : "无已确认"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{p.researchType}</p>
            <p className="mt-3 line-clamp-2 text-xs text-slate-500">
              {p.objective}
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-brand-700">
              进入整理 →
            </span>
          </button>
        );
      })}
    </div>
  );
}
