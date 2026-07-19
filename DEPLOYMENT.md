# ResearchBox 部署指南

本文档指导你将 ResearchBox 部署到生产环境。

## 架构总览

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  用户浏览器      │ ───> │  Cloudflare Pages    │ ───> │ Cloudflare      │
│  (访问报告系统)  │      │  (前端 PWA, 静态)     │      │ Worker          │
└─────────────────┘      └──────────────────────┘      │ (AI 代理, TS)    │
                                                        └────────┬────────┘
                                                                 │
                                          ┌──────────────────────┴──────┐
                                          │  阿里云百炼 / DeepSeek API   │
                                          │  (真正的 AI 计算)            │
                                          └─────────────────────────────┘
```

| 组件 | 部署位置 | 月成本 | 说明 |
|------|---------|--------|------|
| 前端 PWA | Cloudflare Pages | 免费 | 全球 CDN，静态托管 |
| AI 代理 | Cloudflare Worker | 免费额度 10万次/天 | TypeScript，替代 Python FastAPI |
| AI 计算 | 阿里云百炼 | 按量计费 | DeepSeek-V4 约 ¥0.001/千 tokens |
| ASR 转写 | 你本机 | 0 | 按硬约束保留本地，不对外暴露 |

---

## 第一部分：部署 AI 代理到 Cloudflare Worker

### 前置条件

- 安装 Node.js 18+
- 注册 Cloudflare 账号（免费）
- 准备好百炼/DeepSeek 的 API Key

### 步骤 1：安装 Wrangler CLI

```bash
cd d:\定性调研工具箱\research-box\worker
npm install
npx wrangler login
```

执行 `wrangler login` 后会打开浏览器，授权 Cloudflare 账号。

### 步骤 2：配置 API Key 密钥

**重要：API Key 必须通过 Secret 设置，不要写在 wrangler.toml 里。**

```bash
cd d:\定性调研工具箱\research-box\worker
npx wrangler secret put DASHSCOPE_API_KEY
# 按提示输入你的百炼 API Key（sk-xxxxxxxxxxxxxxxxxxxxxxxx）
```

可选：如果需要启用简单鉴权（防止别人直接调用你的 Worker），设置 token：

```bash
npx wrangler secret put AI_PROXY_TOKEN
# 按提示输入一个随机字符串作为 token
```

然后在 `wrangler.toml` 中把 `AUTH_ENABLED` 改为 `"true"`。
前端调用时需在请求头加 `Authorization: Bearer <你的token>`。

### 步骤 3：配置 CORS 允许的域名

编辑 `worker/wrangler.toml`，把 `ALLOWED_ORIGINS` 改为你前端部署后的域名：

```toml
[vars]
ALLOWED_ORIGINS = "https://researchbox.pages.dev,http://localhost:5173"
```

多个域名用逗号分隔。`http://localhost:5173` 是本地开发保留的。

### 步骤 4：部署

```bash
cd d:\定性调研工具箱\research-box\worker
npx wrangler deploy
```

部署成功后会输出 Worker 地址，类似：

```
Published researchbox-ai-proxy (1.23 sec)
  https://researchbox-ai-proxy.<your-subdomain>.workers.dev
```

**记下这个地址**，下一步配置前端时要用。

### 步骤 5：验证 Worker

```bash
curl https://researchbox-ai-proxy.<your-subdomain>.workers.dev/health
```

应返回：

```json
{"ok": true, "configured": true, "provider": "Cloudflare Worker", "model": "deepseek-v4-flash"}
```

---

## 第二部分：部署前端到 Cloudflare Pages

### 步骤 1：构建前端

```bash
cd d:\定性调研工具箱\research-box
# 创建 .env.production，填入你的 Worker 地址
# （已提供模板，编辑 .env.production 替换为实际地址）
npm run build
```

构建产物在 `dist/` 目录。

### 步骤 2：通过 Wrangler 部署到 Pages

