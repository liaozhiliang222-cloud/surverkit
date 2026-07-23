import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  sheetToGrid,
  guessStructure,
  extractTemplateContent,
} from "./summaryTemplateParser";

// 构造一个内存中的「座谈分组」模板（类似黄豆酱：A维度 + B/C/D城市分组列）
function buildGroupTemplate(): XLSX.WorkSheet {
  const aoa: string[][] = [
    ["", "青岛", "温州", "合肥"], // R1 表头：A空 + 城市分组
    ["基本属性", "共6位青岛居民…", "共6位温州居民…", "共6位合肥居民…"],
    ["饮食偏好", "鲁菜家常…", "家常菜偏辣…", "家常徽菜…"],
    ["购买考虑因素", "1.品牌…", "1.原料…", "1.原料…"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return ws;
}

// 构造一个内存中的「深访单人」模板（类似增城：A~D维度层级 + E追问 + F起被访者列）
function buildSingleTemplate(): XLSX.WorkSheet {
  const aoa: string[][] = [
    ["访谈大纲", "", "", "", "", "", ""], // R1 标题
    ["时间", "", "主要问题", "", "关键追问", "被访者:刘畅", "被访者:江素韵"], // R2 表头
    ["还原生活", "基础信息", "基础背景", "家庭现状", "请问您家里几口人？", "——一家三口", "——三代同堂"],
    ["还原生活", "基础信息", "基础背景", "工作状况", "您从事什么职业？", "——自营IT公司", "——服装贸易"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 模拟合并：A3:A4 / B3:B4 / C3:C4 纵向合并
  ws["!merges"] = [
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
  ];
  return ws;
}

describe("通用小结模板结构解析", () => {
  it("识别座谈分组模板（城市分组列）", () => {
    const grid = sheetToGrid(buildGroupTemplate());
    const guess = guessStructure(grid);
    expect(guess).not.toBeNull();
    expect(guess!.kind).toBe("group");
    expect(guess!.headerRow0).toBe(0);
    expect(guess!.respondentCols).toEqual([1, 2, 3]);
    expect(guess!.dimensionCols).toEqual([0]);
    const { dimensions, columns } = extractTemplateContent(grid, guess!);
    expect(dimensions.map((d) => d.name)).toEqual([
      "基本属性",
      "饮食偏好",
      "购买考虑因素",
    ]);
    expect(columns.map((c) => c.label)).toEqual(["青岛", "温州", "合肥"]);
    // 已填写内容应被识别为风格样例
    expect(columns.every((c) => c.hasContent)).toBe(true);
    expect(columns[0].styleSample?.["基本属性"]).toContain("青岛");
  });

  it("识别深访单人模板（层级维度 + 追问列排除 + 被访者列）", () => {
    const grid = sheetToGrid(buildSingleTemplate());
    const guess = guessStructure(grid);
    expect(guess).not.toBeNull();
    expect(guess!.kind).toBe("single");
    expect(guess!.headerRow0).toBe(1);
    // E列(关键追问, index4)应被排除在维度列之外
    expect(guess!.dimensionCols).not.toContain(4);
    expect(guess!.respondentCols).toEqual([5, 6]);
    const { dimensions, columns } = extractTemplateContent(grid, guess!);
    // 末级维度应为 D 列的家庭现状/工作状况
    const names = dimensions.map((d) => d.name);
    expect(names).toContain("家庭现状");
    expect(names).toContain("工作状况");
    // 层级 path 应包含父级
    const jiating = dimensions.find((d) => d.name === "家庭现状");
    expect(jiating?.path).toContain("还原生活");
    expect(columns.map((c) => c.label)).toEqual(["被访者:刘畅", "被访者:江素韵"]);
  });

  it("真实模板文件（若存在）可识别", async () => {
    const files = [
      "D:/新建文件夹/WXWork/1688858442297726/Cache/File/2026-04/黄豆酱座谈会小结-0429.xlsx",
      "D:/新建文件夹/WXWork/1688858442297726/Cache/File/2026-07/【增城新塘-0710】定位及客户研究_访问小结.xlsx",
    ];
    for (const f of files) {
      let data: Buffer;
      try {
        data = await readFile(f);
      } catch {
        continue; // 文件不存在则跳过
      }
      const wb = XLSX.read(data, { type: "buffer" });
      let best: { guess: NonNullable<ReturnType<typeof guessStructure>> } | null = null;
      for (const sn of wb.SheetNames) {
        const grid = sheetToGrid(wb.Sheets[sn]);
        const guess = guessStructure(grid);
        if (guess && (!best || guess.respondentCols.length > best.guess.respondentCols.length)) {
          best = { guess };
        }
      }
      expect(best).not.toBeNull();
      expect(best!.guess.respondentCols.length).toBeGreaterThan(0);
    }
  });
});
