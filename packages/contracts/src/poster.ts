import { z } from "zod";
import { assetRefSchema } from "./assets.js";
import type { PageSchema, ModuleNode } from "./schema.js";
const label = z.string().max(160);
const body = z.string().max(6000);
export const posterSchema = z
  .object({
    title: label,
    subtitle: z.string().max(300),
    eyebrow: label,
    intro: body,
    heroImage: assetRefSchema.optional(),
    backgroundImage: assetRefSchema.optional(),
    logoImage: assetRefSchema.optional(),
    cards: z
      .array(
        z
          .object({
            title: label,
            body,
            image: assetRefSchema.optional(),
            imageOnly: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    statTitle: label,
    statValue: label,
    statBody: body,
    tipsTitle: label,
    tips: z.array(z.string().max(500)).max(8),
    references: body,
    footer: label,
  })
  .strict();
export type PosterData = z.infer<typeof posterSchema>;
export function defaultPoster(page: PageSchema): PosterData {
  const images: Extract<ModuleNode, { type: "Hero" | "Image" }>[] = [];
  const walk = (nodes: ModuleNode[]) =>
    nodes.forEach((n) => {
      if (n.type === "Hero" || n.type === "Image") images.push(n);
      if (n.children) walk(n.children);
    });
  walk(page.nodes);
  return {
    title: page.metadata.title,
    subtitle: "把健康知识，变成看得懂的日常行动",
    eyebrow: "HEALTHCARE / 健康专题",
    intro:
      "在这里填写专题导语。人物插画、产品图或主题照片可以单独上传，模板会负责背景、内容框和整体排版。",
    ...(images[0] ? { heroImage: images[0].props.src } : {}),
    cards: [
      {
        title: "认识健康指标",
        body: "填写这一部分的正文，或上传图片。白色内容框、圆角和装饰由模板统一提供。",
        imageOnly: false,
      },
      {
        title: "关注身心状态",
        body: "在这里填写第二个内容区的标题与说明。文案变长时，内容框会自动撑高。",
        imageOnly: false,
      },
      {
        title: "做好日常预防",
        body: "可以上传图标，搭配文字说明；也可以直接上传整张图文素材填充这个白色坑位。",
        imageOnly: false,
      },
      {
        title: "养成健康习惯",
        body: "每一个坑位都有独立内容。编辑时不用调整背景、边框或相邻模块的位置。",
        imageOnly: false,
      },
    ],
    statTitle: "重点信息",
    statValue: "每日关注",
    statBody: "请填写经过核实的结论或数据说明。",
    tipsTitle: "健康小贴士",
    tips: [
      "保持均衡饮食",
      "规律作息，关注身心状态",
      "如有健康问题，请咨询专业人员",
    ],
    references: "参考资料：请填写正式发布内容所依据的资料来源。",
    footer: page.metadata.author,
  };
}
export const posterProjectSchema = z
  .object({
    version: z.literal(1),
    documents: z
      .array(
        z
          .object({
            name: z.string().min(1),
            templateId: z
              .enum([
                "classic",
                "journal",
                "campaign",
                "poster-blue",
                "poster-pink",
              ])
              .optional(),
            poster: posterSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
