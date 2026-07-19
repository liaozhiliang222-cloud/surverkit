import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

describe("qual-excel summary template", () => {
  it("包含定性小结工作表、分析维度与受访者列", async () => {
    const data = await readFile("public/templates/summary_template.xlsx");
    const workbook = XLSX.read(data, { type: "buffer" });
    const sheetName = workbook.SheetNames.includes("定性小结")
      ? "定性小结"
      : workbook.SheetNames[0];
    expect(sheetName).toBe("定性小结");
    const ws = workbook.Sheets[sheetName];
    const a1 = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    expect(String(a1?.v ?? "")).toContain("分析维度");
    const b1 = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(String(b1?.v ?? "")).toContain("P1");
    const dimensions = [2, 3, 4, 5, 6].map((r) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      return String(cell?.v ?? "");
    });
    expect(dimensions).toContain("购买动机");
    expect(dimensions).toContain("使用痛点");
  });

  it("回填单元格内容后可正确读回", async () => {
    const data = await readFile("public/templates/summary_template.xlsx");
    const workbook = XLSX.read(data, { type: "buffer" });
    const ws = workbook.Sheets["定性小结"];
    const cellAddress = XLSX.utils.encode_cell({ r: 3, c: 1 }); // B4
    const existing = ws[cellAddress] || {};
    existing.t = "s";
    existing.v = "行为描述\n原话佐证";
    ws[cellAddress] = existing;
    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const reloaded = XLSX.read(output, { type: "buffer" });
    const result = reloaded.Sheets["定性小结"];
    const cell = result[cellAddress];
    expect(String(cell?.v ?? "")).toContain("行为描述");
    expect(String(cell?.v ?? "")).toContain("原话佐证");
  });
});
