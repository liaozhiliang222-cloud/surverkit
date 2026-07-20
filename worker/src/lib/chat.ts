/**
 * AI 调用封装（Chat with DashScope/OpenAI-compatible API）
 *
 * 从 Python ai-proxy/main.py 的 chat() 和 chat_with_retry() 迁移。
 * 使用 fetch 调用百炼/DeepSeek API。
 */

export interface ChatResult {
  data: any;
  usage: Record<string, any>;
}

export interface Env {
  DASHSCOPE_API_KEY: string;      // 必需：百炼 API Key（通过 wrangler secret 设置）
  AI_MODEL?: string;              // 可选：首选模型名（配额耗尽时自动降级）
  AI_FALLBACK_MODELS?: string;    // 可选：备用模型列表（逗号分隔）
  AI_BASE_URL?: string;           // 可选：API base url
  AI_TIMEOUT_MS?: string;         // 可选：超时毫秒
  AI_PROXY_TOKEN?: string;        // 可选：鉴权 token
  AUTH_ENABLED?: string;          // 可选：是否启用鉴权
  ALLOWED_ORIGINS?: string;       // 可选：CORS 允许的域名
  ASSETS?: Fetcher;               // 静态资源 binding（由 wrangler.toml [assets] 注入）
}

/**
 * 百炼免费模型列表（按优先级排序）
 *
 * 每个模型有独立的免费额度，配额耗尽时自动降级到下一个。
 * 参考：https://www.banzhuti.com/2026-ai-large-model-api-free-10-million-tokens.html
 */
const DEFAULT_FREE_MODELS = [
  "qwen-turbo",          // 永久每月 100 万 token 免费
  "qwen-plus",           // 100 万 token，3 个月有效
  "deepseek-v4-flash",   // 100 万 token，3 个月有效
  "qwen3.7-plus",        // 100 万 token，3 个月有效
  "qwen-max",            // 100 万 token，3 个月有效
];

/**
 * 判断错误是否为"免费额度耗尽"（可降级到下一个模型）
 *
 * 百炼返回 403 + AllocationQuotaFreeTierOnly 时表示该模型免费额度用完。
 * 同时兼容 "Free quota exhausted" 文本（旧版错误格式）。
 */
function isQuotaExhausted(status: number, detail: string): boolean {
  if (status === 403 && detail.includes("AllocationQuotaFreeTierOnly")) return true;
  if (status === 403 && detail.includes("Free quota exhausted")) return true;
  if (status === 429 && detail.includes("quota")) return true;
  return false;
}

/**
 * 从模型响应中提取 JSON
 * 处理 ```json 代码块包裹和多余文本
 */
