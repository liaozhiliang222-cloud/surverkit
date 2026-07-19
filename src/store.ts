import { create } from "zustand";
import {
  getAiHealth,
  hasUserApiKey,
  generateReportFromTranscriptsWithAi,
  extractInsightsWithAi,
  planSlidesWithAi,
  renderThumbnails,
  qaCheckSlides,
  regenerateSlide,
  listNativeTemplates,
  renderNativePptx,
  uploadNativeTemplate,
  type AiHealth,
  type QuickReportContext,
  type ProReportOptions,
  type QACheckResponse,
  type NativeTemplateMeta,
} from "./aiClient";
import { db, uid, now } from "./db";
import { safeParseInsightPack, type InsightPack } from "./ppt2/schemas/insight";
import { safeParseSlidePlans, type SlidePlan } from "./ppt2/schemas/slidePlan";
import type { Storyline } from "./ppt2/schemas/storyline";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export interface QuickReportResult {
  title: string;
  markdown: string;
  model: string;
}

type QuickReportStatus = "idle" | "generating" | "done" | "error";

/** 专业版报告生成阶段 */
type ProReportStage = "idle" | "extracting" | "planning" | "done" | "error";

interface AppState {
  aiHealth: AiHealth | null;
  aiLoading: boolean;
  toasts: ToastItem[];
  refreshHealth: () => Promise<void>;
  addToast: (message: string, type?: ToastItem["type"]) => void;
  removeToast: (id: string) => void;

  // 快速报告全局状态 —— 独立于组件生命周期，切换页面不会打断生成
  quickTranscripts: Array<{ fileName: string; content: string }>;
  quickStatus: QuickReportStatus;
  quickResult: QuickReportResult | null;
  quickError: string | null;
  quickStartedAt: number | null;
  quickContext: QuickReportContext;
  addQuickTranscripts: (files: Array<{ fileName: string; content: string }>) => void;
  removeQuickTranscript: (idx: number) => void;
  clearQuickTranscripts: () => void;
  updateQuickContext: (patch: Partial<QuickReportContext>) => void;
  startQuickReport: () => Promise<void>;
  resetQuickReport: () => void;

  // 专业版报告（ppt2 架构）状态
  proMode: boolean;                          // 是否启用专业版
  proStage: ProReportStage;                  // 当前生成阶段
  proError: string | null;
  proStartedAt: number | null;
  proInsightPack: InsightPack | null;        // 第一步输出
  proStoryline: Storyline | null;            // 第二步输出的故事线
  proSlides: SlidePlan[] | null;             // 第二步输出的逐页规划
  proOptions: ProReportOptions;              // 报告生成选项
  setProMode: (enabled: boolean) => void;
  updateProOptions: (patch: Partial<ProReportOptions>) => void;
  startProReport: () => Promise<void>;
  resetProReport: () => void;

  // 第四阶段：预览与质检
  thumbnails: string[] | null;             // base64 PNG 列表
  thumbnailLoading: boolean;
  thumbnailError: string | null;
  qaResult: QACheckResponse | null;
  qaLoading: boolean;
  regeneratingSlideId: string | null;
  generateThumbnails: () => Promise<void>;
  runQACheck: () => Promise<void>;
  regenerateSingleSlide: (slideId: string, feedback?: string) => Promise<void>;
  updateProSlide: (slideId: string, newSlide: Record<string, unknown>) => void;

  // 第五阶段：原生模板能力
  nativeTemplates: NativeTemplateMeta[] | null;   // 可用的原生模板列表
  nativeTemplateLoading: boolean;                 // 正在加载模板列表
  nativeRendering: boolean;                       // 正在使用原生模板渲染 PPT
  nativeTemplateError: string | null;
  loadNativeTemplates: () => Promise<void>;       // 加载模板列表
  renderWithNativeTemplate: () => Promise<void>;  // 使用原生模板生成并下载 PPT
  uploadCustomTemplate: (file: File) => Promise<void>;  // 上传自定义模板
}

let polling: ReturnType<typeof setInterval> | null = null;

