/**
 * 模板定义 Schema
 * 对应模块：Template Registry
 * 每个模板的容量限制和布局配置
 */
import { z } from "zod";
import type { SlideType } from "./slidePlan";

export const TemplateLayoutFieldSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const TemplateCapacitySchema = z.object({
  titleMaxChars: z.number().int().min(10).default(40),
  subtitleMaxChars: z.number().int().min(0).default(60),
  bodyMaxChars: z.number().int().min(50).default(300),
  maxItems: z.number().int().min(1).default(5),
  itemMaxChars: z.number().int().min(10).default(80),
  quoteMaxChars: z.number().int().min(20).default(120),
  minFontSize: z.number().int().min(8).default(14),
  maxVisuals: z.number().int().min(0).default(1),
  maxImages: z.number().int().min(0).default(0),
});

export const TemplateDefinitionSchema = z.object({
  templateId: z.string(),
  slideType: z.string() as z.ZodType<SlideType>,
  name: z.string(),
  description: z.string().default(""),
  version: z.string().default("1.0.0"),
  capacity: TemplateCapacitySchema,
  layout: z.record(z.string(), TemplateLayoutFieldSchema).default({}),
  renderer: z.string(),
});

export type TemplateLayoutField = z.infer<typeof TemplateLayoutFieldSchema>;
export type TemplateCapacity = z.infer<typeof TemplateCapacitySchema>;
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