```bash
cd d:\定性调研工具箱\research-box
npx wrangler pages deploy dist --project-name researchbox
```

首次部署会询问是否创建项目，选 Yes。

部署成功后会输出地址：

```
✨ Deployment complete! Take a peek over at https://<hash>.researchbox.pages.dev
```

### 步骤 3：配置环境变量（推荐方式）

更推荐通过 Cloudflare Dashboard 配置环境变量，这样不用每次改 .env.production 重新构建：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 Workers & Pages → 找到 `researchbox` 项目
3. Settings → Environment Variables
4. 添加 Production 环境变量：
   - `VITE_AI_API_URL` = `https://researchbox-ai-proxy.<your-subdomain>.workers.dev`
   - `VITE_ASR_API_URL` = `http://127.0.0.1:8765`（占位，云端不使用）
5. 保存后重新触发一次部署（在 Deployments 页面点 Retry deployment）

### 步骤 4：配置自定义域名（可选）

1. Cloudflare Dashboard → Pages → researchbox → Custom domains
2. 添加你的域名（如 `researchbox.yourdomain.com`）
3. 按提示配置 DNS 记录
4. 配置完成后，在 Worker 的 `ALLOWED_ORIGINS` 中加入这个域名

### 步骤 5：验证前端

打开 Pages 部署地址，应看到 ResearchBox 界面。

测试 AI 功能：上传一份访谈笔录 → 生成快速报告 → 确认能正常返回结果。

---

## 第三部分：ASR 转写功能（仅本地使用）

ASR 按项目硬约束保留在本地，不对外暴露。云端部署的前端会自动隐藏 ASR 入口。

### 本地启动 ASR Agent

```bash
cd d:\定性调研工具箱\research-box
npm run asr:install    # 首次安装依赖
npm run asr            # 启动 ASR Agent（127.0.0.1:8765）
```

ASR Agent 只监听 `127.0.0.1`，别人无法访问。

### 本地使用完整功能

如果你想使用 ASR + 缩略图预览 + 原生模板渲染等本地专用功能：

1. 本地启动 Python ai-proxy：`cd ai-proxy && python main.py`
2. 本地启动前端开发服务器：`npm run dev`
3. 访问 `http://localhost:5173`

本地模式下所有功能可用，包括云端隐藏的本地专用功能。

---

## 环境变量清单

### Worker 环境变量

| 变量名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `DASHSCOPE_API_KEY` | Secret | ✅ | 百炼 API Key |
| `AI_PROXY_TOKEN` | Secret | 可选 | 鉴权 token（启用 AUTH_ENABLED 时必需）|
| `AI_MODEL` | Var | 可选 | 模型名，默认 `deepseek-v4-flash` |
| `AI_BASE_URL` | Var | 可选 | API base url，默认百炼 |
| `AI_TIMEOUT_MS` | Var | 可选 | 超时毫秒，默认 120000 |
| `ALLOWED_ORIGINS` | Var | 可选 | CORS 允许的域名，逗号分隔 |
| `AUTH_ENABLED` | Var | 可选 | 是否启用鉴权，默认 `false` |

### 前端环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `VITE_AI_API_URL` | ✅ | AI 代理地址（Worker URL）|
| `VITE_ASR_API_URL` | 可选 | ASR 地址（本地专用）|

---

## 常见问题排查

### 问题1：前端调用 AI 报 CORS 错误

**原因**：Worker 的 `ALLOWED_ORIGINS` 没有包含你的前端域名。

**解决**：

```bash
# 编辑 worker/wrangler.toml
# 在 ALLOWED_ORIGINS 中加入你的 Pages 域名
ALLOWED_ORIGINS = "https://researchbox.pages.dev,https://researchbox.yourdomain.com,http://localhost:5173"

# 重新部署 Worker
cd worker && npx wrangler deploy
```

