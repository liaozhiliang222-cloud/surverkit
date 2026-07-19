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
  AI_MODEL?: string;              // 可选：模型名，默认 deepseek-v4-flash
  AI_BASE_URL?: string;           // 可选：API base url
  AI_TIMEOUT_MS?: string;         // 可选：超时毫秒
  AI_PROXY_TOKEN?: string;        // 可选：鉴权 token
  AUTH_ENABLED?: string;          // 可选：是否启用鉴权
  ALLOWED_ORIGINS?: string;       // 可选：CORS 允许的域名
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
 */
export async function chat(
  env: Env,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<ChatResult> {
  const apiKey = env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "未配置 AI API Key（请在 Worker 中设置 DASHSCOPE_API_KEY secret）");
  }

  const baseUrl = (env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const model = env.AI_MODEL || "deepseek-v4-flash";
  const timeoutMs = parseInt(env.AI_TIMEOUT_MS || "120000", 10);

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
      throw new HttpError(response.status, `AI 调用失败：${detail.slice(0, 500)}`);
    }

    const body: any = await response.json();
    const content = body?.choices?.[0]?.message?.content || "";

    try {
      const data = extractJson(content);
      return { data, usage: body.usage || {} };
    } catch (e) {
      throw new HttpError(502, `模型输出无法解析为 JSON：${(e as Error).message}`);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new HttpError(504, `AI 调用超时（${timeoutMs}ms）`);
    }
    throw new HttpError(502, `无法连接 AI 服务：${(e as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }
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
): Promise<ChatResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const retryTemp = temperature + 0.1 * attempt;
      const result = await chat(env, system, user, retryTemp);

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
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) {
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
