import { describe, expect, it } from "vitest";
import { safeParseSlidePlans } from "./slidePlan";

describe("slide plan AI output normalization", () => {
  it("accepts object and scalar content returned by the model", () => {
    const result = safeParseSlidePlans({
      slides: [{
        slideId: "slide_01",
        slideType: "RECOMMENDATIONS",
        title: "行动建议",
        content: {
          items: [{ title: "价格透明", description: "展示历史价格" }],
          leftColumn: "当前问题",
          rightColumn: [{ name: "目标状态", detail: "规则清晰" }],
          visualItems: null,
          recommendations: [
            { action: "上线价保提醒", expectedImpact: "降低焦虑", priority: "urgent" },
            "优化客服入口",
          ],
        },
      }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].content.items).toEqual(["价格透明：展示历史价格"]);
    expect(result.data[0].content.leftColumn).toEqual(["当前问题"]);
    expect(result.data[0].content.recommendations[0].priority).toBe("medium");
  });
});
