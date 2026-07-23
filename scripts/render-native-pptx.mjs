/**
 * 原生模板 PPT 渲染脚本（第五阶段）
 *
 * 使用 pptx-automizer 加载原生 .pptx 模板，替换占位符后生成最终 PPTX。
 *
 * 工作流程：
 * 1. 读取输入 JSON（含 SlidePlan[] 和报告元信息）
 * 2. 初始化 pptx-automizer，加载所有原生模板
 * 3. 对每个 SlidePlan：
 *    - 根据 slideType 选择对应的原生模板
 *    - addSlide 添加幻灯片
 *    - 在 modify 回调中遍历所有 <a:t> 文本节点，替换 {{占位符}}
 * 4. 输出 PPTX 文件
 *
 * 命令行参数：
 *   argv[2]: 输入 JSON 文件路径
 *   argv[3]: 输出 PPTX 文件路径
 *
 * 输入 JSON 格式：
 * {
 *   "slides": [...SlidePlan],
 *   "reportTitle": "报告标题",
 *   "reportAuthor": "作者",
 *   "reportDate": "2026-07-19"
 * }
 */
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import PptxAutomizerPkg from "pptx-automizer";
const Automizer = PptxAutomizerPkg.default || PptxAutomizerPkg.Automizer || PptxAutomizerPkg;

// ====== 模板映射：slideType → 模板文件名 ======
const TEMPLATE_MAP = {
  COVER: "native-cover-01.pptx",
  AGENDA: "native-keyfinding-01.pptx",
  SECTION_DIVIDER: "native-cover-01.pptx",
  EXECUTIVE_SUMMARY: "native-keyfinding-01.pptx",
  KEY_FINDING: "native-keyfinding-01.pptx",
  INSIGHT_EVIDENCE: "native-quote-01.pptx",
  THREE_INSIGHTS: "native-keyfinding-01.pptx",
  TWO_COLUMN_COMPARE: "native-compare-01.pptx",
  QUOTE: "native-quote-01.pptx",
  PROCESS: "native-keyfinding-01.pptx",
  JOURNEY: "native-keyfinding-01.pptx",
  CAUSE_ANALYSIS: "native-compare-01.pptx",
  PAIN_POINT_MATRIX: "native-keyfinding-01.pptx",
  OPPORTUNITY_MATRIX: "native-keyfinding-01.pptx",
  RECOMMENDATIONS: "native-keyfinding-01.pptx",
  CONCLUSION: "native-cover-01.pptx",
  APPENDIX: "native-keyfinding-01.pptx",
  // 第一阶段新增：结构化图形类型
  PYRAMID_HIERARCHY: "native-keyfinding-01.pptx",
  DECISION_PATH: "native-keyfinding-01.pptx",
  PRODUCT_HOUSE: "native-keyfinding-01.pptx",
};

// ====== 占位符正则 ======
const PLACEHOLDER_REGEX = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

/**
 * 根据占位符 token 获取替换值
 */
function getPlaceholderValue(token, slide, ctx) {
  const { pageNumber, totalPages, reportTitle, reportAuthor, reportDate } = ctx;
  const content = slide.content || {};

  switch (token) {
    // 通用字段
    case "PAGE_TITLE": return slide.title || "";
    case "SUBTITLE": return slide.subtitle || "";
    case "CORE_MESSAGE": return slide.coreMessage || "";
    case "PAGE_NUMBER": return String(pageNumber);
    case "TOTAL_PAGES": return String(totalPages);
    case "CHAPTER_LABEL": return slide.chapterLabel || "";

    // 元信息字段
    case "REPORT_TITLE": return reportTitle || slide.title || "";
    case "REPORT_DATE": return reportDate || new Date().toISOString().slice(0, 10);
    case "REPORT_AUTHOR": return reportAuthor || "ResearchBox";

    // 引用字段
    case "QUOTE_TEXT": return content.quote || "";
    case "QUOTE_SPEAKER": return content.quoteSpeaker || "";
    case "QUOTE_SOURCE": return content.quoteSource || "";

    // 列表字段：ITEM_1 ~ ITEM_8
    default:
      if (token.startsWith("ITEM_")) {
        const idx = parseInt(token.slice(5), 10) - 1;
        const items = content.items || [];
        return items[idx] || "";
      }
      if (token.startsWith("LEFT_ITEM_")) {
        const idx = parseInt(token.slice(10), 10) - 1;
        const col = content.leftColumn || [];
        return col[idx] || "";
      }
      if (token.startsWith("RIGHT_ITEM_")) {
        const idx = parseInt(token.slice(11), 10) - 1;
        const col = content.rightColumn || [];
        return col[idx] || "";
      }
      if (token.startsWith("VISUAL_LABEL_")) {
        const idx = parseInt(token.slice(13), 10) - 1;
        const items = content.visualItems || [];
        return items[idx] || "";
      }
      // 结构化占位符：旅程阶段 / 矩阵单元格 / 因果链
      if (token.startsWith("STAGE_")) {
        const m = token.match(/^STAGE_(\d+)_(\w+)$/);
        if (m) {
          const st = (content.journeyStages || [])[parseInt(m[1], 10) - 1];
          return st ? (st[m[2].toLowerCase()] || "") : "";
        }
      }
      if (token.startsWith("CELL_")) {
        const m = token.match(/^CELL_(\d+)_(\w+)$/);
        if (m) {
          const c = (content.matrixCells || [])[parseInt(m[1], 10) - 1];
          if (!c) return "";
          if (m[2] === "LEVEL") return c.severity || c.priority || "";
          return c[m[2].toLowerCase()] || "";
        }
      }
      if (token.startsWith("CHAIN_")) {
        const m = token.match(/^CHAIN_(\d+)_(\w+)$/);
        if (m) {
          const ch = (content.causalChains || [])[parseInt(m[1], 10) - 1];
          if (!ch) return "";
          if (m[2] === "SURFACE") return (ch.surfaceCauses || []).join("；");
          if (m[2] === "ROOT") return (ch.rootCauses || []).join("；");
          return ch[m[2].toLowerCase()] || "";
        }
      }
      return "";
  }
}

