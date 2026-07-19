import { describe, expect, it } from "vitest";
import { evidenceStrength, tagCooccurrence } from "./researchAnalytics";

describe("research analytics", () => {
  it("counts each tag pair once per segment", () => {
    const segments = [{ id: "s1", tags: ["价格", "渠道", "价格"] }, { id: "s2", tags: ["渠道", "价格"] }] as any;
    expect(tagCooccurrence(segments)).toEqual([{ left: "价格", right: "渠道", count: 2, segmentIds: ["s1", "s2"] }]);
  });
  it("grades evidence conservatively", () => {
    expect(evidenceStrength(5, 3)).toBe("强");
    expect(evidenceStrength(2, 2)).toBe("中");
    expect(evidenceStrength(8, 1)).toBe("弱");
  });
});
