import { useRef, useState, useEffect } from "react";
import { useStore } from "./store";
import { exportResearchPptx } from "./p2Services";
import { generateProReportPptx } from "./ppt2/pptGenerator";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { now } from "./db";
import type { Project, ResearchType, ProjectStatus } from "./types";
import { isLocalOnlyFeatureAvailable, hasUserApiKey } from "./aiClient";

function isCloudMode(): boolean {
  const url = (import.meta as any).env?.VITE_AI_API_URL;
  return !url || url === "/api" || (!url.includes("127.0.0.1") && !url.includes("localhost"));
}

function isAiReady(aiHealth: any): boolean {
  if (hasUserApiKey()) return true;
  if (aiHealth?.configured) return true;
  if (aiHealth === null && isCloudMode()) return true;
  return false;
}

export default function QuickReportPage() {
  const {
    quickTranscripts,
    quickStatus,
    quickResult,
    quickError,
    quickStartedAt,
    quickContext,
    aiHealth,
    addQuickTranscripts,
    removeQuickTranscript,
    clearQuickTranscripts,
    updateQuickContext,
    startQuickReport,
    resetQuickReport,
    addToast,
    // 专业版状态
    proMode,
    proStage,
    proError,
    proStartedAt,
    proInsightPack,
    proStoryline,
    proSlides,
    proOptions,
    setProMode,
    updateProOptions,
    startProReport,
    resetProReport,
    // 第四阶段：预览与质检
    thumbnails,
    thumbnailLoading,
    thumbnailError,
    qaResult,
    qaLoading,
    regeneratingSlideId,
    generateThumbnails,
    runQACheck,
    regenerateSingleSlide,
    // 第五阶段：原生模板能力
    nativeTemplates,
    nativeTemplateLoading,
    nativeRendering,
    nativeTemplateError,
    loadNativeTemplates,
    renderWithNativeTemplate,
    uploadCustomTemplate,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [proElapsed, setProElapsed] = useState(0);
  const [proExporting, setProExporting] = useState(false);
  const [showNativeTemplates, setShowNativeTemplates] = useState(false);

  // 生成中计时
  useEffect(() => {
    if (quickStatus !== "generating" || !quickStartedAt) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - quickStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [quickStatus, quickStartedAt]);

  // 专业版生成计时
  useEffect(() => {
    if ((proStage !== "extracting" && proStage !== "planning") || !proStartedAt) {
      setProElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setProElapsed(Math.floor((Date.now() - proStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [proStage, proStartedAt]);

  // 结果更新时同步编辑框
  useEffect(() => {
    if (quickResult) {
      setEditedMarkdown(quickResult.markdown);
      setEditMode(false);
    }
  }, [quickResult]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    setUploading(true);
    try {
      const parsed: Array<{ fileName: string; content: string }> = [];
      for (const file of Array.from(files)) {
        let content = "";
        if (/\.docx$/i.test(file.name)) {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({
            arrayBuffer: await file.arrayBuffer(),
          });
          content = result.value;
        } else if (
          /\.md$/i.test(file.name) ||
          /\.txt$/i.test(file.name) ||
          file.type.startsWith("text")
        ) {
          content = await file.text();
        } else {
          addToast(`不支持的文件类型: ${file.name}`, "error");
          continue;
        }
        if (content.trim()) parsed.push({ fileName: file.name, content });
      }
      if (parsed.length > 0) {
        addQuickTranscripts(parsed);
        addToast(`已添加 ${parsed.length} 份笔录`);
      } else {
        addToast("未解析到有效内容", "info");
      }
    } catch {
      addToast("笔录解析失败", "error");
    } finally {
      setUploading(false);
    }
  }

  function exportMarkdown() {
    const md = editMode ? editedMarkdown : quickResult?.markdown || "";
    if (!md) return;
    saveAs(
      new Blob([md], { type: "text/markdown;charset=utf-8" }),
      `${quickResult?.title || "快速研究报告"}.md`,
    );
  }

  async function exportDocx() {
    const md = editMode ? editedMarkdown : quickResult?.markdown || "";
    if (!md) return;
    const doc = new Document({
      sections: [
        {
          children: md.split("\n").map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line.replace(/^#+\s*/, ""),
                    bold: line.startsWith("#"),
                  }),
                ],
                spacing: { after: 120 },
              }),
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${quickResult?.title || "快速研究报告"}.docx`);
  }

  async function exportPptx() {
    const md = editMode ? editedMarkdown : quickResult?.markdown || "";
    if (!md) return;
    const fakeProject: Project = {
      id: "quick",
      workspaceId: "workspace_default",
      name: quickResult?.title || "快速研究报告",
      description: "",
      researchType: (quickContext.researchType || "用户访谈") as ResearchType,
      objective: quickContext.objective || "",
      industry: quickContext.industry || "",
      targetGroup: quickContext.targetGroup || "",
      researchQuestions: "",
      owner: "",
      status: "进行中" as ProjectStatus,
      createdAt: now(),
      updatedAt: now(),
    };
    try {
      await exportResearchPptx(
        fakeProject,
        [], [], [], undefined, true, [], [], [], md,
      );
      addToast("PPT 已导出");
    } catch (e) {
      addToast(`PPT 导出失败：${e instanceof Error ? e.message : "未知错误"}`, "error");
    }
  }

  async function exportProPptx() {
    if (!proSlides || proSlides.length === 0) {
      addToast("没有可导出的页面规划", "error");
      return;
    }
    setProExporting(true);
    try {
      const fileName = (proStoryline?.reportTitle || "专业研究报告") + ".pptx";
      await generateProReportPptx(proSlides, {
        download: true,
        autoCompress: true,
        fileName,
      });
      addToast(`专业版 PPT 已导出（${proSlides.length} 页）`);
    } catch (e) {
      addToast(`PPT 导出失败：${e instanceof Error ? e.message : "未知错误"}`, "error");
    } finally {
      setProExporting(false);
    }
  }

  async function handleTemplateUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    await uploadCustomTemplate(file);
  }

  async function handleNativeRender() {
    // 首次使用时加载模板列表
    if (!nativeTemplates) {
      await loadNativeTemplates();
    }
    await renderWithNativeTemplate();
  }

  const isGenerating = quickStatus === "generating";
  const hasResult = !!(quickStatus === "done" && quickResult);
  const totalChars = quickTranscripts.reduce((s, t) => s + t.content.length, 0);

  // 专业版状态
  const isProGenerating = proStage === "extracting" || proStage === "planning";
  const hasProResult = proStage === "done" && proSlides && proSlides.length > 0;
  const proStageLabel =
    proStage === "extracting" ? "提取结构化洞察" :
    proStage === "planning" ? "规划报告故事线" :
    proStage === "done" ? "规划完成" :
    proStage === "error" ? "生成失败" : "待开始";
  const isBusy = (proMode ? isProGenerating : isGenerating) || uploading;
  const localOnly = isLocalOnlyFeatureAvailable();

  return (
    <section className="mx-auto max-w-4xl">
      {/* 标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">快速报告</h1>
        <p className="mt-1 text-sm text-slate-500">
          上传多份访谈笔录，一键生成含结构化图表的定性研究报告。无需创建项目，切换页面不会打断生成。
        </p>
      </div>

      {/* 模式切换：经典版 vs 专业版 */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            !proMode ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => setProMode(false)}
          disabled={isBusy}
        >
          经典版
          <span className="ml-1 text-xs text-slate-400">Markdown → PPT</span>
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            proMode ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => setProMode(true)}
          disabled={isBusy}
        >
          专业版
          <span className="ml-1 text-xs text-slate-400">模板化 · 咨询报告风格</span>
        </button>
      </div>

      {/* 专业版选项 */}
      {proMode && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">
              <span className="mb-1 block text-slate-500">报告篇幅</span>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={proOptions.reportLength || "标准"}
                onChange={(e) => updateProOptions({ reportLength: e.target.value as "精简" | "标准" | "详细" })}
                disabled={isBusy}
              >
                <option value="精简">精简（6-8页）</option>
                <option value="标准">标准（10-12页）</option>
                <option value="详细">详细（14-16页）</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-500">报告风格</span>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={proOptions.style || "咨询报告"}
                onChange={(e) => updateProOptions({ style: e.target.value as "咨询报告" | "学术研究" | "商业简报" })}
                disabled={isBusy}
              >
                <option value="咨询报告">咨询报告</option>
                <option value="学术研究">学术研究</option>
                <option value="商业简报">商业简报</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={proOptions.includeQuotes !== false}
                onChange={(e) => updateProOptions({ includeQuotes: e.target.checked })}
                disabled={isBusy}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-slate-600">保留专家原话</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={proOptions.preserveExpertVoice !== false}
                onChange={(e) => updateProOptions({ preserveExpertVoice: e.target.checked })}
                disabled={isBusy}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-slate-600">生成原话页</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            专业版采用两步 AI 调用：先提取结构化洞察，再规划报告故事线和逐页内容，AI 不直接生成坐标，布局由模板控制。
          </p>
        </div>
      )}

      {/* 步骤指示器 */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        <StepBadge n={1} label="上传笔录" active={quickTranscripts.length === 0 && !hasResult} done={quickTranscripts.length > 0} />
        <span className="text-slate-300">→</span>
        <StepBadge n={2} label="生成报告" active={isGenerating} done={hasResult === true} />
        <span className="text-slate-300">→</span>
        <StepBadge n={3} label="导出" active={hasResult === true} done={false} />
      </div>

      {/* Step 1: 上传区域 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">上传笔录</h2>
          {quickTranscripts.length > 0 && (
            <button
              className="text-xs text-slate-500 hover:text-red-500"
              onClick={() => clearQuickTranscripts()}
              disabled={isGenerating}
            >
              清空全部
            </button>
          )}
        </div>

        {/* 拖拽上传区 */}
        <div
          className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? "border-brand-500 bg-brand-50"
              : "border-slate-300 bg-slate-50 hover:border-brand-400"
          } ${isGenerating || uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg className="mx-auto mb-3 h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm font-medium text-slate-700">
            {uploading ? "解析中..." : "拖拽文件到此处或点击上传"}
          </p>
          <p className="mt-1 text-xs text-slate-400">支持 .txt / .md / .docx，可多选</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.docx,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 已上传文件列表 */}
        {quickTranscripts.length > 0 && (
          <div className="mt-4 space-y-2">
            {quickTranscripts.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{t.fileName}</p>
                  <p className="text-xs text-slate-400">{t.content.length.toLocaleString()} 字</p>
                </div>
                <button
                  className="ml-2 shrink-0 text-xs text-red-500 hover:text-red-600"
                  onClick={() => removeQuickTranscript(i)}
                  disabled={isGenerating}
                >
                  移除
                </button>
              </div>
            ))}
            <p className="text-right text-xs text-slate-400">
              共 {quickTranscripts.length} 份 · {totalChars.toLocaleString()} 字
            </p>
          </div>
        )}

        {/* 可选: 研究背景 */}
        <div className="mt-4">
          <button
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowContext(!showContext)}
          >
            <svg className={`h-4 w-4 transition ${showContext ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            研究背景（可选，帮助 AI 生成更精准的报告）
          </button>
          {showContext && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ContextInput
                label="研究主题"
                value={quickContext.name || ""}
                onChange={(v) => updateQuickContext({ name: v })}
                placeholder="如：常温短保奶新品概念测试"
              />
              <ContextInput
                label="研究类型"
                value={quickContext.researchType || ""}
                onChange={(v) => updateQuickContext({ researchType: v })}
                placeholder="如：用户访谈、焦点小组"
              />
              <ContextInput
                label="研究目标"
                value={quickContext.objective || ""}
                onChange={(v) => updateQuickContext({ objective: v })}
                placeholder="如：识别购买动机与价格阻碍"
              />
              <ContextInput
                label="目标人群"
                value={quickContext.targetGroup || ""}
                onChange={(v) => updateQuickContext({ targetGroup: v })}
                placeholder="如：年轻家庭用户、精致妈妈"
              />
              <ContextInput
                label="所属行业"
                value={quickContext.industry || ""}
                onChange={(v) => updateQuickContext({ industry: v })}
                placeholder="如：乳品 / 快消"
              />
            </div>
          )}
        </div>

        {/* 生成按钮 */}
        <button
          className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          disabled={quickTranscripts.length === 0 || isBusy}
          onClick={() => void (proMode ? startProReport() : startQuickReport())}
        >
          {proMode
            ? isProGenerating
              ? `[${proStageLabel}] AI 分析中... ${proElapsed > 0 ? `(${proElapsed}s)` : ""}`
              : `生成专业版报告${quickTranscripts.length > 0 ? `（${quickTranscripts.length} 份笔录）` : ""}`
            : isGenerating
              ? `AI 分析笔录中... ${elapsed > 0 ? `(${elapsed}s)` : ""}`
              : `一键生成报告${quickTranscripts.length > 0 ? `（${quickTranscripts.length} 份笔录）` : ""}`}
        </button>
      </div>

      {/* 专业版生成中提示 */}
      {proMode && isProGenerating && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            <div>
              <p className="text-sm font-medium text-brand-800">
                {proStageLabel}... {proElapsed > 0 && `已用时 ${proElapsed} 秒`}
              </p>
              <p className="text-xs text-brand-600">
                {proStage === "extracting"
                  ? "正在从笔录中提取主题、发现、痛点、原因、机会和建议"
                  : "正在规划报告故事线、选择页面版式、填写每页内容"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 专业版错误提示 */}
      {proMode && proStage === "error" && proError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">专业版生成失败</p>
          <p className="mt-1 text-xs text-red-600">{proError}</p>
          <button
            className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            onClick={() => void startProReport()}
          >
            重试
          </button>
        </div>
      )}

      {/* 专业版结果 */}
      {proMode && hasProResult && proSlides && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-slate-950">
                {proStoryline?.reportTitle || "专业研究报告"}
              </h2>
              {proStoryline?.reportSubtitle && (
                <p className="mt-1 text-sm text-slate-500">{proStoryline.reportSubtitle}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                共 {proSlides.length} 页 · 故事线：{proStoryline?.storyLogic || "现状—问题—原因—机会—建议"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {localOnly && (
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:bg-slate-100"
                  onClick={() => void generateThumbnails()}
                  disabled={thumbnailLoading}
                  title="本地专用功能（需要 LibreOffice）"
                >
                  {thumbnailLoading ? "生成中..." : "生成缩略图"}
                </button>
              )}
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:bg-slate-100"
                onClick={() => void runQACheck()}
                disabled={qaLoading}
              >
                {qaLoading ? "质检中..." : "规则质检"}
              </button>
              <button
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"
                onClick={() => void exportProPptx()}
                disabled={proExporting}
              >
                {proExporting ? "导出中..." : "导出 PPTX"}
              </button>
              {localOnly && (
                <button
                  className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:bg-slate-100"
                  onClick={() => void handleNativeRender()}
                  disabled={nativeRendering}
                  title="本地专用功能（使用企业 PPT 模板）"
                >
                  {nativeRendering ? "渲染中..." : "原生模板导出"}
                </button>
              )}
              {localOnly && (
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    setShowNativeTemplates(!showNativeTemplates);
                    if (!nativeTemplates && !showNativeTemplates) {
                      void loadNativeTemplates();
                    }
                  }}
                >
                  模板管理
                </button>
              )}
            </div>
          </div>

          {!localOnly && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2">
              <p className="text-xs text-blue-700">
                云端模式：缩略图预览和原生模板渲染为本地专用功能，已隐藏。PPT 导出使用内置 PptxGenJS 模板（完全可编辑）。
              </p>
            </div>
          )}

          {/* 第五阶段：原生模板管理面板 */}
          {showNativeTemplates && (
            <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">原生 PPT 模板管理</h3>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50"
                    onClick={() => templateInputRef.current?.click()}
                    disabled={nativeTemplateLoading}
                  >
                    {nativeTemplateLoading ? "处理中..." : "+ 上传企业模板"}
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    onClick={() => void loadNativeTemplates()}
                    disabled={nativeTemplateLoading}
                  >
                    刷新
                  </button>
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".pptx"
                    className="hidden"
                    onChange={(e) => {
                      void handleTemplateUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {nativeTemplateError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2">
                  <p className="text-xs text-red-700">{nativeTemplateError}</p>
                </div>
              )}

              {nativeTemplateLoading && !nativeTemplates ? (
                <div className="flex items-center justify-center p-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                  <span className="ml-2 text-xs text-slate-500">加载模板列表...</span>
                </div>
              ) : nativeTemplates && nativeTemplates.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {nativeTemplates.map((tmpl) => (
                    <div
                      key={tmpl.templateId}
                      className={`rounded-lg border p-3 ${
                        tmpl.isCustom
                          ? "border-purple-200 bg-white"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {tmpl.name}
                            {tmpl.isCustom && (
                              <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">自定义</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{tmpl.description}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tmpl.slideTypes.map((st) => (
                              <span key={st} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                {st}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {(tmpl.fileSize / 1024).toFixed(1)} KB · {tmpl.fileName}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-sm text-slate-500">暂无原生模板</p>
                  <p className="mt-1 text-xs text-slate-400">
                    可以上传企业 PPT 模板，或运行 <code className="rounded bg-slate-100 px-1">npm run gen-templates</code> 生成内置模板
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">模板制作说明：</p>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                  <li>1. 在 PowerPoint 中设计模板，在文本框中写入占位符（如 <code className="rounded bg-white px-1">{`{{PAGE_TITLE}}`}</code>）</li>
                  <li>2. 支持的占位符：<code className="rounded bg-white px-1">{`{{PAGE_TITLE}}`}</code>、<code className="rounded bg-white px-1">{`{{CORE_MESSAGE}}`}</code>、<code className="rounded bg-white px-1">{`{{ITEM_1}}`}</code>~<code className="rounded bg-white px-1">{`{{ITEM_8}}`}</code>、<code className="rounded bg-white px-1">{`{{QUOTE_TEXT}}`}</code> 等</li>
                  <li>3. 保存为 .pptx 格式后上传，系统会自动替换占位符为实际内容</li>
                  <li>4. 模板中的样式、颜色、布局完全保留，AI 不干预视觉设计</li>
                </ul>
              </div>
            </div>
          )}

          {/* QA 质检结果摘要 */}
          {qaResult && (
            <div className={`mb-4 rounded-lg border p-3 ${
              qaResult.overallScore >= 80 ? "border-green-200 bg-green-50" :
              qaResult.overallScore >= 60 ? "border-yellow-200 bg-yellow-50" :
              "border-red-200 bg-red-50"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    质检得分：{qaResult.overallScore} / 100
                  </p>
                  <p className="text-xs text-slate-500">{qaResult.summary}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  {qaResult.highIssues > 0 && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">{qaResult.highIssues} 严重</span>
                  )}
                  {qaResult.mediumIssues > 0 && (
                    <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-700">{qaResult.mediumIssues} 中等</span>
                  )}
                  {qaResult.highIssues === 0 && qaResult.mediumIssues === 0 && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">✓ 无明显问题</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 缩略图预览 */}
          {thumbnailLoading && (
            <div className="mb-4 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
              <span className="ml-2 text-sm text-slate-500">正在生成缩略图...</span>
            </div>
          )}
          {thumbnailError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">缩略图生成失败：{thumbnailError}</p>
              <p className="mt-1 text-xs text-red-500">请确保已安装 LibreOffice 并启动 AI 服务</p>
            </div>
          )}
          {thumbnails && thumbnails.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-slate-500">页面缩略图预览（{thumbnails.length} 页）</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {thumbnails.map((thumb, idx) => {
                  const slideInfo = proSlides[idx];
                  const qaInfo = qaResult?.results.find(r => r.slideId === slideInfo?.slideId);
                  return (
                    <div key={idx} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <img
                        src={`data:image/png;base64,${thumb}`}
                        alt={`第 ${idx + 1} 页`}
                        className="w-full cursor-pointer"
                      />
                      <div className="absolute left-1 top-1 flex items-center gap-1">
                        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        {qaInfo && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
                            qaInfo.score >= 80 ? "bg-green-600" :
                            qaInfo.score >= 60 ? "bg-yellow-600" : "bg-red-600"
                          }`}>
                            {qaInfo.score}
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                        <p className="truncate text-[10px] text-white">
                          {slideInfo?.title || "(无标题)"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 洞察摘要 */}
          {proInsightPack && (
            <div className="mb-4 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">提取到的结构化洞察</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{proInsightPack.findings.length} 条发现</span>
                <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">{proInsightPack.painPoints.length} 个痛点</span>
                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-700">{proInsightPack.causes.length} 条原因</span>
                <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">{proInsightPack.opportunities.length} 个机会</span>
                <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">{proInsightPack.recommendations.length} 条建议</span>
                {proInsightPack.contradictions.length > 0 && (
                  <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-700">{proInsightPack.contradictions.length} 处冲突</span>
                )}
              </div>
            </div>
          )}

          {/* 页面规划列表 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">页面规划（{proSlides.length} 页）</p>
            {proSlides.map((slide, idx) => {
              const qaInfo = qaResult?.results.find(r => r.slideId === slide.slideId);
              const isRegenerating = regeneratingSlideId === slide.slideId;
              return (
                <div
                  key={slide.slideId || idx}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                    qaInfo?.recommendation === "switch_template" ? "border-red-200 bg-red-50/30" :
                    qaInfo?.recommendation === "fix" ? "border-orange-200 bg-orange-50/30" :
                    qaInfo?.recommendation === "optimize" ? "border-yellow-200 bg-yellow-50/30" :
                    "border-slate-100 bg-slate-50/50"
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                        {slide.slideType}
                      </span>
                      {slide.templateId && (
                        <span className="text-[10px] text-slate-400">{slide.templateId}</span>
                      )}
                      {qaInfo && (
                        <span className={`text-[10px] font-bold ${
                          qaInfo.score >= 80 ? "text-green-600" :
                          qaInfo.score >= 60 ? "text-yellow-600" : "text-red-600"
                        }`}>
                          QA: {qaInfo.score}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-700">
                      {slide.title || "(无标题)"}
                    </p>
                    {slide.coreMessage && (
                      <p className="truncate text-xs text-slate-400">{slide.coreMessage}</p>
                    )}
                    {/* QA 问题列表 */}
                    {qaInfo && qaInfo.issues.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {qaInfo.issues.slice(0, 2).map((issue, i) => (
                          <p key={i} className={`text-[10px] ${
                            issue.severity === "high" ? "text-red-600" :
                            issue.severity === "medium" ? "text-yellow-600" : "text-slate-500"
                          }`}>
                            [{issue.severity}] {issue.description}
                          </p>
                        ))}
                        {qaInfo.issues.length > 2 && (
                          <p className="text-[10px] text-slate-400">还有 {qaInfo.issues.length - 2} 个问题...</p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 单页重新生成按钮 */}
                  <button
                    className="shrink-0 rounded px-2 py-1 text-[10px] text-brand-600 hover:bg-brand-50 disabled:text-slate-300"
                    onClick={() => {
                      const feedback = prompt("可选：输入对该页的修改要求（留空则自动重新生成）");
                      void regenerateSingleSlide(slide.slideId, feedback || undefined);
                    }}
                    disabled={isRegenerating}
                    title="重新生成此页"
                  >
                    {isRegenerating ? "生成中..." : "↻ 重生成"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 底部操作 */}
          <div className="mt-4 flex items-center justify-between">
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => {
                if (confirm("开始新的专业版报告？当前规划将被清除。")) {
                  resetProReport();
                }
              }}
            >
              ↻ 重新规划
            </button>
            <p className="text-xs text-slate-400">AI 不生成坐标，布局由模板系统控制</p>
          </div>
        </div>
      )}

      {/* 经典版生成中提示 */}
      {!proMode && isGenerating && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            <div>
              <p className="text-sm font-medium text-brand-800">
                正在分析 {quickTranscripts.length} 份笔录... {elapsed > 0 && `已用时 ${elapsed} 秒`}
              </p>
              <p className="text-xs text-brand-600">
                可切换到其他页面查看数据，生成完成后回来即可查看结果
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 经典版错误提示 */}
      {!proMode && quickStatus === "error" && quickError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">生成失败</p>
          <p className="mt-1 text-xs text-red-600">{quickError}</p>
          <button
            className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            onClick={() => void startQuickReport()}
          >
            重试
          </button>
        </div>
      )}

      {/* 经典版生成结果 */}
      {!proMode && hasResult && quickResult && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-slate-950">{quickResult.title}</h2>
              <p className="mt-1 text-xs text-slate-400">
                由 {quickResult.model} 生成 · {quickResult.markdown.length.toLocaleString()} 字
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? "预览" : "编辑"}
              </button>
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => void exportMarkdown()}
              >
                导出 MD
              </button>
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => void exportDocx()}
              >
                导出 DOCX
              </button>
              <button
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                onClick={() => void exportPptx()}
              >
                导出 PPTX
              </button>
            </div>
          </div>

          {/* 报告内容 */}
          {editMode ? (
            <textarea
              className="h-[600px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={editedMarkdown}
              onChange={(e) => setEditedMarkdown(e.target.value)}
            />
          ) : (
            <div className="max-h-[600px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              <MarkdownPreview md={editMode ? editedMarkdown : quickResult.markdown} />
            </div>
          )}

          {/* 底部操作 */}
          <div className="mt-4 flex items-center justify-between">
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => {
                if (confirm("开始新的报告？当前结果将被清除（已保存到报告列表）。")) {
                  resetQuickReport();
                }
              }}
            >
              ↻ 生成新报告
            </button>
            <p className="text-xs text-slate-400">报告已自动保存到报告列表</p>
          </div>
        </div>
      )}

      {/* AI 服务状态 */}
      {!isAiReady(aiHealth) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">
            AI 服务暂不可用，请在设置页面配置 API Key
          </p>
        </div>
      )}
    </section>
  );
}

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
          done
            ? "bg-brand-600 text-white"
            : active
              ? "bg-brand-100 text-brand-700 ring-2 ring-brand-400"
              : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={`text-xs ${active ? "font-medium text-slate-700" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function ContextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function MarkdownPreview({ md }: { md: string }) {
  const html = renderMarkdown(md);
  return (
    <div
      className="prose prose-sm prose-slate max-w-none [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-900 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-700 [&_blockquote]:border-l-3 [&_blockquote]:border-brand-400 [&_blockquote]:bg-brand-50 [&_blockquote]:py-1 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-xs [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:text-slate-800 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inTable = false;
  let inCodeBlock = false;
  let inDiagramBlock = false;
  let diagramType = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        html += "</code></pre>";
        inCodeBlock = false;
      } else {
        html += "<pre><code>";
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      html += escapeHtml(line) + "\n";
      continue;
    }

    // 图形围栏
    if (trimmed.startsWith(":::")) {
      if (inDiagramBlock) {
        html += "</div>";
        inDiagramBlock = false;
        diagramType = "";
        continue;
      }
      const m = trimmed.match(/^:::\s*(\S+)/);
      if (m) {
        inDiagramBlock = true;
        diagramType = m[1];
        const labels: Record<string, string> = {
          pyramid: "金字塔图",
          flowchart: "流程图",
          "product-house": "产品屋",
          "decision-path": "购买决策路径",
          "experience-map": "用户体验地图",
        };
        html += `<div class="my-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3"><p class="mb-2 text-xs font-semibold text-brand-700">📊 ${labels[diagramType] || diagramType}</p>`;
        continue;
      }
    }
    if (inDiagramBlock) {
      if (trimmed) html += `<p class="text-xs text-slate-600">${escapeHtml(trimmed)}</p>`;
      continue;
    }

    // 表格
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) {
        html += '<table>';
        // 表头
        const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
        html += "<thead><tr>" + cells.map((c) => `<th>${escapeHtml(c)}</th>`).join("") + "</tr></thead><tbody>";
        inTable = true;
        // 跳过分隔行
        if (i + 1 < lines.length && /^\s*\|[\s-:|]+\|\s*$/.test(lines[i + 1])) {
          i++;
        }
        continue;
      } else {
        const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
        html += "<tr>" + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
        continue;
      }
    }
    if (inTable) {
      html += "</tbody></table>";
      inTable = false;
    }

    // 标题
    if (trimmed.startsWith("### ")) { html += `<h3>${escapeHtml(trimmed.slice(4))}</h3>`; continue; }
    if (trimmed.startsWith("## ")) { html += `<h2>${escapeHtml(trimmed.slice(3))}</h2>`; continue; }
    if (trimmed.startsWith("# ")) { html += `<h1>${escapeHtml(trimmed.slice(2))}</h1>`; continue; }

    // 引用
    if (trimmed.startsWith("> ")) {
      html += `<blockquote>${escapeHtml(trimmed.slice(2))}</blockquote>`;
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(trimmed)) {
      html += `<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
      continue;
    }

    // 空行
    if (!trimmed) { html += "<br/>"; continue; }

    // 普通段落
    html += `<p>${escapeHtml(trimmed)}</p>`;
  }
  if (inTable) html += "</tbody></table>";
  if (inCodeBlock) html += "</code></pre>";
  if (inDiagramBlock) html += "</div>";
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