/**
 * 替换文本中的占位符
 * 如果值为空，保留原始占位符（方便模板作者调试）
 */
function replaceTextPlaceholders(text, slide, ctx) {
  if (!text || !text.includes("{{")) return text;
  return text.replace(PLACEHOLDER_REGEX, (full, token) => {
    const val = getPlaceholderValue(token, slide, ctx);
    return val !== undefined && val !== "" ? escapeXml(val) : full;
  });
}

/**
 * XML 特殊字符转义
 */
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 获取所有需要加载的模板文件列表（去重）
 */
function getRequiredTemplates(slides) {
  const templates = new Set();
  for (const slide of slides) {
    const tmpl = TEMPLATE_MAP[slide.slideType] || "native-keyfinding-01.pptx";
    templates.add(tmpl);
  }
  return Array.from(templates);
}

/**
 * 主函数
 */
async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("用法: node render-native-pptx.mjs <input.json> <output.pptx>");
    process.exit(1);
  }

  console.log("[render-native] 开始渲染原生模板 PPT");
  console.log(`  输入: ${inputPath}`);
  console.log(`  输出: ${outputPath}`);

  // 读取输入
  const inputRaw = await readFile(inputPath, "utf-8");
  const input = JSON.parse(inputRaw);
  const slides = input.slides || [];
  const reportTitle = input.reportTitle || "研究报告";
  const reportAuthor = input.reportAuthor || "ResearchBox";
  const reportDate = input.reportDate || new Date().toISOString().slice(0, 10);

  console.log(`  页数: ${slides.length}`);
  console.log(`  报告标题: ${reportTitle}`);

  if (slides.length === 0) {
    console.error("[render-native] 错误: 没有幻灯片数据");
    process.exit(1);
  }

  // 模板目录
  const templateDir = path.resolve(process.cwd(), "native-templates");
  console.log(`  模板目录: ${templateDir}`);

  // 检查模板文件是否存在
  const requiredTemplates = getRequiredTemplates(slides);
  console.log(`  需要的模板: ${requiredTemplates.join(", ")}`);

  for (const tmpl of requiredTemplates) {
    const tmplPath = path.join(templateDir, tmpl);
    try {
      await access(tmplPath);
    } catch {
      console.error(`[render-native] 错误: 模板文件不存在: ${tmplPath}`);
      process.exit(1);
    }
  }

  // 初始化 pptx-automizer
  const automizer = new Automizer({
    templateDir,
    outputDir: path.dirname(outputPath),
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    compression: 6,
    cleanup: true,
    verbosity: 0,
  });

  // 加载所有需要的模板
  // 第一个模板作为根模板，用文件名引用
  // 其他模板用 load 加载，用文件名（不含扩展名）作为标签
  const rootTemplate = requiredTemplates[0];
  let pres = automizer.loadRoot(rootTemplate);

  // 所有模板（包括根模板）都需要用 load 注册标签，以便 addSlide 引用
  for (const tmpl of requiredTemplates) {
    const label = tmpl.replace(".pptx", "");
    pres = pres.load(tmpl, label);
  }

  // 为每个 SlidePlan 添加幻灯片
  const totalPages = slides.length;
  let addedCount = 0;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const pageNumber = i + 1;
    const tmplFile = TEMPLATE_MAP[slide.slideType] || "native-keyfinding-01.pptx";
    const tmplLabel = tmplFile.replace(".pptx", "");

    const ctx = { pageNumber, totalPages, reportTitle, reportAuthor, reportDate };

    console.log(`  [${pageNumber}/${totalPages}] ${slide.slideType} → ${tmplFile} : ${slide.title || "(无标题)"}`);

    try {
      pres = pres.addSlide(tmplLabel, 1, (slideObj) => {
        // 使用 modify 回调遍历所有 <a:t> 文本节点，替换占位符
        slideObj.modify((doc) => {
          // 获取所有文本节点 <a:t>
          const textNodes = doc.getElementsByTagName("a:t");
          const nodesToProcess = [];
          for (let j = 0; j < textNodes.length; j++) {
            const node = textNodes[j];
            if (node.textContent && node.textContent.includes("{{")) {
              nodesToProcess.push(node);
            }
          }

          // 替换占位符
          for (const node of nodesToProcess) {
            const original = node.textContent;
            const replaced = replaceTextPlaceholders(original, slide, ctx);
            if (replaced !== original) {
              node.textContent = replaced;
            }
          }
        });
      });
      addedCount++;
    } catch (err) {
      console.error(`  ✗ 第 ${pageNumber} 页添加失败: ${err.message}`);
    }
  }

  console.log(`\n[render-native] 成功添加 ${addedCount}/${totalPages} 页`);

  // 输出文件
  const outputFileName = path.basename(outputPath);
  await pres.write(outputFileName);
  console.log(`[render-native] 输出文件: ${outputPath}`);
  console.log("[render-native] 渲染完成");
}

main().catch(err => {
  console.error("[render-native] 渲染失败:", err);
  process.exit(1);
});
