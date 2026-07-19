/**
 * 内置原生 PPT 模板生成脚本
 *
 * 使用 PptxGenJS 生成 4 个示例 .pptx 模板文件，保存到 native-templates/ 目录。
 * 每个模板的文本框中包含占位符（如 {{PAGE_TITLE}}）。
 *
 * 渲染时，脚本会遍历所有文本框并替换占位符，不依赖形状名。
 * 模板作者也可以在 PowerPoint 中自行设计模板，只需在文本框中写入 {{占位符}}。
 *
 * 运行方式：npx tsx scripts/generate-native-templates.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

interface TemplateGenOptions {
  outputDir: string;
}

/**
 * 生成企业封面模板 native-cover-01.pptx
 * 布局：深色背景 + 大标题 + 副标题 + 日期 + 作者
 */
async function generateCoverTemplate(pptx: any, opts: TemplateGenOptions): Promise<Buffer> {
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();

  slide.background = { color: "1A2B4C" };

  slide.addText("{{REPORT_TITLE}}", {
    x: 0.8, y: 2.2, w: 11.3, h: 1.2,
    fontSize: 36, bold: true, color: "FFFFFF",
    align: "center", fontFace: "微软雅黑",
  });

  slide.addText("{{SUBTITLE}}", {
    x: 1.5, y: 3.6, w: 9.9, h: 0.6,
    fontSize: 18, color: "B0C4DE",
    align: "center", fontFace: "微软雅黑",
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 4.5, y: 4.5, w: 4.0, h: 0.03,
    fill: { color: "4A90D9" },
    line: { type: "none" },
  });

  slide.addText("{{REPORT_DATE}}", {
    x: 3.5, y: 4.8, w: 5.9, h: 0.4,
    fontSize: 14, color: "8FAFCF",
    align: "center", fontFace: "微软雅黑",
  });

  slide.addText("{{REPORT_AUTHOR}}", {
    x: 3.5, y: 5.3, w: 5.9, h: 0.4,
    fontSize: 12, color: "7A9FBF",
    align: "center", fontFace: "微软雅黑",
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.0, w: 13.33, h: 0.5,
    fill: { color: "0D1B33" },
    line: { type: "none" },
  });

  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}

/**
 * 生成关键发现模板 native-keyfinding-01.pptx
 * 布局：白底 + 标题栏 + 核心信息框 + 要点列表
 */
async function generateKeyFindingTemplate(pptx: any, opts: TemplateGenOptions): Promise<Buffer> {
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.0,
    fill: { color: "1A2B4C" },
    line: { type: "none" },
  });

  slide.addText("{{PAGE_TITLE}}", {
    x: 0.6, y: 0.2, w: 10.0, h: 0.6,
    fontSize: 24, bold: true, color: "FFFFFF",
    align: "left", fontFace: "微软雅黑",
  });

  slide.addText("{{PAGE_NUMBER}} / {{TOTAL_PAGES}}", {
    x: 11.5, y: 0.3, w: 1.5, h: 0.4,
    fontSize: 12, color: "8FAFCF",
    align: "right", fontFace: "微软雅黑",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.3, w: 12.1, h: 1.0,
    fill: { color: "E8F0FA" },
    line: { color: "4A90D9", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("{{CORE_MESSAGE}}", {
    x: 0.8, y: 1.4, w: 11.7, h: 0.8,
    fontSize: 16, bold: true, color: "1A2B4C",
    align: "left", valign: "middle", fontFace: "微软雅黑",
  });

  for (let i = 0; i < 5; i++) {
    const y = 2.6 + i * 0.75;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.6, y: y + 0.1, w: 0.4, h: 0.4,
      fill: { color: "4A90D9" },
      line: { type: "none" },
    });
    slide.addText(String(i + 1), {
      x: 0.6, y: y + 0.1, w: 0.4, h: 0.4,
      fontSize: 12, bold: true, color: "FFFFFF",
      align: "center", valign: "middle",
    });

    slide.addText(`{{ITEM_${i + 1}}}`, {
      x: 1.2, y: y, w: 11.5, h: 0.6,
      fontSize: 14, color: "333333",
      align: "left", valign: "middle", fontFace: "微软雅黑",
    });
  }

  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}

/**
 * 生成双栏对比模板 native-compare-01.pptx
 * 布局：标题 + 左右两栏各含 4 条要点
 */
