import type {
  CorrectionLevel,
  CorrectionSuggestion,
  Insight,
  Interview,
  Project,
  Quote,
  Respondent,
  Segment,
  Term,
} from "./types";

// 对外部署时由环境变量指向托管代理，浏览器永远不接触AI API Key。
// 同源部署模式（Worker + Assets）：VITE_AI_API_URL 留空，前端走相对路径 /api
// 本地开发模式：指向本机 Python 代理 http://127.0.0.1:8766
const BASE_URL = ((import.meta.env.VITE_AI_API_URL || "/api") as string).replace(/\/$/, "");

// ============================================================
// 用户 AI 配置（localStorage 存储）
// ============================================================

export interface UserAiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: string;
}

const STORAGE_KEY = "researchbox-ai-config";

export function getUserAiConfig(): UserAiConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.apiKey) return null;
    return {
      apiKey: parsed.apiKey,
      model: parsed.model || "deepseek-v4-flash",
      baseUrl: parsed.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      provider: parsed.provider || "dashscope",
    };
  } catch {
    return null;
  }
}

export function setUserAiConfig(config: UserAiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearUserAiConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 检查用户是否配置了自己的 API Key
 */
export function hasUserApiKey(): boolean {
  return !!getUserAiConfig()?.apiKey;
}

/**
 * 构造请求头，附加用户 AI 配置
 */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const config = getUserAiConfig();
  if (config) {
    headers["X-User-API-Key"] = config.apiKey;
    headers["X-User-Model"] = config.model;
    headers["X-User-Base-URL"] = config.baseUrl;
  }
  return headers;
}

/**
 * 是否为云环境（AI 代理跑在 Cloudflare Worker 上）
 *
 * 同源部署模式：VITE_AI_API_URL 留空（走 /api 相对路径）→ 视为云环境
 * 本地开发模式：VITE_AI_API_URL 指向 127.0.0.1/localhost → 视为本地环境
 * 显式云端：VITE_AI_API_URL 指向非 localhost 的完整 URL → 视为云环境
 */
export function isCloudEnvironment(): boolean {
  const url = import.meta.env.VITE_AI_API_URL as string | undefined;
  if (!url || url === "/api") return true;  // 同源相对路径 = 云端统一部署
  return !url.includes("127.0.0.1") && !url.includes("localhost");
}

/**
 * 是否启用本地专用功能（缩略图、原生模板渲染）
 *
 * 这些功能需要 LibreOffice / Node.js subprocess，只能在本地 Python 代理上运行。
 * Worker 环境下应隐藏相关 UI 入口。
 */
export function isLocalOnlyFeatureAvailable(): boolean {
  return !isCloudEnvironment();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: buildHeaders(init?.headers as Record<string, string> | undefined),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((body as { detail?: string }).detail || `AI 服务返回 ${response.status}`);
    }
    if ((body as { __streamError?: boolean }).__streamError) {
      throw new Error((body as { detail?: string }).detail || "AI 服务流式任务失败");
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("报告生成已取消");
    }
    throw error;
  }
}

export interface AiHealth {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string;
}
export const getAiHealth = () => request<AiHealth>("/health");

/**
 * 测试 AI 连接（使用用户配置的 API Key）
 * 在设置页面点击"测试连接"时调用
 */
