import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, now, uid } from "./db";
import { can, exportProjectBundle, importProjectBundle } from "./p2Services";
import type { MemberRole, ReportTemplate } from "./types";
import {
  getUserAiConfig,
  setUserAiConfig,
  clearUserAiConfig,
  testAiConnection,
  type UserAiConfig,
} from "./aiClient";

// ============================================================
// AI 供应商预设
// ============================================================
const AI_PROVIDERS = [
  {
    id: "dashscope",
    name: "阿里云百炼 (DashScope)",
    models: [
      { label: "DeepSeek V4 Flash（快速，默认）", value: "deepseek-v4-flash" },
      { label: "DeepSeek V4 Pro（精准）", value: "deepseek-v4-pro" },
      { label: "Qwen Plus", value: "qwen-plus" },
      { label: "Qwen Turbo", value: "qwen-turbo" },
    ],
    baseUrl: "https://dashscope.aliyun.com/compatible-mode/v1",
  },
  {
    id: "deepseek",
    name: "DeepSeek 官方",
    models: [
      { label: "DeepSeek Chat", value: "deepseek-chat" },
      { label: "DeepSeek Reasoner", value: "deepseek-reasoner" },
    ],
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    models: [
      { label: "Moonshot 8K", value: "moonshot-v1-8k" },
      { label: "Moonshot 32K", value: "moonshot-v1-32k" },
      { label: "Moonshot 128K", value: "moonshot-v1-128k" },
    ],
    baseUrl: "https://api.moonshot.cn/v1",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    models: [
      { label: "GLM-4-Flash", value: "glm-4-flash" },
      { label: "GLM-4", value: "glm-4" },
      { label: "GLM-4-Plus", value: "glm-4-plus" },
    ],
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "custom",
    name: "自定义 (OpenAI 兼容)",
    models: [],
    baseUrl: "",
  },
];

