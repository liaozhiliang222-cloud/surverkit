import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import {
  applySuggestions,
  segmentCurrentText,
  suggestCorrections,
} from "./correction";
import { db, now, uid } from "./db";
import {
  autoAssignRolesWithAi,
  batchCodeWithAi,
  correctWithAi,
  generateTagsWithAi,
  getAiHealth,
  type AiHealth,
} from "./aiClient";
import { useStore } from "./store";
import type {
  CorrectionLevel,
  CorrectionSuggestion,
  CodingScreeningStatus,
  Project,
  Quote,
  Segment,
  SpeakerRole,
  TagType,
  Term,
} from "./types";

const aiTagColors = ["#0d9488", "#6366f1", "#f59e0b", "#8b5cf6", "#0891b2", "#f97316"];
const validTagTypes: TagType[] = ["主题标签", "痛点标签", "需求标签", "情绪标签", "行为标签", "决策因素", "阻碍因素", "人群特征", "自定义标签"];

const roles: SpeakerRole[] = [
  "研究员",
  "受访者",
  "主持人",
  "专家",
  "客户",
  "其他",
];

type StepStatus = "未开始" | "进行中" | "已完成" | "可选" | "待操作";

type Mode = "correction" | "coding";

function stepCircleClass(status: StepStatus): string {
  const base =
    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors";
  switch (status) {
    case "已完成":
      return `${base} bg-green-500 text-white`;
    case "进行中":
      return `${base} bg-brand-500 text-white animate-pulse ring-4 ring-brand-100`;
    case "未开始":
      return `${base} bg-slate-100 text-slate-400`;
    case "可选":
      return `${base} bg-white text-slate-400 border border-dashed border-slate-300`;
    case "待操作":
      return `${base} bg-slate-100 text-slate-400`;
  }
}

