import Dexie, { Table } from "dexie";
import type {
  Insight,
  Interview,
  Member,
  Project,
  Quote,
  ReportDraft,
  ReportTemplate,
  Respondent,
  Segment,
  SummaryTemplate,
  AiJob,
  SummaryRun,
  TranscriptSnapshot,
  SyncProfile,
  Tag,
  Term,
  Workspace,
} from "./types";

export const uid = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();

class ResearchBoxDb extends Dexie {
  projects!: Table<Project, string>;
  respondents!: Table<Respondent, string>;
  interviews!: Table<Interview, string>;
  segments!: Table<Segment, string>;
  tags!: Table<Tag, string>;
  quotes!: Table<Quote, string>;
  insights!: Table<Insight, string>;
  reports!: Table<ReportDraft, string>;
  terms!: Table<Term, string>;
  workspaces!: Table<Workspace, string>;
  members!: Table<Member, string>;
  syncProfiles!: Table<SyncProfile, string>;
  reportTemplates!: Table<ReportTemplate, string>;
  summaryTemplates!: Table<SummaryTemplate, string>;
  aiJobs!: Table<AiJob, string>;
  summaryRuns!: Table<SummaryRun, string>;
  transcriptSnapshots!: Table<TranscriptSnapshot, string>;

  constructor() {
    super("researchbox-local");
    this.version(1).stores({
      projects: "id, name, researchType, status, updatedAt",
      respondents: "id, projectId, code",
      interviews:
        "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
      segments: "id, interviewId, speakerId, role",
      tags: "id, projectId, name, type",
      quotes:
        "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
      insights: "id, projectId, type, status, createdAt",
      reports: "id, projectId, updatedAt",
    });
    this.version(2)
      .stores({
        projects: "id, name, researchType, status, updatedAt",
        respondents: "id, projectId, code, city, userType",
        interviews:
          "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
        segments: "id, interviewId, speakerId, role, correctionStatus",
        tags: "id, projectId, name, type",
        quotes:
          "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
        insights: "id, projectId, type, status, createdAt",
        reports: "id, projectId, updatedAt",
        terms: "id, projectId, term, createdAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("segments")
          .toCollection()
          .modify((segment) => {
            segment.originalText = segment.originalText || segment.text;
            segment.correctedText = segment.correctedText || segment.text;
            segment.correctionStatus = segment.correctionStatus || "未校正";
            segment.correctionVersion = segment.correctionVersion || 1;
            segment.correctionSuggestions = segment.correctionSuggestions || [];
          });
        await tx
          .table("interviews")
          .toCollection()
          .modify((interview) => {
            interview.transcriptVersion = interview.transcriptVersion || 1;
          });
      });
    this.version(3)
      .stores({
        projects: "id, workspaceId, name, researchType, status, updatedAt",
        respondents: "id, projectId, code, city, userType",
        interviews:
          "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
        segments: "id, interviewId, speakerId, role, correctionStatus",
        tags: "id, projectId, name, type",
        quotes:
          "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
        insights: "id, projectId, type, status, createdAt",
        reports: "id, projectId, updatedAt",
        terms: "id, projectId, term, createdAt",
        workspaces: "id, name, plan",
        members: "id, workspaceId, role, status",
        syncProfiles: "id, workspaceId, provider",
        reportTemplates: "id, workspaceId, name",
      })
      .upgrade(async (tx) => {
        await tx
          .table("projects")
          .toCollection()
          .modify((project) => {
            project.workspaceId = project.workspaceId || "workspace_default";
          });
      });
    this.version(4).stores({
      projects: "id, workspaceId, name, researchType, status, updatedAt",
      respondents: "id, projectId, code, city, userType",
      interviews:
        "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
      segments: "id, interviewId, speakerId, role, correctionStatus",
      tags: "id, projectId, name, type",
      quotes:
        "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
      insights: "id, projectId, type, status, createdAt",
      reports: "id, projectId, updatedAt",
      terms: "id, projectId, term, createdAt",
      workspaces: "id, name, plan",
      members: "id, workspaceId, role, status",
      syncProfiles: "id, workspaceId, provider",
      reportTemplates: "id, workspaceId, name",
      summaryTemplates: "id, projectId, createdAt",
    });
    this.version(5).stores({
      projects: "id, workspaceId, name, researchType, status, updatedAt",
      respondents: "id, projectId, code, city, userType",
      interviews: "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
      segments: "id, interviewId, speakerId, role, correctionStatus",
      tags: "id, projectId, name, type, parentId",
      quotes: "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
      insights: "id, projectId, type, status, createdAt",
      reports: "id, projectId, updatedAt",
      terms: "id, projectId, term, createdAt",
      workspaces: "id, name, plan",
      members: "id, workspaceId, role, status",
      syncProfiles: "id, workspaceId, provider",
      reportTemplates: "id, workspaceId, name",
      summaryTemplates: "id, projectId, createdAt",
      aiJobs: "id, projectId, kind, status, updatedAt",
      summaryRuns: "id, projectId, version, status, createdAt",
    });
    this.version(6).stores({
      projects: "id, workspaceId, name, researchType, status, updatedAt",
      respondents: "id, projectId, code, city, userType",
      interviews: "id, projectId, respondentId, transcriptStatus, analysisStatus, updatedAt",
      segments: "id, interviewId, speakerId, role, correctionStatus",
      tags: "id, projectId, name, type, parentId",
      quotes: "id, projectId, interviewId, segmentId, isFavorite, isUsedInReport",
      insights: "id, projectId, type, status, createdAt",
      reports: "id, projectId, updatedAt",
      terms: "id, projectId, term, createdAt",
      workspaces: "id, name, plan",
      members: "id, workspaceId, role, status",
      syncProfiles: "id, workspaceId, provider",
      reportTemplates: "id, workspaceId, name",
      summaryTemplates: "id, projectId, createdAt",
      aiJobs: "id, projectId, kind, status, updatedAt",
      summaryRuns: "id, projectId, version, status, createdAt",
      transcriptSnapshots: "id, interviewId, version, createdAt",
    });
  }
}

