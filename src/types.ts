export type ResearchType =
  | "用户访谈"
  | "市场深访"
  | "焦点小组"
  | "专家访谈"
  | "开放题分析"
  | "可用性测试"
  | "其他";

export type ProjectStatus = "进行中" | "已完成" | "已归档";
export type TranscriptStatus =
  | "未转写"
  | "转写中"
  | "转写完成"
  | "转写失败"
  | "原始笔录"
  | "待校正"
  | "校正中"
  | "已确认";
export type AnalysisStatus =
  "未分析" | "已生成摘要" | "已完成编码" | "已纳入聚合分析";
export type TagType =
  | "主题标签"
  | "痛点标签"
  | "需求标签"
  | "情绪标签"
  | "行为标签"
  | "决策因素"
  | "阻碍因素"
  | "人群特征"
  | "自定义标签";
export type SpeakerRole =
  "研究员" | "受访者" | "主持人" | "专家" | "客户" | "其他";

export interface Project {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  researchType: ResearchType;
  objective: string;
  industry?: string;
  targetGroup?: string;
  researchQuestions?: string;
  owner?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = "所有者" | "管理员" | "研究员" | "访客";
export interface Workspace {
  id: string;
  name: string;
  plan: "免费版" | "专业版" | "团队版";
  createdAt: string;
}
export interface Member {
  id: string;
  workspaceId: string;
  name: string;
  email?: string;
  role: MemberRole;
  status: "已加入" | "待邀请";
  createdAt: string;
}
export interface SyncProfile {
  id: string;
  workspaceId: string;
  provider: "未配置" | "WebDAV" | "自定义API";
  endpoint?: string;
  enabled: boolean;
  lastSyncAt?: string;
}
export interface ReportTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  sections: string[];
  accentColor: string;
  createdAt: string;
}
export interface SummaryTemplate {
  id: string;
  projectId: string;
  name: string;
  fileName: string;
  sheetName: string;
  dimensionColumn: number;
  respondentColumns: Array<{ column: number; label: string }>;
  dimensions: Array<{ row: number; name: string }>;
  headerRow?: number;
  validationWarnings?: string[];
  fileData: ArrayBuffer;
  createdAt: string;
}

export interface AiJob {
  id: string;
  projectId: string;
  kind: "summary" | "coding" | "insight";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  attempts: number;
  input: string;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryRun {
  id: string;
  projectId: string;
  version: number;
  model: string;
  interviewIds: string[];
  dimensions: string[];
  summaries: string;
  status: "草稿" | "已确认";
  createdAt: string;
}

export interface TranscriptSnapshot {
  id: string;
  interviewId: string;
  version: number;
  segments: string;
  createdAt: string;
}

export interface Respondent {
  id: string;
  projectId: string;
  code: string;
  nickname?: string;
  gender?: string;
  ageRange?: string;
  city?: string;
  userType?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
}

export interface Interview {
  id: string;
  projectId: string;
  respondentId?: string;
  title: string;
  sourceType: "音频" | "视频" | "文本" | "DOCX" | "SRT" | "VTT";
  fileName?: string;
  interviewDate?: string;
  duration?: number;
  transcriptStatus: TranscriptStatus;
  analysisStatus: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
  transcriptVersion?: number;
}

export type CorrectionLevel = "保守" | "标准" | "阅读优化";
export type CorrectionCategory =
  "错别字" | "标点" | "语气词" | "重复" | "术语" | "格式";
export type CorrectionRisk = "低" | "中" | "高";

export interface CorrectionSuggestion {
  id: string;
  category: CorrectionCategory;
  original: string;
  replacement: string;
  reason: string;
  risk: CorrectionRisk;
  status: "待处理" | "已接受" | "已拒绝";
}

export type CodingScreeningStatus = "未筛选" | "已纳入" | "已跳过";

export interface Segment {
  id: string;
  interviewId: string;
  start: number;
  end: number;
  speakerId: string;
  role: SpeakerRole;
  text: string;
  originalText?: string;
  correctedText?: string;
  correctionStatus?: "未校正" | "待审核" | "已确认";
  correctionVersion?: number;
  correctionSuggestions?: CorrectionSuggestion[];
  codingStatus?: CodingScreeningStatus;
  screeningReason?: string;
  confidence: number;
  tags: string[];
  note?: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  type: TagType;
  description?: string;
  color: string;
  parentId?: string;
  usageCount: number;
  createdAt: string;
  createdBy?: "用户" | "AI";
  creationReason?: string;
}

export interface Quote {
  id: string;
  projectId: string;
  interviewId: string;
  segmentId: string;
  respondentCode?: string;
  text: string;
  speakerRole: SpeakerRole;
  start: number;
  end: number;
  tags: string[];
  importance: "高" | "中" | "低";
  isFavorite: boolean;
  isUsedInReport: boolean;
  note?: string;
  createdAt: string;
}

export interface Insight {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: "单访谈摘要" | "主题聚合" | "痛点分析" | "需求分析" | "报告草稿";
  evidenceCount: number;
  relatedTags: string[];
  quoteIds: string[];
  segmentIds?: string[];
  interviewIds?: string[];
  inputVersion?: number;
  status: "草稿" | "已确认";
  createdBy: "AI模拟" | "AI" | "用户";
  createdAt: string;
}

export interface Term {
  id: string;
  projectId: string;
  term: string;
  aliases: string[];
  description?: string;
  createdAt: string;
}

export interface ReportDraft {
  id: string;
  projectId?: string;
  title: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
  templateId?: string;
}