export function SettingsCenter() {
  const workspace = useLiveQuery(
    () => db.workspaces.get("workspace_default"),
    [],
    undefined,
  );
  const members = useLiveQuery(
    () => db.members.where("workspaceId").equals("workspace_default").toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(
    () =>
      db.projects.where("workspaceId").equals("workspace_default").toArray(),
    [],
    [],
  );
  const templates = useLiveQuery(
    () =>
      db.reportTemplates
        .where("workspaceId")
        .equals("workspace_default")
        .toArray(),
    [],
    [],
  );
  const sync = useLiveQuery(
    () =>
      db.syncProfiles.where("workspaceId").equals("workspace_default").first(),
    [],
    undefined,
  );
  const [memberName, setMemberName] = useState("");
  const [role, setRole] = useState<MemberRole>("研究员");
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [endpoint, setEndpoint] = useState(sync?.endpoint || "");
  const [currentRole, setCurrentRole] = useState<MemberRole>(() =>
    (localStorage.getItem("researchbox-current-role") as MemberRole) || "所有者",
  );
  const canManage = can(currentRole, "manageMembers");
  const canWrite = can(currentRole, "write");

  // ====== AI 接口配置状态 ======
  const existingConfig = getUserAiConfig();
  const [aiProvider, setAiProvider] = useState(existingConfig?.provider || "dashscope");
  const [aiModel, setAiModel] = useState(existingConfig?.model || "deepseek-v4-flash");
  const [aiBaseUrl, setAiBaseUrl] = useState(existingConfig?.baseUrl || AI_PROVIDERS[0].baseUrl);
  const [aiApiKey, setAiApiKey] = useState(existingConfig?.apiKey || "");
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSaved, setAiSaved] = useState(false);

  const currentProvider = AI_PROVIDERS.find((p) => p.id === aiProvider) || AI_PROVIDERS[0];

  function handleProviderChange(providerId: string) {
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;
    setAiProvider(providerId);
    setAiBaseUrl(provider.baseUrl);
    if (provider.models.length > 0) {
      setAiModel(provider.models[0].value);
    }
    setAiTestResult(null);
    setAiSaved(false);
  }

  async function handleSaveAiConfig() {
    if (!aiApiKey.trim()) {
      setMessage("请输入 API Key");
      return;
    }
    const config: UserAiConfig = {
      apiKey: aiApiKey.trim(),
      model: aiModel.trim(),
      baseUrl: aiBaseUrl.trim(),
      provider: aiProvider,
    };
    setUserAiConfig(config);
    setAiSaved(true);
    setMessage("AI 接口配置已保存");
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleTestConnection() {
    if (!aiApiKey.trim()) {
      setAiTestResult({ ok: false, message: "请先输入 API Key" });
      return;
    }
    setAiTesting(true);
    setAiTestResult(null);
    const config: UserAiConfig = {
      apiKey: aiApiKey.trim(),
      model: aiModel.trim(),
      baseUrl: aiBaseUrl.trim(),
      provider: aiProvider,
    };
    const result = await testAiConnection(config);
    setAiTestResult(result);
    setAiTesting(false);
  }

  function handleClearAiConfig() {
    clearUserAiConfig();
    setAiApiKey("");
    setAiTestResult(null);
    setAiSaved(false);
    setMessage("AI 接口配置已清空");
    setTimeout(() => setMessage(""), 3000);
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberName.trim()) return;
    await db.members.add({
      id: uid("member"),
      workspaceId: "workspace_default",
      name: memberName.trim(),
      role,
      status: "待邀请",
      createdAt: now(),
    });
    setMemberName("");
  }
  async function addTemplate(event: FormEvent) {
    event.preventDefault();
    if (!templateName.trim()) return;
    const item: ReportTemplate = {
      id: uid("template"),
      workspaceId: "workspace_default",
      name: templateName.trim(),
      description: "自定义研究报告模板",
      sections: ["项目背景", "研究目标", "核心发现", "典型原话", "行动建议"],
      accentColor: "#0d9488",
      createdAt: now(),
    };
    await db.reportTemplates.add(item);
    setTemplateName("");
  }
  async function saveSync() {
    const profile = {
      id: sync?.id || uid("sync"),
      workspaceId: "workspace_default",
      provider: endpoint ? ("自定义API" as const) : ("未配置" as const),
      endpoint: endpoint.trim(),
      enabled: Boolean(endpoint.trim()),
    };
    if (sync) await db.syncProfiles.update(sync.id, profile);
    else await db.syncProfiles.add(profile);
    setMessage(
      endpoint
        ? "同步接口配置已保存；实际发送前仍需服务端鉴权实现。"
        : "已关闭同步配置。",
    );
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      const project = await importProjectBundle(file);
      setMessage(`项目"${project.name}"已恢复。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败");
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
        <p className="text-sm text-brand-700">系统设置</p>
        <h1 className="text-3xl font-bold">AI 接口设置</h1>
        </div>
        <label className="w-56"><span className="label">当前身份</span><select className="input" value={currentRole} onChange={(event) => { const next = event.target.value as MemberRole; setCurrentRole(next); localStorage.setItem("researchbox-current-role", next); }}><option>所有者</option><option>管理员</option><option>研究员</option><option>访客</option></select></label>
        {message && (
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            {message}
          </p>
        )}
      </div>

      {/* ====== AI 接口配置卡片 ====== */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">输入与配置</span>
              <h2 className="mt-2 font-semibold">AI 大模型接口</h2>
              <p className="mt-1 text-sm text-slate-500">
                选择 LLM 供应商并填入 API Key，所有 AI 功能（校正、编码、分析、报告）将通过此接口调用。
              </p>
            </div>
            {existingConfig && (
              <span className="badge bg-green-50 text-green-700">已配置</span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {/* 供应商 */}
            <label className="block">
              <span className="label">供应商</span>
              <select
                className="input"
                value={aiProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            {/* 模型档位 */}
            {currentProvider.models.length > 0 && (
              <label className="block">
                <span className="label">模型档位</span>
                <select
                  className="input"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  {currentProvider.models.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* 模型名称（可自定义） */}
            <label className="block">
              <span className="label">模型名称</span>
              <input
                className="input"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="deepseek-v4-flash"
              />
            </label>

            {/* 接口地址 */}
            <label className="block">
              <span className="label">接口地址</span>
              <input
                className="input"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="https://dashscope.aliyun.com/compatible-mode/v1"
              />
            </label>

            {/* API Key */}
            <label className="block">
              <span className="label">API Key</span>
              <input
                className="input"
                type="password"
                value={aiApiKey}
                onChange={(e) => { setAiApiKey(e.target.value); setAiSaved(false); }}
                placeholder="sk-..."
              />
            </label>
          </div>

          {/* 操作按钮 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() => void handleSaveAiConfig()}
            >
              保存设置
            </button>
            <button
              className="btn-ghost"
              disabled={aiTesting || !aiApiKey.trim()}
              onClick={() => void handleTestConnection()}
            >
              {aiTesting ? "测试中..." : "测试连接"}
            </button>
            <button
              className="text-sm text-slate-500 hover:text-slate-700"
              onClick={handleClearAiConfig}
            >
              清空设置
            </button>
          </div>

          {/* 测试结果 */}
          {aiTestResult && (
            <div
              className={`mt-3 rounded-lg p-3 text-sm ${
                aiTestResult.ok
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {aiTestResult.ok ? "✓ " : "✗ "}
              {aiTestResult.message}
            </div>
          )}

          {aiSaved && (
            <p className="mt-3 text-xs text-slate-500">
              配置已保存到本地浏览器，切换设备需重新输入。未配置 API Key 时，如服务端已配置默认 Key 则自动降级使用。
            </p>
          )}
        </div>

        {/* ====== 接口校验状态卡片 ====== */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">接口校验</span>
              <h2 className="mt-2 font-semibold">连接状态</h2>
              <p className="mt-1 text-sm text-slate-500">
                查看当前 AI 接口的配置状态和可用性。
              </p>
            </div>
            <span
              className={`badge ${
                existingConfig
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {existingConfig ? "已就绪" : "未配置"}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {existingConfig ? (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-900">
                  {AI_PROVIDERS.find((p) => p.id === existingConfig.provider)?.name || existingConfig.provider}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  模型：{existingConfig.model}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  接口：{existingConfig.baseUrl}
                </p>
                <p className="mt-2 text-xs text-blue-600">
                  设置校验通过，可以在 AI 功能中调用
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">尚未配置 API Key</p>
                <p className="mt-1 text-xs text-amber-700">
                  请在左侧填入 API Key 并点击"保存设置"。如服务端已配置默认 Key，AI 功能仍可使用，但建议配置专属 Key 以获得更稳定的 service。
                </p>
              </div>
            )}

            {/* 供应商速览 */}
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">支持的供应商</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                <li>· 阿里云百炼：deepseek-v4-flash / pro, qwen-plus</li>
                <li>· DeepSeek 官方：deepseek-chat, deepseek-reasoner</li>
                <li>· Moonshot (Kimi)：8K / 32K / 128K 上下文</li>
                <li>· 智谱 AI：GLM-4-Flash, GLM-4, GLM-4-Plus</li>
                <li>· 自定义：任何 OpenAI 兼容接口</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ====== 原有设置卡片 ====== */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold">工作区与订阅</h2>
              <p className="mt-1 text-sm text-slate-500">{workspace?.name}</p>
            </div>
            <span className="badge bg-brand-50 text-brand-800">
              {workspace?.plan || "免费版"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["免费版", "专业版", "团队版"] as const).map((plan) => (
              <button
                disabled={!canManage}
                key={plan}
                className={
                  workspace?.plan === plan ? "btn-primary" : "btn-ghost"
                }
                onClick={() =>
                  void db.workspaces.update("workspace_default", { plan })
                }
              >
                {plan}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            当前为本地方案状态，不包含真实扣费；支付接入需要商户与合规配置。
          </p>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">云同步适配</h2>
          <p className="mt-1 text-sm text-slate-500">
            预留 WebDAV/自定义 API 接口，不会在未授权时上传数据。
          </p>
          <input
            disabled={!canManage}
            className="input mt-4"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://your-api.example.com/researchbox"
          />
          <button disabled={!canManage} className="btn-primary mt-3" onClick={() => void saveSync()}>
            保存配置
          </button>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">成员与角色权限</h2>
          <div className="mt-4 space-y-2">
            {members.map((member) => (
              <div
                className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                key={member.id}
              >
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.status}</p>
                </div>
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={member.role}
                  disabled={!canManage || member.id === "member_owner"}
                  onChange={(e) =>
                    void db.members.update(member.id, {
                      role: e.target.value as MemberRole,
                    })
                  }
                >
                  <option>所有者</option>
                  <option>管理员</option>
                  <option>研究员</option>
                  <option>访客</option>
                </select>
              </div>
            ))}
          </div>
          <form
            className="mt-3 grid grid-cols-[1fr_120px_auto] gap-2"
            onSubmit={addMember}
          >
            <input
              disabled={!canManage}
              className="input"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="成员名称"
            />
            <select
              disabled={!canManage}
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
            >
              <option>管理员</option>
              <option>研究员</option>
              <option>访客</option>
            </select>
            <button disabled={!canManage} className="btn-primary">邀请</button>
          </form>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">报告模板</h2>
          <div className="mt-4 space-y-2">
            {templates.map((template) => (
              <div className="rounded-lg border p-3" key={template.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: template.accentColor }}
                  />
                  <p className="font-medium">{template.name}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {template.sections.join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={addTemplate}>
            <input
              disabled={!canWrite}
              className="input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="新模板名称"
            />
            <button disabled={!canWrite} className="btn-ghost">创建</button>
          </form>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="font-semibold">项目备份与恢复</h2>
        <p className="mt-1 text-sm text-slate-500">
          备份包含项目、样本、笔录、校正记录、标签、术语、原话与洞察。
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {projects.map((project) => (
            <button
              className="btn-ghost justify-start"
              key={project.id}
              onClick={() => void exportProjectBundle(project.id)}
            >
              备份：{project.name}
            </button>
          ))}
        </div>
        <label className="btn-primary mt-4 cursor-pointer">
          恢复项目备份
          <input
            className="hidden"
            type="file"
            accept=".json"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}