export const db = new ResearchBoxDb();

export async function initDb() {
  await db.open();
  if ((await db.workspaces.count()) === 0) {
    const createdAt = now();
    await db.workspaces.add({
      id: "workspace_default",
      name: "我的研究工作区",
      plan: "专业版",
      createdAt,
    });
    await db.members.add({
      id: "member_owner",
      workspaceId: "workspace_default",
      name: "本机用户",
      role: "所有者",
      status: "已加入",
      createdAt,
    });
    await db.reportTemplates.bulkAdd([
      {
        id: "template_standard",
        workspaceId: "workspace_default",
        name: "标准研究报告",
        description: "背景、样本、核心发现、主题、原话与建议",
        sections: [
          "项目背景",
          "研究目标",
          "样本说明",
          "核心发现",
          "高频主题",
          "典型原话",
          "业务启发",
        ],
        accentColor: "#0d9488",
        createdAt,
      },
      {
        id: "template_executive",
        workspaceId: "workspace_default",
        name: "管理层摘要",
        description: "精简呈现关键结论、证据与行动建议",
        sections: ["执行摘要", "核心发现", "关键证据", "行动建议"],
        accentColor: "#1e2761",
        createdAt,
      },
    ]);
  }
  const count = await db.projects.count();
  if (count > 0) return;

  const createdAt = now();
  const project: Project = {
    id: "project_demo",
    workspaceId: "workspace_default",
    name: "常温短保奶消费者访谈",
    description: "验证消费者对常温短保奶新品概念的理解、购买动机与阻碍。",
    researchType: "用户访谈",
    objective: "识别购买动机、价格阻碍、渠道偏好与可打动用户的表达方式。",
    industry: "乳品 / 快消",
    targetGroup: "年轻家庭用户、精致妈妈、健康关注人群",
    researchQuestions:
      "用户如何理解短保？哪些场景愿意尝试？价格和冷藏要求如何影响购买？",
    owner: "ResearchBox 示例",
    status: "进行中",
    createdAt,
    updatedAt: createdAt,
  };

  const respondent: Respondent = {
    id: "respondent_demo",
    projectId: project.id,
    code: "R01",
    nickname: "受访者01",
    gender: "女",
    ageRange: "30-39",
    city: "上海",
    userType: "年轻家庭用户",
    tags: ["精致妈妈", "低温奶用户"],
    notes: "家中有儿童，日常关注食品安全与新鲜度。",
    createdAt,
  };

  const interview: Interview = {
    id: "interview_demo",
    projectId: project.id,
    respondentId: respondent.id,
    title: "R01 新品概念深访",
    sourceType: "文本",
    fileName: "demo_transcript.txt",
    interviewDate: createdAt.slice(0, 10),
    duration: 420,
    transcriptStatus: "转写完成",
    analysisStatus: "已生成摘要",
    createdAt,
    updatedAt: createdAt,
  };

  const tags: Tag[] = [
    {
      id: "tag_fresh",
      projectId: project.id,
      name: "新鲜感认知",
      type: "主题标签",
      color: "#0d9488",
      usageCount: 2,
      createdAt,
      description: "将产品与新鲜、品质、短保关联。",
    },
    {
      id: "tag_price",
      projectId: project.id,
      name: "价格敏感",
      type: "痛点标签",
      color: "#f59e0b",
      usageCount: 2,
      createdAt,
      description: "价格影响购买频次或尝试意愿。",
    },
    {
      id: "tag_child",
      projectId: project.id,
      name: "儿童饮用场景",
      type: "需求标签",
      color: "#6366f1",
      usageCount: 1,
      createdAt,
      description: "围绕儿童、家庭健康的饮用需求。",
    },
    {
      id: "tag_channel",
      projectId: project.id,
      name: "购买便利性",
      type: "阻碍因素",
      color: "#ef4444",
      usageCount: 1,
      createdAt,
      description: "渠道距离、冷藏陈列与到手便利性。",
    },
  ];

  const segments: Segment[] = [
    {
      id: "seg_demo_1",
      interviewId: interview.id,
      start: 1.2,
      end: 6.8,
      speakerId: "SPEAKER_00",
      role: "研究员",
      text: "今天主要想了解一下你最近购买牛奶的经历。",
      confidence: 0.96,
      tags: [],
      updatedAt: createdAt,
    },
    {
      id: "seg_demo_2",
      interviewId: interview.id,
      start: 7.1,
      end: 16.5,
      speakerId: "SPEAKER_01",
      role: "受访者",
      text: "我一般会买低温奶，因为感觉更新鲜一点，给小孩喝也更放心。",
      confidence: 0.89,
      tags: ["新鲜感认知", "儿童饮用场景"],
      updatedAt: createdAt,
    },
    {
      id: "seg_demo_3",
      interviewId: interview.id,
      start: 18.0,
      end: 27.4,
      speakerId: "SPEAKER_00",
      role: "研究员",
      text: "如果是常温但保质期更短的新品，你会怎么理解？",
      confidence: 0.94,
      tags: [],
      updatedAt: createdAt,
    },
    {
      id: "seg_demo_4",
      interviewId: interview.id,
      start: 28.1,
      end: 48.2,
      speakerId: "SPEAKER_01",
      role: "受访者",
      text: "我会觉得它可能比普通常温奶新鲜，但是如果价格高太多，可能不会天天买。",
      confidence: 0.86,
      tags: ["新鲜感认知", "价格敏感"],
      updatedAt: createdAt,
    },
    {
      id: "seg_demo_5",
      interviewId: interview.id,
      start: 52.5,
      end: 70.6,
      speakerId: "SPEAKER_01",
      role: "受访者",
      text: "如果小区门口便利店能买到，我会愿意先试一下；如果只能去大超市就比较麻烦。",
      confidence: 0.78,
      tags: ["购买便利性"],
      updatedAt: createdAt,
    },
    {
      id: "seg_demo_6",
      interviewId: interview.id,
      start: 76.0,
      end: 88.6,
      speakerId: "SPEAKER_01",
      role: "受访者",
      text: "每天喝的话，这个价格还是有点贵，但偶尔给孩子喝可以接受。",
      confidence: 0.91,
      tags: ["价格敏感", "儿童饮用场景"],
      updatedAt: createdAt,
    },
  ];

  const quotes: Quote[] = [
    {
      id: "quote_demo_1",
      projectId: project.id,
      interviewId: interview.id,
      segmentId: "seg_demo_6",
      respondentCode: respondent.code,
      text: "每天喝的话，这个价格还是有点贵，但偶尔给孩子喝可以接受。",
      speakerRole: "受访者",
      start: 76,
      end: 88.6,
      tags: ["价格敏感", "儿童饮用场景"],
      importance: "高",
      isFavorite: true,
      isUsedInReport: false,
      createdAt,
    },
  ];

  const insights: Insight[] = [
    {
      id: "insight_demo_1",
      projectId: project.id,
      title: "新鲜感是短保概念的第一理解入口",
      description:
        "受访者会把短保与“更新鲜、更放心”联系起来，尤其在儿童饮用场景中更容易形成尝试动机。",
      type: "主题聚合",
      evidenceCount: 2,
      relatedTags: ["新鲜感认知", "儿童饮用场景"],
      quoteIds: ["quote_demo_1"],
      status: "草稿",
      createdBy: "AI模拟",
      createdAt,
    },
  ];

  await db.transaction(
    "rw",
    [
      db.projects,
      db.respondents,
      db.interviews,
      db.segments,
      db.tags,
      db.quotes,
      db.insights,
    ],
    async () => {
      await db.projects.add(project);
      await db.respondents.add(respondent);
      await db.interviews.add(interview);
      await db.tags.bulkAdd(tags);
      await db.segments.bulkAdd(segments);
      await db.quotes.bulkAdd(quotes);
      await db.insights.bulkAdd(insights);
    },
  );
}

export async function resetDemoData() {
  await db.transaction(
    "rw",
    [
      db.projects,
      db.respondents,
      db.interviews,
      db.segments,
      db.tags,
      db.quotes,
      db.insights,
      db.reports,
      db.terms,
    ],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.respondents.clear(),
        db.interviews.clear(),
        db.segments.clear(),
        db.tags.clear(),
        db.quotes.clear(),
        db.insights.clear(),
        db.reports.clear(),
        db.terms.clear(),
      ]);
    },
  );
  await initDb();
}
