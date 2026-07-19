/**
 * 缩略图渲染脚本
 *
 * 由 Python 后端调用，接收 slides JSON 文件路径，生成 PPTX 文件。
 *
 * 用法：
 *   node scripts/render-thumbnails.mjs <input-json> <output-pptx>
 *
 * 输入 JSON 格式：
 *   { "slides": [SlidePlan, SlidePlan, ...] }
 *
 * 输出：
 *   生成 PPTX 文件到指定路径
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error("用法: node scripts/render-thumbnails.mjs <input-json> <output-pptx>");
    process.exit(1);
  }

  console.log(`[render-thumbnails] 输入: ${inputPath}`);
  console.log(`[render-thumbnails] 输出: ${outputPath}`);

  // 读取 slides JSON
  const jsonContent = await readFile(inputPath, "utf-8");
  const { slides } = JSON.parse(jsonContent);

  if (!slides || !Array.isArray(slides) || slides.length === 0) {
    console.error("[render-thumbnails] slides 为空或格式错误");
    process.exit(1);
  }

  console.log(`[render-thumbnails] 共 ${slides.length} 页`);

  // 动态导入 ppt2 模块
  const ppt2Path = path.resolve(rootDir, "src/ppt2/pptGenerator.ts");

  // 使用 esbuild 即时编译 TypeScript
  let generateProReportPptx;
  try {
    // 尝试直接导入（如果 vite 环境可用）
    const mod = await import("../src/ppt2/pptGenerator.ts");
    generateProReportPptx = mod.generateProReportPptx;
  } catch {
    // 降级：使用 esbuild 打包后导入
    console.log("[render-thumbnails] 直接导入失败，使用 esbuild 打包...");
    const { build } = await import("esbuild");

    const tmpBundle = path.resolve(rootDir, "scripts/render-thumbnails-bundle.mjs");
    await build({
      entryPoints: [ppt2Path],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: tmpBundle,
      logLevel: "warning",
      external: ["pptxgenjs", "file-saver"],
    });

    const mod = await import(`file://${tmpBundle}`);
    generateProReportPptx = mod.generateProReportPptx;
  }

  // 生成 PPTX（不触发下载，手动写文件）
  const result = await generateProReportPptx(slides, {
    download: false,
    autoCompress: true,
    fileName: "output.pptx",
  });

  // 将 Blob 写入指定路径
  const arrayBuffer = await result.blob.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));

  console.log(`[render-thumbnails] PPTX 已生成: ${outputPath}`);
  console.log(`[render-thumbnails] 文件大小: ${result.blob.size} bytes`);
  console.log(`[render-thumbnails] 幻灯片数量: ${result.slideCount}`);
}

main().catch(err => {
  console.error("[render-thumbnails] 失败:", err);
  process.exit(1);
});
