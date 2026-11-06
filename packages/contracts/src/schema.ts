import { z } from "zod";
import { assetRefSchema, linkHrefSchema } from "./assets.js";
import { colorSchema, controlledStyleSchema, LIMITS } from "./tokens.js";

const text = z.string().min(1).max(LIMITS.textLength);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "日期无效，应为 YYYY-MM-DD");

export const metadataSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    title: text.max(200),
    author: text.max(100),
    publishDate: dateSchema,
  })
  .strict();

export const frontmatterSchema = metadataSchema
  .extend({
    page: z
      .object({
        width: z.number().int().min(320).max(1200).default(750),
        background: colorSchema.default("#FFFFFF"),
      })
      .strict()
      .default({}),
    theme: z
      .object({
        primary: colorSchema.default("#176B87"),
        text: colorSchema.default("#243447"),
      })
      .strict()
      .default({}),
  })
  .strict();

export const sourceLocationSchema = z
  .object({
    file: z.string().min(1).max(2048),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    endLine: z.number().int().positive(),
    endColumn: z.number().int().positive(),
  })
  .strict();
export type SourceLocation = z.infer<typeof sourceLocationSchema>;

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong" | "emphasis"; children: InlineNode[] }
  | { type: "link"; children: InlineNode[]; href: string }
  | { type: "break" };
export const inlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("text"),
        value: z.string().max(LIMITS.textLength),
      })
      .strict(),
    z
      .object({
        type: z.literal("strong"),
        children: z.array(inlineNodeSchema).max(LIMITS.nodes),
      })
      .strict(),
    z
      .object({
        type: z.literal("emphasis"),
        children: z.array(inlineNodeSchema).max(LIMITS.nodes),
      })
      .strict(),
    z
      .object({
        type: z.literal("link"),
        href: linkHrefSchema,
        children: z.array(inlineNodeSchema).max(LIMITS.nodes),
      })
      .strict(),
    z.object({ type: z.literal("break") }).strict(),
  ]),
);

export type RichBlock =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; start: number; items: RichBlock[][] };
export const richBlockSchema: z.ZodType<RichBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("paragraph"),
        children: z.array(inlineNodeSchema).min(1).max(LIMITS.nodes),
      })
      .strict(),
    z
      .object({
        type: z.literal("list"),
        ordered: z.boolean(),
        start: z.number().int().min(1).max(9999),
        items: z.array(z.array(richBlockSchema).min(1)).min(1).max(500),
      })
      .strict(),
  ]),
);

const variant = <const T extends [string, ...string[]]>(values: T) =>
  z.enum(values).optional();
const inlineContent = z.array(inlineNodeSchema).min(1).max(LIMITS.nodes);
const richContent = z.array(richBlockSchema).min(1).max(LIMITS.nodes);
const imageProps = {
  src: assetRefSchema,
  alt: z.string().min(1).max(500),
  caption: z.string().max(500).optional(),
  width: z.number().int().min(1).max(2400).optional(),
  height: z.number().int().min(1).max(4800).optional(),
  aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9"]).optional(),
  fit: z.enum(["contain", "cover"]).optional(),
};

