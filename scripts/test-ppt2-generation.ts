/**
 * ppt2 系统集成测试脚本
 *
 * 目标：验证新的模板化 PPT 生成系统可以正确生成包含 8 种页面类型的 PPTX 文件。
 *
 * 运行方式：
 *   npx esbuild scripts/test-ppt2-generation.ts --bundle --platform=node --format=esm --outfile=scripts/test-ppt2.mjs --log-level=warning
 *   node scripts/test-ppt2.mjs
 *
 * 输出：
 *   - d:\定性调研工具箱\ppt2-集成测试.pptx
 *   - 控制台打印每页容量检查结果和文件大小
 */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateProReportPptx } from "../src/ppt2/pptGenerator";
import type { SlidePlan } from "../src/ppt2/schemas/slidePlan";
import { validateAndCompress } from "../src/ppt2/capacityValidator";
import { listAllTemplates } from "../src/ppt2/templateRegistry";
import { ensureLayoutDiversity } from "../src/ppt2/layoutDiversity";

// ====== 构造 8 种页面类型的测试数据 ======
// 场景：新品概念消费者访谈，研究新品上市的机会与阻碍

const slides: SlidePlan[] = [
  // 1. 封面
  {
    slideId: "slide_01",
    slideType: "COVER",
    templateId: "COVER_01",
    chapterId: "",
    chapterLabel: "",
    title: "新品概念消费者深访洞察报告",
    subtitle: "聚焦购买驱动、价值感知与上市机会识别",
    coreMessage: "8 位目标消费者深访 · 覆盖一线城市 25-40 岁家庭饮品决策者",
    content: {
      items: ["项目代号：NC-2026-Q3", "研究周期：2026.06-2026.07", "受访者：8 位深访", "方法：一对一线上深访"],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "",
  },

  // 2. 核心结论总览（执行摘要）
  {
    slideId: "slide_02",
    slideType: "EXECUTIVE_SUMMARY",
    templateId: "ES_01",
    chapterId: "chapter_01",
    chapterLabel: "EXECUTIVE SUMMARY",
    title: "四大核心结论",
    subtitle: "新鲜感是首要入口，价格与便利性决定持续复购",
    coreMessage: "",
    content: {
      items: [
        "新鲜感是消费者理解新品价值的首要入口，6/8 受访者主动将短保与更新鲜、更安心联系起来，家庭饮用场景尤其明显。",
        "价格溢价被普遍接受的前提是品质差异能够被直接感知，否则会退化为偶尔尝鲜而非日常购买。",
        "购买便利性影响首次尝试后的持续复购，社区便利店和常用电商渠道覆盖是降低尝试成本的关键。",
        "包装规格与家庭人口结构匹配度直接影响单次购买决策，大包装更适合家庭场景但存在新鲜度顾虑。",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_01", "finding_02", "finding_03", "finding_04"],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "本页为整份报告的核心结论，每个结论均有 3 条以上原话证据支撑。",
  },

  // 3. 单项核心洞察
  {
    slideId: "slide_03",
    slideType: "KEY_FINDING",
    templateId: "KF_01",
    chapterId: "chapter_02",
    chapterLabel: "KEY FINDING 01",
    title: "新鲜感是消费者理解新品价值的首要入口，而非功能诉求",
    subtitle: "",
    coreMessage: "6/8 位受访者主动将短保与更新鲜、更安心联系起来，家庭饮用场景尤其明显",
    content: {
      items: [
        "短保概念被自发解读为更少添加剂、更接近现做口感",
        "家庭饮用场景下，新鲜度是决策权重最高的属性",
        "功能诉求（如添加益生菌、高蛋白）属于加分项而非首选",
        "新鲜感认知直接影响首次尝试意愿与价格接受度",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "如果给孩子喝，我会更看重新鲜和安心，至于那些功能添加反而没那么重要。",
      quoteSpeaker: "R03 受访者",
      quoteSource: "seg_014",
      metric: "6/8",
      metricLabel: "主动提及新鲜感",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_01"],
    evidenceSegmentIds: ["seg_014", "seg_022", "seg_031"],
    visualType: "metric",
    speakerNotes: "此发现来自 6/8 受访者的自发表达，置信度高。",
  },

  // 4. 洞察 + 证据
  {
    slideId: "slide_04",
    slideType: "INSIGHT_EVIDENCE",
    templateId: "IE_01",
    chapterId: "chapter_02",
    chapterLabel: "INSIGHT & EVIDENCE",
    title: "价格溢价被接受的前提是品质差异可感知",
    subtitle: "",
    coreMessage: "消费者愿意为可感知的品质提升支付溢价，但拒绝为模糊概念买单",
    content: {
      items: [
        "价格敏感度随品质差异感知强度反向变化",
        "试饮/小规格试用是建立品质感知的有效路径",
        "成分透明度直接影响溢价合理性判断",
        "对比基准通常是消费者熟悉的现有品类，而非抽象标准",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "价格高一点可以，但要让我明显感受到品质差别，不然我为什么不买原来那种。",
      quoteSpeaker: "R05 受访者",
      quoteSource: "seg_047",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_02"],
    evidenceSegmentIds: ["seg_047", "seg_052"],
    visualType: "none",
    speakerNotes: "",
  },

  // 5. 双栏对比
  {
    slideId: "slide_05",
    slideType: "TWO_COLUMN_COMPARE",
    templateId: "TCC_01",
    chapterId: "chapter_03",
    chapterLabel: "COMPARISON",
    title: "尝鲜购买 vs 持续复购的决策驱动差异",
    subtitle: "",
    coreMessage: "首次购买由新鲜感驱动，复购由便利性与性价比共同决定",
    content: {
      items: [],
      leftColumn: [
        "新鲜感与好奇心是首要驱动",
        "包装视觉与概念故事影响首购",
        "促销试用降低尝试门槛",
        "社交推荐加速首次决策",
      ],
      rightColumn: [
        "购买便利性决定是否持续",
        "性价比感知影响复购频率",
        "家庭成员接受度是关键门槛",
        "规格与储存方式影响复购稳定性",
      ],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "尝鲜驱动",
      metricLabel: "复购驱动",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_03"],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "",
  },

  // 6. 专家原话
  {
    slideId: "slide_06",
    slideType: "QUOTE",
    templateId: "QT_01",
    chapterId: "chapter_03",
    chapterLabel: "VOICE OF CONSUMER",
    title: "购买便利性影响首次尝试后的持续复购",
    subtitle: "",
    coreMessage: "",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "楼下便利店可以买到，我才会愿意经常回购，如果每次都要专门跑超市或者等快递，那就算了，再好喝也坚持不下来。",
      quoteSpeaker: "R07 受访者 · 32 岁 · 家庭主妇",
      quoteSource: "seg_068 · 第二轮深访",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_03"],
    evidenceSegmentIds: ["seg_068"],
    visualType: "none",
    speakerNotes: "该原话精准概括了购买便利性对复购的决定性影响，可作为报告金句。",
  },

  // 7. 原因分析（复用 KEY_FINDING 模板展示根因）
  {
    slideId: "slide_07",
    slideType: "CAUSE_ANALYSIS",
    templateId: "KF_01",
    chapterId: "chapter_04",
    chapterLabel: "ROOT CAUSE",
    title: "复购流失的根本原因是便利性缺口，而非产品本身",
    subtitle: "",
    coreMessage: "5/8 受访者表示产品体验良好但渠道覆盖不足导致放弃复购",
    content: {
      items: [
        "社区便利店覆盖率不足，紧急补货场景缺失",
        "电商冷链配送时效与家庭饮用节奏不匹配",
        "大规格包装的储存与新鲜度顾虑抑制单次购买量",
        "缺少订阅或定期配送服务，复购决策成本持续存在",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "产品我是真喜欢，但就是买不到，慢慢地也就算了。",
      quoteSpeaker: "R02 受访者",
      quoteSource: "seg_041",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: ["finding_04"],
    evidenceSegmentIds: ["seg_041", "seg_055"],
    visualType: "none",
    speakerNotes: "本页为推断性结论，标注 isInference=true，但由多位受访者原话共同支撑。",
  },

  // 8. 建议总结
  {
    slideId: "slide_08",
    slideType: "RECOMMENDATIONS",
    templateId: "REC_01",
    chapterId: "chapter_05",
    chapterLabel: "RECOMMENDATIONS",
    title: "新品上市五大行动建议",
    subtitle: "围绕新鲜感、可感知品质、便利性三大杠杆展开",
    coreMessage: "",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [
        {
          title: "上市沟通以新鲜感为核心主张",
          description: "在包装、广告、终端物料上统一放大短保带来的新鲜与安心感知，避免功能诉求喧宾夺主。",
          priority: "high",
        },
        {
          title: "建立可感知的品质差异证据链",
          description: "通过试饮、对比盲测、成分透明化等手段让消费者直接感知品质提升，为溢价提供合理性。",
          priority: "high",
        },
        {
          title: "优先布局社区便利店与即时零售渠道",
          description: "将渠道覆盖作为复购转化的前置条件，首批聚焦高家庭密度社区，降低补货门槛。",
          priority: "high",
        },
        {
          title: "推出家庭场景适配的多规格组合",
          description: "针对 3-4 口家庭推出适中规格，配套小包装尝鲜装，缓解新鲜度顾虑与储存压力。",
          priority: "medium",
        },
        {
          title: "试点订阅制与定期配送服务",
          description: "针对高潜家庭用户试点订阅模式，锁定复购节奏，降低决策成本，培育长期饮用习惯。",
          priority: "medium",
        },
      ],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "所有建议均由前文发现推导而来，每条建议对应至少一个核心结论。",
  },

  // 9. 目录页（第二阶段新增）
  {
    slideId: "slide_09",
    slideType: "AGENDA",
    templateId: "AG_01",
    chapterId: "",
    chapterLabel: "AGENDA",
    title: "报告目录",
    subtitle: "五大章节，从洞察到行动",
    coreMessage: "",
    content: {
      items: [
        "执行摘要：四大核心结论一览",
        "核心洞察：新鲜感、价格感知与便利性",
        "痛点诊断：复购流失的三大根因",
        "机会识别：上市破局的四个杠杆",
        "行动建议：从沟通到渠道的五步走",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "",
  },

  // 10. 痛点矩阵（第二阶段新增）
  {
    slideId: "slide_10",
    slideType: "PAIN_POINT_MATRIX",
    templateId: "PPM_01",
    chapterId: "chapter_04",
    chapterLabel: "PAIN POINTS",
    title: "消费者体验中的四大痛点",
    subtitle: "覆盖购买、使用、储存、复购全链路",
    coreMessage: "",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [
        "购买不便：社区便利店覆盖率不足，紧急补货场景缺失，5/8 受访者反映买不到",
        "储存压力：大规格包装开启后新鲜度下降快，家庭小人口难以在保质期内喝完",
        "价格门槛：单瓶价格高于现有品类 30% 以上时，尝鲜意愿显著降低",
        "信息缺失：成分表与生产日期标注不清晰，影响品质感知与信任建立",
      ],
      recommendations: [],
    },
    findingIds: ["finding_04"],
    evidenceSegmentIds: [],
    visualType: "matrix",
    speakerNotes: "",
  },

  // 11. 机会矩阵（第二阶段新增）
  {
    slideId: "slide_11",
    slideType: "OPPORTUNITY_MATRIX",
    templateId: "OM_01",
    chapterId: "chapter_05",
    chapterLabel: "OPPORTUNITIES",
    title: "新品上市的四大机会点",
    subtitle: "基于消费者需求与市场缺口识别",
    coreMessage: "",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [
        "新鲜感沟通：短保概念可成为差异化核心，6/8 受访者主动关联新鲜与安心",
        "家庭场景：3-4 口家庭对适中规格需求明确，存在专用产品空白",
        "即时零售：社区便利店与 O2O 渠道可大幅降低补货门槛，提升复购率",
        "订阅模式：高潜家庭用户对定期配送接受度高，可锁定长期饮用习惯",
      ],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "matrix",
    speakerNotes: "",
  },

  // 12. 流程图（第二阶段新增）
  {
    slideId: "slide_12",
    slideType: "PROCESS",
    templateId: "PROC_01",
    chapterId: "chapter_05",
    chapterLabel: "PROCESS",
    title: "新品上市五步走行动路径",
    subtitle: "",
    coreMessage: "从沟通到渠道到订阅，分阶段推进",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [
        "新鲜感沟通：统一放大短保带来的新鲜与安心感知",
        "品质证据链：通过试饮、对比盲测建立可感知差异",
        "渠道布局：首批聚焦高家庭密度社区便利店",
        "规格组合：推出家庭装+尝鲜装多规格矩阵",
        "订阅试点：针对高潜用户试点定期配送服务",
      ],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "flowchart",
    speakerNotes: "",
  },

  // 13. 旅程图（第二阶段新增）
  {
    slideId: "slide_13",
    slideType: "JOURNEY",
    templateId: "JRN_01",
    chapterId: "chapter_03",
    chapterLabel: "JOURNEY",
    title: "消费者从认知到复购的完整旅程",
    subtitle: "",
    coreMessage: "五个阶段，每阶段有不同的决策驱动与痛点",
    content: {
      items: [],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [
        "认知阶段：通过广告、社交推荐首次接触短保概念，新鲜感是主要吸引力",
        "尝试阶段：促销试用或小规格购买降低尝试门槛，包装视觉影响首购决策",
        "体验阶段：饮用后形成品质感知，口感与新鲜度决定是否愿意复购",
        "复购阶段：购买便利性成为关键，渠道覆盖不足直接导致复购流失",
        "忠诚阶段：形成家庭饮用习惯，订阅模式可锁定长期复购",
      ],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "experience-map",
    speakerNotes: "",
  },

  // 14. 结论页（第二阶段新增）
  {
    slideId: "slide_14",
    slideType: "CONCLUSION",
    templateId: "CON_01",
    chapterId: "chapter_05",
    chapterLabel: "CONCLUSION",
    title: "新鲜感、品质感知、便利性三箭齐发",
    subtitle: "",
    coreMessage: "新品上市的成功取决于能否在三大杠杆上同时发力",
    content: {
      items: [
        "新鲜感是首要入口，需在沟通中统一放大短保带来的新鲜与安心感知",
        "品质差异必须可感知，通过试饮、对比盲测为溢价提供合理性",
        "便利性决定复购转化，社区便利店与即时零售是渠道布局重点",
        "订阅模式可锁定高潜家庭用户，培育长期饮用习惯",
      ],
      leftColumn: [],
      rightColumn: [],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "报告总结，强调三大杠杆的协同效应。",
  },

  // 15. 附录页（第二阶段新增）
  {
    slideId: "slide_15",
    slideType: "APPENDIX",
    templateId: "APX_01",
    chapterId: "",
    chapterLabel: "APPENDIX",
    title: "研究方法与限制说明",
    subtitle: "",
    coreMessage: "",
    content: {
      items: [],
      leftColumn: [
        "一对一线上深访，单次 45-60 分钟",
        "受访者配额：25-40 岁家庭饮品决策者",
        "样本量：8 位，覆盖一线城市",
        "访谈周期：2026.06-2026.07",
        "分析方法：主题分析法 + JTBD 框架",
      ],
      rightColumn: [
        "样本量有限，结论的统计代表性不足",
        "仅覆盖一线城市，下沉市场表现待验证",
        "依赖受访者主观表达，存在回忆偏差",
        "未包含价格敏感度定量测试",
      ],
      quote: "",
      quoteSpeaker: "",
      quoteSource: "数据来源：ResearchBox 定性研究平台 · 2026.07",
      metric: "",
      metricLabel: "",
      visualItems: [],
      recommendations: [],
    },
    findingIds: [],
    evidenceSegmentIds: [],
    visualType: "none",
    speakerNotes: "",
  },
];

// ====== 主测试流程 ======
async function main() {
  console.log("===== ppt2 集成测试开始 =====\n");

  // 1. 打印已注册模板
  const templates = listAllTemplates();
  console.log(`[1] 已注册模板数量：${templates.length}`);
  templates.forEach(t => console.log(`    - ${t.templateId} (${t.slideType}): ${t.name}`));
  console.log("");

  // 2. 先做容量检查（不压缩，仅诊断）
  console.log("[2] 容量检查（诊断模式，不压缩）：");
  const diagnosis = validateAndCompress(slides);
  diagnosis.results.forEach(r => {
    const status = r.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`    ${status}  ${r.slideId}  建议: ${r.recommendation}`);
    r.issues.forEach(i => {
      console.log(`           - [${i.severity}] ${i.field}: ${i.description}`);
    });
  });
  console.log(`    压缩标记: ${diagnosis.compressed ? "是（有页面触发压缩）" : "否"}\n`);

  // 2.5 版式多样性检查
  console.log("[2.5] 版式多样性检查：");
  const diversityResult = ensureLayoutDiversity(slides);
  if (diversityResult.issues.length === 0) {
    console.log("    ✓ 无连续 3 页相同版式");
  } else {
    diversityResult.issues.forEach(issue => {
      const status = issue.fixed ? "✓ 已修复" : "⚠ 未修复";
      console.log(`    ${status}  第${issue.slideIndex + 1}页 ${issue.slideId}: ${issue.reason}`);
    });
  }
  console.log(`    修复页数: ${diversityResult.fixedCount}\n`);

  // 3. 生成 PPTX（关闭自动下载，手动写文件）
  console.log("[3] 调用 generateProReportPptx 生成 PPTX...");
  const result = await generateProReportPptx(slides, {
    download: false,
    autoCompress: true,
    fileName: "ppt2-完整集成测试.pptx",
  });

  console.log(`    幻灯片数量: ${result.slideCount}`);
  console.log(`    是否触发压缩: ${result.compressed}`);
  console.log(`    Blob 大小: ${result.blob.size} bytes (${(result.blob.size / 1024).toFixed(1)} KB)`);

  // 4. 将 Blob 写入磁盘
  const outputDir = "d:\\定性调研工具箱";
  const outputPath = path.join(outputDir, "ppt2-完整集成测试.pptx");
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  const arrayBuffer = await result.blob.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  console.log(`\n[4] PPTX 已保存到: ${outputPath}`);

  // 5. 简单文件校验
  const stats = await import("node:fs/promises").then(m => m.stat(outputPath));
  console.log(`    文件大小: ${stats.size} bytes`);
  if (stats.size < 10000) {
    console.error("    ✗ 警告：文件过小，可能生成异常");
    process.exit(1);
  }
  console.log("    ✓ 文件大小正常");

  console.log("\n===== 测试完成 =====");
  console.log(`\n请用 PowerPoint 或 WPS 打开验证：${outputPath}`);
  console.log("验证要点：");
  console.log("  1. 8 种页面类型均正确渲染");
  console.log("  2. 所有文字可编辑（非图片）");
  console.log("  3. 标题、正文、颜色、字号风格统一");
  console.log("  4. 引用块、编号徽章、装饰线等元素正确显示");
}

main().catch(err => {
  console.error("测试失败：", err);
  process.exit(1);
});
