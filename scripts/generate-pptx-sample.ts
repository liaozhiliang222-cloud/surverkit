import { writeFile } from 'node:fs/promises';
import { exportResearchPptx } from '../src/p2Services';
import type { Insight, Interview, Project, Quote } from '../src/types';

const timestamp = new Date().toISOString();
const project: Project = { id: 'qa', workspaceId: 'workspace_default', name: '新品概念消费者访谈', researchType: '用户访谈', objective: '识别消费者对新品价值的理解、购买驱动与关键阻碍，并形成可执行的上市建议。', status: '进行中', createdAt: timestamp, updatedAt: timestamp };
const interviews = Array.from({ length: 8 }, (_, index): Interview => ({ id: `i${index}`, projectId: 'qa', title: `R0${index + 1} 深访`, sourceType: '文本', transcriptStatus: '已确认', analysisStatus: '已纳入聚合分析', createdAt: timestamp, updatedAt: timestamp }));
const insights: Insight[] = [
  ['新鲜感是消费者理解新品价值的首要入口', '6/8 位受访者主动将短保与更新鲜、更安心联系起来，家庭饮用场景尤其明显。', 14, ['新鲜感认知']],
  ['价格决定产品更适合日常购买还是偶尔尝试', '价格溢价被普遍接受的前提是品质差异能够被直接感知。', 11, ['价格敏感']],
  ['购买便利性影响首次尝试后的持续复购', '社区便利店和常用电商渠道覆盖，是降低尝试成本的关键。', 8, ['购买便利性']]
].map(([title, description, evidenceCount, relatedTags], index) => ({ id: `in${index}`, projectId: 'qa', title: title as string, description: description as string, type: '主题聚合', evidenceCount: evidenceCount as number, relatedTags: relatedTags as string[], quoteIds: [], status: '已确认', createdBy: '用户', createdAt: timestamp }));
const quotes: Quote[] = ['如果给孩子喝，我会更看重新鲜和安心。','价格高一点可以，但要让我明显感受到品质差别。','楼下便利店可以买到，我才会愿意经常回购。','偶尔尝鲜没问题，每天买还是会考虑预算。'].map((text, index) => ({ id: `q${index}`, projectId: 'qa', interviewId: `i${index}`, segmentId: `s${index}`, respondentCode: `R0${index + 1}`, text, speakerRole: '受访者', start: 10, end: 20, tags: [index % 2 ? '价格敏感' : '新鲜感认知'], importance: '高', isFavorite: true, isUsedInReport: true, createdAt: timestamp }));
const buffer = await exportResearchPptx(project, interviews, insights, quotes, undefined, false);
await writeFile('tmp-pptx-qa-v2.pptx', Buffer.from(buffer as Uint8Array));