export function extractJson(content: string): any {
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // 尝试找到第一个 { 或 [ 到最后一个 } 或 ]
    const startCandidates = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter(i => i >= 0);
    if (startCandidates.length === 0) {
      throw new Error("模型未返回 JSON");
    }
    const start = Math.min(...startCandidates);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (end <= start) {
      throw new Error("JSON 结构不完整");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/**
 * 调用百炼/OpenAI 兼容的 chat completions API
 *
 * API Key 优先级：
 * 1. 请求头 X-User-API-Key（用户在前端设置页面手动输入）
 * 2. Worker Secret DASHSCOPE_API_KEY（部署时配置的默认 Key）
 *
 * 模型降级策略：
 * 当首选模型返回 403（免费额度耗尽）时，自动切换到下一个备用模型。
 * 备用模型列表由 AI_FALLBACK_MODELS 环境变量指定，或使用内置默认列表。
 */
export async function chat(
  env: Env,
  system: string,
  user: string,
  temperature = 0.2,
  userApiKey?: string,
): Promise<ChatResult> {
  const apiKey = userApiKey || env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "未配置 AI API Key（请在设置页面输入 API Key，或联系管理员配置 DASHSCOPE_API_KEY）");
  }

  const baseUrl = (env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const timeoutMs = parseInt(env.AI_TIMEOUT_MS || "120000", 10);

  // 构建模型列表：首选模型 + 环境变量备用模型 + 内置默认列表（去重）
  const preferredModel = env.AI_MODEL || "qwen-turbo";
  const envFallbacks = env.AI_FALLBACK_MODELS
    ? env.AI_FALLBACK_MODELS.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const modelList: string[] = [];
  for (const m of [preferredModel, ...envFallbacks, ...DEFAULT_FREE_MODELS]) {
    if (!modelList.includes(m)) modelList.push(m);
  }

  let lastError: Error | null = null;
  const triedModels: string[] = [];

  for (const model of modelList) {
    triedModels.push(model);
    console.log(`[AI] 尝试模型: ${model}`);

    const payload = JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      response_format: { type: "json_object" },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let detail = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          detail = errorJson.error?.message || errorJson.detail || errorText;
        } catch {}

        // 免费额度耗尽 → 降级到下一个模型
        if (isQuotaExhausted(response.status, detail)) {
          console.log(`[AI] 模型 ${model} 免费额度耗尽，降级到下一个模型`);
          lastError = new HttpError(response.status, `AI 调用失败：${detail.slice(0, 500)}`);
          continue; // 尝试下一个模型
        }

        // 其他错误直接抛出（不降级）
        throw new HttpError(response.status, `AI 调用失败：${detail.slice(0, 500)}`);
      }

      const body: any = await response.json();
      const content = body?.choices?.[0]?.message?.content || "";

      if (!content || content.trim().length === 0) {
        throw new HttpError(502, `模型返回空内容。完整响应: ${JSON.stringify(body).slice(0, 500)}`);
      }

      try {
        const data = extractJson(content);
        console.log(`[AI] 模型 ${model} 调用成功`);
        return { data, usage: body.usage || {} };
      } catch (e) {
        throw new HttpError(502, `模型输出无法解析为 JSON：${(e as Error).message}。原始内容前300字符: ${content.slice(0, 300)}`);
      }
    } catch (e) {
      if (e instanceof HttpError) {
        // 如果是额度耗尽错误，继续降级（上面已经 continue 了，这里防御性处理）
        if (isQuotaExhausted(e.status, e.message)) {
          lastError = e;
          continue;
        }
        throw e;
      }
      if (e instanceof Error && e.name === "AbortError") {
        // 超时也降级到下一个模型
        console.log(`[AI] 模型 ${model} 调用超时，降级到下一个模型`);
        lastError = new HttpError(504, `AI 调用超时（${timeoutMs}ms）`);
        continue;
      }
      throw new HttpError(502, `无法连接 AI 服务：${(e as Error).message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 所有模型都失败了
  throw new HttpError(503, `所有 AI 模型免费额度已耗尽。已尝试: ${triedModels.join(" → ")}。请在阿里云百炼控制台充值或关闭"免费额度用完即停"模式。`);
}

/**
 * 带重试和结构校验的 chat 调用
 *
 * 当发生以下情况时自动重试（最多 max_retries 次）：
 * 1. 网络错误（502/504）
 * 2. JSON 解析失败（502）
 * 3. 缺少必需字段（结构校验失败）
 *
 * 重试时温度略微提高以增加输出多样性。
 */
export async function chatWithRetry(
  env: Env,
  system: string,
  user: string,
  temperature = 0.2,
  maxRetries = 2,
  requiredFields: string[] | null = null,
  userApiKey?: string,
): Promise<ChatResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const retryTemp = temperature + 0.1 * attempt;
      const result = await chat(env, system, user, retryTemp, userApiKey);

      // 结构校验
      if (requiredFields && result.data && typeof result.data === "object") {
        const missing = requiredFields.filter(f => !(f in result.data));
        if (missing.length > 0) {
          throw new Error(`输出缺少必需字段：${missing.join(", ")}`);
        }
      }

      return result;
    } catch (e) {
      lastError = e as Error;

      // 4xx 错误（客户端错误，非 429）不重试
      // 503（所有模型额度耗尽）不重试，因为重试也是一样的结果
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw e;
      }
      if (e instanceof HttpError && e.status === 503) {
        throw e;
      }

      // 最后一次尝试失败，抛出
      if (attempt === maxRetries) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(502, `AI 调用失败（重试 ${maxRetries} 次后仍失败）：${(e as Error).message}`);
      }

      // 指数退避等待（Worker 中没有 setTimeout 可用于 sleep，用 Promise）
      const delayMs = 1500 * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new HttpError(502, `AI 调用失败：${lastError?.message || "未知错误"}`);
}

/**
 * 自定义 HTTP 错误
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * 构造错误响应
 */
export function errorResponse(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * 构造成功响应
 */
export function successResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
