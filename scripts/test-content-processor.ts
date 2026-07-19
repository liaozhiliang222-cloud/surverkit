/**
 * 第三阶段内容处理测试脚本
 *
 * 测试内容：
 * 1. 标题压缩算法
 * 2. 长段落转要点
 * 3. 自动拆页逻辑
 * 4. 综合处理流程
 */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  compressTitle,
  paragraphToBullets,
  isLongParagraph,
  splitSlide,
  processAllSlides,
} from "../src/ppt2/contentProcessor";
import { getTemplate } from "../src/ppt2/templateRegistry";
import type { SlidePlan } from "../src/ppt2/schemas/slidePlan";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

async function main() {
  console.log("===== 第三阶段内容处理测试 =====\n");

  // ====== 测试1：标题压缩 ======
  console.log("[1] 标题压缩算法测试");
  const longTitle = "基于对8位消费者的深度访谈分析，我们发现新鲜感是消费者理解新品价值的首要入口，而非功能诉求";
  const titleResult = compressTitle(longTitle, 40, 2);
  console.log(`    原标题: ${longTitle}`);
  console.log(`    压缩后: ${titleResult.compressed}`);
  console.log(`    是否压缩: ${titleResult.wasCompressed}`);
  console.log(`    估计行数: ${titleResult.linesEstimate}`);
  assert(titleResult.wasCompressed, "标题应被压缩");
  assert(titleResult.compressed.length < longTitle.length, "压缩后应更短");
  assert(titleResult.linesEstimate <= 2, "压缩后不应超过2行");
  console.log("");

  // ====== 测试2：长段落转要点 ======
  console.log("[2] 长段落转要点测试");
  const longParagraph = "新鲜感是消费者理解新品价值的首要入口。6/8受访者主动将短保与更新鲜、更安心联系起来。家庭饮用场景尤其明显。功能诉求属于加分项而非首选。新鲜感认知直接影响首次尝试意愿与价格接受度。";
  assert(isLongParagraph(longParagraph), "应识别为长段落");
  const bullets = paragraphToBullets(longParagraph, 5, 80);
  console.log(`    原段落长度: ${longParagraph.length}`);
  console.log(`    转换为 ${bullets.length} 条要点:`);
  bullets.forEach((b, i) => console.log(`      ${i + 1}. ${b}`));
  assert(bullets.length > 1, "应生成多条要点");
  console.log("");

  // ====== 测试3：自动拆页 ======
  console.log("[3] 自动拆页逻辑测试");

  // 构造超量内容的 KEY_FINDING 页
  const overfullSlide: SlidePlan = {
    slideId: "test_split_01",
    slideType: "KEY_FINDING",
    templateId: "KF_01",
    chapterId: "ch01",
    chapterLabel: "TEST",
    title: "测试拆页的洞察标题",
    subtitle: "",
    coreMessage: "核心信息",
    content: {
      items: [
        "要点1：这是第一条很长的要点内容用于测试拆页功能",
        "要点2：这是第二条很长的要点内容用于测试拆页功能",
        "要点3：这是第三条很长的要点内容用于测试拆页功能",
        "要点4：这是第四条很长的要点内容用于测试拆页功能",
        "要点5：这是第五条很长的要点内容用于测试拆页功能",
        "要点6：这是第六条很长的要点内容用于测试拆页功能",
        "要点7：这是第七条很长的要点内容用于测试拆页功能",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "这是引用原话",
      quoteSpeaker: "受访者",
      quoteSource: "seg_001",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "",
  };

  const template = getTemplate("KF_01");
  assert(template !== undefined, "KF_01 模板应存在");

  const splitResult = splitSlide(overfullSlide, template!);
  console.log(`    原 items 数量: ${overfullSlide.content.items?.length}`);
  console.log(`    拆页后页数: ${splitResult.slides.length}`);
  console.log(`    是否拆页: ${splitResult.split}`);
  console.log(`    原因: ${splitResult.reason}`);
  if (splitResult.slides.length > 1) {
    console.log(`    第1页 items: ${splitResult.slides[0].content.items?.length}`);
    console.log(`    第2页 items: ${splitResult.slides[1].content.items?.length}`);
  }
  assert(splitResult.split, "应触发拆页");
  assert(splitResult.slides.length === 2, "应拆为2页");
  console.log("");

  // ====== 测试4：综合处理流程 ======
  console.log("[4] 综合处理流程测试");

  const testSlides: SlidePlan[] = [
    overfullSlide,
    {
      ...overfullSlide,
      slideId: "test_02",
      title: "正常标题",
      content: {
        ...overfullSlide.content,
        items: ["要点1", "要点2"],
      },
    },
  ];

  const processResult = processAllSlides(testSlides);
  console.log(`    输入页数: ${testSlides.length}`);
  console.log(`    输出页数: ${processResult.slides.length}`);
  console.log(`    是否处理: ${processResult.processed}`);
  console.log(`    处理报告:`);
  processResult.report.forEach(r => {
    console.log(`      ${r.slideId}: ${r.actions.length} 个动作, 拆页=${r.split}`);
    r.actions.forEach(a => console.log(`        - ${a}`));
  });
  assert(processResult.slides.length >= testSlides.length, "输出页数应>=输入页数");
  console.log("");

  // ====== 测试5：生成含拆页的 PPT ======
  console.log("[5] 生成含拆页的测试 PPT");
  const { generateProReportPptx } = await import("../src/ppt2/pptGenerator");

  const fullTestSlides: SlidePlan[] = [
    {
      slideId: "s1",
      slideType: "COVER",
      templateId: "COVER_01",
      chapterId: "",
      chapterLabel: "",
      title: "内容处理测试报告",
      subtitle: "验证第三阶段拆页与压缩功能",
      coreMessage: "测试用例",
      content: {
        items: ["测试日期：2026-07-19", "测试内容：标题压缩、段落转要点、自动拆页"],
        leftColumn: [], rightColumn: [],
        quote: "", quoteSpeaker: "", quoteSource: "",
        metric: "", metricLabel: "",
        visualItems: [], recommendations: [],
      },
      findingIds: [], evidenceSegmentIds: [],
      visualType: "none", speakerNotes: "",
    },
    overfullSlide,  // 超量页，应自动拆为2页
    {
      slideId: "s3",
      slideType: "RECOMMENDATIONS",
      templateId: "REC_01",
      chapterId: "ch02",
      chapterLabel: "RECOMMENDATIONS",
      title: "七大行动建议（测试拆页）",
      subtitle: "",
      coreMessage: "",
      content: {
        items: [],
        leftColumn: [], rightColumn: [],
        quote: "", quoteSpeaker: "", quoteSource: "",
        metric: "", metricLabel: "",
        visualItems: [],
        recommendations: [
          { title: "建议1", description: "描述1", priority: "high" },
          { title: "建议2", description: "描述2", priority: "high" },
          { title: "建议3", description: "描述3", priority: "medium" },
          { title: "建议4", description: "描述4", priority: "medium" },
          { title: "建议5", description: "描述5", priority: "low" },
          { title: "建议6", description: "描述6", priority: "low" },
          { title: "建议7", description: "描述7", priority: "low" },
        ],
      },
      findingIds: [], evidenceSegmentIds: [],
      visualType: "none", speakerNotes: "",
    },
  ];

  const result = await generateProReportPptx(fullTestSlides, {
    download: false,
    autoCompress: true,
    fileName: "ppt2-拆页测试.pptx",
  });

  console.log(`    输入页数: ${fullTestSlides.length}`);
  console.log(`    输出页数: ${result.slideCount}`);
  console.log(`    文件大小: ${(result.blob.size / 1024).toFixed(1)} KB`);

  const outputDir = "d:\\定性调研工具箱";
  const outputPath = path.join(outputDir, "ppt2-拆页测试.pptx");
  if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });
  const arrayBuffer = await result.blob.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  console.log(`    已保存: ${outputPath}`);

  assert(result.slideCount > fullTestSlides.length, "应因拆页而增加页数");
  console.log("");

  console.log("===== 所有测试通过 =====");
}

main().catch(err => {
  console.error("测试失败:", err);
  process.exit(1);
});
