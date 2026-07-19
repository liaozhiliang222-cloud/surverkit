# ResearchBox 上线准备清单

> 最近更新：2026-07-19（单 Worker 同源部署改造完成）

## 已具备

- 项目、访谈、笔录、校正、编码、洞察和报告完整闭环；
- DeepSeek AI 校正与跨访谈分析，所有结论绑定证据片段；
- AI 数据发送前用户确认，本地规则可降级；
- IndexedDB 本地存储、项目备份与恢复；
- Markdown、DOCX、PPTX 导出；
- 专业版 PPT 生成系统（第一阶段架构分离 → 第二阶段模板补全 → 第三阶段容量控制 → 第四阶段预览与质检 → 第五阶段原生模板能力）；
- 17 种 slideType 渲染器，布局多样性、内容压缩、自动拆页、规则质检 13 条；
- 桌面与移动端响应式导航；
- 自动化测试、生产构建和 PWA；
- **单 Worker 同源部署**（前端 SPA + AI 代理 API 合并到一个 Cloudflare Worker）；
- 完整部署文档（DEPLOYMENT.md）。

## 部署架构（单 Worker 同源）

```
用户浏览器 → Cloudflare Worker（单一服务）
                ├── /api/*      → AI 代理逻辑（13 个端点）
                ├── 其他路径     → 前端 SPA 静态资源
                └── 未匹配路径   → index.html（SPA fallback）
                                     ↓
                              阿里云百炼 API（AI 计算）
```

- 前端 + AI 代理：同一个 Cloudflare Worker（免费额度 10 万次/天）
- AI 计算：阿里云百炼（按量计费）
- ASR：本机（127.0.0.1，不对外暴露，仅自用）

**优势**：单一域名、单一服务、单一部署命令、无 CORS 问题。

## 正式公网发布前必须完成

1. **密钥管理**：`DASHSCOPE_API_KEY` 已通过 Worker Secret 管理 ✅
2. **CORS 限制**：同源部署无需 CORS 配置 ✅
3. **可选鉴权**：`AUTH_ENABLED` + `AI_PROXY_TOKEN` 简单鉴权（公网发布建议开启）
4. 账号认证：如需多用户隔离，需接入 Cloudflare Access 或自建鉴权（当前为单用户模式）
5. 云数据库与对象存储：项目、笔录、附件的加密存储和数据隔离（当前为 IndexedDB 本地存储）
6. 合规文档：隐私政策、用户协议、数据处理说明
7. 可观测性：Cloudflare Analytics + 百炼用量监控
8. 安全测试：依赖漏洞、越权、上传文件、接口限流、提示词注入和内容安全
9. 真实用户验收：长笔录、20+ 访谈聚合、异常网络和多浏览器测试

## 内测发布前建议完成

- 修复构建包体积警告，继续做路由级拆包；
- 增加端到端浏览器测试和 Worker 契约测试；
- 增加项目删除、归档和回收站；
- 增加用量与预计费用提示；
- 为长文本增加分块、重试、取消和任务队列；
- 增加洞察证据跳转和分析版本差异对比；
- Worker 日志结构化和错误告警。

## 部署快速入口

参见 [DEPLOYMENT.md](./DEPLOYMENT.md) 完整部署指南。

### 一键部署命令

```bash
# 1. 配置百炼 API Key（仅首次）
cd worker
npx wrangler login
npx wrangler secret put DASHSCOPE_API_KEY
cd ..

# 2. 一键部署（构建前端 + 部署 Worker）
npm run deploy

# 3. 验证
curl https://researchbox.<your-subdomain>.workers.dev/api/health
```

## 功能矩阵

| 功能 | 本地开发 | 云端生产 |
|------|---------|---------|
| AI 校正/编码/分析 | ✅ Python 代理 | ✅ Worker（/api/*） |
| 快速报告 | ✅ | ✅ |
| 专业版报告（洞察+规划） | ✅ | ✅ |
| 规则质检 | ✅ | ✅ |
| 单页重生成 | ✅ | ✅ |
| PPT 导出（PptxGenJS） | ✅ | ✅ |
| 缩略图预览 | ✅ 需 LibreOffice | ❌ 隐藏 |
| 原生模板渲染 | ✅ 需 Node.js | ❌ 隐藏 |
| ASR 转写 | ✅ 本地模型 | ❌ 隐藏 |
