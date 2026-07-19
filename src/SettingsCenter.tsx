import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, now, uid } from "./db";
import { can, exportProjectBundle, importProjectBundle } from "./p2Services";
import type { MemberRole, ReportTemplate } from "./types";

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
      setMessage(`项目“${project.name}”已恢复。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败");
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
        <p className="text-sm text-brand-700">P2 产品化设置</p>
        <h1 className="text-3xl font-bold">工作区与交付能力</h1>
        </div>
        <label className="w-56"><span className="label">当前身份</span><select className="input" value={currentRole} onChange={(event) => { const next = event.target.value as MemberRole; setCurrentRole(next); localStorage.setItem("researchbox-current-role", next); }}><option>所有者</option><option>管理员</option><option>研究员</option><option>访客</option></select></label>
        {message && (
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            {message}
          </p>
        )}
      </div>
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
      <div className="card p-5">
        <h2 className="font-semibold">转写服务策略</h2>
        <p className="mt-2 text-sm text-slate-600">
          本地 Agent 继续保留；云端 ASR
          通过统一任务接口接入。当前产品默认从已有笔录开始，不会强制上传音频。
        </p>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          适配器约定：健康检查 → 提交任务 → 查询进度 → 标准化片段 →
          进入待校正状态。
        </div>
      </div>
    </section>
  );
}
