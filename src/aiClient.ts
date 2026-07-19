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
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `AI 服务返回 ${response.status}`);
  }
  return response.json();
}

export interface AiHealth {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string;
}
export const getAiHealth = () => request<AiHealth>("/health");

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
  }>("/report/generate-from-transcripts", {
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
): Promise<InsightPackResponse> {
  return request<InsightPackResponse>("/report/extract-insights", {
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

/**
 * 第二步：基于结构化洞察规划报告故事线和逐页内容。
 * 返回 { storyline, slides }，AI 只选 slideType 和填内容，不输出坐标。
 */
export async function planSlidesWithAi(
  insightPack: Record<string, unknown>,
  options?: ProReportOptions,
): Promise<SlidePlanResponse> {
  return request<SlidePlanResponse>("/report/plan-slides", {
    method: "POST",
    body: JSON.stringify({
      insightPack,
      options: options || {},
    }),
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

  const response = await fetch(`${BASE_URL}/report/upload-template`, {
    method: "POST",
    body: formData,
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

export async function generateSummaryWithAi(
  project: Project,
  respondents: Respondent[],
  interviews: Interview[],
  segments: Segment[],
  dimensions: string[],
) {
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
      dimensions,
    }),
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