export const modulePropsSchemas = {
  ArticleHeader: z
    .object({
      variant: variant(["standard", "centered"]),
      title: text.max(200).optional(),
      subtitle: text.max(500).optional(),
    })
    .strict(),
  Hero: z
    .object({ ...imageProps, variant: variant(["plain", "rounded"]) })
    .strict(),
  Section: z
    .object({
      variant: variant(["plain", "tinted"]),
      backgroundImage: assetRefSchema.optional(),
    })
    .strict(),
  SectionTitle: z
    .object({
      content: inlineContent,
      level: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
      variant: variant(["standard", "accent", "numbered"]),
      number: z.number().int().min(1).max(999).optional(),
    })
    .strict(),
  ContentCard: z
    .object({ variant: variant(["plain", "bordered", "elevated"]) })
    .strict(),
  Text: z
    .object({ text, variant: variant(["body", "lead", "caption"]) })
    .strict(),
  RichText: z
    .object({ content: richContent, variant: variant(["standard", "compact"]) })
    .strict(),
  Image: z.object(imageProps).strict(),
  ImageGrid: z
    .object({ columns: z.number().int().min(1).max(4).default(2) })
    .strict(),
  List: z
    .object({
      ordered: z.boolean().default(false),
      start: z.number().int().min(1).max(9999).default(1),
      items: z.array(z.array(richBlockSchema).min(1)).min(1).max(500),
      variant: variant(["standard", "checklist"]),
    })
    .strict(),
  Callout: z
    .object({
      content: richContent,
      title: text.max(200).optional(),
      variant: variant(["info", "success", "warning"]),
    })
    .strict(),
  Quote: z
    .object({
      content: richContent,
      attribution: text.max(200).optional(),
      variant: variant(["standard", "accent"]),
    })
    .strict(),
  Row: z
    .object({
      verticalAlign: z.enum(["start", "center", "end", "stretch"]).optional(),
    })
    .strict(),
  Column: z
    .object({ weight: z.number().int().min(1).max(12).default(1) })
    .strict(),
  Divider: z.object({ variant: variant(["solid", "dashed"]) }).strict(),
  Spacer: z
    .object({ height: z.number().int().min(0).max(400).default(24) })
    .strict(),
  References: z
    .object({
      items: z.array(inlineContent).min(1).max(200),
      title: text.max(200).optional(),
    })
    .strict(),
  Disclaimer: z
    .object({ content: richContent, variant: variant(["standard", "muted"]) })
    .strict(),
  Footer: z
    .object({
      content: richContent,
      variant: variant(["standard", "centered"]),
    })
    .strict(),
} as const;

export type ModuleType = keyof typeof modulePropsSchemas;
export type ModulePropsMap = {
  [K in ModuleType]: z.infer<(typeof modulePropsSchemas)[K]>;
};
export const directiveTypes = {
  "article-header": "ArticleHeader",
  hero: "Hero",
  section: "Section",
  "section-title": "SectionTitle",
  "content-card": "ContentCard",
  text: "Text",
  "rich-text": "RichText",
  image: "Image",
  "image-grid": "ImageGrid",
  list: "List",
  callout: "Callout",
  quote: "Quote",
  row: "Row",
  column: "Column",
  divider: "Divider",
  spacer: "Spacer",
  references: "References",
  disclaimer: "Disclaimer",
  footer: "Footer",
} as const satisfies Record<string, ModuleType>;

export const containerTypes = [
  "Section",
  "ContentCard",
  "ImageGrid",
  "Row",
  "Column",
] as const;
export type ContainerType = (typeof containerTypes)[number];
export function isContainerType(type: ModuleType): type is ContainerType {
  return (containerTypes as readonly ModuleType[]).includes(type);
}

// Interface indirection keeps the recursive mapped union legal and preserves type/props correlation.
interface ModuleChildren {
  children: ModuleNode[];
}
export type ModuleNode = {
  [K in ModuleType]: {
    id: string;
    type: K;
    props: ModulePropsMap[K];
    style?: z.infer<typeof controlledStyleSchema>;
    source?: SourceLocation;
  } & (K extends ContainerType ? ModuleChildren : { children?: never });
}[ModuleType];

const base = {
  id: z.string().min(1).max(200),
  style: controlledStyleSchema.optional(),
  source: sourceLocationSchema.optional(),
};