### 问题2：AI 调用返回 503 "未配置 AI API Key"

**原因**：Worker 没有设置 `DASHSCOPE_API_KEY` secret。

**解决**：

```bash
cd worker
npx wrangler secret put DASHSCOPE_API_KEY
# 输入你的百炼 API Key
```

### 问题3：AI 调用超时

**原因**：百炼 API 响应慢或 Worker 超时设置过短。

**解决**：

```bash
# 编辑 worker/wrangler.toml，增加超时
AI_TIMEOUT_MS = "180000"  # 3 分钟
# 重新部署
npx wrangler deploy
```

注意：Cloudflare Worker 免费版有 CPU 时间限制（10ms/请求），但**等待外部 API 响应的时间不计入 CPU 时间**，所以 AI 调用不受此限制。

### 问题4：部署后前端显示"云端模式"

这是正常行为。云端模式下会隐藏缩略图预览和原生模板渲染（这两个功能需要本地二进制）。PPT 导出使用内置 PptxGenJS 模板，完全可编辑。

### 问题5：本地开发时连不上 Worker

本地开发默认连 `http://127.0.0.1:8766`（Python 代理）。如果要连 Worker 测试：

```bash
# 创建 .env.local
echo "VITE_AI_API_URL=https://researchbox-ai-proxy.your-subdomain.workers.dev" > .env.local
npm run dev
```

---

## 成本估算

| 项 | 免费额度 | 超出后 | 预估月费 |
|----|---------|--------|---------|
| Cloudflare Pages | 500 次构建/月，无限请求 | $0 | ¥0 |
| Cloudflare Worker | 10 万次请求/天 | $5/月起 | ¥0（小流量）|
| 百炼 AI（DeepSeek-V4） | 按量 | - | 视用量，约 ¥10-50/月 |

**典型场景**：每天生成 10 份报告，每份报告约 2 万 tokens，月费约 ¥10-20。

---

## 更新部署

### 更新 Worker

```bash
cd d:\定性调研工具箱\research-box\worker
# 修改代码后
npx wrangler deploy
```

### 更新前端

```bash
cd d:\定性调研工具箱\research-box
npm run build
npx wrangler pages deploy dist --project-name researchbox
```

### 查看日志

```bash
# Worker 实时日志
cd worker && npx wrangler tail

# Pages 部署历史
# 在 Cloudflare Dashboard → Pages → researchbox → Deployments 查看
```

---

## 安全注意事项

1. **API Key 只用 Secret**：永远不要把 `DASHSCOPE_API_KEY` 写在 `wrangler.toml` 或代码里
2. **启用鉴权**：如果担心别人直接调你的 Worker，设置 `AUTH_ENABLED=true` 和 `AI_PROXY_TOKEN`
3. **CORS 限制**：`ALLOWED_ORIGINS` 只列你自己的域名
4. **ASR 不暴露**：ASR Agent 绑定 `127.0.0.1`，不要改成 `0.0.0.0`
5. **定期检查用量**：在 Cloudflare Dashboard 监控 Worker 和百炼的用量

---

## 本地开发 vs 生产环境对比

| 功能 | 本地开发 (localhost) | 生产环境 (Cloudflare) |
|------|---------------------|---------------------|
| AI 校正/编码/分析 | ✅ Python 代理 | ✅ Worker |
| 快速报告 | ✅ Python 代理 | ✅ Worker |
| 专业版报告（洞察+规划） | ✅ Python 代理 | ✅ Worker |
| 规则质检 | ✅ Python 代理 | ✅ Worker |
| PPT 导出（PptxGenJS） | ✅ 前端生成 | ✅ 前端生成 |
| 缩略图预览 | ✅ 需 LibreOffice | ❌ 隐藏 |
| 原生模板渲染 | ✅ 需 Node.js | ❌ 隐藏 |
| ASR 转写 | ✅ 本地模型 | ❌ 隐藏 |
