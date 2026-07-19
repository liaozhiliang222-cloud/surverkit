import type { Segment } from "./types";

export interface TagPair {
  left: string;
  right: string;
  count: number;
  segmentIds: string[];
}

export function tagCooccurrence(segments: Segment[]): TagPair[] {
  const pairs = new Map<string, TagPair>();
  segments.forEach((segment) => {
    const tags = [...new Set(segment.tags)].sort((a, b) => a.localeCompare(b, "zh"));
    tags.forEach((left, leftIndex) => tags.slice(leftIndex + 1).forEach((right) => {
      const key = `${left}\u0000${right}`;
      const pair = pairs.get(key) || { left, right, count: 0, segmentIds: [] };
      pair.count += 1;
      pair.segmentIds.push(segment.id);
      pairs.set(key, pair);
    }));
  });
  return [...pairs.values()].sort((a, b) => b.count - a.count || a.left.localeCompare(b.left, "zh"));
}

export function evidenceStrength(evidenceCount: number, interviewCount: number): "强" | "中" | "弱" {
  if (evidenceCount >= 5 && interviewCount >= 3) return "强";
  if (evidenceCount >= 2 && interviewCount >= 2) return "中";
  return "弱";
}

export function contraryCases(segments: Segment[], dominantTag: string) {
  const interviewIds = new Set(segments.filter((segment) => segment.tags.includes(dominantTag)).map((segment) => segment.interviewId));
  return segments.filter((segment) => segment.role !== "研究员" && segment.text.trim() && !interviewIds.has(segment.interviewId));
}