async function generateCompareTemplate(pptx: any, opts: TemplateGenOptions): Promise<Buffer> {
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addText("{{PAGE_TITLE}}", {
    x: 0.6, y: 0.3, w: 12.1, h: 0.7,
    fontSize: 24, bold: true, color: "1A2B4C",
    align: "left", fontFace: "微软雅黑",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 6.65, y: 1.3, w: 0, h: 5.8,
    line: { color: "CCCCCC", width: 1 },
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.4, y: 1.3, w: 6.0, h: 5.8,
    fill: { color: "F5F8FC" },
    line: { color: "D0DCE8", width: 0.5 },
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 6.9, y: 1.3, w: 6.0, h: 5.8,
    fill: { color: "FFF8F0" },
    line: { color: "E8D5C0", width: 0.5 },
  });

  slide.addText("左侧观点", {
    x: 0.6, y: 1.5, w: 5.6, h: 0.5,
    fontSize: 16, bold: true, color: "1A2B4C",
    align: "left", fontFace: "微软雅黑",
  });

  slide.addText("右侧观点", {
    x: 7.1, y: 1.5, w: 5.6, h: 0.5,
    fontSize: 16, bold: true, color: "8B4513",
    align: "left", fontFace: "微软雅黑",
  });

  for (let i = 0; i < 4; i++) {
    const y = 2.2 + i * 1.1;
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: y, w: 0.08, h: 0.9,
      fill: { color: "4A90D9" },
      line: { type: "none" },
    });
    slide.addText(`{{LEFT_ITEM_${i + 1}}}`, {
      x: 0.9, y: y, w: 5.3, h: 0.9,
      fontSize: 13, color: "444444",
      align: "left", valign: "middle", fontFace: "微软雅黑",
    });
  }

  for (let i = 0; i < 4; i++) {
    const y = 2.2 + i * 1.1;
    slide.addShape(pptx.ShapeType.rect, {
      x: 7.2, y: y, w: 0.08, h: 0.9,
      fill: { color: "D97706" },
      line: { type: "none" },
    });
    slide.addText(`{{RIGHT_ITEM_${i + 1}}}`, {
      x: 7.4, y: y, w: 5.3, h: 0.9,
      fontSize: 13, color: "444444",
      align: "left", valign: "middle", fontFace: "微软雅黑",
    });
  }

  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}

/**
 * 生成专家引用模板 native-quote-01.pptx
 * 布局：深色侧边栏 + 大引用文本 + 说话人 + 来源
 */
async function generateQuoteTemplate(pptx: any, opts: TemplateGenOptions): Promise<Buffer> {
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.background = { color: "FAFAFA" };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.3, h: 7.5,
    fill: { color: "4A90D9" },
    line: { type: "none" },
  });

  slide.addText("\u201C", {
    x: 0.8, y: 0.5, w: 2.0, h: 2.0,
    fontSize: 120, color: "4A90D9",
    bold: true, fontFace: "Georgia",
  });

  slide.addText("{{QUOTE_TEXT}}", {
    x: 1.5, y: 2.0, w: 10.5, h: 3.5,
    fontSize: 20, color: "2C3E50",
    italic: true, align: "left", valign: "top",
    fontFace: "微软雅黑",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 1.5, y: 5.8, w: 4.0, h: 0,
    line: { color: "BDC3C7", width: 1 },
  });

  slide.addText("{{QUOTE_SPEAKER}}", {
    x: 1.5, y: 6.0, w: 10.5, h: 0.5,
    fontSize: 16, bold: true, color: "1A2B4C",
    align: "left", fontFace: "微软雅黑",
  });

  slide.addText("{{QUOTE_SOURCE}}", {
    x: 1.5, y: 6.6, w: 10.5, h: 0.4,
    fontSize: 12, color: "7F8C8D",
    align: "left", fontFace: "微软雅黑",
  });

  slide.addText("{{PAGE_TITLE}}", {
    x: 1.5, y: 0.3, w: 10.5, h: 0.4,
    fontSize: 12, color: "95A5A6",
    align: "left", fontFace: "微软雅黑",
  });

  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}

/**
 * 主函数：生成所有内置模板
 */
async function main(): Promise<void> {
  console.log("=== 生成内置原生 PPT 模板 ===\n");

  const outputDir = path.resolve(process.cwd(), "native-templates");
  await mkdir(outputDir, { recursive: true });
  console.log(`输出目录: ${outputDir}\n`);

  const { default: PptxGenJS } = await import("pptxgenjs");

  console.log("[1/4] 企业封面模板");
  {
    const pptx: any = new PptxGenJS();
    pptx.author = "ResearchBox";
    pptx.title = "企业封面模板";
    const buf = await generateCoverTemplate(pptx, { outputDir });
    const filePath = path.join(outputDir, "native-cover-01.pptx");
    await writeFile(filePath, buf);
    console.log(`  ✓ native-cover-01.pptx (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log("[2/4] 关键发现模板");
  {
    const pptx: any = new PptxGenJS();
    pptx.author = "ResearchBox";
    pptx.title = "关键发现模板";
    const buf = await generateKeyFindingTemplate(pptx, { outputDir });
    const filePath = path.join(outputDir, "native-keyfinding-01.pptx");
    await writeFile(filePath, buf);
    console.log(`  ✓ native-keyfinding-01.pptx (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log("[3/4] 双栏对比模板");
  {
    const pptx: any = new PptxGenJS();
    pptx.author = "ResearchBox";
    pptx.title = "双栏对比模板";
    const buf = await generateCompareTemplate(pptx, { outputDir });
    const filePath = path.join(outputDir, "native-compare-01.pptx");
    await writeFile(filePath, buf);
    console.log(`  ✓ native-compare-01.pptx (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log("[4/4] 专家引用模板");
  {
    const pptx: any = new PptxGenJS();
    pptx.author = "ResearchBox";
    pptx.title = "专家引用模板";
    const buf = await generateQuoteTemplate(pptx, { outputDir });
    const filePath = path.join(outputDir, "native-quote-01.pptx");
    await writeFile(filePath, buf);
    console.log(`  ✓ native-quote-01.pptx (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log("\n=== 所有模板生成完成 ===");
  console.log(`模板目录: ${outputDir}`);
  console.log("\n使用说明：");
  console.log("  这些模板包含 {{占位符}}，生成报告时会被自动替换。");
  console.log("  用户也可以在 PowerPoint 中自行设计模板并上传。");
}

main().catch(err => {
  console.error("生成模板失败:", err);
  process.exit(1);
});
