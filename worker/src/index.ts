/**
 * ResearchBox AI Proxy - Cloudflare Worker 主入口
 *
 * 替代 Python ai-proxy/main.py，提供 13 个 AI 端点。
 * 所有 AI 调用走百炼/OpenAI 兼容 API，密钥通过 Worker Secrets 保护。
 *
 * 端点列表：
 * - GET  /health                              健康检查
 * - POST /correct                             笔录校正
 * - POST /analyze/interview                   单访谈分析
 * - POST /analyze/project                     项目跨访谈分析
 * - POST /code/batch                          批量编码
 * - POST /analyze/summary                     维度小结
 * - POST /correct/roles                       角色识别
 * - POST /tags/suggest                        标签建议
 * - POST /dimensions/suggest                  维度建议
 * - POST /report/transcript                   快速报告（从笔录直接生成）
 * - POST /report/extract-insights             结构化洞察提取（专业版第一步）
 * - POST /report/plan-slides                  报告规划（专业版第二步）
 * - POST /report/regenerate-slide             单页重生成
 * - POST /report/qa-check                     规则质检（纯逻辑，不调 AI）
 */
import { chat, chatWithRetry, HttpError, errorResponse, successResponse, type Env } from "./lib/chat";
import {
  INSIGHT_SYSTEM_PROMPT, buildInsightUserPrompt,
  SLIDE_SYSTEM_PROMPT, buildSlideUserPrompt,
  CORRECT_SYSTEM_PROMPT, ANALYZE_INTERVIEW_SYSTEM_PROMPT,
  ANALYZE_PROJECT_SYSTEM_PROMPT, CODE_BATCH_SYSTEM_PROMPT,
  ANALYZE_SUMMARY_SYSTEM_PROMPT, AUTO_ROLES_SYSTEM_PROMPT,
  SUGGEST_TAGS_SYSTEM_PROMPT, SUGGEST_DIMENSIONS_SYSTEM_PROMPT,
  TRANSCRIPT_REPORT_SYSTEM_PROMPT,
} from "./lib/prompts";
import { checkSlides } from "./lib/qa";

// ====================================================================
// CORS 工具
// ====================================================================

function getAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS || "http://localhost:5173";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function corsHeaders(env: Env, requestOrigin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins(env);
  const origin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(env: Env, requestOrigin: string | null, data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, requestOrigin),
    },
  });
}

function errorJsonResponse(env: Env, requestOrigin: string | null, status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, requestOrigin),
    },
  });
}

// ====================================================================
// 鉴权
// ====================================================================

function checkAuth(env: Env, request: Request): void {
  if (env.AUTH_ENABLED !== "true") return;
  const token = env.AI_PROXY_TOKEN;
  if (!token) return;
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new HttpError(401, "未提供鉴权 token");
  }
  if (auth.slice(7) !== token) {
    throw new HttpError(401, "鉴权 token 无效");
  }
}

// ====================================================================
// 请求体解析
// ====================================================================

async function parseJsonBody(request: Request): Promise<Record<string, any>> {
  try {
    const text = await request.text();
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "请求体不是有效的 JSON");
  }
}

