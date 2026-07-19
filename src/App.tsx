import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { db, now, resetDemoData, uid } from "./db";
import { parseTranscript } from "./correction";
const TranscriptWorkspace = lazy(() => import("./TranscriptWorkspace").then((module) => ({ default: module.TranscriptWorkspace })));
const SummaryPage = lazy(() => import("./SummaryPage").then((module) => ({ default: module.SummaryPage })));
const SettingsCenter = lazy(() => import("./SettingsCenter").then((module) => ({ default: module.SettingsCenter })));
const QuickReportPage = lazy(() => import("./QuickReportPage"));
import { exportResearchPptx } from "./p2Services";
import { analyzeProjectWithAi, generateReportWithAi, generateReportFromTranscriptsWithAi, hasUserApiKey, getUserAiConfig } from "./aiClient";
import { contraryCases, evidenceStrength, tagCooccurrence } from "./researchAnalytics";
import { useStore, startHealthPolling, stopHealthPolling } from "./store";
import { ToastContainer } from "./Toast";
import type {
  Insight,
  Interview,
  Project,
  Quote,
  Respondent,
  ResearchType,
  Segment,
  Tag,
  TagType,
} from "./types";

const researchTypes: ResearchType[] = [
  "用户访谈",
  "市场深访",
  "焦点小组",
  "专家访谈",
  "开放题分析",
  "可用性测试",
  "其他",
];
const tagTypes: TagType[] = [
  "主题标签",
  "痛点标签",
  "需求标签",
  "情绪标签",
  "行为标签",
  "决策因素",
  "阻碍因素",
  "人群特征",
  "自定义标签",
];
const tagColors = [
  "#0d9488",
  "#f59e0b",
  "#6366f1",
  "#ef4444",
  "#8b5cf6",
  "#0891b2",
  "#84cc16",
  "#f97316",
];