export async function testAiConnection(config: UserAiConfig): Promise<{
  ok: boolean;
  message: string;
  model?: string;
}> {
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      method: "GET",
      headers: {
        "X-User-API-Key": config.apiKey,
        "X-User-Model": config.model,
        "X-User-Base-URL": config.baseUrl,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { ok: false, message: body.detail || `HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: true,
      message: `连接成功 · 模型：${config.model}`,
      model: config.model,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "连接失败",
    };
  }
}

export async function correctWithAi(
  text: string,
  level: CorrectionLevel,
  terms: Term[],
) {
  const response = await request<{
    data: {
      correctedText: string;
      suggestions: Omit<CorrectionSuggestion, "id" | "status">[];
    };
    model: string;
  }>("/correct", {
    method: "POST",
    body: JSON.stringify({
      text,
      level,
      terms: terms.map(({ term, aliases, description }) => ({
        term,
        aliases,
        description,
      })),
    }),
  });
  return {
    correctedText: response.data.correctedText,
    suggestions: (response.data.suggestions || []).map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      status: "待处理" as const,
    })),
    model: response.model,
  };
}

export async function analyzeInterviewWithAi(
  project: Project,
  interview: Interview,
  respondent: Respondent | undefined,
  segments: Segment[],
) {
  return request<{ data: any; model: string }>("/analyze/interview", {
    method: "POST",
    body: JSON.stringify({
      project,
      interview,
      respondent,
      segments: segments.map(({ id, role, text, correctedText, tags }) => ({
        id,
        role,
        text: correctedText || text,
        tags,
      })),
    }),
  });
}

export interface QuickReportContext {
  name?: string;
  description?: string;
  objective?: string;
  researchType?: string;
  targetGroup?: string;
  researchQuestions?: string;
  industry?: string;
}

export async function generateReportFromTranscriptsWithAi(
  transcripts: Array<{ fileName: string; content: string }>,
  context?: QuickReportContext,
) {
  return request<{
    data: { title: string; markdown: string };
    model: string;
  }>("/report/transcript", {
    method: "POST",
    body: JSON.stringify({
      project: context || {},
      transcripts: transcripts.map((t) => ({
        fileName: t.fileName,
        content: t.content.slice(0, 15000),
      })),
    }),
  });
}

// ====== 专业 PPT 报告生成（ppt2 架构，两步调用）======

/** 第一步：结构化洞察提取响应 */
export interface InsightPackResponse {
  data: Record<string, unknown>; // InsightPack JSON
  model: string;
  usage?: Record<string, unknown>;
}

/** 第二步：逐页规划响应 */
export interface SlidePlanResponse {
  data: {
    storyline: Record<string, unknown>;
    slides: Array<Record<string, unknown>>;
  };
  model: string;
  usage?: Record<string, unknown>;
}

export interface ReportOutlineSlide {
  slideId: string;
  slideType: string;
  chapterId?: string;
  chapterLabel?: string;
  title: string;
  coreMessage?: string;
  findingIds?: string[];
  evidenceSegmentIds?: string[];
  visualType?: string;
}

export interface ReportOutlineResponse {
  data: {
    storyline: Record<string, unknown>;
    outline: ReportOutlineSlide[];
  };
  model: string;
  usage?: Record<string, unknown>;
}

/** 报告生成选项 */
export interface ProReportOptions {
  reportLength?: "精简" | "标准" | "详细";
  style?: "咨询报告" | "学术研究" | "商业简报";
  includeQuotes?: boolean;
  preserveExpertVoice?: boolean;
}

/**
 * 第一步：从原始笔录提取结构化洞察。
 * 返回 InsightPack JSON（researchContext, topics, findings, painPoints, causes,
 * opportunities, recommendations, contradictions, informationGaps）。
 */
export async function extractInsightsWithAi(
  transcripts: Array<{ fileName: string; content: string }>,
  context?: QuickReportContext,
  signal?: AbortSignal,
): Promise<InsightPackResponse> {
  return request<InsightPackResponse>("/report/extract-insights", {
    method: "POST",
    signal,
    body: JSON.stringify({
      project: context || {},
      transcripts: transcripts.map((t) => ({
        fileName: t.fileName,
        content: t.content,
      })),
    }),
  });
}

// ============================================================
// 分批并行提取洞察（长笔录加速）
// ============================================================

/** 每批笔录份数：控制单次请求的 token 量，兼顾并发与稳定性 */
export const MAX_TRANSCRIPT_CHARS = 9_000;
// 18k 是 qwen3.7-plus 在当前线上延迟下更稳妥的输入上限。
export const MAX_INSIGHT_BATCH_CHARS = 18_000;
const MAX_CONCURRENT_BATCHES = 3;

export interface InsightTranscriptChunk {
  fileName: string;
  content: string;
}

/** 在段落边界附近切片，确保完整笔录全部进入分析且单片不超过上限。 */
export function splitInsightTranscript(
  transcript: { fileName: string; content: string },
): InsightTranscriptChunk[] {
  const content = transcript.content;
  if (!content.trim()) return [];

  const rawParts: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    const remaining = content.length - offset;
    if (remaining <= MAX_TRANSCRIPT_CHARS) {
      rawParts.push(content.slice(offset));
      break;
    }

    const hardEnd = offset + MAX_TRANSCRIPT_CHARS;
    const softStart = offset + Math.floor(MAX_TRANSCRIPT_CHARS * 0.6);
    const paragraphBreak = content.lastIndexOf("\n", hardEnd);
    const splitAt = paragraphBreak >= softStart ? paragraphBreak + 1 : hardEnd;
    rawParts.push(content.slice(offset, splitAt));
    offset = splitAt;
  }

  return rawParts.map((part, index) => ({
    fileName: rawParts.length === 1
      ? transcript.fileName
      : `${transcript.fileName} [片段 ${index + 1}/${rawParts.length}]`,
    content: part,
  }));
}

/** 按真实发送字符数装箱；切片后不会再静默截断任何笔录内容。 */
export function createInsightBatches(
  transcripts: Array<{ fileName: string; content: string }>,
): InsightTranscriptChunk[][] {
  // First-fit decreasing：重新组合切片可减少尾块浪费；批次之间没有顺序依赖。
  const chunks = transcripts.flatMap(splitInsightTranscript)
    .sort((a, b) => b.content.length - a.content.length);
  const batches: InsightTranscriptChunk[][] = [];
  for (const chunk of chunks) {
    const target = batches.find((batch) =>
      batch.reduce((sum, item) => sum + item.content.length, 0) + chunk.content.length
        <= MAX_INSIGHT_BATCH_CHARS
    );
    if (target) {
      target.push(chunk);
    } else {
      batches.push([chunk]);
    }
  }
  return batches;
}

/** 合并多批 InsightPack，并重写批次内引用 ID。 */
function mergeInsightPacks(
  packs: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    researchContext: {
      projectName: "",
      researchObjective: "",
      respondentProfile: "",
      industry: "",
    },
    topics: [],
    findings: [],
    painPoints: [],
    causes: [],
    opportunities: [],
    recommendations: [],
    contradictions: [],
    informationGaps: [],
  };

  const mTopics = merged.topics as unknown[];
  const mFindings = merged.findings as unknown[];
  const mPain = merged.painPoints as unknown[];
  const mCauses = merged.causes as unknown[];
  const mOpp = merged.opportunities as unknown[];
  const mRecs = merged.recommendations as unknown[];
  const mContra = merged.contradictions as unknown[];
  const mGaps = merged.informationGaps as string[];
  const rc = merged.researchContext as Record<string, string>;

  const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const prefixIds = (ids: unknown, p: string): string[] =>
    asArr(ids).map((x) => `${p}${String(x)}`);

  packs.forEach((pack, bi) => {
    if (!pack || typeof pack !== "object") return;
    const p = `b${bi + 1}_`;

    // researchContext：字段级取首个非空值
    const ctx = (pack.researchContext || {}) as Record<string, unknown>;
    for (const key of ["projectName", "researchObjective", "respondentProfile", "industry"]) {
      if (!rc[key] && typeof ctx[key] === "string" && ctx[key]) {
        rc[key] = ctx[key] as string;
      }
    }

    // topics
    for (const t of asArr(pack.topics)) {
      const o = t as Record<string, unknown>;
      mTopics.push({ ...o, topicId: `${p}${String(o.topicId ?? "")}` });
    }

    // findings / painPoints / causes / opportunities：结构相同，统一重写
    const remapFinding = (f: unknown) => {
      const o = f as Record<string, unknown>;
      const quotes = asArr(o.quotes).map((q) => {
        const qo = q as Record<string, unknown>;
        return { ...qo, segmentId: qo.segmentId ? `${p}${String(qo.segmentId)}` : "" };
      });
      return {
        ...o,
        findingId: `${p}${String(o.findingId ?? "")}`,
        topicId: o.topicId ? `${p}${String(o.topicId)}` : "",
        evidenceSegmentIds: prefixIds(o.evidenceSegmentIds, p),
        quotes,
      };
    };
    for (const f of asArr(pack.findings)) mFindings.push(remapFinding(f));
    for (const f of asArr(pack.painPoints)) mPain.push(remapFinding(f));
    for (const f of asArr(pack.causes)) mCauses.push(remapFinding(f));
    for (const f of asArr(pack.opportunities)) mOpp.push(remapFinding(f));

    // recommendations
    for (const r of asArr(pack.recommendations)) {
      const o = r as Record<string, unknown>;
      mRecs.push({
        ...o,
        id: `${p}${String(o.id ?? "")}`,
        relatedFindingIds: prefixIds(o.relatedFindingIds, p),
      });
    }

    // contradictions
    for (const c of asArr(pack.contradictions)) {
      const o = c as Record<string, unknown>;
      mContra.push({ ...o, findingIds: prefixIds(o.findingIds, p) });
    }

    // informationGaps：直接拼接
    for (const g of asArr(pack.informationGaps)) {
      if (typeof g === "string" && g.trim()) mGaps.push(g);
    }
  });

  // informationGaps 去重
  merged.informationGaps = Array.from(new Set(mGaps));

  return merged;
}

/** 汇总多批 usage（token 计数求和） */
function mergeUsage(
  usages: Array<Record<string, unknown> | undefined>,
): Record<string, unknown> {
  const out: Record<string, number> = {};
  for (const u of usages) {
    if (!u) continue;
    for (const [k, v] of Object.entries(u)) {
      if (typeof v === "number") out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

/**
 * 分批并行提取洞察：笔录较多时，按字符体量切成多个批次并行调用，
 * 最后在前端合并成一份完整 InsightPack，大幅缩短总耗时。
 * 笔录份数不超过阈值时退化为单次调用。
 *
 * @param onProgress 可选进度回调 (已完成批次, 总批次)
 */
export async function extractInsightsBatched(
  transcripts: Array<{ fileName: string; content: string }>,
  context?: QuickReportContext,
  onProgress?: (done: number, total: number, phase?: "extracting" | "retrying") => void,
  signal?: AbortSignal,
): Promise<InsightPackResponse> {
  const batches = createInsightBatches(transcripts);
  const total = batches.length;
  if (total === 0) throw new Error("笔录内容为空，无法生成报告");

  let done = 0;
  onProgress?.(0, total, "extracting");
  const results: Array<InsightPackResponse | undefined> = new Array(total);
  const errors: Array<Error | undefined> = new Array(total);
  let progressPhase: "extracting" | "retrying" = "extracting";

  async function processBatch(index: number): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      results[index] = await extractInsightsWithAi(batches[index], context, signal);
      errors[index] = undefined;
      done += 1;
      onProgress?.(done, total, progressPhase);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors[index] = error instanceof Error ? error : new Error(String(error));
    }
  }

  // 首轮失败后不再原样重放重批次：拆成不超过 9k 的片段，逐片串行提取后再合并。
  async function retryBatchInSmallerPieces(index: number): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const pieceResults: InsightPackResponse[] = [];
      for (const piece of batches[index]) {
        pieceResults.push(await extractInsightsWithAi([piece], context, signal));
      }
      results[index] = {
        data: mergeInsightPacks(pieceResults.map((result) => result.data)),
        model: pieceResults[0]?.model || "",
        usage: mergeUsage(pieceResults.map((result) => result.usage)),
      };
      errors[index] = undefined;
      done += 1;
      onProgress?.(done, total, "retrying");
    } catch (error) {
      if (signal?.aborted) throw error;
      errors[index] = error instanceof Error ? error : new Error(String(error));
    }
  }

  async function runIndices(indices: number[], concurrency: number): Promise<void> {
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < indices.length) {
        const index = indices[cursor++];
        await processBatch(index);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, indices.length) }, () => worker()),
    );
  }

  const allIndices = batches.map((_, index) => index);
  await runIndices(allIndices, MAX_CONCURRENT_BATCHES);

  // 已成功的批次保留，只对失败批次定向重试一次，并降低重试并发。
  const failedIndices = allIndices.filter((index) => !results[index]);
  if (failedIndices.length > 0) {
    progressPhase = "retrying";
    onProgress?.(done, total, "retrying");
    for (const index of failedIndices) {
      await retryBatchInSmallerPieces(index);
    }
  }

  const remainingFailures = allIndices.filter((index) => !results[index]);
  if (remainingFailures.length > 0) {
    const firstError = errors[remainingFailures[0]]?.message || "未知错误";
    throw new Error(
      `洞察提取有 ${remainingFailures.length}/${total} 批失败；成功批次已保留。最后错误：${firstError}`,
    );
  }

  const completed = results as InsightPackResponse[];
  const mergedData = mergeInsightPacks(completed.map((result) => result.data));
  const mergedUsage = mergeUsage(completed.map((result) => result.usage));
  return { data: mergedData, model: completed[0]?.model || "", usage: mergedUsage };
}

/** 第二步统一规划跨访谈故事线，并完成各批洞察的聚合。 */
export async function planSlidesWithAi(
  insightPack: Record<string, unknown>,
  options?: ProReportOptions,
  signal?: AbortSignal,
): Promise<SlidePlanResponse> {
  return request<SlidePlanResponse>("/report/plan-slides", {
    method: "POST",
    signal,
    body: JSON.stringify({
      insightPack,
      options: options || {},
    }),
  });
}

export async function planReportOutlineWithAi(
  insightPack: Record<string, unknown>,
  options?: ProReportOptions,
): Promise<ReportOutlineResponse> {
  return request<ReportOutlineResponse>("/report/plan-outline", {
    method: "POST",
    body: JSON.stringify({ insightPack, options: options || {} }),
  });
}

export async function generateSlidesFromOutlineWithAi(
  insightPack: Record<string, unknown>,
  outline: ReportOutlineSlide[],
): Promise<{ data: { slides: Array<Record<string, unknown>> }; model: string; usage?: Record<string, unknown> }> {
  return request("/report/generate-slide-batch", {
    method: "POST",
    body: JSON.stringify({ insightPack, outline }),
  });
}

// ====== 第四阶段：预览与质检 API ======

/** 缩略图渲染响应 */
export interface ThumbnailsResponse {
  thumbnails: string[];  // base64 编码的 PNG
  slideCount: number;
  pdfBase64: string;  // base64 编码的 PDF
}

/** QA 质检响应 */
export interface QACheckResponse {
  results: Array<{
    slideId: string;
    slideType: string;
    score: number;
    issues: Array<{
      type: string;
      severity: "high" | "medium" | "low";
      description: string;
      suggestion: string;
    }>;
    recommendation: "ok" | "optimize" | "fix" | "switch_template";
  }>;
  overallScore: number;
  summary: string;
  totalIssues: number;
  highIssues: number;
  mediumIssues: number;
}

/** 单页重新生成响应 */
export interface RegenerateSlideResponse {
  data: Record<string, unknown>;
  model: string;
}

/**
 * 渲染缩略图：将 SlidePlan[] 渲染为 PPTX 并转为 PNG 缩略图。
 * 后端流程：PPTX → LibreOffice 转 PDF → PyMuPDF 转 PNG
 */
export async function renderThumbnails(
  slides: Array<Record<string, unknown>>,
): Promise<ThumbnailsResponse> {
  return request<ThumbnailsResponse>("/report/render-thumbnails", {
    method: "POST",
    body: JSON.stringify({ slides }),
  });
}

/**
 * 规则质检：对 SlidePlan[] 执行 13 项规则检查。
 */
export async function qaCheckSlides(
  slides: Array<Record<string, unknown>>,
): Promise<QACheckResponse> {
  return request<QACheckResponse>("/report/qa-check", {
    method: "POST",
    body: JSON.stringify({ slides }),
  });
}

/**
 * 单页重新生成：基于 InsightPack 重新生成单个 slide。
 * AI 保持 slideType 不变，只调整内容。
 */
export async function regenerateSlide(
  insightPack: Record<string, unknown>,
  currentSlide: Record<string, unknown>,
  feedback?: string,
): Promise<RegenerateSlideResponse> {
  return request<RegenerateSlideResponse>("/report/regenerate-slide", {
    method: "POST",
    body: JSON.stringify({
      insightPack,
      currentSlide,
      feedback: feedback || "",
    }),
  });
}

// ====== 第五阶段：原生模板能力 ======

/** 原生模板元信息 */
export interface NativeTemplateMeta {
  templateId: string;
  name: string;
  fileName: string;
  slideTypes: string[];
  description: string;
  slideCount: number;
  detectedPlaceholders: string[];
  isCustom: boolean;
  fileSize: number;
}

/** 列出原生模板响应 */
export interface NativeTemplatesResponse {
  templates: NativeTemplateMeta[];
  total: number;
}

/** 使用原生模板生成 PPT 的响应 */
export interface RenderNativeResponse {
  pptxBase64: string;
  slideCount: number;
  fileSize: number;
  stdout?: string;
}

/** 上传模板响应 */
export interface UploadTemplateResponse {
  templateId: string;
  fileName: string;
  fileSize: number;
  message: string;
}

/**
 * 列出所有可用的原生 PPT 模板
 */
export async function listNativeTemplates(): Promise<NativeTemplatesResponse> {
  return request<NativeTemplatesResponse>("/report/native-templates", {
    method: "GET",
  });
}

/**
 * 使用原生模板生成 PPT 报告
 *
 * @param slides SlidePlan[] 幻灯片规划
 * @param reportTitle 报告标题
 * @param reportAuthor 报告作者
 * @param reportDate 报告日期
 * @returns base64 编码的 PPTX 文件
 */
export async function renderNativePptx(
  slides: Record<string, unknown>[],
  reportTitle: string,
  reportAuthor?: string,
  reportDate?: string,
): Promise<RenderNativeResponse> {
  return request<RenderNativeResponse>("/report/render-native", {
    method: "POST",
    body: JSON.stringify({
      slides,
      reportTitle,
      reportAuthor: reportAuthor || "ResearchBox",
      reportDate: reportDate || "",
    }),
  });
}

/**
 * 上传企业自定义 PPT 模板
 *
 * @param file .pptx 模板文件
 * @returns 上传结果
 */
export async function uploadNativeTemplate(file: File): Promise<UploadTemplateResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const config = getUserAiConfig();
  const headers: Record<string, string> = {};
  if (config) {
    headers["X-User-API-Key"] = config.apiKey;
    headers["X-User-Model"] = config.model;
    headers["X-User-Base-URL"] = config.baseUrl;
  }

  const response = await fetch(`${BASE_URL}/report/upload-template`, {
    method: "POST",
    body: formData,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `上传失败：${response.status}`);
  }
  return response.json();
}

export async function analyzeProjectWithAi(
  project: Project,
  interviews: Interview[],
  respondents: Respondent[],
  segments: Segment[],
  quotes: Quote[],
) {
  return request<{
    data: {
      executiveSummary: string;
      insights: Array<{
        title: string;
        description: string;
        type: "主题聚合" | "痛点分析" | "需求分析";
        relatedTags: string[];
        segmentIds: string[];
        interviewIds: string[];
      }>;
    };
    model: string;
  }>("/analyze/project", {
    method: "POST",
    body: JSON.stringify({
      project,
      interviews,
      respondents,
      segments: segments.map(
        ({ id, interviewId, role, text, correctedText, tags }) => ({
          id,
          interviewId,
          role,
          text: correctedText || text,
          tags,
        }),
      ),
      quotes,
    }),
  });
}

export async function batchCodeWithAi(
  segments: Array<{ id: string; role: string; text: string; tags: string[] }>,
  availableTags: string[],
) {
  return request<{
    data: {
      newTags?: Array<{
        name: string;
        type: string;
        reason: string;
      }>;
      results: Array<{
        segmentId: string;
        suggestedTags: string[];
        reason: string;
      }>;
    };
    model: string;
  }>("/code/batch", {
    method: "POST",
    body: JSON.stringify({ segments, availableTags }),
  });
}

export interface SummaryStyleExample {
  // 风格样例：第一个用户/第一组 在各维度下的小结内容
  respondentCode: string;
  dimensions: Array<{ name: string; path?: string; content: string }>;
}

export interface SummaryDimensionSpec {
  name: string;
  path?: string;
}

export async function generateSummaryWithAi(
  project: Project,
  respondents: Respondent[],
  interviews: Interview[],
  segments: Segment[],
  dimensions: string[] | SummaryDimensionSpec[],
  styleExample?: SummaryStyleExample | null,
) {
  const dimSpecs: SummaryDimensionSpec[] = dimensions.map((d) =>
    typeof d === "string" ? { name: d } : d,
  );
  return request<{
    data: {
      summaries: Array<{
        respondentId: string;
        respondentCode: string;
        dimensions: Array<{
          name: string;
          content: string;
        }>;
      }>;
    };
    model: string;
  }>("/analyze/summary", {
    method: "POST",
    body: JSON.stringify({
      project,
      respondents,
      interviews,
      segments: segments.map(({ id, interviewId, role, text, correctedText }) => ({
        id,
        interviewId,
        role,
        text: correctedText || text,
      })),
      dimensions: dimSpecs,
      styleExample: styleExample || null,
    }),
  });
}

// AI 识别 Excel 小结模板结构（表头行/维度列/受访者列）
export async function recognizeTemplateWithAi(gridText: string) {
  return request<{
    data: {
      sheetName?: string;
      headerRow: number; // 1-based
      dimensionCols?: number[]; // 1-based 维度层级列
      dimensionCol?: number; // 1-based 单维度列
      leafDimensionCol?: number; // 1-based 末级维度列
      respondentCols: number[]; // 1-based 受访者/分组列
      kind?: "single" | "group";
    };
    model: string;
  }>("/analyze/template-structure", {
    method: "POST",
    body: JSON.stringify({ gridText }),
  });
}

export async function autoAssignRolesWithAi(
  segments: Array<{ id: string; speakerId: string; text: string }>,
  researchType: string,
) {
  return request<{
    data: {
      assignments: Array<{
        speakerId: string;
        role: string;
        reason: string;
      }>;
    };
    model: string;
  }>("/correct/roles", {
    method: "POST",
    body: JSON.stringify({ segments, researchType }),
  });
}

export async function generateTagsWithAi(
  project: Project,
  segments?: Array<{ id: string; role: string; text: string }>,
) {
  return request<{
    data: {
      tags: Array<{
        name: string;
        type: string;
        description: string;
      }>;
    };
    model: string;
  }>("/code/tags", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: project.name,
        description: project.description,
        objective: project.objective,
        researchType: project.researchType,
        targetGroup: project.targetGroup,
        researchQuestions: project.researchQuestions,
      },
      segments: segments || [],
    }),
  });
}

export async function suggestDimensionsWithAi(project: Project) {
  return request<{
    data: { dimensions: string[] };
    model: string;
  }>("/analyze/dimensions", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: project.name,
        objective: project.objective,
        researchType: project.researchType,
        targetGroup: project.targetGroup,
        researchQuestions: project.researchQuestions,
      },
    }),
  });
}

export async function generateReportWithAi(
  project: Project,
  insights: Insight[],
  quotes: Quote[],
  summaries: Array<{
    respondentCode: string;
    dimensions: Array<{ name: string; content: string }>;
  }>,
  interviews: Interview[],
  respondents: Respondent[],
  tags: Array<{ name: string; type: string; description?: string; usageCount: number }>,
  codedSegments: Array<{ text: string; role: string; tags: string[]; respondentCode?: string }>,
) {
  return request<{
    data: { title: string; markdown: string };
    model: string;
  }>("/report/generate", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: project.name,
        description: project.description,
        objective: project.objective,
        researchType: project.researchType,
        targetGroup: project.targetGroup,
        researchQuestions: project.researchQuestions,
        industry: project.industry,
      },
      insights: insights.map((i) => ({
        title: i.title,
        description: i.description,
        type: i.type,
        relatedTags: i.relatedTags,
        segmentIds: i.segmentIds || [],
        interviewIds: i.interviewIds || [],
      })),
      quotes: quotes.map((q) => ({
        text: q.text,
        respondentCode: q.respondentCode,
        tags: q.tags,
      })),
      summaries,
      interviews: interviews.map((i) => ({
        id: i.id,
        title: i.title,
        respondentId: i.respondentId,
      })),
      respondents: respondents.map((r) => ({
        code: r.code,
        nickname: r.nickname,
        gender: r.gender,
        ageRange: r.ageRange,
        city: r.city,
        userType: r.userType,
        tags: r.tags,
      })),
      tags: tags.map((t) => ({
        name: t.name,
        type: t.type,
        description: t.description,
        usageCount: t.usageCount,
      })),
      codedSegments: codedSegments.map((s) => ({
        text: s.text,
        role: s.role,
        tags: s.tags,
        respondentCode: s.respondentCode,
      })),
    }),
  });
}