export const useStore = create<AppState>((set, get) => ({
  aiHealth: null,
  aiLoading: true,
  toasts: [],

  refreshHealth: async () => {
    set({ aiLoading: true });
    try {
      const ai = await getAiHealth();
      set({ aiHealth: ai, aiLoading: false });
    } catch {
      set({ aiHealth: null, aiLoading: false });
    }
  },

  addToast: (message: string, type: ToastItem["type"] = "success") => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      get().removeToast(id);
    }, 3500);
  },

  removeToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  // ── 快速报告 ──
  quickTranscripts: [],
  quickStatus: "idle",
  quickResult: null,
  quickError: null,
  quickStartedAt: null,
  quickContext: {},

  addQuickTranscripts: (files) =>
    set((state) => ({ quickTranscripts: [...state.quickTranscripts, ...files] })),

  removeQuickTranscript: (idx) =>
    set((state) => ({
      quickTranscripts: state.quickTranscripts.filter((_, i) => i !== idx),
    })),

  clearQuickTranscripts: () => set({ quickTranscripts: [] }),

  updateQuickContext: (patch) =>
    set((state) => ({ quickContext: { ...state.quickContext, ...patch } })),

  resetQuickReport: () =>
    set({
      quickTranscripts: [],
      quickStatus: "idle",
      quickResult: null,
      quickError: null,
      quickStartedAt: null,
      quickContext: {},
    }),

  // ── 专业版报告（ppt2 架构）──
  proMode: false,
  proStage: "idle",
  proError: null,
  proStartedAt: null,
  proInsightPack: null,
  proStoryline: null,
  proSlides: null,
  proOptions: {
    reportLength: "标准",
    style: "咨询报告",
    includeQuotes: true,
    preserveExpertVoice: true,
  },

  // 第四阶段：预览与质检初始状态
  thumbnails: null,
  thumbnailLoading: false,
  thumbnailError: null,
  qaResult: null,
  qaLoading: false,
  regeneratingSlideId: null,

  // 第五阶段：原生模板能力
  nativeTemplates: null,
  nativeTemplateLoading: false,
  nativeRendering: false,
  nativeTemplateError: null,

  setProMode: (enabled) => set({ proMode: enabled }),

  updateProOptions: (patch) =>
    set((state) => ({ proOptions: { ...state.proOptions, ...patch } })),

  resetProReport: () =>
    set({
      proStage: "idle",
      proError: null,
      proStartedAt: null,
      proInsightPack: null,
      proStoryline: null,
      proSlides: null,
      thumbnails: null,
      thumbnailError: null,
      qaResult: null,
    }),

  // ====== 第四阶段：预览与质检 ======

  generateThumbnails: async () => {
    const { proSlides, aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (!proSlides || proSlides.length === 0) {
      addToast("没有可预览的页面", "error");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动", "error");
      return;
    }

    set({ thumbnailLoading: true, thumbnailError: null });
    addToast("正在生成页面缩略图...");

    try {
      const resp = await renderThumbnails(proSlides as unknown as Array<Record<string, unknown>>);
      set({ thumbnails: resp.thumbnails, thumbnailLoading: false });
      addToast(`已生成 ${resp.slideCount} 页缩略图`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "缩略图生成失败";
      set({ thumbnailLoading: false, thumbnailError: msg });
      addToast(`缩略图生成失败：${msg}`, "error");
    }
  },

  runQACheck: async () => {
    const { proSlides, aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (!proSlides || proSlides.length === 0) {
      addToast("没有可质检的页面", "error");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动", "error");
      return;
    }

    set({ qaLoading: true });
    addToast("正在执行规则质检...");

    try {
      const resp = await qaCheckSlides(proSlides as unknown as Array<Record<string, unknown>>);
      set({ qaResult: resp, qaLoading: false });
      addToast(`质检完成：平均分 ${resp.overallScore}，发现 ${resp.totalIssues} 个问题`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "质检失败";
      set({ qaLoading: false });
      addToast(`质检失败：${msg}`, "error");
    }
  },

  regenerateSingleSlide: async (slideId: string, feedback?: string) => {
    const { proSlides, proInsightPack, aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (!proSlides || !proInsightPack) {
      addToast("缺少洞察数据，无法重新生成", "error");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动", "error");
      return;
    }

    const targetSlide = proSlides.find(s => s.slideId === slideId);
    if (!targetSlide) {
      addToast(`未找到页面 ${slideId}`, "error");
      return;
    }

    set({ regeneratingSlideId: slideId });
    addToast(`正在重新生成第 ${proSlides.indexOf(targetSlide) + 1} 页...`);

    try {
      const resp = await regenerateSlide(
        proInsightPack as unknown as Record<string, unknown>,
        targetSlide as unknown as Record<string, unknown>,
        feedback,
      );

      // 更新对应 slide
      const newSlide = resp.data as unknown as SlidePlan;
      const updatedSlides = proSlides.map(s =>
        s.slideId === slideId ? { ...newSlide, slideId } : s
      );
      set({
        proSlides: updatedSlides,
        regeneratingSlideId: null,
        thumbnails: null,  // 清除旧缩略图
        qaResult: null,    // 清除旧质检结果
      });
      addToast("页面已重新生成");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重新生成失败";
      set({ regeneratingSlideId: null });
      addToast(`重新生成失败：${msg}`, "error");
    }
  },

  updateProSlide: (slideId: string, newSlide: Record<string, unknown>) => {
    const { proSlides } = get();
    if (!proSlides) return;
    const updatedSlides = proSlides.map(s =>
      s.slideId === slideId ? { ...s, ...(newSlide as Partial<SlidePlan>) } : s
    );
    set({ proSlides: updatedSlides, thumbnails: null, qaResult: null });
  },

  // ====== 第五阶段：原生模板能力 ======

  loadNativeTemplates: async () => {
    const { aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (!aiReady) {
      addToast("AI 服务未启动", "error");
      return;
    }

    set({ nativeTemplateLoading: true, nativeTemplateError: null });
    try {
      const resp = await listNativeTemplates();
      set({ nativeTemplates: resp.templates, nativeTemplateLoading: false });
      addToast(`已加载 ${resp.total} 个原生模板`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载模板失败";
      set({ nativeTemplateLoading: false, nativeTemplateError: msg });
      addToast(`加载模板失败：${msg}`, "error");
    }
  },

  renderWithNativeTemplate: async () => {
    const { proSlides, proStoryline, aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (!proSlides || proSlides.length === 0) {
      addToast("没有可导出的页面规划", "error");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动", "error");
      return;
    }

    set({ nativeRendering: true, nativeTemplateError: null });
    addToast("正在使用原生模板生成 PPT（可能需要 30-60 秒）...");

    try {
      const reportTitle = proStoryline?.reportTitle || "专业研究报告";
      const reportDate = new Date().toISOString().slice(0, 10);

      const resp = await renderNativePptx(
        proSlides as unknown as Array<Record<string, unknown>>,
        reportTitle,
        "ResearchBox",
        reportDate,
      );

      // 将 base64 转换为 Blob 并触发下载
      const binaryString = atob(resp.pptxBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });

      // 动态导入 file-saver
      const { saveAs } = await import("file-saver");
      saveAs(blob, `${reportTitle}（原生模板）.pptx`);

      set({ nativeRendering: false });
      addToast(`原生模板 PPT 已导出（${resp.slideCount} 页，${(resp.fileSize / 1024).toFixed(1)} KB）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "原生模板渲染失败";
      set({ nativeRendering: false, nativeTemplateError: msg });
      addToast(`原生模板渲染失败：${msg}`, "error");
    }
  },

  uploadCustomTemplate: async (file: File) => {
    const { addToast } = get();

    if (!file.name.endsWith(".pptx")) {
      addToast("只支持 .pptx 格式的模板文件", "error");
      return;
    }

    set({ nativeTemplateLoading: true, nativeTemplateError: null });
    addToast(`正在上传模板：${file.name}...`);

    try {
      const resp = await uploadNativeTemplate(file);
      set({ nativeTemplateLoading: false });
      addToast(resp.message);

      // 重新加载模板列表
      await get().loadNativeTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "模板上传失败";
      set({ nativeTemplateLoading: false, nativeTemplateError: msg });
      addToast(`模板上传失败：${msg}`, "error");
    }
  },

  startProReport: async () => {
    const { quickTranscripts, quickContext, aiHealth, proOptions, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (quickTranscripts.length === 0) {
      addToast("请先上传至少1份笔录文件", "info");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动，请在终端运行 npm run ai 后重试", "error");
      return;
    }

    set({
      proStage: "extracting",
      proError: null,
      proInsightPack: null,
      proStoryline: null,
      proSlides: null,
      proStartedAt: Date.now(),
    });
    addToast(`[专业版] 第1步：提取结构化洞察（${quickTranscripts.length} 份笔录）...`);

    try {
      // ===== 第一步：提取结构化洞察 =====
      const context = Object.values(quickContext).some((v) => v?.trim())
        ? quickContext
        : undefined;
      const insightResp = await extractInsightsWithAi(quickTranscripts, context);
      const insightParsed = safeParseInsightPack(insightResp.data);
      if (!insightParsed.success) {
        throw new Error(`洞察解析失败：${insightParsed.error}`);
      }
      set({ proInsightPack: insightParsed.data });
      addToast("[专业版] 第1步完成，开始第2步：规划报告故事线...");

      // ===== 第二步：规划故事线和逐页内容 =====
      set({ proStage: "planning" });
      const slideResp = await planSlidesWithAi(
        insightResp.data,
        proOptions,
      );

      // 解析 storyline（容错：部分模型可能将其嵌套在 data 中）
      const storylineData = (slideResp.data?.storyline || {}) as Record<string, unknown>;
      // 解析 slides（使用 Zod 校验）
      const slidesData = slideResp.data?.slides || [];
      const slidesParsed = safeParseSlidePlans({ slides: slidesData });
      if (!slidesParsed.success) {
        throw new Error(`页面规划解析失败：${slidesParsed.error}`);
      }

      set({
        proStage: "done",
        proStoryline: storylineData as unknown as Storyline,
        proSlides: slidesParsed.data,
      });
      addToast(`[专业版] 报告规划完成，共 ${slidesParsed.data.length} 页，可导出 PPT`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "专业版报告生成失败";
      set({ proStage: "error", proError: msg });
      addToast(`生成失败：${msg}`, "error");
    }
  },

  startQuickReport: async () => {
    const { quickTranscripts, quickContext, aiHealth, addToast } = get();
    const aiReady = aiHealth?.configured || hasUserApiKey();
    if (quickTranscripts.length === 0) {
      addToast("请先上传至少1份笔录文件", "info");
      return;
    }
    if (!aiReady) {
      addToast("AI 服务未启动，请在终端运行 npm run ai 后重试", "error");
      return;
    }
    // 如果有已完成的旧结果，保留笔录但覆盖结果
    set({ quickStatus: "generating", quickError: null, quickResult: null, quickStartedAt: Date.now() });
    addToast(`正在分析 ${quickTranscripts.length} 份笔录，预计需要 30-60 秒...`);
    try {
      const context = Object.values(quickContext).some((v) => v?.trim())
        ? quickContext
        : undefined;
      const response = await generateReportFromTranscriptsWithAi(quickTranscripts, context);
      const md = response.data?.markdown || "";
      if (!md) throw new Error("AI 未返回报告内容，请重试");
      const result: QuickReportResult = {
        title: response.data?.title || "快速研究报告",
        markdown: md,
        model: response.model,
      };
      // 自动保存到数据库（不关联项目）
      const timestamp = now();
      await db.reports.add({
        id: uid("report"),
        projectId: "",
        title: result.title,
        markdown: md,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      set({ quickStatus: "done", quickResult: result });
      addToast("报告已生成，可导出或继续编辑");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 报告生成失败";
      set({ quickStatus: "error", quickError: msg });
      addToast(`生成失败：${msg}`, "error");
    }
  },
}));

export function startHealthPolling() {
  if (polling) return;
  useStore.getState().refreshHealth();
  polling = setInterval(() => {
    useStore.getState().refreshHealth();
  }, 15000);
}

export function stopHealthPolling() {
  if (polling) {
    clearInterval(polling);
    polling = null;
  }
}
