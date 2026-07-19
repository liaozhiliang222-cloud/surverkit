/**
 * 笔录解析 Schema
 * 对应模块：Transcript Parser
 * AI 不生成此结构，由前端解析上传文件生成
 */
import { z } from "zod";

export const SpeakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["主持人", "受访者", "研究员", "专家", "客户", "其他"]).default("受访者"),
});

export const TranscriptSegmentSchema = z.object({
  segmentId: z.string(),
  speakerId: z.string(),
  text: z.string(),
  cleanText: z.string(),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  topic: z.string().default(""),
});

export const TranscriptDocumentSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  fileName: z.string(),
  participants: z.array(SpeakerSchema),
  segments: z.array(TranscriptSegmentSchema),
});

export type Speaker = z.infer<typeof SpeakerSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type TranscriptDocument = z.infer<typeof TranscriptDocumentSchema>;

/**
 * 从原始文本构建简化的 TranscriptDocument
 * 第一阶段不做复杂说话人识别，按段落切分
 */
export function buildTranscriptFromText(fileName: string, text: string): TranscriptDocument {
  const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  paragraphs.forEach((para, idx) => {
    const start = cursor;
    const end = cursor + para.length;
    segments.push({
      segmentId: `seg_${String(idx + 1).padStart(3, "0")}`,
      speakerId: "speaker_1",
      text: para,
      cleanText: para.replace(/\s+/g, " ").trim(),
      startIndex: start,
      endIndex: end,
      topic: "",
    });
    cursor = end + 2;
  });

  return {
    documentId,
    title: fileName.replace(/\.[^.]+$/, ""),
    fileName,
    participants: [{ id: "speaker_1", name: "受访者", role: "受访者" }],
    segments,
  };
}
