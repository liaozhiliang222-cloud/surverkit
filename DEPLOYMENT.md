# ResearchBox 部署指南

> 架构：单个 Cloudflare Worker 同时托管前端 SPA 和 AI 代理 API（同源部署）

## 部署架构

```
用户浏览器 → Cloudflare Worker（单一服务）
                ├── /api/*      → AI 代理逻辑（13 个端点）
                ├── 其他路径     → 前端 SPA 静态资源
                └── 未匹配路径   → index.html（SPA fallback）
                                     ↓
                              阿里云百炼 API（AI 计算）
```

**优势**：
- 单一域名、单一服务、单一部署命令
- 同源请求，无 CORS 问题
- 免费额度：Worker 10 万次/天 + 静态资源全球 CDN

## 前置条件

1. Cloudflare 账号（免费即可）
2. 阿里云百炼 API Key（[DashScope 控制台](https://dashscope.console.aliyun.com/)获取）
3. Node.js 18+ 和 npm

## 部署步骤

### 1. 安装依赖

```bash
cd research-box
npm install
cd worker
npm install
cd ..
```

### 2. 登录 Cloudflare

```bash
cd worker
npx wrangler login
```

浏览器会打开授权页面，授权后终端显示成功。

### 3. 配置百炼 API Key（Secret）

```bash
npx wrangler secret put DASHSCOPE_API_KEY
# 提示输入值时，粘贴你的百炼 API Key（sk- 开头）
```

Secret 加密存储在 Cloudflare，不会出现在代码或配置文件中。

### 4. 一键部署

**回到项目根目录执行**：

```bash
cd ..  # 回到 research-box 根目录
npm run deploy
```

这条命令会：
1. `npm run build` - 构建前端到 `dist/` 目录
2. `cd worker && npx wrangler deploy` - 部署 Worker（同时上传前端静态资源 + API 代码）

部署成功后输出类似：

```
Published researchbox
  https://researchbox.<你的子域>.workers.dev
```

### 5. 验证部署

```bash
# 健康检查
curl https://researchbox.<你的子域>.workers.dev/api/health

# 应返回：
# {"ok":true,"configured":true,"provider":"Cloudflare Worker","mode":"unified",...}

# 访问前端
# 浏览器打开 https://researchbox.<你的子域>.workers.dev
```

## 本地开发

### 前端 + Python 代理（完整功能）

```bash
# 1. 启动 Python AI 代理（需要先安装依赖）
npm run ai

# 2. 另开终端，设置环境变量并启动前端
# 创建 .env.local 文件：
# VITE_AI_API_URL=http://127.0.0.1:8766
npm run dev
```

### 前端 + Worker 本地预览（模拟云端环境）

```bash
# 1. 构建前端
npm run build

# 2. 启动 Worker 本地开发服务器
npm run deploy:dev
# 访问 http://localhost:8788
```

## 可选配置

### 开启鉴权（公网发布建议）

编辑 `worker/wrangler.toml`：

```toml
AUTH_ENABLED = "true"
```

设置访问 Token：

```bash
cd worker
npx wrangler secret put AI_PROXY_TOKEN
# 输入自定义 token，如 rb-xxx-2026
```

前端在 Cloudflare Pages 环境变量里设置 `VITE_AI_PROXY_TOKEN` 为同一个值（如果是分离部署）。
同源部署模式下，前端代码会自动从 localStorage 读取 token（设置页面里配置）。

### 自定义域名

在 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Triggers → Custom Domains 添加域名。

### 更新 CORS 白名单

同源部署模式下通常不需要配置 CORS。仅当需要从其他域名调试时，编辑 `worker/wrangler.toml`：

```toml
ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:8788,https://your-debug-domain.com"
```

重新 `npm run deploy:worker`。

## 部署命令速查

| 命令 | 作用 |
|------|------|
| `npm run deploy` | 一键部署（构建前端 + 部署 Worker） |
| `npm run deploy:build` | 仅构建前端 |
| `npm run deploy:worker` | 仅部署 Worker（需先 build） |
| `npm run deploy:dev` | Worker 本地预览（模拟云端） |

## 文件结构

```
research-box/
├── src/                    # 前端源码
├── dist/                   # 前端构建产物（部署时上传到 Worker）
├── worker/
│   ├── src/
│   │   ├── index.ts        # Worker 主入口（API 路由 + 静态资源 fallback）
│   │   └── lib/
│   │       ├── chat.ts     # AI 调用封装
│   │       ├── prompts.ts  # AI 提示词
│   │       └── qa.ts       # 规则质检
│   ├── wrangler.toml       # Worker 配置（含 [assets] 静态资源配置）
│   └── package.json
├── package.json            # 根 package.json（含 deploy 脚本）
└── DEPLOYMENT.md           # 本文档
```

## 故障排查

### 部署报错：`dist/ directory not found`
先执行 `npm run build`，再执行 `npm run deploy:worker`。

### 前端能打开但 API 返回 404
检查路径是否以 `/api/` 开头（如 `/api/health` 而非 `/health`）。

### API 返回 503：未配置 API Key
执行 `npx wrangler secret put DASHSCOPE_API_KEY` 设置百炼 API Key。

### CORS 错误
同源部署模式下不应出现 CORS 错误。如果出现，检查浏览器地址栏的域名是否与 Worker 域名一致。

## ASR 本地部署（可选，仅自用）

ASR 语音转写服务需要本地运行（不部署到云端），参见本地 `ASR_AGENT_SETUP.md`（未入库）。