function App() {
  return (
    <div className="min-h-full bg-slate-50">
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/correction" element={<CorrectionHub />} />
          <Route path="/coding" element={<CodingHub />} />
          <Route path="/insights" element={<InsightsHub />} />
          <Route path="/summary" element={<Suspense fallback={<PageLoading />}><SummaryPage /></Suspense>} />
          <Route path="/knowledge" element={<KnowledgeSearchPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/transcript/:interviewId" element={<TranscriptPage />} />
          <Route path="/transcript/:interviewId/:mode" element={<TranscriptPage />} />
          <Route path="/insights/:projectId" element={<InsightsPage />} />
          <Route path="/reports" element={<ReportsHub />} />
          <Route path="/reports/:projectId" element={<ReportPage />} />
          <Route path="/quick-report" element={<Suspense fallback={<PageLoading />}><QuickReportPage /></Suspense>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Shell>
      <ToastContainer />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const projects = useLiveQuery(() => db.projects.count(), [], 0);
  const interviews = useLiveQuery(() => db.interviews.count(), [], 0);
  const aiHealth = useStore((s) => s.aiHealth);

  useEffect(() => {
    startHealthPolling();
    return () => stopHealthPolling();
  }, []);

  const navGroups = [
    {
      label: "",
      items: [["/", "概览", "home"]] as const,
    },
    {
      label: "数据准备",
      items: [
        ["/correction", "笔录校正", "correction"],
      ] as const,
    },
    {
      label: "数据加工",
      items: [
        ["/coding", "标签编码", "coding"],
        ["/insights", "洞察分析", "insights"],
        ["/knowledge", "知识检索", "search"],
      ] as const,
    },
    {
      label: "结果交付",
      items: [
        ["/quick-report", "快速报告", "quick-report"],
        ["/summary", "访谈小结", "summary"],
        ["/reports", "定性报告", "report"],
      ] as const,
    },
    { label: "系统", items: [["/settings", "设置", "settings"]] as const },
  ] as const;

  // 移动端底部导航精简为 5 个核心入口
  const mobileNavItems = [
    ["/", "概览", "home"],
    ["/correction", "校正", "correction"],
    ["/coding", "编码", "coding"],
    ["/insights", "洞察", "insights"],
    ["/summary", "小结", "summary"],
  ] as const;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950 p-5 text-white lg:flex lg:flex-col">
        <Link to="/" className="flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white shadow-lg shadow-brand-950/20">
            RB
          </span>
          <span>
            <span className="block text-lg font-semibold">ResearchBox</span>
            <span className="block text-xs text-slate-400">
              AI 定性研究工作台
            </span>
          </span>
        </Link>
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">我的研究工作区</span>
            <span className="badge bg-brand-500/15 text-brand-300">专业版</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-lg bg-slate-800 px-2 py-2">
              {projects} 个项目
            </span>
            <span className="rounded-lg bg-slate-800 px-2 py-2">
              {interviews} 份访谈
            </span>
          </div>
        </div>
        <nav className="mt-6 flex-1 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label || "overview"}>
              {group.label && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(([to, label, icon]) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand-500 text-white shadow-md shadow-brand-950/20" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`
                    }
                    end={to === "/"}
                  >
                    <NavIcon name={icon} />
                    <span>{label}</span>
                    {(to === "/correction" || to === "/coding") && (
                      <span className="ml-auto text-xs opacity-70">
                        {interviews}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${hasUserApiKey() || aiHealth?.configured ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            <span className="font-medium">
              AI 代理 {hasUserApiKey() || aiHealth?.configured ? "已连接" : "未配置 Key"}
            </span>
          </div>
          <p className="pl-4 text-slate-500">
            {getUserAiConfig()?.model || aiHealth?.model || "未配置"}
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/" className="font-semibold text-brand-800">
            ResearchBox
          </Link>
          <details className="relative">
            <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
            </summary>
            <div className="absolute right-0 top-10 z-50 w-44 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
              <Link to="/knowledge" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">知识检索</Link>
              <Link to="/reports" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">定性报告</Link>
              <Link to="/settings" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">设置</Link>
            </div>
          </details>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white px-0.5 py-1.5 lg:hidden">
          {mobileNavItems.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] ${isActive ? "text-brand-700" : "text-slate-500"}`
              }
              end={to === "/"}
            >
              <NavIcon name={icon} />
              {label}
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    transcribe:
      "M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z",
    correction:
      "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.3 5.3-9 9-1.4-1.4 9-9 1.4 1.4z",
    coding:
      "M8 6l-6 6 6 6 1.5-1.5L5 12l4.5-4.5L8 6zm8 0l-1.5 1.5L19 12l-4.5 4.5L16 18l6-6-6-6z",
    insights:
      "M3 13h2v8H3zm4-6h2v14H7zm4 3h2v11h-2zm4-7h2v18h-2zm4 4h2v14h-2z",
    summary:
      "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zm2 2v2h12V7H6zm0 4v2h7v-2H6zm0 4v2h10v-2H6z",
    report:
      "M7 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4H7zm5 1 3 3h-3V4zM8 12h8v1.5H8V12zm0 3h6v1.5H8V15z",
    "quick-report":
      "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
    settings:
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.7a1.7 1.7 0 0 0-1.56-1.04H5v-3h.08A1.7 1.7 0 0 0 6.64 9.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.34 4.4V4h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04H21v3h-.08A1.7 1.7 0 0 0 19.4 15z",
  };
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.home} />
    </svg>
  );
}

function ProjectsPage() {
  const projects = useLiveQuery(
    () => db.projects.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const interviews = useLiveQuery(() => db.interviews.toArray(), [], []);
  const [query, setQuery] = useState("");
  const filtered = projects.filter((project) =>
    `${project.name}${project.objective}${project.industry || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-brand-700">PROJECTS</p>
          <h1 className="mt-1 text-3xl font-bold">研究项目</h1>
          <p className="mt-2 text-slate-500">
            集中管理研究背景、访谈资料、编码、洞察与交付报告。
          </p>
        </div>
        <Link className="btn-primary" to="/">
          新建研究项目
        </Link>
      </div>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索项目名称、目标或行业"
        />
        <span className="badge shrink-0 bg-slate-100 text-slate-600">
          全部 {projects.length}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => {
          const count = interviews.filter(
            (item) => item.projectId === project.id,
          ).length;
          return (
            <Link
              to={`/projects/${project.id}`}
              className="card group p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              key={project.id}
            >
              <div className="flex items-start justify-between">
                <span className="badge bg-brand-50 text-brand-800">
                  {project.researchType}
                </span>
                <StatusBadge text={project.status} />
              </div>
              <h2 className="mt-4 text-lg font-semibold group-hover:text-brand-700">
                {project.name}
              </h2>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-500">
                {project.objective}
              </p>
              <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-slate-500">
                <span>{count} 份访谈</span>
                <span>
                  {new Date(project.updatedAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!filtered.length && <EmptyState text="没有找到匹配的研究项目。" />}
    </section>
  );
}

function CorrectionHub() {
  const interviews = useLiveQuery(
    () => db.interviews.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const [query, setQuery] = useState("");

  const filtered = interviews.filter((item) =>
    `${item.title}${item.fileName || ""}${item.transcriptStatus}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const statusCounts = {
    待校正: interviews.filter((i) => i.transcriptStatus === "待校正").length,
    校正中: interviews.filter((i) => i.transcriptStatus === "校正中").length,
    已确认: interviews.filter((i) => i.transcriptStatus === "已确认").length,
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-brand-700">数据准备 · 第二步</p>
          <h1 className="mt-1 text-3xl font-bold">笔录校正</h1>
          <p className="mt-2 text-slate-500">
            修正 ASR 错别字、添加标点、分配说话人角色。校正完成后即可进入标签编码。
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="card p-4">
            <p className="text-2xl font-bold text-slate-900">{count}</p>
            <p className="text-xs text-slate-500">{status}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索访谈标题、文件名或状态"
        />
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-4">访谈资料</th>
                <th className="p-4">所属项目</th>
                <th className="p-4">笔录状态</th>
                <th className="p-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => (
                <tr className="hover:bg-slate-50" key={item.id}>
                  <td className="p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.fileName || item.sourceType}
                    </p>
                  </td>
                  <td className="p-4 text-slate-600">
                    {projects.find((project) => project.id === item.projectId)
                      ?.name || "未知项目"}
                  </td>
                  <td className="p-4">
                    <StatusBadge text={item.transcriptStatus} />
                  </td>
                  <td className="p-4">
                    <Link
                      className="font-medium text-brand-700 hover:underline"
                      to={`/transcript/${item.id}/correction`}
                    >
                      打开校正
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CodingHub() {
  const interviews = useLiveQuery(
    () => db.interviews.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const segments = useLiveQuery(() => db.segments.toArray(), [], []);
  const [query, setQuery] = useState("");

  const confirmed = interviews.filter(
    (i) => i.transcriptStatus === "已确认",
  );
  const filtered = confirmed.filter((item) =>
    `${item.title}${item.fileName || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  function getTagCount(interviewId: string) {
    return segments.filter(
      (s) => s.interviewId === interviewId && s.tags.length > 0,
    ).length;
  }

  function getTotalSegments(interviewId: string) {
    return segments.filter((s) => s.interviewId === interviewId).length;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-brand-700">数据加工 · 第一步</p>
          <h1 className="mt-1 text-3xl font-bold">标签编码</h1>
          <p className="mt-2 text-slate-500">
            为已校正的访谈片段打上主题、痛点、需求等标签。编码完成后即可生成洞察。
          </p>
        </div>
        <Link className="btn-primary" to="/correction">
          去校正笔录
        </Link>
      </div>

      {confirmed.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-6 text-center">
          <p className="text-sm text-slate-600">
            还没有已确认的笔录。先去
            <Link to="/correction" className="font-medium text-brand-700 hover:underline">
              {" "}笔录校正{" "}
            </Link>
            完成校正并确认笔录吧。
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <p className="text-2xl font-bold text-slate-900">{confirmed.length}</p>
              <p className="text-xs text-slate-500">已确认笔录</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-slate-900">
                {confirmed.filter((i) => getTagCount(i.id) > 0).length}
              </p>
              <p className="text-xs text-slate-500">已开始编码</p>
            </div>
          </div>

          <div className="card p-4">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索访谈标题"
            />
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">访谈资料</th>
                    <th className="p-4">所属项目</th>
                    <th className="p-4">编码进度</th>
                    <th className="p-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => {
                    const tagged = getTagCount(item.id);
                    const total = getTotalSegments(item.id);
                    return (
                      <tr className="hover:bg-slate-50" key={item.id}>
                        <td className="p-4">
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.fileName || item.sourceType}
                          </p>
                        </td>
                        <td className="p-4 text-slate-600">
                          {projects.find((project) => project.id === item.projectId)
                            ?.name || "未知项目"}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded bg-slate-100">
                              <div
                                className="h-2 rounded bg-brand-500"
                                style={{ width: `${total > 0 ? (tagged / total) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{tagged}/{total}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Link
                            className="font-medium text-brand-700 hover:underline"
                            to={`/transcript/${item.id}/coding`}
                          >
                            打开编码
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function InsightsHub() {
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const insights = useLiveQuery(() => db.insights.toArray(), [], []);
  const interviews = useLiveQuery(() => db.interviews.toArray(), [], []);

  const projectStats = projects.map((project) => {
    const projectInterviews = interviews.filter(
      (i) => i.projectId === project.id,
    );
    const projectInsights = insights.filter((i) => i.projectId === project.id);
    const confirmedInterviews = projectInterviews.filter(
      (i) => i.transcriptStatus === "已确认",
    ).length;
    return {
      project,
      interviewCount: projectInterviews.length,
      confirmedCount: confirmedInterviews,
      insightCount: projectInsights.length,
    };
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-700">数据加工 · 第二步</p>
        <h1 className="mt-1 text-3xl font-bold">洞察分析</h1>
        <p className="mt-2 text-slate-500">
          选择一个项目，生成洞察分析并确认有价值的洞察。流程：生成洞察 → 确认洞察 → 编辑报告。
        </p>
      </div>

      {projectStats.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-6 text-center">
          <p className="text-sm text-slate-600">
            还没有项目。先在笔录校正中导入访谈资料吧。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projectStats.map(({ project, interviewCount, confirmedCount, insightCount }) => (
            <div key={project.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{project.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {project.researchType}
                  </p>
                </div>
                <span className={`badge ${insightCount > 0 ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {insightCount > 0 ? `${insightCount} 条洞察` : "未分析"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold">{interviewCount}</p>
                  <p className="text-xs text-slate-500">访谈</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold">{confirmedCount}</p>
                  <p className="text-xs text-slate-500">已确认</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold">{insightCount}</p>
                  <p className="text-xs text-slate-500">洞察</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  to={`/insights/${project.id}`}
                  className="btn-primary flex-1 text-center text-sm"
                >
                  进入分析
                </Link>
                <Link
                  to={`/reports/${project.id}`}
                  className="btn-ghost flex-1 text-center text-sm"
                >
                  编辑报告
                </Link>
              </div>
              {confirmedCount < interviewCount && (
                <p className="mt-2 text-xs text-amber-600">
                  还有 {interviewCount - confirmedCount} 份访谈未确认笔录，建议先完成校正。
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Dashboard() {
  const projects = useLiveQuery(
    () => db.projects.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const interviews = useLiveQuery(
    () => db.interviews.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const insights = useLiveQuery(
    () => db.insights.orderBy("createdAt").reverse().toArray(),
    [],
    [],
  );
  const segments = useLiveQuery(() => db.segments.toArray(), [], []);
  const summaryRuns = useLiveQuery(() => db.summaryRuns.toArray(), [], []);
  const reports = useLiveQuery(() => db.reports.toArray(), [], []);
  const [showForm, setShowForm] = useState(false);

  const stats = [
    ["项目数", projects.length],
    ["访谈资料", interviews.length],
    [
      "待校正",
      interviews.filter((item) => item.transcriptStatus === "待校正").length,
    ],
    ["洞察草稿", insights.filter((item) => item.status === "草稿").length],
  ];

  function projectProgress(pid: string): number {
    const pInterviews = interviews.filter((i) => i.projectId === pid);
    if (pInterviews.length === 0) return 0;
    let done = 0;
    const confirmed = pInterviews.filter((i) => i.transcriptStatus === "已确认").length;
    if (confirmed > 0) done++;
    const pSegments = segments.filter((s) => pInterviews.some((i) => i.id === s.interviewId));
    if (pSegments.some((s) => s.tags.length > 0)) done++;
    if (insights.some((i) => i.projectId === pid && i.status === "已确认")) done++;
    if (summaryRuns.some((r) => r.projectId === pid)) done++;
    if (reports.some((r) => r.projectId === pid)) done++;
    return Math.round((done / 5) * 100);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-brand-700">
            AI 定性研究工作台
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            把访谈资料转化为可编码、可引用、可导出的研究洞察
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void resetDemoData()}>
            重置示例数据
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            新建项目
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div className="card p-5" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {showForm && <ProjectForm onClose={() => setShowForm(false)} />}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">最近项目</h2>
            <button className="btn-ghost" onClick={() => setShowForm(true)}>
              创建
            </button>
          </div>
          <div className="grid gap-3">
            {projects.map((project) => {
              const progress = projectProgress(project.id);
              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {project.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {project.objective}
                      </p>
                    </div>
                    <span className="badge bg-brand-50 text-brand-800">
                      {project.researchType}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{progress}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-lg font-semibold">研究流程</h2>
            <div className="mt-4 space-y-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">数据准备</div>
              <Link to="/correction" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">1</span>
                <span className="text-sm font-medium">笔录校正 — 修正错别字、标点、说话人角色</span>
              </Link>
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">数据加工</div>
              <Link to="/coding" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">2</span>
                <span className="text-sm font-medium">标签编码 — 为片段打上主题、痛点、需求标签</span>
              </Link>
              <Link to="/insights" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">3</span>
                <span className="text-sm font-medium">洞察分析 — 跨访谈聚合、生成与确认洞察</span>
              </Link>
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">结果交付</div>
              <Link to="/summary" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">4</span>
                <span className="text-sm font-medium">访谈小结 — 按维度整理每位受访者的详细小结</span>
              </Link>
              <Link to="/reports" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">5</span>
                <span className="text-sm font-medium">定性报告 — 导出完整研究报告（Markdown/DOCX/PPTX）</span>
              </Link>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-semibold">最近洞察</h2>
            <div className="mt-3 space-y-3">
              {insights.slice(0, 4).map((insight) => (
                <div key={insight.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">{insight.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {insight.description}
                  </p>
                </div>
              ))}
              {insights.length === 0 && (
                <EmptyState text="还没有洞察，先导入一份访谈资料。" />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    researchType: "用户访谈" as ResearchType,
    objective: "",
    description: "",
    industry: "",
    targetGroup: "",
    owner: "",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.objective.trim()) return;
    const timestamp = now();
    const project: Project = {
      id: uid("project"),
      name: form.name.trim(),
      researchType: form.researchType,
      objective: form.objective.trim(),
      description: form.description.trim(),
      industry: form.industry.trim(),
      targetGroup: form.targetGroup.trim(),
      owner: form.owner.trim(),
      status: "进行中",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.projects.add(project);
    onClose();
    navigate(`/projects/${project.id}`);
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">新建研究项目</h2>
        <button
          type="button"
          className="text-sm text-slate-500 hover:text-slate-900"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="项目名称" required>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例如：新品概念用户访谈"
          />
        </Field>
        <Field label="研究类型">
          <select
            className="input"
            value={form.researchType}
            onChange={(e) =>
              setForm({ ...form, researchType: e.target.value as ResearchType })
            }
          >
            {researchTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="研究目标" required>
          <textarea
            className="input min-h-24"
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
          />
        </Field>
        <Field label="项目描述">
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="行业/品类">
          <input
            className="input"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
        </Field>
        <Field label="目标人群">
          <input
            className="input"
            value={form.targetGroup}
            onChange={(e) => setForm({ ...form, targetGroup: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <button className="btn-primary">创建项目</button>
      </div>
    </form>
  );
}

function ProjectDetail() {
  const { projectId = "" } = useParams();
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const interviews = useLiveQuery(
    () => db.interviews.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const tags = useLiveQuery(
    () => db.tags.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const insights = useLiveQuery(
    () => db.insights.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const segments = useLiveQuery(
    () => db.segments.where("interviewId").anyOf(interviews.map((i) => i.id)).toArray(),
    [interviews],
    [],
  );
  const summaryRuns = useLiveQuery(
    () => db.summaryRuns.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const reports = useLiveQuery(
    () => db.reports.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );

  const stages = useMemo(() => {
    const confirmed = interviews.filter((i) => i.transcriptStatus === "已确认").length;
    const coded = segments.filter((s) => s.tags.length > 0).length;
    const confirmedInsights = insights.filter((i) => i.status === "已确认").length;
    return [
      { label: "笔录校正", count: confirmed, total: interviews.length, done: confirmed > 0, link: `/correction?projectId=${projectId}` },
      { label: "标签编码", count: coded, total: segments.length || 1, done: coded > 0, link: `/coding?projectId=${projectId}` },
      { label: "洞察分析", count: confirmedInsights, total: insights.length || 1, done: confirmedInsights > 0, link: `/insights/${projectId}` },
      { label: "访谈小结", count: summaryRuns.length, total: 1, done: summaryRuns.length > 0, link: "/summary" },
      { label: "定性报告", count: reports.length, total: 1, done: reports.length > 0, link: `/reports/${projectId}` },
    ];
  }, [interviews, segments, insights, summaryRuns, reports, projectId]);

  const completedStages = stages.filter((s) => s.done).length;
  const overallProgress = Math.round((completedStages / 5) * 100);

  if (!project) return <EmptyState text="没有找到这个项目。" />;

  return (
    <section className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <span className="badge bg-brand-50 text-brand-800">
              {project.researchType}
            </span>
            <h1 className="mt-3 text-3xl font-bold text-slate-950">
              {project.name}
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">{project.objective}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/insights/${project.id}`} className="btn-primary">
              洞察面板
            </Link>
            <Link to={`/reports/${project.id}`} className="btn-ghost">
              报告导出
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="访谈数" value={interviews.length} />
          <Metric
            label="已转写"
            value={
              interviews.filter((item) => item.transcriptStatus === "转写完成")
                .length
            }
          />
          <Metric label="标签数" value={tags.length} />
          <Metric label="洞察数" value={insights.length} />
        </div>
      </div>

      {/* F2: 研究进度看板 */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">研究进度</h2>
          <span className="text-sm text-slate-500">
            {completedStages}/6 阶段完成 · {overallProgress}%
          </span>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stages.map((stage, index) => (
            <Link
              key={stage.label}
              to={stage.link}
              className={`flex items-center gap-3 rounded-xl border p-3 transition hover:border-brand-300 hover:bg-brand-50/30 ${
                stage.done
                  ? "border-green-200 bg-green-50/40"
                  : "border-slate-200"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  stage.done
                    ? "bg-green-500 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {stage.done ? "✓" : index + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {stage.label}
                </p>
                <p className="text-xs text-slate-500">
                  {stage.total > 1
                    ? `${stage.count}/${stage.total}`
                    : stage.done
                      ? "已完成"
                      : "未开始"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="card p-5">
          <h2 className="text-lg font-semibold">访谈资料</h2>
          {interviews.length === 0 ? (
            <div className="mt-4 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-6">
              <h3 className="text-base font-semibold text-brand-800">
                开始你的研究流程
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                按照以下步骤，把访谈资料转化为可引用的研究洞察：
              </p>
              <div className="mt-4 grid gap-3">
                <GuideStep
                  step={1}
                  title="校正逐字稿"
                  desc="修正错别字、添加标点、分配说话人角色"
                />
                <GuideStep
                  step={2}
                  title="标签编码"
                  desc="为片段打上主题、痛点、需求等标签"
                />
                <GuideStep
                  step={3}
                  title="生成洞察与报告"
                  desc="本地规则或 AI 聚合分析，导出 DOCX/PPTX 报告"
                  linkTo={`/insights/${project.id}`}
                  linkText="去分析 →"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3">标题</th>
                    <th className="p-3">转写</th>
                    <th className="p-3">分析</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {interviews.map((interview) => (
                    <tr key={interview.id}>
                      <td className="p-3 font-medium text-slate-900">
                        {interview.title}
                      </td>
                      <td className="p-3">
                        <StatusBadge text={interview.transcriptStatus} />
                      </td>
                      <td className="p-3">
                        <StatusBadge text={interview.analysisStatus} />
                      </td>
                      <td className="p-3">
                        <Link
                          className="text-brand-700 hover:underline"
                          to={`/transcript/${interview.id}`}
                        >
                          打开逐字稿
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <TagPanel projectId={project.id} />
      </div>
    </section>
  );
}

function TranscriptPage() {
  const { interviewId = "", mode } = useParams();
  const resolvedMode = mode === "coding" ? "coding" : "correction";
  return (
    <Suspense fallback={<PageLoading />}>
      <TranscriptWorkspace key={`${interviewId}-${resolvedMode}`} interviewId={interviewId} initialMode={resolvedMode} />
    </Suspense>
  );
}

function PageLoading() {
  return <div className="card p-8 text-center text-sm text-slate-500">正在加载工作区…</div>;
}

function KnowledgeSearchPage() {
  const [query, setQuery] = useState("");
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const interviews = useLiveQuery(() => db.interviews.toArray(), [], []);
  const segments = useLiveQuery(() => db.segments.toArray(), [], []);
  const insights = useLiveQuery(() => db.insights.toArray(), [], []);
  const normalized = query.trim().toLowerCase();
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const interviewById = new Map(interviews.map((interview) => [interview.id, interview]));
  const segmentResults = normalized ? segments.filter((segment) => `${segment.text} ${segment.tags.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 30) : [];
  const insightResults = normalized ? insights.filter((insight) => `${insight.title} ${insight.description} ${insight.relatedTags.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 20) : [];
  return <section className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-950">跨项目知识检索</h1><p className="mt-2 text-sm text-slate-500">同时检索已校正原文、标签和洞察，结果可直接回到证据位置。</p></div>
    <input className="input w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索观点、标签、产品名或研究主题…" />
    {!normalized ? <div className="card p-8 text-center text-sm text-slate-400">输入关键词开始检索。</div> : <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5"><h2 className="font-semibold">原文片段 · {segmentResults.length}</h2><div className="mt-4 space-y-3">{segmentResults.map((segment) => { const interview = interviewById.get(segment.interviewId); const project = interview ? projectById.get(interview.projectId) : undefined; return <Link key={segment.id} className="block rounded-lg border border-slate-200 p-3 hover:border-brand-300" to={`/transcript/${segment.interviewId}/coding?segment=${segment.id}`}><p className="text-xs text-slate-400">{project?.name} / {interview?.title}</p><p className="mt-1 line-clamp-3 text-sm">{segment.text}</p></Link>; })}</div></div>
      <div className="card p-5"><h2 className="font-semibold">研究洞察 · {insightResults.length}</h2><div className="mt-4 space-y-3">{insightResults.map((insight) => <Link key={insight.id} className="block rounded-lg border border-slate-200 p-3 hover:border-brand-300" to={`/insights/${insight.projectId}`}><p className="text-xs text-slate-400">{projectById.get(insight.projectId)?.name}</p><p className="mt-1 font-medium">{insight.title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{insight.description}</p></Link>)}</div></div>
    </div>}
  </section>;
}

function TagPanel({ projectId }: { projectId: string }) {
  const tags = useLiveQuery(
    () => db.tags.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<TagType>("主题标签");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");

  async function addTag(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const tag: Tag = {
      id: uid("tag"),
      projectId,
      name: name.trim(),
      type,
      description: description.trim() || undefined,
      parentId: parentId || undefined,
      color: tagColors[tags.length % tagColors.length],
      usageCount: 0,
      createdAt: now(),
    };
    await db.tags.add(tag);
    setName("");
    setDescription("");
    setParentId("");
  }

  async function renameTag(tag: Tag) {
    const next = window.prompt("新的标签名称", tag.name)?.trim();
    if (!next || next === tag.name) return;
    const interviews = await db.interviews
      .where("projectId")
      .equals(projectId)
      .primaryKeys();
    await db.transaction("rw", db.tags, db.segments, db.quotes, async () => {
      const segments = await db.segments
        .where("interviewId")
        .anyOf(interviews.length ? interviews : ["none"])
        .toArray();
      for (const segment of segments)
        if (segment.tags.includes(tag.name))
          await db.segments.update(segment.id, {
            tags: segment.tags.map((item) => (item === tag.name ? next : item)),
          });
      const quotes = await db.quotes
        .where("projectId")
        .equals(projectId)
        .toArray();
      for (const quote of quotes)
        if (quote.tags.includes(tag.name))
          await db.quotes.update(quote.id, {
            tags: quote.tags.map((item) => (item === tag.name ? next : item)),
          });
      await db.tags.update(tag.id, { name: next });
    });
  }

  async function deleteTag(tag: Tag) {
    if (!window.confirm(`删除标签“${tag.name}”？已有片段上的该标签也会移除。`))
      return;
    const interviews = await db.interviews
      .where("projectId")
      .equals(projectId)
      .primaryKeys();
    await db.transaction("rw", db.tags, db.segments, db.quotes, async () => {
      const segments = await db.segments
        .where("interviewId")
        .anyOf(interviews.length ? interviews : ["none"])
        .toArray();
      for (const segment of segments)
        if (segment.tags.includes(tag.name))
          await db.segments.update(segment.id, {
            tags: segment.tags.filter((item) => item !== tag.name),
          });
      await db.tags.delete(tag.id);
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold">标签体系</h2>
      <form onSubmit={addTag} className="mt-4 grid gap-2">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新建标签，如 价格敏感"
        />
        <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as TagType)}
        >
          {tagTypes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">无上级标签</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
        <textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="标签定义、适用范围与排除规则" />
        <button className="btn-primary">添加标签</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="chip text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.parentId ? "↳ " : ""}{tag.name} · {tag.usageCount}{tag.createdBy === "AI" ? " · AI新建" : ""}
            <button title="重命名" onClick={() => void renameTag(tag)}>
              ✎
            </button>
            <button title="删除" onClick={() => void deleteTag(tag)}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function InsightsPage() {
  const { projectId = "" } = useParams();
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const interviews = useLiveQuery(
    () => db.interviews.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const insights = useLiveQuery(
    () => db.insights.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const quotes = useLiveQuery(
    () => db.quotes.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const segments = useLiveQuery(
    async () => {
      const items = await db.interviews
        .where("projectId")
        .equals(projectId)
        .toArray();
      const ids = items.map((item) => item.id);
      return db.segments
        .where("interviewId")
        .anyOf(ids.length ? ids : ["none"])
        .toArray();
    },
    [projectId],
    [],
  );
  const respondents = useLiveQuery(
    () => db.respondents.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const [aiStatus, setAiStatus] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const aiHealth = useStore((s) => s.aiHealth);
  const addToast = useStore((s) => s.addToast);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((segment) =>
      segment.tags.forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1)),
    );
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [segments]);

  const coverage = useMemo(
    () =>
      tagCounts.map(([tag, count]) => {
        const interviewIds = [
          ...new Set(
            segments
              .filter((segment) => segment.tags.includes(tag))
              .map((segment) => segment.interviewId),
          ),
        ];
        return {
          tag,
          count,
          interviewIds,
          rate: interviews.length
            ? Math.round((interviewIds.length / interviews.length) * 100)
            : 0,
        };
      }),
    [tagCounts, segments, interviews.length],
  );

  const groupComparison = useMemo(() => {
    const interviewByRespondent = new Map(
      interviews.map((item) => [
        item.id,
        respondents.find((respondent) => respondent.id === item.respondentId),
      ]),
    );
    const map = new Map<string, Map<string, Set<string>>>();
    segments.forEach((segment) => {
      const respondent = interviewByRespondent.get(segment.interviewId);
      const group = respondent?.userType || respondent?.city || "未分组";
      segment.tags.forEach((tag) => {
        if (!map.has(group)) map.set(group, new Map());
        if (!map.get(group)!.has(tag)) map.get(group)!.set(tag, new Set());
        map.get(group)!.get(tag)!.add(segment.interviewId);
      });
    });
    return [...map.entries()].map(([group, tags]) => ({
      group,
      top: [...tags.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 3),
    }));
  }, [segments, interviews, respondents]);
  const cooccurrence = useMemo(() => tagCooccurrence(segments).slice(0, 8), [segments]);
  const exceptions = useMemo(() => coverage[0] ? contraryCases(segments, coverage[0].tag).slice(0, 5) : [], [segments, coverage]);

  async function generateInsights() {
    if (!project) return;
    const timestamp = now();
    const aggregateInsights: Insight[] = coverage
      .slice(0, 5)
      .map(({ tag, count, interviewIds, rate }) => ({
        id: uid("insight"),
        projectId,
        title: `${tag} 是当前资料中的高频主题`,
        description: `“${tag}”覆盖 ${interviewIds.length}/${interviews.length} 份访谈（${rate}%），共有 ${count} 段原文证据。`,
        type:
          tag.includes("痛") || tag.includes("价格") ? "痛点分析" : "主题聚合",
        evidenceCount: count,
        relatedTags: [tag],
        quoteIds: quotes
          .filter((quote) => quote.tags.includes(tag))
          .map((quote) => quote.id),
        segmentIds: segments
          .filter((segment) => segment.tags.includes(tag))
          .map((segment) => segment.id),
        interviewIds,
        inputVersion: Math.max(
          1,
          ...interviews.map((item) => item.transcriptVersion || 1),
        ),
        status: "草稿",
        createdBy: "AI模拟",
        createdAt: timestamp,
      }));
    const summaries: Insight[] = interviews.map((interview) => {
      const evidence = segments.filter(
        (segment) =>
          segment.interviewId === interview.id && segment.role !== "研究员",
      );
      const topTags = [
        ...new Set(evidence.flatMap((segment) => segment.tags)),
      ].slice(0, 4);
      const highlights = evidence
        .filter((segment) => segment.tags.length)
        .slice(0, 3);
      return {
        id: uid("insight"),
        projectId,
        title: `${interview.title}｜单访谈摘要`,
        description: highlights.length
          ? `受访者重点提及${topTags.join("、") || "尚未编码的议题"}。代表性观点：${highlights.map((item) => `“${item.text}”`).join("；")}`
          : "该访谈尚缺少已编码的受访者观点，请先完成笔录校正与编码。",
        type: "单访谈摘要",
        evidenceCount: highlights.length,
        relatedTags: topTags,
        quoteIds: quotes
          .filter((quote) => quote.interviewId === interview.id)
          .map((quote) => quote.id),
        segmentIds: highlights.map((item) => item.id),
        interviewIds: [interview.id],
        inputVersion: interview.transcriptVersion || 1,
        status: "草稿",
        createdBy: "AI模拟",
        createdAt: timestamp,
      };
    });
    const newInsights = [...summaries, ...aggregateInsights];
    if (newInsights.length) {
      await db.insights
        .where("projectId")
        .equals(projectId)
        .filter((item) => item.createdBy === "AI模拟")
        .delete();
      await db.insights.bulkAdd(newInsights);
      await db.interviews
        .where("projectId")
        .equals(projectId)
        .modify({ analysisStatus: "已纳入聚合分析" });
    }
  }

  async function generateBailianInsights() {
    if (!project) return;
    if (
      !window.confirm(
        "将把当前项目的逐字稿文本、标签和样本分组信息发送至AI 服务进行分析；原始音频不会上传。是否继续？",
      )
    )
      return;
    setAiRunning(true);
    setAiStatus("AI正在跨访谈分析，请稍候...");
    try {
      const response = await analyzeProjectWithAi(
        project,
        interviews,
        respondents,
        segments,
        quotes,
      );
      const timestamp = now();
      const generated: Insight[] = (response.data.insights || []).map(
        (item) => ({
          id: uid("insight"),
          projectId,
          title: item.title,
          description: item.description,
          type: item.type,
          evidenceCount: item.segmentIds?.length || 0,
          relatedTags: item.relatedTags || [],
          quoteIds: quotes
            .filter((quote) => item.segmentIds?.includes(quote.segmentId))
            .map((quote) => quote.id),
          segmentIds: item.segmentIds || [],
          interviewIds: item.interviewIds || [],
          inputVersion: Math.max(
            1,
            ...interviews.map((interview) => interview.transcriptVersion || 1),
          ),
          status: "草稿",
          createdBy: "AI",
          createdAt: timestamp,
        }),
      );
      if (!generated.length) throw new Error("AI没有返回可用洞察");
      await db.insights
        .where("projectId")
        .equals(projectId)
        .filter((item) => item.createdBy === "AI")
        .delete();
      await db.insights.bulkAdd(generated);
      await db.interviews
        .where("projectId")
        .equals(projectId)
        .modify({ analysisStatus: "已纳入聚合分析" });
      setAiStatus(
        `${response.model} 已生成 ${generated.length} 条有证据的洞察草稿。`,
      );
      addToast(`AI 已生成 ${generated.length} 条洞察`);
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "AI分析失败");
      addToast("AI 分析失败", "error");
    } finally {
      setAiRunning(false);
    }
  }

  const confirmedInsights = insights.filter((i) => i.status === "已确认");

  async function oneClickInsights() {
    setAiRunning(true);
    setAiStatus("一键洞察：正在生成本地规则分析...");
    try {
      await generateInsights();
      const useAi = aiHealth?.configured || hasUserApiKey();
      if (useAi) {
        setAiStatus("一键洞察：AI 正在跨访谈深度分析...");
        try {
          await generateBailianInsights();
        } catch {
          setAiStatus("一键洞察：AI 分析失败，已保留本地规则结果");
        }
      }
      // 合并去重：按标题前8字相似度判断
      const allDrafts = await db.insights
        .where("projectId")
        .equals(projectId)
        .filter((item) => item.status === "草稿")
        .toArray();
      const seen = new Set<string>();
      const deduped: string[] = [];
      allDrafts.forEach((item) => {
        const key = item.title.slice(0, 8);
        let isDup = false;
        for (const s of seen) {
          if (s === key || s.includes(key) || key.includes(s)) {
            isDup = true;
            break;
          }
        }
        if (!isDup) {
          seen.add(key);
          deduped.push(item.id);
        }
      });
      const toRemove = allDrafts.filter((item) => !deduped.includes(item.id)).map((item) => item.id);
      if (toRemove.length) await db.insights.bulkDelete(toRemove);
      // 自动确认所有草稿洞察
      const draftIds = await db.insights
        .where("projectId")
        .equals(projectId)
        .filter((item) => item.status === "草稿")
        .primaryKeys();
      if (draftIds.length) {
        await db.insights.bulkUpdate(
          draftIds.map((id) => ({ key: id, changes: { status: "已确认" } })),
        );
      }
      const finalCount = draftIds.length;
      addToast(`一键洞察完成，已生成并确认 ${finalCount} 条洞察${useAi ? "（含 AI 深度分析）" : ""}，可前往定性报告一键生成`);
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "一键洞察失败");
      addToast("一键洞察失败", "error");
    } finally {
      setAiRunning(false);
    }
  }

  if (!project) return <EmptyState text="没有找到这个项目。" />;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-slate-500">洞察分析</p>
          <h1 className="text-3xl font-bold text-slate-950">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            洞察 {insights.length} 条（已确认 {confirmedInsights.length}）· 原话 {quotes.length} 条
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/insights">
            返回洞察列表
          </Link>
          <button
            className="btn-primary"
            disabled={aiRunning}
            onClick={() => void oneClickInsights()}
          >
            {aiRunning ? "一键洞察中..." : "一键洞察"}
          </button>
          <button className="btn-ghost" onClick={() => { void generateInsights().then(() => addToast("本地规则分析已完成")); }}>
            本地规则分析
          </button>
          <button
            disabled={!(aiHealth?.configured || hasUserApiKey()) || aiRunning}
            className="btn-ghost"
            onClick={() => void generateBailianInsights()}
          >
            {aiRunning ? "AI分析中..." : "AI 聚合分析"}
          </button>
          <button
            className="btn-ghost"
            disabled={insights.filter((i) => i.status === "草稿").length === 0}
            onClick={async () => {
              const drafts = await db.insights
                .where("projectId")
                .equals(projectId)
                .filter((i) => i.status === "草稿")
                .primaryKeys();
              if (drafts.length) {
                await db.insights.bulkUpdate(drafts.map((id) => ({ key: id, changes: { status: "已确认" } })));
                addToast(`已确认 ${drafts.length} 条草稿洞察`);
              }
            }}
          >
            全部确认
          </button>
          <button
            className="btn-ghost"
            disabled={insights.filter((i) => i.status === "草稿").length === 0}
            onClick={async () => {
              if (!window.confirm("确定删除所有草稿洞察？此操作不可撤销。")) return;
              const drafts = await db.insights
                .where("projectId")
                .equals(projectId)
                .filter((i) => i.status === "草稿")
                .primaryKeys();
              if (drafts.length) {
                await db.insights.bulkDelete(drafts);
                addToast(`已删除 ${drafts.length} 条草稿洞察`);
              }
            }}
          >
            删除草稿
          </button>
          <Link
            className="btn-ghost"
            to={`/reports/${projectId}`}
          >
            编辑研究报告
          </Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-semibold">标签共现</h2>
          <p className="mt-1 text-xs text-slate-500">同一原文片段中共同出现的标签，可用于发现议题关联。</p>
          <div className="mt-4 space-y-2">{cooccurrence.length ? cooccurrence.map((pair) => <div key={`${pair.left}-${pair.right}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{pair.left} × {pair.right}</span><b>{pair.count} 段</b></div>) : <p className="text-sm text-slate-400">完成编码后显示共现关系。</p>}</div>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold">反例与少数观点</h2>
          <p className="mt-1 text-xs text-slate-500">当前高频主题“{coverage[0]?.tag || "暂无"}”未覆盖访谈中的有效观点，需人工复核。</p>
          <div className="mt-4 space-y-2">{exceptions.length ? exceptions.map((segment) => <Link key={segment.id} to={`/transcript/${segment.interviewId}/coding?segment=${segment.id}`} className="block rounded-lg border border-slate-200 p-3 text-sm hover:border-brand-300"><span className="line-clamp-2">{segment.text}</span></Link>) : <p className="text-sm text-slate-400">暂未发现可展示的反例。</p>}</div>
        </div>
      </div>

      {/* 流程引导：生成洞察 → 确认洞察 → 编辑报告 */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-sm">
          {[
            { label: "生成洞察", done: insights.length > 0 },
            { label: "确认洞察", done: confirmedInsights.length > 0 },
            { label: "编辑报告", done: false },
          ].map((step, idx, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done
                    ? "bg-green-500 text-white"
                    : idx === 0 && insights.length === 0
                      ? "bg-brand-500 text-white animate-pulse"
                      : idx === 1 && insights.length > 0 && confirmedInsights.length === 0
                        ? "bg-brand-500 text-white animate-pulse"
                        : idx === 2 && confirmedInsights.length > 0
                          ? "bg-brand-500 text-white animate-pulse"
                          : "bg-slate-100 text-slate-400"
                }`}
              >
                {step.done ? "✓" : idx + 1}
              </span>
              <span
                className={`font-medium ${
                  step.done
                    ? "text-green-700"
                    : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
              {idx < arr.length - 1 && (
                <span className="mx-1 text-slate-300">→</span>
              )}
            </div>
          ))}
          {confirmedInsights.length > 0 && (
            <Link
              to={`/reports/${projectId}`}
              className="ml-auto text-sm font-medium text-brand-700 hover:underline"
            >
              前往编辑报告 →
            </Link>
          )}
        </div>
        {insights.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            还没有洞察。点击上方「一键洞察」快速生成并确认，或用「本地规则分析」「AI 聚合分析」逐步操作，最后编辑研究报告。
          </p>
        )}
        {insights.length > 0 && confirmedInsights.length === 0 && (
          <p className="mt-3 text-xs text-amber-600">
            已有 {insights.length} 条洞察草稿，请在下方逐条确认有价值的洞察，确认后即可导出报告。
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-900">本地规则分析</p>
          <p className="mt-1 text-xs text-slate-500">
            基于标签频次和覆盖率快速生成统计洞察，无需 AI。适合快速概览和高频主题筛查。
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-900">AI 聚合分析</p>
          <p className="mt-1 text-xs text-slate-500">
            语义级跨访谈理解，生成带证据链的深度洞察。需要 AI 接口，会将笔录文本发送至AI 服务（音频不上传）。
          </p>
        </div>
      </div>
      <div
        className={`rounded-xl border p-3 text-sm ${aiHealth?.configured || hasUserApiKey() ? "border-green-200 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-600"}`}
      >
        {aiHealth?.configured || hasUserApiKey()
          ? `AI已连接 · ${getUserAiConfig()?.model || aiHealth?.model}`
          : "请在设置页面配置 API Key"}
        {aiStatus && <span className="ml-2">{aiStatus}</span>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="card p-5">
          <h2 className="text-lg font-semibold">高频主题排行</h2>
          <div className="mt-4 space-y-3">
            {coverage.map(({ tag, count, interviewIds, rate }) => (
              <div key={tag}>
                <div className="flex justify-between text-sm">
                  <span>{tag}</span>
                  <span>
                    {interviewIds.length} 访谈 · {count} 段
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-brand-600"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold">洞察草稿</h2>
          <div className="mt-4 grid gap-3">
            {insights.map((insight) => {
              const evidenceSegments = segments.filter((s) =>
                insight.segmentIds?.includes(s.id),
              );
              const evidenceInterviews = interviews.filter((i) =>
                insight.interviewIds?.includes(i.id),
              );
              return (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  evidenceSegments={evidenceSegments}
                  evidenceInterviews={evidenceInterviews}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="text-lg font-semibold">人群观点比较</h2>
        <p className="mt-1 text-sm text-slate-500">
          优先按用户类型分组，缺失时使用城市。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {groupComparison.map((group) => (
            <div className="rounded-xl border p-4" key={group.group}>
              <p className="font-semibold">{group.group}</p>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {group.top.map(([tag, ids]) => (
                  <p key={tag}>
                    {tag}：{ids.size} 位/份受访者
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <QuoteLibrary quotes={quotes} />
    </section>
  );
}

function QuoteLibrary({ quotes }: { quotes: Quote[] }) {
  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold">典型原话库</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quotes.map((quote) => (
          <blockquote
            key={quote.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-slate-800">“{quote.text}”</p>
            <footer className="mt-3 text-xs text-slate-500">
              {quote.speakerRole} · {formatTime(quote.start)} ·{" "}
              {quote.tags.join("、")}
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  evidenceSegments,
  evidenceInterviews,
}: {
  insight: Insight;
  evidenceSegments: Segment[];
  evidenceInterviews: Interview[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = evidenceSegments.length > 0 || evidenceInterviews.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-900">{insight.title}</p>
        <span className="badge bg-slate-100 text-slate-600">{insight.type}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{insight.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <button
          className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium transition ${hasEvidence ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-slate-100 text-slate-400"}`}
          disabled={!hasEvidence}
          onClick={() => setExpanded(!expanded)}
        >
          <span>{expanded ? "▼" : "▶"}</span>
          证据 {insight.evidenceCount} 条
        </button>
        <span className="text-slate-500">
          覆盖访谈 {insight.interviewIds?.length || 0} 份
        </span>
        <span className="badge bg-indigo-50 text-indigo-700">证据强度 {evidenceStrength(insight.evidenceCount, insight.interviewIds?.length || 0)}</span>
        <span className="text-slate-400">v{insight.inputVersion || 1}</span>
        <span className={`badge ${insight.status === "已确认" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
          {insight.status}
        </span>
      </div>
      {expanded && hasEvidence && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {evidenceSegments.length > 0 ? (
            evidenceSegments.map((seg) => {
              const interview = evidenceInterviews.find(
                (i) => i.id === seg.interviewId,
              );
              return (
                <Link
                  key={seg.id}
                  to={`/transcript/${seg.interviewId}`}
                  className="block rounded-lg bg-slate-50 p-3 text-xs transition hover:bg-slate-100"
                >
                  <div className="mb-1 flex items-center gap-2 text-slate-500">
                    <span className="font-medium">{seg.role}</span>
                    <span>{interview?.title || "未知访谈"}</span>
                    {seg.tags.length > 0 && (
                      <span className="text-brand-600">#{seg.tags.join(" #")}</span>
                    )}
                  </div>
                  <p className="text-slate-700">
                    {seg.correctedText || seg.text}
                  </p>
                </Link>
              );
            })
          ) : (
            <p className="text-xs text-slate-400">
              该洞察由 AI 生成，未关联具体片段证据。
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          className="text-xs text-brand-700"
          onClick={() =>
            void db.insights.update(insight.id, {
              status: insight.status === "草稿" ? "已确认" : "草稿",
            })
          }
        >
          {insight.status === "草稿" ? "确认洞察" : "退回草稿"}
        </button>
        <button
          className="text-xs text-red-600"
          onClick={() => void db.insights.delete(insight.id)}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function ReportPage() {
  const { projectId = "" } = useParams();
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const interviews = useLiveQuery(
    () => db.interviews.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const insights = useLiveQuery(
    () => db.insights.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const quotes = useLiveQuery(
    () => db.quotes.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const savedReport = useLiveQuery(
    () => db.reports.where("projectId").equals(projectId).first(),
    [projectId],
  );
  const summaryRuns = useLiveQuery(
    () => db.summaryRuns.where("projectId").equals(projectId).reverse().sortBy("createdAt"),
    [projectId],
    [],
  );
  const respondents = useLiveQuery(
    () => db.respondents.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const tags = useLiveQuery(
    () => db.tags.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const allSegments = useLiveQuery(
    () => db.segments.where("interviewId").anyOf(interviews.map((i) => i.id)).toArray(),
    [interviews],
    [],
  );
  const templates = useLiveQuery(
    () =>
      db.reportTemplates
        .where("workspaceId")
        .equals(project?.workspaceId || "workspace_default")
        .toArray(),
    [project?.workspaceId],
    [],
  );
  const [markdown, setMarkdown] = useState("");
  const [templateId, setTemplateId] = useState("template_standard");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [uploadedTranscripts, setUploadedTranscripts] = useState<Array<{ fileName: string; content: string }>>([]);
  const [uploadingTranscripts, setUploadingTranscripts] = useState(false);
  const [quickGenerating, setQuickGenerating] = useState(false);
  const addToast = useStore((s) => s.addToast);
  const aiHealth = useStore((s) => s.aiHealth);

  const generated = useMemo(
    () =>
      project ? buildReportMarkdown(project, interviews, insights, quotes, respondents, tags, allSegments) : "",
    [project, interviews, insights, quotes, respondents, tags, allSegments],
  );
  const content = markdown || savedReport?.markdown || generated;

  async function oneClickReport() {
    if (!project) return;
    if (!aiHealth?.configured && !hasUserApiKey()) {
      addToast("AI 服务暂不可用，请稍后重试", "error");
      return;
    }
    const confirmedInsights = insights.filter((i) => i.status === "已确认");
    if (confirmedInsights.length === 0) {
      addToast("请先在洞察分析中生成并确认洞察", "info");
      return;
    }
    setAiGenerating(true);
    try {
      const latestSummary = summaryRuns[0];
      let summaries: Array<{ respondentCode: string; dimensions: Array<{ name: string; content: string }> }> = [];
      if (latestSummary) {
        try {
          const parsed = JSON.parse(latestSummary.summaries);
          summaries = (parsed as Array<{ respondentCode: string; dimensions: Array<{ name: string; content: string }> }>).map((row) => ({
            respondentCode: row.respondentCode,
            dimensions: row.dimensions || [],
          }));
        } catch { /* ignore parse errors */ }
      }
      const response = await generateReportWithAi(
        project,
        confirmedInsights,
        quotes,
        summaries,
        interviews,
        respondents,
        tags.map((t) => ({ name: t.name, type: t.type, description: t.description, usageCount: t.usageCount })),
        allSegments
          .filter((s) => s.tags.length > 0)
          .slice(0, 80)
          .map((s) => {
            const interview = interviews.find((i) => i.id === s.interviewId);
            const respondent = respondents.find((r) => r.id === interview?.respondentId);
            return {
              text: (s.correctedText || s.text).slice(0, 200),
              role: s.role,
              tags: s.tags,
              respondentCode: respondent?.code,
            };
          }),
      );
      const md = response.data?.markdown || "";
      if (!md) throw new Error("AI 未返回报告内容");
      setMarkdown(md);
      const timestamp = now();
      if (savedReport)
        await db.reports.update(savedReport.id, {
          markdown: md,
          title: response.data?.title || `${project.name} 研究报告`,
          updatedAt: timestamp,
        });
      else
        await db.reports.add({
          id: uid("report"),
          projectId,
          title: response.data?.title || `${project.name} 研究报告`,
          markdown: md,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      addToast(`${response.model} 已生成研究报告，可在下方编辑后导出`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 报告生成失败";
      addToast(msg, "error");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleTranscriptUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingTranscripts(true);
    try {
      const parsed: Array<{ fileName: string; content: string }> = [];
      for (const file of Array.from(files)) {
        let content = "";
        if (/\.docx$/i.test(file.name)) {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
          content = result.value;
        } else if (/\.md$/i.test(file.name) || /\.txt$/i.test(file.name) || file.type.startsWith("text")) {
          content = await file.text();
        } else {
          addToast(`不支持的文件类型: ${file.name}`, "error");
          continue;
        }
        if (content.trim()) parsed.push({ fileName: file.name, content });
      }
      if (parsed.length > 0) {
        setUploadedTranscripts((prev) => [...prev, ...parsed]);
        addToast(`已上传 ${parsed.length} 份笔录，可一键生成报告`);
      }
    } catch {
      addToast("笔录解析失败", "error");
    } finally {
      setUploadingTranscripts(false);
    }
  }

  function removeTranscript(idx: number) {
    setUploadedTranscripts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function oneClickTranscriptReport() {
    if (!project) return;
    if (uploadedTranscripts.length === 0) {
      addToast("请先上传至少1份笔录文件", "info");
      return;
    }
    if (!aiHealth?.configured && !hasUserApiKey()) {
      addToast("AI 服务未启动，请在终端运行 npm run ai 后重试", "error");
      return;
    }
    setQuickGenerating(true);
    addToast(`正在分析 ${uploadedTranscripts.length} 份笔录，预计需要 30-60 秒...`);
    try {
      const response = await generateReportFromTranscriptsWithAi(uploadedTranscripts, {
        name: project.name,
        description: project.description,
        objective: project.objective,
        researchType: project.researchType,
        targetGroup: project.targetGroup,
        researchQuestions: project.researchQuestions,
        industry: project.industry,
      });
      const md = response.data?.markdown || "";
      if (!md) throw new Error("AI 未返回报告内容，请重试");
      setMarkdown(md);
      const timestamp = now();
      if (savedReport)
        await db.reports.update(savedReport.id, {
          markdown: md,
          title: response.data?.title || `${project.name} 研究报告`,
          updatedAt: timestamp,
        });
      else
        await db.reports.add({
          id: uid("report"),
          projectId,
          title: response.data?.title || `${project.name} 研究报告`,
          markdown: md,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      addToast("报告已生成");
      setUploadedTranscripts([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 报告生成失败";
      addToast(`生成失败：${msg}`, "error");
    } finally {
      setQuickGenerating(false);
    }
  }

  async function saveDraft() {
    if (!project) return;
    const timestamp = now();
    if (savedReport)
      await db.reports.update(savedReport.id, {
        markdown: content,
        title: `${project.name} 研究报告`,
        updatedAt: timestamp,
      });
    else
      await db.reports.add({
        id: uid("report"),
        projectId,
        title: `${project.name} 研究报告`,
        markdown: content,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
  }

  async function exportMarkdown() {
    if (!project) return;
    saveAs(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
      `${project.name}-研究报告.md`,
    );
  }

  async function exportDocx() {
    if (!project) return;
    const doc = new Document({
      sections: [
        {
          children: content.split("\n").map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line.replace(/^#+\s*/, ""),
                    bold: line.startsWith("#"),
                  }),
                ],
                spacing: { after: 120 },
              }),
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${project.name}-研究报告.docx`);
  }

  if (!project) return <EmptyState text="没有找到这个项目。" />;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-slate-500">报告导出</p>
          <h1 className="text-3xl font-bold text-slate-950">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            洞察 {insights.length} 条（已确认 {insights.filter((i) => i.status === "已确认").length}）· 原话 {quotes.length} 条
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to={`/insights/${projectId}`}>
            返回洞察分析
          </Link>
          <button
            className="btn-primary"
            disabled={aiGenerating || (!aiHealth?.configured && !hasUserApiKey())}
            onClick={() => void oneClickReport()}
          >
            {aiGenerating ? "AI 生成中..." : "一键生成报告"}
          </button>
          <select
            className="input w-auto"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => void saveDraft()}>
            保存草稿
          </button>
          <button className="btn-ghost" onClick={() => void exportMarkdown()}>
            导出 Markdown
          </button>
          <button className="btn-ghost" onClick={() => void exportDocx()}>
            导出 DOCX
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              void exportResearchPptx(
                project,
                interviews,
                insights.filter((item) => item.status === "已确认"),
                quotes,
                templates.find((item) => item.id === templateId),
                true,
                respondents,
                tags,
                allSegments,
                content,
              )
            }
          >
            导出 PPTX
          </button>
        </div>
      </div>

      {/* 多笔录快速上传区域 */}
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">快速生成：上传笔录</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              上传多个笔录文件（.txt/.md/.docx），无需经过校正→编码→洞察流程，直接生成含结构化图表的PPT报告
            </p>
          </div>
          {uploadedTranscripts.length > 0 && (
            <span className="text-xs font-medium text-brand-600">
              已上传 {uploadedTranscripts.length} 份
            </span>
          )}
        </div>
        <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-6 transition hover:border-brand-400 hover:bg-brand-50/30">
          <input
            type="file"
            multiple
            accept=".txt,.md,.docx"
            className="hidden"
            onChange={(e) => void handleTranscriptUpload(e.target.files)}
          />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">
              {uploadingTranscripts ? "解析中..." : "点击上传笔录文件"}
            </p>
            <p className="mt-1 text-xs text-slate-400">支持 .txt / .md / .docx，可多选</p>
          </div>
        </label>
        {uploadedTranscripts.length > 0 && (
          <>
            <div className="mt-3 space-y-1">
              {uploadedTranscripts.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">{t.fileName}</span>
                    <span className="text-xs text-slate-400">{t.content.length} 字</span>
                  </div>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => removeTranscript(idx)}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-primary mt-3 w-full"
              disabled={quickGenerating || (!aiHealth?.configured && !hasUserApiKey())}
              onClick={() => void oneClickTranscriptReport()}
            >
              {quickGenerating ? "AI 分析笔录中..." : `从 ${uploadedTranscripts.length} 份笔录一键生成报告`}
            </button>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <textarea
          className="input min-h-[70vh] font-mono text-sm"
          value={content}
          onChange={(e) => setMarkdown(e.target.value)}
        />
        <article className="card prose prose-slate max-w-none whitespace-pre-wrap p-6 text-sm leading-7">
          {content}
        </article>
      </div>
    </section>
  );
}

function SettingsPage() {
  return <Suspense fallback={<PageLoading />}><SettingsCenter /></Suspense>;
}

function buildReportMarkdown(
  project: Project,
  interviews: Interview[],
  insights: Insight[],
  quotes: Quote[],
  respondents: Respondent[] = [],
  tags: Tag[] = [],
  segments: Segment[] = [],
) {
  const confirmedInsights = insights.filter((i) => i.status === "\u5DF2\u786E\u8BA4");
  const allTags = [...new Set(insights.flatMap((i) => i.relatedTags))];

  // sample table
  const respondentTable = respondents.length
    ? respondents.map((r) => `| ${r.code} | ${r.nickname || "-"} | ${r.gender || "-"} | ${r.ageRange || "-"} | ${r.city || "-"} | ${r.userType || "-"} |`).join("\n")
    : "| - | - | - | - | - | - |";

  // insight sections with 6-element format from skill methodology
  const insightSections = confirmedInsights.length
    ? confirmedInsights.map((insight, idx) => {
        const relatedQuotes = quotes.filter((q) => insight.relatedTags.some((t) => q.tags.includes(t))).slice(0, 2);
        const quoteBlock = relatedQuotes.length
          ? relatedQuotes.map((q) => `> *"${q.text}"* \u2014 ${q.respondentCode || q.speakerRole}`).join("\n\n")
          : "> \uFF08\u6682\u65E0\u76F4\u63A5\u5173\u8054\u539F\u8BDD\uFF0C\u53EF\u53C2\u8003\u7F16\u7801\u7247\u6BB5\u4E2D\u7684\u8868\u8FF0\uFF09";
        const evidenceStrength = (insight.interviewIds || []).length >= 3 ? "\u591A\u4F4D\u53D7\u8BBF\u8005" : (insight.interviewIds || []).length >= 2 ? "\u90E8\u5206\u53D7\u8BBF\u8005" : "\u4E2A\u522B\u53D7\u8BBF\u8005";
        const implication = insight.type === "\u75DB\u70B9\u5206\u6790"
          ? "\u9700\u8BC6\u522B\u8BE5\u969C\u788D\u7684\u6839\u672C\u539F\u56E0\uFF0C\u8BC4\u4F30\u4EA7\u54C1\u5C42\u9762\u7684\u4FEE\u590D\u4F18\u5148\u7EA7"
          : insight.type === "\u9700\u6C42\u5206\u6790"
          ? "\u53EF\u4F5C\u4E3A\u4EA7\u54C1\u8DEF\u7EBF\u56FE\u7684\u8F93\u5165\uFF0C\u8BC4\u4F30\u9700\u6C42\u7684\u666E\u904D\u6027\u4E0E\u5B9E\u73B0\u6210\u672C"
          : "\u53EF\u4F5C\u4E3A\u7EC6\u5206\u4EBA\u7FA4\u7B56\u7565\u7684\u4F9D\u636E\uFF0C\u8BC4\u4F30\u662F\u5426\u9700\u5DEE\u5F02\u5316\u8BBE\u8BA1";
        return `### 2.${idx + 1} ${insight.title}

**\u6D1E\u5BDF\u6982\u8FF0**
${insight.description}

**\u8BC1\u636E\u4E0E\u8868\u73B0**
${evidenceStrength}\u5728\u76F8\u5173\u573A\u666F\u4E2D\u5C55\u73B0\u51FA\u8FD9\u4E00\u6A21\u5F0F\uFF0C\u6D89\u53CA\u6807\u7B7E\uFF1A${insight.relatedTags.join("\u3001") || "\u672A\u5206\u7C7B"}\u3002

${quoteBlock}

**\u5206\u6790\u89E3\u8BFB**
\u8FD9\u4E00\u73B0\u8C61\u80CC\u540E\u53CD\u6620\u4E86\u53D7\u8BBF\u8005${insight.type === "\u75DB\u70B9\u5206\u6790" ? "\u5728\u4F7F\u7528\u8FC7\u7A0B\u4E2D\u9047\u5230\u7684\u5177\u4F53\u969C\u788D\u53CA\u5176\u5BF9\u4F53\u9A8C\u7684\u5F71\u54CD" : insight.type === "\u9700\u6C42\u5206\u6790" ? "\u5BF9\u529F\u80FD\u6216\u670D\u52A1\u7684\u6DF1\u5C42\u671F\u5F85\u4E0E\u672A\u88AB\u6EE1\u8DB3\u7684\u9700\u6C42" : "\u5171\u540C\u7684\u884C\u4E3A\u4E60\u60EF\u4E0E\u6001\u5EA6\u503E\u5411"}\u3002\u7814\u7A76\u8005\u5E94\u5173\u6CE8\u5176\u80CC\u540E\u7684\u52A8\u673A\u3001\u60C5\u7EEA\u548C\u60C5\u5883\u7EA6\u675F\uFF0C\u800C\u975E\u4EC5\u505C\u7559\u5728\u8868\u9762\u63CF\u8FF0\u3002

**\u5DEE\u5F02\u5BF9\u6BD4**
${respondents.length > 1 ? `\u4E0D\u540C\u7528\u6237\u7C7B\u578B\u7684\u53D7\u8BBF\u8005\u5728\u6B64\u4E3B\u9898\u4E0A\u53EF\u80FD\u5B58\u5728\u5DEE\u5F02\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u8DE8\u6848\u4F8B\u5BF9\u6BD4\u7AE0\u8282\u8FDB\u4E00\u6B65\u5206\u6790\u3002` : "\u5F53\u524D\u6837\u672C\u91CF\u6709\u9650\uFF0C\u672A\u53D1\u73B0\u660E\u786E\u5DEE\u5F02\u3002"}

**\u4E1A\u52A1\u542F\u793A**
${implication}\u3002`;
      }).join("\n\n---\n\n")
    : "\u6682\u65E0\u5DF2\u786E\u8BA4\u7684\u6D1E\u5BDF\uFF0C\u8BF7\u5148\u5728\u6D1E\u5BDF\u5206\u6790\u4E2D\u751F\u6210\u5E76\u786E\u8BA4\u6D1E\u5BDF\u540E\u91CD\u65B0\u751F\u6210\u62A5\u544A\u3002";

  // cross-case analysis: NO coding stats, focus on behavioral differences
  const userTypes = [...new Set(respondents.map((r) => r.userType).filter(Boolean))];
  const crossCaseSection = respondents.length > 1
    ? userTypes.length >= 2
      ? userTypes.slice(0, 4).map((type) => {
          const typeRespondents = respondents.filter((r) => r.userType === type);
          const typeCodes = typeRespondents.map((r) => r.code).join("\u3001");
          return `- **${type}**\uFF08${typeCodes}\uFF09\uFF1A${typeRespondents.length}\u4F4D\u53D7\u8BBF\u8005\uFF0C\u5176\u884C\u4E3A\u7279\u5F81\u4E0E\u5176\u4ED6\u7FA4\u4F53\u7684\u5DEE\u5F02\u9700\u7ED3\u5408\u5177\u4F53\u53D1\u73B0\u5C55\u5F00\u5206\u6790`;
        }).join("\n")
      : respondents.slice(0, 5).map((r) => {
          return `- **${r.code}\uFF08${r.nickname || "\u533F\u540D"}\uFF09**\uFF1A${r.userType || "\u672A\u5206\u7C7B"}\u7528\u6237\uFF0C${r.gender || "\u672A\u77E5"}\u6027\uFF0C${r.city || "\u672A\u77E5"}\u5730\u533A`;
        }).join("\n")
    : "\u5F53\u524D\u6837\u672C\u91CF\u4E0D\u8DB3\u4EE5\u8FDB\u884C\u7CFB\u7EDF60\u7684\u8DE8\u6848\u4F8B\u5BF9\u6BD4\uFF0C\u5EFA\u8BAE\u589E\u52A0\u53D7\u8BBF\u8005\u6570\u91CF\u540E\u8865\u5145\u3002";

  // conclusions table
  const conclusionsTable = confirmedInsights.length
    ? confirmedInsights.slice(0, 5).map((i, idx) => `| ${idx + 1} | ${i.title} | ${i.type}\uFF0C\u8986\u76D6${(i.interviewIds || []).length}\u4F4D\u53D7\u8BBF\u8005 | ${i.description.slice(0, 40)}${i.description.length > 40 ? "..." : ""} | \u53C2\u89C1\u7814\u7A76\u53D1\u73B0\u7AE0\u8282 |`).join("\n")
    : "| - | \u5F85\u751F\u6210 | - | - | - |";

  // key findings summary for executive summary
  const keyFindingsSummary = confirmedInsights.length
    ? confirmedInsights.slice(0, 5).map((i, idx) => `${idx + 1}. ${i.title}\u3002`).join("\n")
    : "\u6682\u65E0\u5DF2\u786E\u8BA4\u6D1E\u5BDF\uFF0C\u8BF7\u5148\u5728\u6D1E\u5BDF\u5206\u6790\u4E2D\u751F\u6210\u3002";

  // key recommendations summary for executive summary
  const keyRecommendations = confirmedInsights.length
    ? confirmedInsights.slice(0, 3).map((i, idx) => `${idx + 1}. \u9488\u5BF9\u201C${i.title}\u201D\uFF0C${i.type === "\u75DB\u70B9\u5206\u6790" ? "\u8BC4\u4F30\u4FEE\u590D\u4F18\u5148\u7EA7\u5E76\u7EB3\u5165\u4EA7\u54C1\u8DEF\u7EBF" : i.type === "\u9700\u6C42\u5206\u6790" ? "\u8BC4\u4F30\u9700\u6C42\u666E\u904D\u6027\u540E\u7EB3\u5165\u4EA7\u54C1\u89C4\u5212" : "\u7EB3\u5165\u7EC6\u5206\u4EBA\u7FA4\u7B56\u7565\u5236\u5B9A"}\u3002`).join("\n")
    : "\u5F85\u751F\u6210\u6D1E\u5BDF\u540E\u8865\u5145\u5EFA\u8BAE\u3002";

  return `# ${project.name} \u5B9A\u6027\u7814\u7A76\u62A5\u544A

## \u6267\u884C\u6458\u8981

### \u7814\u7A76\u76EE\u7684
\u672C\u7814\u7A76\u56F4\u7ED5\u201C${project.objective}\u201D\u5C55\u5F00\uFF0C\u91C7\u7528${project.researchType}\u65B9\u6CD5\uFF0C\u5BF9 ${respondents.length} \u4F4D${project.targetGroup || "\u76EE\u6807\u7528\u6237"}\u8FDB\u884C\u6DF1\u5EA6\u8BBF\u8C08\uFF0C\u65E8\u5728\u4E3A${project.industry ? project.industry + "\u9886\u57DF\u7684" : ""}\u4EA7\u54C1\u89C4\u5212\u4E0E\u4E1A\u52A1\u51B3\u7B56\u63D0\u4F9B\u7528\u6237\u89C6\u89D2\u7684\u5B9A\u6027\u8BC1\u636E\u652F\u6491\u3002

### \u5173\u952E\u53D1\u73B0
${keyFindingsSummary}

### \u6838\u5FC3\u5EFA\u8BAE
${keyRecommendations}

---

## 1. \u9879\u76EE\u6982\u8FF0

### 1.1 \u7814\u7A76\u80CC\u666F\u4E0E\u76EE\u7684

- **\u7814\u7A76\u80CC\u666F**\uFF1A${project.description || "\u672C\u9879\u76EE\u56F4\u7ED5\u8BBF\u8C08\u8D44\u6599\u8FDB\u884C\u5B9A\u6027\u5206\u6790\uFF0C\u65E8\u5728\u6DF1\u5165\u4E86\u89E3\u76EE\u6807\u7528\u6237\u7684\u9700\u6C42\u3001\u75DB\u70B9\u4E0E\u884C\u4E3A\u6A21\u5F0F\u3002"}
- **\u6838\u5FC3\u95EE\u9898**\uFF1A${project.researchQuestions || "\u56F4\u7ED5\u7814\u7A76\u76EE\u6807\uFF0C\u63A2\u7D22\u53D7\u8BBF\u8005\u7684\u52A8\u673A\u3001\u6001\u5EA6\u3001\u884C\u4E3A\u4E0E\u75DB\u70B9\u3002"}
- **\u7814\u7A76\u7528\u9014**\uFF1A\u62A5\u544A\u5C06\u652F\u6301\u4EA7\u54C1\u89C4\u5212\u3001\u7528\u6237\u4F53\u9A8C\u8BBE\u8BA1\u548C\u5E02\u573A\u7B56\u7565\u51B3\u7B56\u3002

### 1.2 \u7814\u7A76\u65B9\u6CD5

| \u9879\u76EE | \u5185\u5BB9 |
|---|---|
| \u65B9\u6CD5\u7C7B\u578B | ${project.researchType} |
| \u6837\u672C\u91CF | N=${respondents.length} |
| \u8BBF\u8C08\u4EFD\u6570 | ${interviews.length} \u4EFD |
| \u6570\u636E\u6765\u6E90 | ${[...new Set(interviews.map((i) => i.sourceType))].join("\u3001") || "\u6587\u672C\u5F55\u5165"} |
| \u5206\u6790\u65B9\u5F0F | \u4E3B\u9898\u5206\u6790\u6CD5\uFF08Thematic Analysis\uFF09 |

### 1.3 \u6837\u672C\u6784\u6210

| \u4EE3\u53F7 | \u6635\u79F0 | \u6027\u522B | \u5E74\u9F84\u6BB5 | \u57CE\u5E02 | \u7528\u6237\u7C7B\u578B |
|---|---|---|---|---|---|
${respondentTable}

---

## 2. \u4E3B\u8981\u7814\u7A76\u53D1\u73B0

${insightSections}

---

## 3. \u8DE8\u6848\u4F8B\u5BF9\u6BD4\u5206\u6790

### 3.1 \u7528\u6237\u7FA4\u4F53\u5DEE\u5F02
${crossCaseSection}

### 3.2 \u5171\u6027\u4E0E\u4E2A\u6027
- **\u5171\u6027**\uFF1A${allTags.slice(0, 3).join("\u3001") || "\u6838\u5FC3\u4E3B\u9898"}\u5728\u591A\u4F4D\u53D7\u8BBF\u8005\u4E2D\u53CD\u590D\u51FA\u73B0\uFF0C\u8868\u660E\u8FD9\u4E9B\u9700\u6C42\u548C\u75DB\u70B9\u5177\u6709\u8F83\u9AD8\u7684\u666E\u904D\u6027\u3002
- **\u4E2A\u6027**\uFF1A\u4E0D\u540C\u7528\u6237\u7C7B\u578B\u5728${allTags.slice(3, 5).join("\u3001") || "\u90E8\u5206\u7EF4\u5EA6"}\u4E0A\u5448\u73B0\u5DEE\u5F02\uFF0C\u4E1A\u52A1\u4E0A\u9700\u8BC4\u4F30\u662F\u5426\u63D0\u4F9B\u5DEE\u5F02\u5316\u65B9\u6848\u3002
- **\u4E1A\u52A1\u542B\u4E49**\uFF1A\u5DEE\u5F02\u4E0D\u4EC5\u662F\u201C\u4E0D\u540C\u201D\uFF0C\u66F4\u91CD\u8981\u7684\u662F\u201C\u56E0\u6B64\u9700\u8981\u505A\u4EC0\u4E48\u201D\u2014\u2014\u5BF9\u4E8E\u9AD8\u9891\u5171\u6027\u9700\u6C42\u5E94\u4F18\u5148\u6EE1\u8DB3\uFF0C\u5BF9\u4E8E\u7EC6\u5206\u5DEE\u5F02\u53EF\u901A\u8FC7\u53EF\u914D\u7F6E\u9009\u9879\u6216\u5206\u5C42\u7B56\u7565\u5E94\u5BF9\u3002

---

## 4. \u7ED3\u8BBA\u4E0E\u5EFA\u8BAE

### 4.1 \u6838\u5FC3\u7ED3\u8BBA

| # | \u7ED3\u8BBA | \u8BC1\u636E\u57FA\u7840 | \u6DF1\u5C42\u542B\u4E49 | \u6218\u7565\u542F\u793A |
|---|---|---|---|---|
${conclusionsTable}

### 4.2 \u884C\u52A8\u5EFA\u8BAE

| \u9636\u6BB5 | \u5EFA\u8BAE\u884C\u52A8 | \u5BF9\u5E94\u53D1\u73B0 | \u9884\u671F\u5F71\u54CD | \u8D44\u6E90\u9700\u6C42 | \u98CE\u9669 |
|---|---|---|---|---|---|
| \u77ED\u671F | \u9488\u5BF9\u9AD8\u9891\u75DB\u70B9\u5F00\u5C55\u4EA7\u54C1\u5C42\u9762\u4FEE\u590D | \u75DB\u70B9\u5206\u6790\u7C7B\u6D1E\u5BDF | \u7528\u6237\u4F53\u9A8C\u6539\u5584 | \u4F4E | \u4FEE\u590D\u53EF\u80FD\u5F15\u5165\u65B0\u95EE\u9898 |
| \u4E2D\u671F | \u5C06\u5171\u6027\u9700\u6C42\u7EB3\u5165\u4EA7\u54C1\u8DEF\u7EBF\u56FE | \u9700\u6C42\u5206\u6790\u7C7B\u6D1E\u5BDF | \u4EA7\u54C1\u7ADE\u4E89\u529B\u63D0\u5347 | \u4E2D | \u9700\u6C42\u4F18\u5148\u7EA7\u53D8\u52A8 |
| \u957F\u671F | \u6309\u7528\u6237\u7C7B\u578B\u5236\u5B9A\u5DEE\u5F02\u5316\u7B56\u7565 | \u8DE8\u6848\u4F8B\u5BF9\u6BD4\u53D1\u73B0 | \u7CBE\u51C6\u8986\u76D6\u7EC6\u5206\u4EBA\u7FA4 | \u9AD8 | \u7B56\u7565\u590D\u6742\u5EA6\u589E\u52A0 |

---

## 5. \u9644\u5F55

### \u7814\u7A76\u9650\u5236

- \u5B9A\u6027\u7814\u7A76\u53D1\u73B0\u4E3A\u65B9\u5411\u6027\u6D1E\u5BDF\uFF0C\u4E0D\u4EE3\u8868\u7EDF\u8BA1\u603B\u4F53\u3002
- \u6837\u672C\u91CF ${respondents.length} \u4EBA\uFF0C\u7ED3\u8BBA\u7684\u53EF\u63A8\u5E7F\u6027\u9700\u8C28\u614E\u5BF9\u5F85\u3002
- \u672A\u5728\u539F\u59CB\u6750\u6599\u4E2D\u51FA\u73B0\u7684\u4FE1\u606F\u4E0D\u4F1A\u4F5C\u4E3A\u7ED3\u8BBA\u4F9D\u636E\u3002
- \u5EFA\u8BAE\u7ED3\u5408\u5B9A\u91CF\u7814\u7A76\u9A8C\u8BC1\u5B9A\u6027\u53D1\u73B0\u7684\u666E\u904D\u6027\u3002

### \u53D7\u8BBF\u8005\u4FE1\u606F\u8868

| \u4EE3\u53F7 | \u6635\u79F0 | \u6027\u522B | \u5E74\u9F84\u6BB5 | \u57CE\u5E02 | \u7528\u6237\u7C7B\u578B |
|---|---|---|---|---|---|
${respondentTable}

---

*\u672C\u62A5\u544A\u7531 ResearchBox \u672C\u5730\u6570\u636E\u81EA\u52A8\u751F\u6210\uFF0C\u878D\u5408\u4E86\u4E3B\u9898\u5206\u6790\u6CD5\u65B9\u6CD5\u8BBA\u3002\u5EFA\u8BAE\u4F7F\u7528\u201CAI \u751F\u6210\u62A5\u544A\u201D\u529F\u80FD\u83B7\u53D6\u66F4\u6DF1\u5EA6\u7684\u5206\u6790\u5185\u5BB9\u3002*`;
}

function createSegmentsFromText(
  interviewId: string,
  rawText: string,
): Segment[] {
  const fallback = [
    "研究员：请你介绍一下最近一次相关产品的购买经历。",
    "受访者：我比较看重新鲜和安全，如果给家里人喝会更谨慎。",
    "研究员：价格会影响你的选择吗？",
    "受访者：会，如果每天买价格高很多就会有压力，但偶尔尝试可以接受。",
    "受访者：购买是否方便也很重要，最好楼下便利店或者常去的超市能买到。",
  ].join("\n");
  return parseTranscript(rawText.trim() || fallback).map((item, index) => {
    return {
      id: uid("seg"),
      interviewId,
      ...item,
      originalText: item.text,
      correctedText: item.text,
      correctionStatus: "未校正" as const,
      correctionVersion: 1,
      correctionSuggestions: [],
      confidence: index % 5 === 0 ? 0.78 : 0.88 + Math.random() * 0.1,
      tags: [] as string[],
      updatedAt: now(),
    };
  });
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ text }: { text: string }) {
  return <span className="badge bg-slate-100 text-slate-700">{text}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function GuideStep({
  step,
  title,
  desc,
  linkTo,
  linkText,
}: {
  step: number;
  title: string;
  desc: string;
  linkTo?: string;
  linkText?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
        {step}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
      {linkTo && linkText && (
        <Link
          to={linkTo}
          className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
        >
          {linkText}
        </Link>
      )}
    </div>
  );
}

function ReportsHub() {
  const projects = useLiveQuery(
    () => db.projects.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const reports = useLiveQuery(() => db.reports.toArray(), [], []);
  const insights = useLiveQuery(() => db.insights.toArray(), [], []);

  const standaloneReports = reports.filter((r) => !r.projectId);
  const projectReports = reports.filter((r) => r.projectId);

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">定性报告</h1>
        <p className="mt-1 text-sm text-slate-500">
          基于已确认洞察生成 AI 研究报告，支持 Markdown / DOCX / PPTX 导出。
        </p>
      </div>

      {/* 快速报告入口 */}
      <Link
        to="/quick-report"
        className="mb-6 flex items-center justify-between rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-slate-50 p-5 transition hover:border-brand-400 hover:shadow-md"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-slate-900">快速报告</p>
            <p className="mt-0.5 text-sm text-slate-500">
              上传多份笔录，一键生成含结构化图表的研究报告，无需创建项目
            </p>
          </div>
        </div>
        <span className="text-sm font-medium text-brand-700">前往 →</span>
      </Link>

      {/* 独立快速报告 */}
      {standaloneReports.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">快速报告历史</h2>
          <div className="mb-6 grid gap-3">
            {standaloneReports
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{report.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {report.markdown.length.toLocaleString()} 字 · 更新于{" "}
                      {new Date(report.updatedAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <button
                    className="ml-2 shrink-0 text-xs text-red-500 hover:underline"
                    onClick={async () => {
                      await db.reports.delete(report.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      {/* 项目报告 */}
      <h2 className="mb-3 text-sm font-semibold text-slate-700">项目报告</h2>
      <div className="grid gap-3">
        {projects.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            暂无项目，请先在概览页创建项目并导入访谈资料。
          </div>
        )}
        {projects.map((project) => {
          const projectReportsCount = projectReports.filter(
            (r) => r.projectId === project.id,
          ).length;
          const confirmedInsights = insights.filter(
            (i) =>
              i.projectId === project.id && i.status === "已确认",
          ).length;
          return (
            <Link
              key={project.id}
              to={`/reports/${project.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/30"
            >
              <div>
                <p className="font-semibold text-slate-900">{project.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {confirmedInsights} 条已确认洞察 ·{" "}
                  {projectReportsCount} 份报告草稿
                </p>
              </div>
              <span className="text-sm font-medium text-brand-700">
                {projectReportsCount > 0 ? "查看报告 →" : "生成报告 →"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold">页面不存在</h1>
      <p className="mt-3 text-slate-500">
        该地址可能已失效，返回工作台继续研究任务。
      </p>
      <Link className="btn-primary mt-6" to="/">
        返回工作台
      </Link>
    </section>
  );
}

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const second = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minute}:${second}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default App;