// ====================================================================
// 主入口
// ====================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const requestOrigin = request.headers.get("Origin");

    // CORS 预检
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, requestOrigin) });
    }

    // 路由分发
    try {
      // ====== 健康检查（无需鉴权）======
      if (path === "/health" && method === "GET") {
        return jsonResponse(env, requestOrigin, {
          ok: true,
          configured: !!env.DASHSCOPE_API_KEY,
          provider: "Cloudflare Worker",
          model: env.AI_MODEL || "deepseek-v4-flash",
          authEnabled: env.AUTH_ENABLED === "true",
        });
      }

      // 鉴权（除 health 外所有端点）
      checkAuth(env, request);

      // ====== 笔录校正 ======
      if (path === "/correct" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, CORRECT_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 单访谈分析 ======
      if (path === "/analyze/interview" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, ANALYZE_INTERVIEW_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 项目跨访谈分析 ======
      if (path === "/analyze/project" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, ANALYZE_PROJECT_SYSTEM_PROMPT, JSON.stringify(body), 0.15);
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 批量编码 ======
      if (path === "/code/batch" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, CODE_BATCH_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 维度小结 ======
      if (path === "/analyze/summary" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, ANALYZE_SUMMARY_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 角色识别 ======
      if (path === "/correct/roles" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, AUTO_ROLES_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 标签建议 ======
      if (path === "/tags/suggest" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, SUGGEST_TAGS_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 维度建议 ======
      if (path === "/dimensions/suggest" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chat(env, SUGGEST_DIMENSIONS_SYSTEM_PROMPT, JSON.stringify(body));
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 快速报告（从笔录直接生成 Markdown 报告）======
      if (path === "/report/transcript" && method === "POST") {
        const body = await parseJsonBody(request);
        const result = await chatWithRetry(
          env, TRANSCRIPT_REPORT_SYSTEM_PROMPT, JSON.stringify(body), 0.3, 2,
          ["title", "markdown"],
        );
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 专业版第一步：结构化洞察提取 ======
      if (path === "/report/extract-insights" && method === "POST") {
        const body = await parseJsonBody(request);
        const transcripts = body.transcripts || [];
        const projectContext = body.projectContext || {};
        const userPrompt = buildInsightUserPrompt(transcripts, projectContext);
        const result = await chatWithRetry(
          env, INSIGHT_SYSTEM_PROMPT, userPrompt, 0.2, 2,
          ["researchContext", "topics", "findings"],
        );
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 专业版第二步：报告规划 ======
      if (path === "/report/plan-slides" && method === "POST") {
        const body = await parseJsonBody(request);
        const insightPack = body.insightPack || {};
        const options = body.options || {};
        const userPrompt = buildSlideUserPrompt(insightPack, options);
        const result = await chatWithRetry(
          env, SLIDE_SYSTEM_PROMPT, userPrompt, 0.25, 2,
          ["storyline", "slides"],
        );
        return jsonResponse(env, requestOrigin, {
          data: result.data, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 专业版：单页重生成 ======
      if (path === "/report/regenerate-slide" && method === "POST") {
        const body = await parseJsonBody(request);
        const insightPack = body.insightPack || {};
        const currentSlide = body.currentSlide || {};
        const feedback = body.feedback || "";

        const regenSystemPrompt = `你是报告架构师。基于现有 InsightPack 和用户反馈，重新生成一页幻灯片内容。
要求：
1. 保持 slideType 不变
2. 必须基于 InsightPack 中的发现和原话，不得编造
3. 标题必须写成结论型
4. 不要输出任何坐标、字号、颜色等布局参数
5. 如果用户给了反馈，针对性改进

输出与原页相同结构的 JSON 对象，包含 slideId, slideType, title, subtitle, coreMessage, content, findingIds, evidenceSegmentIds 等字段。`;

        const regenUserPrompt = `## 现有页面
${JSON.stringify(currentSlide, null, 2)}

## 用户反馈
${feedback || "(无特别反馈，请基于 InsightPack 优化内容)"}

## InsightPack 摘要
${JSON.stringify({
  researchContext: insightPack.researchContext,
  topics: insightPack.topics,
  findings: (insightPack.findings || []).map((f: any) => ({
    findingId: f.findingId, headline: f.headline, description: f.description,
    evidenceSegmentIds: f.evidenceSegmentIds, quotes: f.quotes, importance: f.importance,
  })),
  painPoints: insightPack.painPoints,
  causes: insightPack.causes,
  opportunities: insightPack.opportunities,
  recommendations: insightPack.recommendations,
}, null, 2)}

请输出严格 JSON，保持原 slideType="${currentSlide.slideType || "KEY_FINDING"}"。`;

        const result = await chatWithRetry(
          env, regenSystemPrompt, regenUserPrompt, 0.3, 2,
          ["slideType", "title", "content"],
        );
        // 确保保留原 slideId
        const regenerated = result.data;
        if (!regenerated.slideId && currentSlide.slideId) {
          regenerated.slideId = currentSlide.slideId;
        }
        return jsonResponse(env, requestOrigin, {
          data: regenerated, usage: result.usage,
          model: env.AI_MODEL || "deepseek-v4-flash",
        });
      }

      // ====== 规则质检（纯逻辑，不调 AI）======
      if (path === "/report/qa-check" && method === "POST") {
        const body = await parseJsonBody(request);
        const slides = body.slides || [];
        const result = checkSlides(slides);
        return jsonResponse(env, requestOrigin, result);
      }

      // ====== 404 ======
      return errorJsonResponse(env, requestOrigin, 404, `端点不存在: ${path}`);

    } catch (e) {
      if (e instanceof HttpError) {
        return errorJsonResponse(env, requestOrigin, e.status, e.message);
      }
      const msg = e instanceof Error ? e.message : "未知错误";
      return errorJsonResponse(env, requestOrigin, 500, `服务器内部错误: ${msg}`);
    }
  },
};