// Construct each branch from the same props declarations used by the parser.
export const moduleNodeSchema: z.ZodType<ModuleNode> = z.lazy(() => {
  const schemas = (Object.keys(modulePropsSchemas) as ModuleType[]).map(
    (type) =>
      z
        .object({
          ...base,
          type: z.literal(type),
          props: modulePropsSchemas[type],
          ...(isContainerType(type)
            ? { children: z.array(moduleNodeSchema).max(LIMITS.nodes) }
            : {}),
        })
        .strict(),
  );
  // Runtime branches are validated above; the correlated union is exposed by ModuleNode.
  return z.union([
    schemas[0]!,
    schemas[1]!,
    ...schemas.slice(2),
  ]) as z.ZodType<ModuleNode>;
});

export interface PageSchema {
  schemaVersion: 1;
  metadata: z.infer<typeof metadataSchema>;
  page: { width: number; height: "auto"; background: string };
  theme: { primary: string; text: string };
  nodes: ModuleNode[];
}

/** Iterative preflight runs BEFORE recursive Zod parsing, including for imported JSON. */
const boundedInput = z.unknown().superRefine((value, ctx) => {
  const stack = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let count = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++count > LIMITS.nodes * 20 || current.depth > LIMITS.depth * 3) {
      ctx.addIssue({
        code: "custom",
        message: "页面数据超过结构大小或深度限制",
      });
      return;
    }
    if (current.value && typeof current.value === "object") {
      if (seen.has(current.value)) {
        ctx.addIssue({
          code: "custom",
          message: "页面数据不能包含循环或共享对象引用",
        });
        return;
      }
      seen.add(current.value);
      const values = Object.values(current.value);
      if (values.length > LIMITS.nodes) {
        ctx.addIssue({ code: "custom", message: "页面数组或对象超过大小限制" });
        return;
      }
      for (const child of values)
        stack.push({ value: child, depth: current.depth + 1 });
    }
  }
});

const pageStructure: z.ZodType<PageSchema> = z
  .object({
    schemaVersion: z.literal(1),
    metadata: metadataSchema,
    page: z
      .object({
        width: z.number().int().min(320).max(1200),
        height: z.literal("auto"),
        background: colorSchema,
      })
      .strict(),
    theme: z.object({ primary: colorSchema, text: colorSchema }).strict(),
    nodes: z.array(moduleNodeSchema).min(1).max(LIMITS.nodes),
  })
  .strict()
  .superRefine((page, ctx) => {
    const ids = new Set<string>();
    const queue = page.nodes.map((node, index) => ({
      node,
      depth: 1,
      path: ["nodes", index] as (string | number)[],
      parent: "",
    }));
    let count = 0;
    while (queue.length) {
      const { node, depth, path, parent } = queue.pop()!;
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path, message });
      if (++count > LIMITS.nodes) {
        issue("模块数量超过限制");
        return;
      }
      if (depth > LIMITS.depth) {
        issue("模块嵌套超过限制");
        return;
      }
      if (ids.has(node.id)) issue(`模块 ID 重复：${node.id}`);
      ids.add(node.id);
      if (node.type === "Column" && parent !== "Row")
        issue("Column 必须位于 Row 内");
      if (
        node.type === "ImageGrid" &&
        (!node.children.length || node.children.some((c) => c.type !== "Image"))
      )
        issue("ImageGrid 只能包含非空 Image 子模块");
      if (
        node.type === "Row" &&
        (!node.children.length ||
          node.children.length > 4 ||
          node.children.some((c) => c.type !== "Column"))
      )
        issue("Row 必须包含 1–4 个 Column");
      if (node.children)
        node.children.forEach((child, index) =>
          queue.push({
            node: child,
            depth: depth + 1,
            path: [...path, "children", index],
            parent: node.type,
          }),
        );
    }
    // Resolveable theme colors must be concrete; aliases here would form token cycles.
    if (page.theme.primary.startsWith("$") || page.theme.text.startsWith("$")) {
      ctx.addIssue({
        code: "custom",
        path: ["theme"],
        message: "主题颜色必须使用具体十六进制颜色",
      });
    }
  });

export const pageSchema = boundedInput.pipe(pageStructure);
export type Frontmatter = z.infer<typeof frontmatterSchema>;