function stepStatusTextClass(status: StepStatus): string {
  switch (status) {
    case "已完成":
      return "text-green-600";
    case "进行中":
      return "text-brand-600";
    case "可选":
      return "text-slate-400";
    case "未开始":
    case "待操作":
      return "text-slate-400";
  }
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function finalizedSegmentText(segment: Segment) {
  // correctedText 即使为空字符串也代表明确的校正结果，不能回退到原文。
  return segment.correctedText !== undefined
    ? segment.correctedText.trim()
    : (segment.text || "").trim();
}

export function TranscriptWorkspace({
  interviewId,
  initialMode = "correction",
}: {
  interviewId: string;
  initialMode?: Mode;
}) {
  const interview = useLiveQuery(
    () => db.interviews.get(interviewId),
    [interviewId],
  );
  const segments = useLiveQuery(
    async () => {
      const items = (await db.segments.where("interviewId").equals(interviewId).toArray()).sort((a, b) => a.start - b.start);
      if (initialMode !== "coding") return items;
      const snapshots = await db.transcriptSnapshots.where("interviewId").equals(interviewId).sortBy("version");
      const latest = snapshots[snapshots.length - 1];
      if (!latest) return items;
      const snapshotTexts = new Map<string, string>(JSON.parse(latest.segments).map((item: { id: string; text: string }) => [item.id, item.text]));
      return items.map((item) => snapshotTexts.has(item.id) ? { ...item, text: snapshotTexts.get(item.id)!, correctedText: snapshotTexts.get(item.id)! } : item);
    },
    [interviewId, initialMode],
    [],
  );
  const tags = useLiveQuery(
    async () => {
      const current = await db.interviews.get(interviewId);
      return current
        ? db.tags.where("projectId").equals(current.projectId).toArray()
        : [];
    },
    [interviewId],
    [],
  );
  const terms = useLiveQuery(
    async () => {
      const current = await db.interviews.get(interviewId);
      return current
        ? db.terms.where("projectId").equals(current.projectId).toArray()
        : [];
    },
    [interviewId],
    [],
  );
  const respondent = useLiveQuery(
    () =>
      interview?.respondentId
        ? db.respondents.get(interview.respondentId)
        : undefined,
    [interview?.respondentId],
  );
  const project = useLiveQuery(
    () => (interview ? db.projects.get(interview.projectId) : undefined),
    [interview?.projectId],
  );
  const codingJob = useLiveQuery(
    async () => {
      if (initialMode !== "coding") return undefined;
      const jobs = await db.aiJobs.where("kind").equals("coding").reverse().sortBy("updatedAt");
      return jobs.find((job) => {
        try { return JSON.parse(job.input).interviewId === interviewId; } catch { return false; }
      });
    },
    [interviewId, initialMode],
  );
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<CorrectionLevel>("标准");
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [batchCodingRunning, setBatchCodingRunning] = useState(false);
  const [batchCodingMessage, setBatchCodingMessage] = useState("");
  const [oneClickRunning, setOneClickRunning] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [tagGenRunning, setTagGenRunning] = useState(false);
  const [tagGenMessage, setTagGenMessage] = useState("");
  const [autoRoleRunning, setAutoRoleRunning] = useState(false);
  const [mode] = useState<Mode>(initialMode);
  const addToast = useStore((s) => s.addToast);
  useEffect(() => {
    getAiHealth()
      .then(setAiHealth)
      .catch(() => setAiHealth(null));
  }, []);
  useEffect(() => {
    if (mode !== "coding" || interview?.transcriptStatus !== "已确认") return;
    void (async () => {
      const rawSegments = await db.segments.where("interviewId").equals(interviewId).toArray();
      const version = interview.transcriptVersion || 1;
      const finalized = rawSegments.map((segment) => ({ id: segment.id, text: finalizedSegmentText(segment) }));
      await db.transaction("rw", db.segments, db.transcriptSnapshots, async () => {
        for (const segment of rawSegments) {
          const finalText = finalizedSegmentText(segment);
          if (segment.text !== finalText || segment.correctedText !== finalText) await db.segments.update(segment.id, { text: finalText, correctedText: finalText, updatedAt: now() });
        }
        if (!(await db.transcriptSnapshots.get(`${interviewId}_v${version}`))) {
          await db.transcriptSnapshots.put({ id: `${interviewId}_v${version}`, interviewId, version, segments: JSON.stringify(finalized), createdAt: now() });
        }
      });
    })();
  }, [mode, interview?.transcriptStatus, interview?.transcriptVersion, interviewId]);
  useEffect(() => {
    void (async () => {
      const items = await db.segments.where("interviewId").equals(interviewId).toArray();
      let repaired = false;
      for (const segment of items) {
        const accepted = (segment.correctionSuggestions || []).filter((suggestion) => suggestion.status === "已接受");
        if (!accepted.length) continue;
        const current = segment.correctedText ?? segment.text;
        const hasUnappliedAcceptedChange = accepted.some((suggestion) => suggestion.original && current.includes(suggestion.original));
        if (!hasUnappliedAcceptedChange) continue;
        const corrected = applySuggestions(current, accepted);
        await db.segments.update(segment.id, { text: corrected, correctedText: corrected, updatedAt: now() });
        repaired = true;
      }
      if (repaired && interview?.transcriptStatus === "已确认") {
        const version = interview.transcriptVersion || 1;
        const updated = await db.segments.where("interviewId").equals(interviewId).toArray();
        await db.transcriptSnapshots.put({
          id: `${interviewId}_v${version}`,
          interviewId,
          version,
          segments: JSON.stringify(updated.map((segment) => ({ id: segment.id, text: finalizedSegmentText(segment) }))),
          createdAt: now(),
        });
      }
    })();
  }, [interviewId, interview?.transcriptStatus, interview?.transcriptVersion]);
  const active = segments.find((item) => item.id === activeId);
  const filtered = useMemo(
    () =>
      segments.filter((item) =>
        `${item.role}${segmentCurrentText(item)}${item.tags.join(" ")}`.includes(
          search,
        ),
      ),
    [segments, search],
  );
  const pendingCount = segments.reduce(
    (sum, item) =>
      sum +
      (item.correctionSuggestions || []).filter(
        (suggestion) => suggestion.status === "待处理",
      ).length,
    0,
  );
  const segmentHasPendingSuggestion = (item: Segment) =>
    (item.correctionSuggestions || []).some((suggestion) => suggestion.status === "待处理");
  const confirmedCount = segments.filter(
    (item) => item.correctionStatus === "已确认" && !segmentHasPendingSuggestion(item),
  ).length;
  const hasSuggestions = segments.some(
    (item) => (item.correctionSuggestions || []).length > 0,
  );
  const uncorrectedCount = segments.filter(
    (item) => (!item.correctionStatus || item.correctionStatus === "未校正") && !segmentHasPendingSuggestion(item),
  ).length;
  const pendingReviewCount = segments.filter(
    (item) => item.correctionStatus === "待审核" || segmentHasPendingSuggestion(item),
  ).length;
  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seg of segments) {
      for (const t of seg.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [segments]);

  async function updateSegment(id: string, patch: Partial<Segment>) {
    await db.segments.update(id, { ...patch, updatedAt: now() });
  }

  async function generateSuggestions() {
    setCorrectionMessage("正在生成校正建议，请勿重复操作...");
    await db.transaction("rw", db.segments, db.interviews, async () => {
      for (const segment of segments) {
        const originalText = segment.originalText || segment.text;
        const correctedText = segment.correctedText || segment.text;
        await db.segments.update(segment.id, {
          originalText,
          correctedText,
          correctionSuggestions: suggestCorrections(
            correctedText,
            level,
            terms,
          ),
          correctionStatus: "待审核",
          updatedAt: now(),
        });
      }
      await db.interviews.update(interviewId, {
        transcriptStatus: "校正中",
        updatedAt: now(),
      });
    });
    setCorrectionMessage("校正建议已生成，请先审核待处理建议。");
  }

  async function generateAiSuggestions(segment: Segment) {
    if (
      !window.confirm(
        "将把当前笔录片段和项目术语发送至AI 服务进行校正；原始音频不会上传。是否继续？",
      )
    )
      return;
    setAiRunning(true);
    setAiMessage("AI正在校正当前片段...");
    try {
      const result = await correctWithAi(
        segmentCurrentText(segment),
        level,
        terms,
      );
      await updateSegment(segment.id, {
        originalText: segment.originalText || segment.text,
        correctionSuggestions: result.suggestions,
        correctionStatus: "待审核",
      });
      await db.interviews.update(interviewId, {
        transcriptStatus: "校正中",
        updatedAt: now(),
      });
      setAiMessage(
        `已由 ${result.model} 生成 ${result.suggestions.length} 条建议，请逐条审核。`,
      );
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI校正失败");
    } finally {
      setAiRunning(false);
    }
  }

  async function decide(
    segment: Segment,
    suggestion: CorrectionSuggestion,
    accept: boolean,
  ) {
    const suggestions = (segment.correctionSuggestions || []).map((item) =>
      item.id === suggestion.id
        ? {
            ...item,
            status: accept ? ("已接受" as const) : ("已拒绝" as const),
          }
        : item,
    );
    const correctedText = accept
      ? applySuggestions(segmentCurrentText(segment), [{ ...suggestion, status: "已接受" }])
      : segmentCurrentText(segment);
    await updateSegment(segment.id, {
      correctionSuggestions: suggestions,
      correctedText,
      text: correctedText,
    });
  }

  async function reviewAllSuggestions() {
    setOneClickRunning(true);
    setCorrectionMessage(`正在一键审核 ${pendingCount} 条建议...`);
    try {
    for (const segment of segments) {
      const pending = (segment.correctionSuggestions || []).filter(
        (item) => item.status === "待处理",
      );
      if (!pending.length) {
        if (segment.correctionStatus !== "已确认") await updateSegment(segment.id, { correctionStatus: "已确认" });
        continue;
      }
      const correctedText = applySuggestions(
        segmentCurrentText(segment),
        pending,
        false,
      );
      const correctionSuggestions = (segment.correctionSuggestions || []).map(
        (item) =>
          item.status === "待处理"
            ? { ...item, status: "已接受" as const }
            : item,
      );
      await updateSegment(segment.id, {
        correctedText,
        text: correctedText,
        correctionSuggestions,
        correctionStatus: "已确认",
      });
    }
      setCorrectionMessage(`已完成 ${pendingCount} 条建议的一键审核，现在可以确认整份笔录。`);
    } finally {
      setOneClickRunning(false);
    }
  }

  async function confirmAll() {
    if (pendingCount > 0 || oneClickRunning) {
      setCorrectionMessage(`仍有 ${pendingCount} 条建议待审核，处理完成后才能确认整份笔录。`);
      return;
    }
    const version = (interview?.transcriptVersion || 1) + 1;
    const finalized = segments.map((segment) => ({ id: segment.id, text: finalizedSegmentText(segment) }));
    await db.transaction("rw", db.segments, db.interviews, db.transcriptSnapshots, async () => {
      await db.transcriptSnapshots.put({
        id: `${interviewId}_v${version}`,
        interviewId,
        version,
        segments: JSON.stringify(finalized),
        createdAt: now(),
      });
      await db.segments.where("interviewId").equals(interviewId).modify((segment) => {
        const finalText = finalizedSegmentText(segment as Segment);
        segment.text = finalText;
        segment.correctedText = finalText;
        segment.correctionStatus = "已确认";
        segment.correctionVersion = version;
        segment.updatedAt = now();
      });
      await db.interviews.update(interviewId, {
        transcriptStatus: "已确认",
        transcriptVersion: version,
        updatedAt: now(),
      });
    });
    setCorrectionMessage(`已确认并固化校正稿 v${version}，标签编码将自动读取此版本。`);
  }

  async function exportCorrectedTranscript() {
    if (!interview) return;
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const paragraphs = segments.flatMap((segment) => [
      new Paragraph({ children: [new TextRun({ text: `${segment.role}  ${formatTime(segment.start)}–${formatTime(segment.end)}`, bold: true, color: "0F766E" })], spacing: { before: 180, after: 60 } }),
      new Paragraph({ text: finalizedSegmentText(segment), spacing: { after: 100 } }),
    ]);
    const document = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: interview.title, bold: true, size: 32 })] }), new Paragraph({ text: `已确认校正稿 · v${interview.transcriptVersion || 1}` }), ...paragraphs] }] });
    saveAs(await Packer.toBlob(document), `${interview.title}-校正后笔录-v${interview.transcriptVersion || 1}.docx`);
  }

  async function restoreOriginal(segment: Segment) {
    const original = segment.originalText || segment.text;
    await updateSegment(segment.id, {
      correctedText: original,
      text: original,
      correctionSuggestions: [],
      correctionStatus: "未校正",
    });
  }

  async function batchRole(speakerId: string, role: SpeakerRole) {
    await db.segments
      .where("interviewId")
      .equals(interviewId)
      .filter((item) => item.speakerId === speakerId)
      .modify({ role, updatedAt: now() });
  }

  async function addTag(segment: Segment, tagName: string) {
    if (!tagName || segment.tags.includes(tagName)) return;
    await updateSegment(segment.id, { tags: [...segment.tags, tagName] });
    await recountTags();
  }

  async function removeTag(segment: Segment, tagName: string) {
    await updateSegment(segment.id, {
      tags: segment.tags.filter((item) => item !== tagName),
    });
    await recountTags();
  }

  async function recountTags() {
    if (!interview) return;
    const allSegments = await db.segments.toArray();
    const projectInterviews = await db.interviews
      .where("projectId")
      .equals(interview.projectId)
      .primaryKeys();
    const relevant = allSegments.filter((item) =>
      projectInterviews.includes(item.interviewId),
    );
    for (const tag of tags)
      await db.tags.update(tag.id, {
        usageCount: relevant.filter((item) => item.tags.includes(tag.name))
          .length,
      });
  }

  // C1: 自动说话人角色识别
  async function autoAssignRoles() {
    if (!interview || !aiHealth?.configured || !project) return;
    setAutoRoleRunning(true);
    try {
      const result = await autoAssignRolesWithAi(
        segments.map((s) => ({
          id: s.id,
          speakerId: s.speakerId,
          text: segmentCurrentText(s),
        })),
        project.researchType,
      );
      for (const assignment of result.data.assignments) {
        const role = assignment.role as SpeakerRole;
        if (!roles.includes(role)) continue;
        await batchRole(assignment.speakerId, role);
      }
      addToast(`已由 ${result.model} 自动识别 ${result.data.assignments.length} 个说话人角色`);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "角色识别失败", "error");
    } finally {
      setAutoRoleRunning(false);
    }
  }

  // C2: 一键校正增强 — 生成→审核→确认三步合一
  async function oneClickCorrection() {
    if (!interview) return;
    setOneClickRunning(true);
    setCorrectionMessage("正在执行一键校正...");
    try {
      // C1: 先自动识别说话人角色（如果 AI 可用）
      if (aiHealth?.configured && project) {
        setCorrectionMessage("步骤 1/3：自动识别说话人角色...");
        await autoAssignRoles();
      }
      // 步骤 2: 生成校正建议
      setCorrectionMessage("步骤 2/3：生成本地校正建议...");
      await generateSuggestions();
      // 步骤 2.5: 接受所有建议（一键审核）
      setCorrectionMessage("步骤 2/3：一键审核所有建议...");
      await reviewAllSuggestions();
      // 步骤 3: 确认整份笔录
      setCorrectionMessage("步骤 3/3：确认整份笔录...");
      await confirmAll();
      // C3: 流转提示
      addToast("一键校正完成！可以去标签编码了");
      setCorrectionMessage("一键校正完成，笔录已确认。");
    } catch (error) {
      setCorrectionMessage(error instanceof Error ? error.message : "一键校正失败");
      addToast("一键校正失败", "error");
    } finally {
      setOneClickRunning(false);
    }
  }

  // K1: 编码前智能筛选
  async function autoScreenSegments() {
    if (!segments.length) return;
    const screenRoleFilter = true; // 隐藏研究员/主持人提问
    const minLength = 10; // 隐藏 10 字以下短句
    for (const segment of segments) {
      const text = segmentCurrentText(segment).trim();
      let shouldSkip = false;
      let reason = "";
      if (screenRoleFilter && (segment.role === "研究员" || segment.role === "主持人")) {
        shouldSkip = true;
        reason = "角色过滤（研究员/主持人提问）";
      } else if (text.length < minLength) {
        shouldSkip = true;
        reason = `长度过滤（${text.length}字 < ${minLength}字）`;
      }
      await updateSegment(segment.id, {
        codingStatus: shouldSkip ? "已跳过" : "已纳入",
        screeningReason: reason,
      });
    }
    const included = segments.filter((s) => {
      const text = segmentCurrentText(s).trim();
      if (screenRoleFilter && (s.role === "研究员" || s.role === "主持人")) return false;
      if (text.length < minLength) return false;
      return true;
    }).length;
    addToast(`智能筛选完成：已纳入 ${included} 段，跳过 ${segments.length - included} 段`);
  }

  async function toggleSegmentScreening(segment: Segment) {
    const newStatus: CodingScreeningStatus = segment.codingStatus === "已纳入" ? "已跳过" : "已纳入";
    await updateSegment(segment.id, { codingStatus: newStatus, screeningReason: "手动调整" });
  }

  // K2: AI 自动创建标签体系
  async function generateTagsFromProject() {
    if (!project || !aiHealth?.configured) return;
    setTagGenRunning(true);
    setTagGenMessage("正在根据项目信息生成推荐标签...");
    try {
      const result = await generateTagsWithAi(
        project,
        segments.slice(0, 10).map((s) => ({
          id: s.id,
          role: s.role,
          text: segmentCurrentText(s),
        })),
      );
      const existingNames = new Set(tags.map((t) => t.name));
      let added = 0;
      for (const tag of result.data.tags) {
        if (existingNames.has(tag.name)) continue;
        const type = validTagTypes.includes(tag.type as TagType) ? tag.type as TagType : "自定义标签";
        await db.tags.add({
          id: uid("tag"),
          projectId: project.id,
          name: tag.name,
          type,
          description: tag.description,
          creationReason: tag.description,
          createdBy: "AI",
          color: aiTagColors[existingNames.size % aiTagColors.length],
          usageCount: 0,
          createdAt: now(),
        });
        existingNames.add(tag.name);
        added++;
      }
      setTagGenMessage(`已由 ${result.model} 生成 ${added} 个新标签（共推荐 ${result.data.tags.length} 个，${result.data.tags.length - added} 个已存在）。`);
      addToast(`AI 推荐标签：新增 ${added} 个`);
    } catch (error) {
      setTagGenMessage(error instanceof Error ? error.message : "标签生成失败");
      addToast("标签生成失败", "error");
    } finally {
      setTagGenRunning(false);
    }
  }

  // K3: 筛选后一键编码（仅对已纳入且未编码的片段执行）
  async function oneClickCoding() {
    if (!interview || !aiHealth?.configured) return;
    if (
      !window.confirm(
        "将把筛选后的访谈片段发送至AI 服务进行批量标签推荐；原始音频不会上传。是否继续？",
      )
    )
      return;
    setBatchCodingRunning(true);
    setBatchCodingMessage("正在准备分批编码...");
    let completedSegments = 0;
    const jobId = uid("coding_job");
    try {
      // K3: 仅对已纳入且未编码的片段执行
      const screenedSegments = segments.filter(
        (s) => s.codingStatus !== "已跳过" && s.tags.length === 0,
      );
      const availableTags = tags.map((t) => t.name);
      if (!availableTags.length) throw new Error("项目尚未建立标签，请先点击「AI 推荐标签」生成标签体系。");
      const payload = screenedSegments.map((s) => ({
        id: s.id,
        role: s.role,
        text: segmentCurrentText(s),
        tags: s.tags,
      }));
      if (!payload.length) {
        setBatchCodingMessage("没有需要编码的片段（所有筛选片段已编码或被跳过）。");
        return;
      }
      await db.aiJobs.put({
        id: jobId,
        projectId: interview.projectId,
        kind: "coding",
        status: "running",
        progress: 0,
        attempts: 1,
        input: JSON.stringify({ interviewId, segmentIds: payload.map((item) => item.id) }),
        output: JSON.stringify({ processedIds: [] }),
        createdAt: now(),
        updatedAt: now(),
      });
      const batchSize = 20;
      let appliedCount = 0;
      let codedSegments = 0;
      let model = "AI";
      const processedIds: string[] = [];
      const knownTagNames = new Set(availableTags);
      for (let offset = 0; offset < payload.length; offset += batchSize) {
        const batch = payload.slice(offset, offset + batchSize);
        const batchNumber = Math.floor(offset / batchSize) + 1;
        const batchTotal = Math.ceil(payload.length / batchSize);
        setBatchCodingMessage(`AI正在处理第 ${batchNumber}/${batchTotal} 批（已完成 ${offset}/${payload.length} 段）...`);
        const result = await batchCodeWithAi(batch, availableTags);
        completedSegments += batch.length;
        model = result.model;
        for (const proposed of result.data.newTags || []) {
          const name = proposed.name.trim();
          if (!name || knownTagNames.has(name)) continue;
          const type = validTagTypes.includes(proposed.type as TagType) ? proposed.type as TagType : "自定义标签";
          await db.tags.add({
            id: uid("tag"), projectId: interview.projectId, name, type,
            description: proposed.reason, creationReason: proposed.reason,
            createdBy: "AI", color: aiTagColors[knownTagNames.size % aiTagColors.length], usageCount: 0, createdAt: now(),
          });
          knownTagNames.add(name);
          availableTags.push(name);
        }
        for (const item of result.data.results) {
          const segment = segments.find((s) => s.id === item.segmentId);
          if (!segment || !item.suggestedTags.length) continue;
          const latest = await db.segments.get(segment.id);
          const existingTags = latest?.tags || segment.tags;
          const newTags = item.suggestedTags.filter((t) => !existingTags.includes(t));
          if (!newTags.length) continue;
          await updateSegment(segment.id, { tags: [...existingTags, ...newTags] });
          appliedCount += newTags.length;
          codedSegments += 1;
        }
        processedIds.push(...batch.map((item) => item.id));
        await db.aiJobs.update(jobId, {
          progress: payload.length ? Math.round((processedIds.length / payload.length) * 100) : 100,
          output: JSON.stringify({ processedIds, appliedCount, codedSegments }),
          updatedAt: now(),
        });
      }
      await recountTags();
      await db.aiJobs.update(jobId, { status: "completed", progress: 100, updatedAt: now() });
      // K4: 编码完成自动流转
      setBatchCodingMessage(
        `已由 ${model} 分批完成 ${payload.length} 个片段，应用 ${appliedCount} 个标签到 ${codedSegments} 个片段。`,
      );
      addToast("一键编码完成！可以去生成洞察了");
    } catch (error) {
      await db.aiJobs.update(jobId, { status: "failed", error: error instanceof Error ? error.message : "批量编码失败", updatedAt: now() });
      setBatchCodingMessage(
        `${error instanceof Error ? error.message : "批量编码失败"}${completedSegments > 0 ? `；已完成并保存 ${completedSegments} 段，可再次点击继续。` : ""}`,
      );
    } finally {
      setBatchCodingRunning(false);
    }
  }

  async function favorite(segment: Segment) {
    if (!interview) return;
    const existing = await db.quotes
      .where("segmentId")
      .equals(segment.id)
      .first();
    if (existing)
      return void (await db.quotes.update(existing.id, {
        text: segmentCurrentText(segment),
        tags: segment.tags,
        isFavorite: !existing.isFavorite,
      }));
    const quote: Quote = {
      id: uid("quote"),
      projectId: interview.projectId,
      interviewId,
      segmentId: segment.id,
      respondentCode: respondent?.code,
      text: segmentCurrentText(segment),
      speakerRole: segment.role,
      start: segment.start,
      end: segment.end,
      tags: segment.tags,
      importance: "中",
      isFavorite: true,
      isUsedInReport: false,
      createdAt: now(),
    };
    await db.quotes.add(quote);
  }

  async function addTerm(event: FormEvent) {
    event.preventDefault();
    if (!interview || !term.trim()) return;
    const item: Term = {
      id: uid("term"),
      projectId: interview.projectId,
      term: term.trim(),
      aliases: aliases
        .split(/[，,、]/)
        .map((value) => value.trim())
        .filter(Boolean),
      createdAt: now(),
    };
    await db.terms.add(item);
    setTerm("");
    setAliases("");
  }

  if (!interview)
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        没有找到这份访谈。
      </div>
    );
  const speakerIds = [...new Set(segments.map((item) => item.speakerId))];

  // 阶段步骤状态
  const step1Status: StepStatus = oneClickRunning
    ? "进行中"
    : hasSuggestions ? "已完成" : "未开始";
  const step2Status: StepStatus =
    pendingCount > 0 ? "进行中" : hasSuggestions ? "已完成" : "未开始";
  const step3Status: StepStatus = pendingCount > 0
    ? "待操作"
    : interview.transcriptStatus === "已确认" ? "已完成" : "待操作";
  const steps: { label: string; status: StepStatus }[] = [
    { label: "生成校正建议", status: step1Status },
    { label: "审核修改", status: step2Status },
    { label: "确认笔录", status: step3Status },
  ];

  // 进度条
  const total = segments.length;
  const uncorrectedPct = total ? (uncorrectedCount / total) * 100 : 0;
  const pendingReviewPct = total ? (pendingReviewCount / total) * 100 : 0;
  const confirmedPct = total ? (confirmedCount / total) * 100 : 0;

  const mainGridClass =
    mode === "coding"
      ? "grid gap-5 xl:grid-cols-[250px_1fr]"
      : "grid gap-5 xl:grid-cols-[250px_1fr_340px]";
  const persistedCodingActive = codingJob?.status === "running" && Date.now() - new Date(codingJob.updatedAt).getTime() < 3 * 60 * 1000;

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-brand-700">
            {mode === "correction" ? "笔录校正" : "标签编码"}
          </p>
          <h1 className="text-3xl font-bold">{interview.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            状态：{interview.transcriptStatus} · 版本 v
            {interview.transcriptVersion || 1} · 已确认 {confirmedCount}/
            {segments.length} 段
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "correction" ? (
            <>
              <Link className="btn-ghost" to="/correction">
                返回校正列表
              </Link>
              <button className="btn-ghost" onClick={() => setCompareMode((value) => !value)}>
                {compareMode ? "返回校正稿" : "查看修改对照"}
              </button>
              <button className="btn-ghost" onClick={() => void exportCorrectedTranscript()}>
                导出
              </button>
            </>
          ) : (
            <>
              <Link className="btn-ghost" to="/coding">
                返回编码列表
              </Link>
              <button
                className="btn-ghost"
                onClick={() => void autoScreenSegments()}
              >
                智能筛选
              </button>
              {aiHealth?.configured && (
                <button
                  className="btn-ghost"
                  disabled={tagGenRunning}
                  onClick={() => void generateTagsFromProject()}
                >
                  {tagGenRunning ? "生成标签中..." : "AI 推荐标签"}
                </button>
              )}
              <button
                className="btn-primary"
                disabled={!aiHealth?.configured || batchCodingRunning || persistedCodingActive}
                onClick={() => void oneClickCoding()}
              >
                {batchCodingRunning || persistedCodingActive ? `一键编码中${codingJob ? ` ${codingJob.progress}%` : ""}...` : codingJob?.status === "failed" || codingJob?.status === "running" ? "继续一键编码" : "一键编码"}
              </button>
              <Link
                className="btn-ghost"
                to={`/insights/${interview.projectId}`}
              >
                前往洞察分析
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 校正模式专属：分阶段引导步骤条 + 进度条 + 校正工具 */}
      {mode === "correction" && (
        <>
          {/* 分阶段引导步骤条 (2.3) */}
          <div className="card p-5">
            <div className="flex items-start">
              {steps.map((step, idx) => {
                const connectorDone = step.status === "已完成";
                const isLast = idx === steps.length - 1;
                return (
                  <div
                    key={step.label}
                    className="flex items-start"
                    style={{ flex: isLast ? "none" : "1 1 0%" }}
                  >
                    <div className="flex w-28 flex-col items-center text-center">
                      <div className={stepCircleClass(step.status)}>
                        {step.status === "已完成" ? <CheckIcon /> : idx + 1}
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-700">
                        {step.label}
                      </div>
                      <div
                        className={`mt-0.5 text-[10px] ${stepStatusTextClass(step.status)}`}
                      >
                        {step.status}
                      </div>
                    </div>
                    {!isLast && (
                      <div
                        className={`mt-4 h-0.5 flex-1 ${connectorDone ? "bg-green-400" : "bg-slate-200"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 笔录校正进度可视化 (2.8) */}
          <div className="card p-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-slate-300"
                style={{ width: `${uncorrectedPct}%` }}
                title={`未校正 ${uncorrectedCount} 段`}
              />
              <div
                className="bg-yellow-400"
                style={{ width: `${pendingReviewPct}%` }}
                title={`待审核 ${pendingReviewCount} 段`}
              />
              <div
                className="bg-green-500"
                style={{ width: `${confirmedPct}%` }}
                title={`已确认 ${confirmedCount} 段`}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                未校正 {uncorrectedCount} 段
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                待审核 {pendingReviewCount} 段
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                已确认 {confirmedCount} 段
              </span>
              <span className="text-slate-400">· 共 {total} 段</span>
            </div>
          </div>

          {/* 校正工具栏 */}
          <div className="card grid gap-3 p-4 md:grid-cols-[170px_1fr_auto] md:items-end">
            <label className="relative">
              <span className="label flex items-center gap-1">
                校正级别
                {/* 校正级别说明 Tooltip (2.7) */}
                <span className="group relative inline-flex">
                  <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500">
                    ?
                  </span>
                  <span className="pointer-events-none absolute left-6 top-0 z-20 hidden w-60 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-lg group-hover:block">
                    <p>
                      <b className="text-slate-800">保守：</b>仅修正明显错别字和标点
                    </p>
                    <p>
                      <b className="text-slate-800">标准：</b>修正错别字、语气词冗余、
                      标点
                    </p>
                    <p>
                      <b className="text-slate-800">阅读优化：</b>调整语序、删除冗余
                      表达、合并断句
                    </p>
                  </span>
                </span>
              </span>
              <select
                className="input"
                value={level}
                onChange={(e) => setLevel(e.target.value as CorrectionLevel)}
              >
                <option>保守</option>
                <option>标准</option>
                <option>阅读优化</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-medium">
                {interview.transcriptStatus === "已确认"
                  ? "这份笔录已经确认"
                  : pendingCount > 0
                    ? `下一步：审核 ${pendingCount} 条修改建议`
                    : hasSuggestions
                      ? "修改已审核，可以确认笔录"
                      : "第一步：生成校正建议"}
              </p>
              <p className="text-xs text-slate-500">
                默认展示可编辑校正稿；需要核对时点击右上角“查看修改对照”。
              </p>
            </div>
            {interview.transcriptStatus === "已确认" ? (
              <span className="rounded-lg bg-green-50 px-4 py-2 text-center text-sm font-medium text-green-700">
                已完成
              </span>
            ) : pendingCount > 0 ? (
              <button
                className="btn-primary"
                disabled={oneClickRunning}
                onClick={() => void reviewAllSuggestions()}
                title="接受当前全部待处理建议；也可在右侧逐条接受或拒绝"
              >
                接受全部建议（{pendingCount}）
              </button>
            ) : hasSuggestions ? (
              <button
                className="btn-primary"
                disabled={oneClickRunning}
                onClick={() => void confirmAll()}
              >
                确认笔录
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={oneClickRunning}
                onClick={() => void generateSuggestions()}
              >
                生成校正建议
              </button>
            )}
            {correctionMessage && <p className="text-xs text-brand-700 md:col-span-3">{correctionMessage}</p>}
          </div>
        </>
      )}

      {/* 编码模式专属：编码进度概览 + 筛选状态 */}
      {mode === "coding" && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-medium text-slate-700">
              编码进度：{segments.filter((s) => s.tags.length > 0).length} / {segments.length} 段已打标签
            </span>
            <div className="h-2 flex-1 rounded bg-slate-100">
              <div
                className="h-2 rounded bg-brand-500"
                style={{
                  width: `${segments.length ? (segments.filter((s) => s.tags.length > 0).length / segments.length) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-xs text-slate-500">
              共 {tagStats.length} 个标签 · {tagStats.reduce((sum, [, c]) => sum + c, 0)} 次标注
            </span>
          </div>
          {/* K1: 智能筛选状态 */}
          {(() => {
            const screened = segments.filter((s) => s.codingStatus === "已纳入").length;
            const skipped = segments.filter((s) => s.codingStatus === "已跳过").length;
            const unscreened = segments.filter((s) => !s.codingStatus || s.codingStatus === "未筛选").length;
            if (unscreened === segments.length) {
              return (
                <p className="mt-2 text-xs text-amber-600">
                  尚未筛选。点击上方「智能筛选」自动排除提问和短句，仅对高价值片段编码。
                </p>
              );
            }
            return (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1 text-green-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  已纳入 {screened} 段
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                  已跳过 {skipped} 段
                </span>
                {unscreened > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                    未筛选 {unscreened} 段
                  </span>
                )}
                <span className="text-slate-400">· 一键编码仅作用于已纳入且未编码的片段</span>
              </div>
            );
          })()}
          {tagGenMessage && (
            <p className={`mt-2 text-xs ${tagGenMessage.includes("失败") ? "text-red-600" : "text-brand-700"}`}>
              {tagGenMessage}
            </p>
          )}
          {batchCodingMessage && (
            <p className={`mt-2 text-xs ${batchCodingMessage.includes("失败") ? "text-red-600" : "text-brand-700"}`}>
              {batchCodingMessage}
            </p>
          )}
          {codingJob && (
            <p className="mt-2 text-xs text-slate-500">
              持久化任务：{codingJob.status === "running" ? "进行中" : codingJob.status === "completed" ? "已完成" : codingJob.status === "failed" ? "可继续" : codingJob.status} · {codingJob.progress}%
            </p>
          )}
          {!aiHealth?.configured && (
            <p className="mt-2 text-xs text-amber-600">
              AI 服务暂不可用。一键编码恢复后会自动启用；当前仍可继续人工编码。
            </p>
          )}
        </div>
      )}
      <div className={mainGridClass}>
        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold">筛选与说话人</h2>
            <input
              className="input mt-3"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文本、标签或角色"
            />
            <div className="mt-4 space-y-3">
              {speakerIds.map((speaker) => (
                <label key={speaker} className="block text-xs">
                  <span className="mb-1 block text-slate-500">{speaker}</span>
                  <select
                    className="input"
                    value={
                      segments.find((item) => item.speakerId === speaker)?.role
                    }
                    onChange={(e) =>
                      void batchRole(speaker, e.target.value as SpeakerRole)
                    }
                  >
                    {roles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          {mode === "correction" ? (
            <form className="card p-4" onSubmit={addTerm}>
              <h2 className="font-semibold">项目术语词库</h2>
              <input
                className="input mt-3"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="标准术语"
              />
              <input
                className="input mt-2"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="别名，用逗号分隔"
              />
              <button className="btn-ghost mt-2 w-full">加入词库</button>
              <div className="mt-3 flex flex-wrap gap-1">
                {terms.map((item) => (
                  <span className="chip bg-slate-100" key={item.id}>
                    {item.term}
                  </span>
                ))}
              </div>
            </form>
          ) : (
            <div className="card p-4">
              <h2 className="font-semibold">标签统计</h2>
              <p className="mt-1 text-xs text-slate-500">
                本访谈各标签使用次数
              </p>
              <div className="mt-3 space-y-2">
                {tagStats.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无标签使用记录。</p>
                ) : (
                  tagStats.map(([name, count]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="chip bg-brand-50 text-brand-800">
                        {name}
                      </span>
                      <span className="font-medium text-slate-500">
                        {count} 次
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
        <main className="card overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-semibold">
              {mode === "coding" ? "编码稿" : "校正稿"}
            </h2>
            {mode === "coding" && <p className="mt-1 text-xs text-green-700">当前使用已确认校正稿 · v{interview.transcriptVersion || 1}</p>}
          </div>
          <div className="max-h-[72vh] space-y-3 overflow-auto p-4">
            {filtered.map((segment) => (
              <article
                key={segment.id}
                onClick={() => setActiveId(segment.id)}
                className={`rounded-xl border p-3 ${activeId === segment.id ? "border-brand-400 bg-brand-50/30" : "border-slate-200"}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{segment.role}</span>
                  <span>
                    {formatTime(segment.start)}–{formatTime(segment.end)}
                  </span>
                  {mode === "correction" && (
                    <span
                      className={`badge ${segment.correctionStatus === "已确认" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}
                    >
                      {segment.correctionStatus || "未校正"}
                    </span>
                  )}
                  {mode === "coding" && segment.codingStatus && (
                    <button
                      className={`badge ${segment.codingStatus === "已纳入" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleSegmentScreening(segment);
                      }}
                      title={segment.screeningReason || "点击切换纳入/跳过"}
                    >
                      {segment.codingStatus === "已纳入" ? "已纳入" : "已跳过"}
                    </button>
                  )}
                </div>
                {mode === "correction" && compareMode ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-500">校正前</p>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{segment.originalText || segment.text}</p>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-green-700">校正后</p>
                      <textarea placeholder="此段校正后为空（已按审核建议删除）" className="input min-h-28 text-base leading-7" value={segmentCurrentText(segment)} onChange={(e) => void updateSegment(segment.id, { correctedText: e.target.value, text: e.target.value, correctionStatus: "待审核" })} />
                    </div>
                  </div>
                ) : (
                  <textarea
                    className={`input min-h-20 text-base leading-7 ${mode === "coding" ? "bg-slate-50 text-slate-700" : ""}`}
                    placeholder="此段校正后为空（已按审核建议删除）"
                    value={segmentCurrentText(segment)}
                    readOnly={mode === "coding"}
                    onChange={(e) => void updateSegment(segment.id, { correctedText: e.target.value, text: e.target.value, correctionStatus: "待审核" })}
                  />
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {segment.tags.map((tag) => (
                    <button
                      title="移除标签"
                      key={tag}
                      className="chip bg-brand-50 text-brand-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeTag(segment, tag);
                      }}
                    >
                      {tag} ×
                    </button>
                  ))}
                  {mode === "coding" ? (
                    <select
                      className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      defaultValue=""
                      onChange={(e) => void addTag(segment, e.target.value)}
                    >
                      <option value="">+ 添加标签</option>
                      {tags.map((tag) => (
                        <option key={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => void addTag(segment, e.target.value)}
                    >
                      <option value="">添加标签</option>
                      {tags.map((tag) => (
                        <option key={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className={
                      mode === "coding"
                        ? "rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
                        : "rounded border px-2 py-1 text-xs"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      void favorite(segment);
                    }}
                  >
                    {mode === "coding" ? "★ 收藏原话" : "收藏原话"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </main>
        {mode === "correction" && (
          <aside className="card p-4">
            <h2 className="font-semibold">修改审核</h2>
            <div
              className={`mt-3 rounded-lg p-3 text-xs ${aiHealth?.configured ? "bg-green-50 text-green-800" : "bg-slate-50 text-slate-600"}`}
            >
              <p>
                {aiHealth?.configured
                  ? `AI已连接 · ${aiHealth.model}`
                  : "AI 服务暂不可用，仍可使用本地规则校正。"}
              </p>
              {aiMessage && <p className="mt-1">{aiMessage}</p>}
            </div>
            {active ? (
              <div className="mt-4 space-y-3">
                <button
                  disabled={!aiHealth?.configured || aiRunning}
                  className="btn-primary w-full"
                  onClick={() => void generateAiSuggestions(active)}
                >
                  {aiRunning ? "AI 校正中..." : "AI校正当前片段"}
                </button>
                <div className="rounded bg-slate-50 p-3 text-xs leading-5">
                  <b>原始文本</b>
                  <p className="mt-1 text-slate-600">
                    {active.originalText || active.text}
                  </p>
                </div>
                {(active.correctionSuggestions || []).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${item.status === "待处理" ? "border-slate-200" : "border-slate-100 opacity-60"}`}
                  >
                    <div className="flex justify-between">
                      <span className="badge bg-slate-100">{item.category}</span>
                      <span
                        className={
                          item.risk === "低" ? "text-green-600" : "text-amber-600"
                        }
                      >
                        {item.risk}风险
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="text-red-600 line-through">
                        {item.original}
                      </span>{" "}
                      →{" "}
                      <span className="text-green-700">
                        {item.replacement || "删除"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                    {item.status === "待处理" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          className="btn-primary py-1"
                          onClick={() => void decide(active, item, true)}
                        >
                          接受
                        </button>
                        <button
                          className="btn-ghost py-1"
                          onClick={() => void decide(active, item, false)}
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <button
                  className="btn-ghost w-full"
                  onClick={() => void restoreOriginal(active)}
                >
                  恢复此段原文
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                选择一个片段审核修改。
              </p>
            )}
          </aside>
        )}
      </div>
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
