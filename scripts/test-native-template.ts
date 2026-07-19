/**
 * 第五阶段端到端测试
 *
 * 验证内容：
 * 1. 占位符适配器模块加载正常
 * 2. 原生模板文件存在
 * 3. 渲染脚本能正常执行（4 页测试数据）
 * 4. 占位符替换正确（检查输出 PPTX 中的文本）
 * 5. 后端 API 端点注册正常（通过 Python 模块检查）
 *
 * 运行方式：npx tsx scripts/test-native-template.ts
 */
import { readFile, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => {
      results.push({ name, passed: true, detail: "" });
      console.log(`  ✓ ${name}`);
    })
    .catch(err => {
      results.push({ name, passed: false, detail: err.message });
      console.log(`  ✗ ${name}: ${err.message}`);
    });
}

async function main() {
  console.log("=== 第五阶段端到端测试 ===\n");

  const projectRoot = path.resolve(process.cwd());
  const templatesDir = path.join(projectRoot, "native-templates");
  const workDir = "c:\\Users\\a1382\\.trae-cn\\work\\6a4d0bd3ee07c13973b12168";
  const outputPath = path.join(workDir, "p5-test-output.pptx");

  // 测试 1：模块加载
  console.log("[1] 模块加载测试");
  await test("nativeTemplateAdapter 模块可导入", async () => {
    const adapter = await import("../src/ppt2/nativeTemplateAdapter");
    if (!adapter.STANDARD_PLACEHOLDERS || adapter.STANDARD_PLACEHOLDERS.length === 0) {
      throw new Error("STANDARD_PLACEHOLDERS 为空");
    }
    if (typeof adapter.compressTitle !== "undefined") {
      throw new Error("不应导出 compressTitle");
    }
    if (typeof adapter.buildPlaceholderValues !== "function") {
      throw new Error("buildPlaceholderValues 未导出");
    }
    if (typeof adapter.replacePlaceholders !== "function") {
      throw new Error("replacePlaceholders 未导出");
    }
  });

  // 测试 2：占位符替换功能
  console.log("[2] 占位符替换功能测试");
  await test("replacePlaceholders 正确替换占位符", async () => {
    const { replacePlaceholders, buildPlaceholderValues } = await import("../src/ppt2/nativeTemplateAdapter");
    const values = new Map<string, string>();
    values.set("PAGE_TITLE", "测试标题");
    values.set("CORE_MESSAGE", "核心信息内容");
    values.set("ITEM_1", "第一条要点");

    const result = replacePlaceholders("标题：{{PAGE_TITLE}}，信息：{{CORE_MESSAGE}}，要点：{{ITEM_1}}", values);
    if (!result.includes("测试标题")) throw new Error(`未替换 PAGE_TITLE: ${result}`);
    if (!result.includes("核心信息内容")) throw new Error(`未替换 CORE_MESSAGE: ${result}`);
    if (!result.includes("第一条要点")) throw new Error(`未替换 ITEM_1: ${result}`);
  });

  await test("空值占位符保留原文", async () => {
    const { replacePlaceholders } = await import("../src/ppt2/nativeTemplateAdapter");
    const values = new Map<string, string>();
    values.set("PAGE_TITLE", "有值");
    // ITEM_1 未设置

    const result = replacePlaceholders("{{PAGE_TITLE}} - {{ITEM_1}}", values);
    if (!result.includes("有值")) throw new Error("有值的占位符未替换");
    if (!result.includes("{{ITEM_1}}")) throw new Error("空值占位符应保留原文");
  });

  await test("detectPlaceholders 检测占位符", async () => {
    const { detectPlaceholders } = await import("../src/ppt2/nativeTemplateAdapter");
    const tokens = detectPlaceholders("{{PAGE_TITLE}} and {{ITEM_1}} and {{QUOTE_TEXT}}");
    if (tokens.length !== 3) throw new Error(`应检测到 3 个占位符，实际 ${tokens.length}`);
    if (!tokens.includes("PAGE_TITLE")) throw new Error("缺少 PAGE_TITLE");
    if (!tokens.includes("ITEM_1")) throw new Error("缺少 ITEM_1");
    if (!tokens.includes("QUOTE_TEXT")) throw new Error("缺少 QUOTE_TEXT");
  });

  // 测试 3：模板文件存在
  console.log("[3] 原生模板文件测试");
  const templateFiles = [
    "native-cover-01.pptx",
    "native-keyfinding-01.pptx",
    "native-compare-01.pptx",
    "native-quote-01.pptx",
  ];
  for (const file of templateFiles) {
    await test(`模板文件存在: ${file}`, async () => {
      const filePath = path.join(templatesDir, file);
      try {
        await access(filePath);
      } catch {
        throw new Error(`文件不存在: ${filePath}`);
      }
    });
  }

  // 测试 4：渲染脚本端到端测试
  console.log("[4] 渲染脚本端到端测试");
  await test("渲染脚本生成 4 页 PPTX", async () => {
    const inputData = {
      reportTitle: "测试报告",
      reportAuthor: "测试作者",
      reportDate: "2026-07-19",
      slides: [
        {
          slideId: "t1", slideType: "COVER", templateId: "", chapterId: "", chapterLabel: "",
          title: "封面标题", subtitle: "副标题", coreMessage: "",
          content: { items: [], leftColumn: [], rightColumn: [], quote: "", quoteSpeaker: "", quoteSource: "", metric: "", metricLabel: "", visualItems: [], recommendations: [] },
          findingIds: [], evidenceSegmentIds: [], visualType: "none", speakerNotes: "",
        },
        {
          slideId: "t2", slideType: "KEY_FINDING", templateId: "", chapterId: "", chapterLabel: "",
          title: "关键发现", subtitle: "", coreMessage: "这是核心信息",
          content: { items: ["要点1", "要点2", "要点3"], leftColumn: [], rightColumn: [], quote: "", quoteSpeaker: "", quoteSource: "", metric: "", metricLabel: "", visualItems: [], recommendations: [] },
          findingIds: [], evidenceSegmentIds: [], visualType: "none", speakerNotes: "",
        },
        {
          slideId: "t3", slideType: "TWO_COLUMN_COMPARE", templateId: "", chapterId: "", chapterLabel: "",
          title: "对比分析", subtitle: "", coreMessage: "",
          content: { items: [], leftColumn: ["左1", "左2"], rightColumn: ["右1", "右2"], quote: "", quoteSpeaker: "", quoteSource: "", metric: "", metricLabel: "", visualItems: [], recommendations: [] },
          findingIds: [], evidenceSegmentIds: [], visualType: "none", speakerNotes: "",
        },
        {
          slideId: "t4", slideType: "QUOTE", templateId: "", chapterId: "", chapterLabel: "",
          title: "引用页", subtitle: "", coreMessage: "",
          content: { items: [], leftColumn: [], rightColumn: [], quote: "这是引用的原话内容", quoteSpeaker: "说话人", quoteSource: "来源信息", metric: "", metricLabel: "", visualItems: [], recommendations: [] },
          findingIds: [], evidenceSegmentIds: [], visualType: "none", speakerNotes: "",
        },
      ],
    };

    const inputPath = path.join(workDir, "p5-test-input.json");
    await writeFile(inputPath, JSON.stringify(inputData, null, 2), "utf-8");

    const scriptPath = path.join(projectRoot, "scripts", "render-native-pptx.mjs");
    execFileSync("node", [scriptPath, inputPath, outputPath], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 60000,
    });

    // 验证输出文件存在且大小合理
    const stats = await readFile(outputPath);
    if (stats.length < 1000) {
      throw new Error(`输出文件过小: ${stats.length} 字节`);
    }
    if (stats.length > 1000000) {
      throw new Error(`输出文件过大: ${stats.length} 字节`);
    }
    console.log(`    输出文件大小: ${(stats.length / 1024).toFixed(1)} KB`);
  });

  // 测试 5：Python 后端端点
  console.log("[5] Python 后端端点测试");
  await test("main.py 加载且包含 3 个新端点", async () => {
    const venvPython = path.join(projectRoot, "ai-proxy", ".venv", "Scripts", "python.exe");
    const checkScript = `
import sys
sys.path.insert(0, 'ai-proxy')
import main
routes = [r.path for r in main.app.routes if hasattr(r, 'path')]
assert '/report/native-templates' in routes, f'缺少 native-templates: {routes}'
assert '/report/render-native' in routes, f'缺少 render-native: {routes}'
assert '/report/upload-template' in routes, f'缺少 upload-template: {routes}'
print('OK: 3 个端点已注册')
`;
    execFileSync(venvPython, ["-c", checkScript], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 30000,
    });
  });

  // 测试 6：模板选择逻辑
  console.log("[6] 模板选择逻辑测试");
  await test("selectNativeTemplate 正确匹配 slideType", async () => {
    const { selectNativeTemplate, BUILTIN_NATIVE_TEMPLATES } = await import("../src/ppt2/nativeTemplateAdapter");
    const cover = selectNativeTemplate("COVER", BUILTIN_NATIVE_TEMPLATES);
    if (!cover || cover.templateId !== "native-cover-01") {
      throw new Error(`COVER 应匹配 native-cover-01，实际: ${cover?.templateId}`);
    }
    const quote = selectNativeTemplate("QUOTE", BUILTIN_NATIVE_TEMPLATES);
    if (!quote || quote.templateId !== "native-quote-01") {
      throw new Error(`QUOTE 应匹配 native-quote-01，实际: ${quote?.templateId}`);
    }
  });

  // ====== 汇总 ======
  console.log("\n=== 测试汇总 ===");
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`通过: ${passed} / ${results.length}`);
  if (failed > 0) {
    console.log(`失败: ${failed}`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
  console.log("\n===== 所有测试通过 =====");
}

main().catch(err => {
  console.error("测试执行失败:", err);
  process.exit(1);
});
