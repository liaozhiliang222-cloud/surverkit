import { describe, expect, it } from "vitest";
import {
  MAX_INSIGHT_BATCH_CHARS,
  MAX_TRANSCRIPT_CHARS,
  createInsightBatches,
  splitInsightTranscript,
} from "./aiClient";

describe("professional report transcript batching", () => {
  it("preserves every character while splitting a long transcript", () => {
    const content = `  opening\n${"a".repeat(36_000)}\nclosing  `;
    const chunks = splitInsightTranscript({ fileName: "long.docx", content });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= MAX_TRANSCRIPT_CHARS)).toBe(true);
    expect(chunks.map((chunk) => chunk.content).join("")).toBe(content);
  });

  it("packs the reported ten-file workload without truncation or oversized batches", () => {
    const lengths = [13_707, 17_782, 14_964, 14_256, 16_752, 18_770, 24_682, 14_611, 13_685, 13_397];
    const transcripts = lengths.map((length, index) => ({
      fileName: `interview-${index + 1}.docx`,
      content: String(index % 10).repeat(length),
    }));

    const batches = createInsightBatches(transcripts);
    const sentChars = batches.flat().reduce((sum, chunk) => sum + chunk.content.length, 0);

    expect(sentChars).toBe(lengths.reduce((sum, length) => sum + length, 0));
    expect(batches.every((batch) => batch.reduce((sum, chunk) => sum + chunk.content.length, 0) <= MAX_INSIGHT_BATCH_CHARS)).toBe(true);
    expect(batches.flat().every((chunk) => chunk.content.length <= MAX_TRANSCRIPT_CHARS)).toBe(true);
    expect(batches.length).toBeLessThanOrEqual(12);
  });
});
