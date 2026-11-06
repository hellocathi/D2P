import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
import { isNode, LineCounter, parseDocument, visit } from "yaml";
import type { Node } from "unist";
import {
  LIMITS,
  controlledStyleSchema,
  directiveTypes,
  frontmatterSchema,
  isContainerType,
  isPackagePath,
  modulePropsSchemas,
  pageSchema,
  resolveAssetRef,
  type AssetRef,
  type InlineNode,
  type ModuleNode,
  type ModuleType,
  type PageSchema,
  type RichBlock,
  type SourceLocation,
} from "@d2p/contracts";

export interface Diagnostic {
  code:
    "syntax" | "frontmatter" | "unsupported" | "validation" | "asset" | "limit";
  message: string;
  file: string;
  line: number;
  column: number;
  path?: string;
}
export interface ParseOptions {
  /** Canonical path relative to the material package root. */
  file?: string;
  /** If supplied, missing package assets are errors. Never reads the filesystem. */
  availableAssets?: readonly string[];
}
export type ParseResult =
  | { ok: true; page: PageSchema; assets: AssetRef[]; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[] };

// A narrow adapter over mdast, including remark-directive's extension nodes.
interface AstNode extends Node {
  children?: AstNode[];
  value?: string;
  name?: string;
  attributes?: Record<string, string | null>;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  alt?: string | null;
  title?: string | null;
}
class ParseFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkDirective);
const styleKeys = new Set(Object.keys(controlledStyleSchema.shape));
const numericKeys = new Set([
  "width",
  "height",
  "level",
  "number",
  "weight",
  "columns",
  "start",
  "fontWeight",
]);

/** Pure Markdown -> AST -> validated PageSchema. No HTML, eval, IO or DOM. */
export function parseMarkdown(
  markdown: string,
  options: ParseOptions = {},
): ParseResult {
  const file = options.file ?? "article.md";
  const lines = markdown.split(/\r?\n/);
  let nextId = 0;
  const assets = new Map<string, AssetRef>();
  const available = options.availableAssets
    ? new Set(options.availableAssets)
    : undefined;
  const locations = new Map<string, SourceLocation>();
  const fail = (
    code: Diagnostic["code"],
    message: string,
    node?: AstNode,
    path?: string,
  ): never => {
    throw new ParseFailure({
      code,
      message,
      file,
      line: node?.position?.start.line ?? 1,
      column: node?.position?.start.column ?? 1,
      ...(path ? { path } : {}),
    });
  };
  const location = (node: AstNode): SourceLocation => ({
    file,
    line: node.position?.start.line ?? 1,
    column: node.position?.start.column ?? 1,
    endLine: node.position?.end.line ?? 1,
    endColumn: node.position?.end.column ?? 1,
  });
  const asset = (value: unknown, node: AstNode): AssetRef => {
    if (typeof value !== "string")
      return fail("asset", "图片必须提供 src", node, "props.src");
    let ref: AssetRef;
    try {
      ref = resolveAssetRef(value, file);
    } catch (error) {
      return fail(
        "asset",
        error instanceof Error ? error.message : "素材路径无效",
        node,
        "props.src",
      );
    }
    if (ref.kind === "package" && available && !available.has(ref.path))
      fail("asset", `找不到素材：${ref.path}`, node, "props.src");
    assets.set(`${ref.kind}:${ref.path}`, ref);
    if (assets.size > LIMITS.assets)
      fail("limit", `每篇最多引用 ${LIMITS.assets} 份素材`, node);
    return ref;
  };
  const inline = (nodes: AstNode[]): InlineNode[] =>
    nodes.map((node): InlineNode => {
      switch (node.type) {
        case "text":
          return { type: "text", value: node.value ?? "" };
        case "break":
          return { type: "break" };
        case "strong":
        case "emphasis":
          return { type: node.type, children: inline(node.children ?? []) };
        case "link":
          if (node.title)
            fail(
              "unsupported",
              "链接 title 暂不支持，请直接写入链接正文",
              node,
            );
          return {
            type: "link",
            href: node.url ?? "",
            children: inline(node.children ?? []),
          };
        default:
          return fail(
            "unsupported",
            `富文本不支持 ${node.type}，图片请使用独立 Image 模块`,
            node,
          );
      }
    });
  const blocks = (nodes: AstNode[]): RichBlock[] =>
    nodes.map((node): RichBlock => {
      if (node.type === "paragraph")
        return { type: "paragraph", children: inline(node.children ?? []) };
      if (node.type === "list")
        return {
          type: "list",
          ordered: node.ordered ?? false,
          start: node.start ?? 1,
          items: (node.children ?? []).map((item) =>
            blocks(item.children ?? []),
          ),
        };
      return fail("unsupported", `富文本不支持 ${node.type}`, node);
    });
  const plainText = (nodes: AstNode[]): string =>
    nodes
      .map((node) => {
        if (node.type === "text") return node.value ?? "";
        if (node.type === "break") return "\n";
        if (node.type === "paragraph") return plainText(node.children ?? []);
        return fail(
          "unsupported",
          `Text 仅接受纯文本，${node.type} 请改用 RichText`,
          node,
        );
      })
      .join(nodes.some((node) => node.type === "paragraph") ? "\n\n" : "");
  const make = (
    type: ModuleType,
    props: Record<string, unknown>,
    node: AstNode,
    style: Record<string, unknown> = {},
    children?: ModuleNode[],
  ): ModuleNode => {
    const parsedProps = modulePropsSchemas[type].safeParse(props);
    const parsedStyle = controlledStyleSchema.safeParse(style);
    const diagnostics: Diagnostic[] = [];
    for (const [prefix, result] of [
      ["props", parsedProps],
      ["style", parsedStyle],
    ] as const) {
      if (!result.success)
        for (const issue of result.error.issues)
          diagnostics.push({
            code: "validation",
            file,
            line: node.position?.start.line ?? 1,
            column: node.position?.start.column ?? 1,
            path: [prefix, ...issue.path].join("."),
            message: issue.message,
          });
    }
    if (diagnostics.length) throw new ValidationFailure(diagnostics);
    const id = `node-${++nextId}`;
    const source = location(node);
    locations.set(id, source);
    // Both props and style were validated; pageSchema verifies the correlated node union again.
    return {
      id,
      type,
      props: parsedProps.data,
      style: parsedStyle.data,
      source,
      ...(children !== undefined ? { children } : {}),
    } as ModuleNode;
  };

  const directive = (node: AstNode): ModuleNode => {
    const name = node.name ?? "";
    if (!Object.hasOwn(directiveTypes, name))
      return fail("unsupported", `未知模块指令：${name}`, node);
    const type = directiveTypes[name as keyof typeof directiveTypes];
    const props: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    const style: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    // Body-derived fields cannot be supplied through attributes.
    const reserved = new Set([
      "content",
      "text",
      "items",
      "children",
      "id",
      "type",
      "source",
      "style",
    ]);
    for (const [key, raw] of Object.entries(node.attributes ?? {})) {
      if (reserved.has(key))
        fail(
          "validation",
          `属性 ${key} 应由正文生成或不允许配置`,
          node,
          `props.${key}`,
        );
      let value: unknown = raw;
      if (
        numericKeys.has(key) ||
        (key === "fontSize" && /^\d+$/.test(raw ?? ""))
      ) {
        if (!/^\d+$/.test(raw ?? ""))
          fail("validation", `${key} 必须为整数`, node, key);
        value = Number(raw);
      } else if (key === "ordered") {
        if (raw !== "true" && raw !== "false")
          fail("validation", "ordered 必须为 true 或 false", node, key);
        value = raw === "true";
      } else if (key === "src" || key === "backgroundImage")
        value = asset(raw, node);
      (styleKeys.has(key) ? style : props)[key] = value;
    }
    const body = node.children ?? [];
    if (isContainerType(type))
      return make(type, props, node, style, convert(body));
    switch (type) {
      case "Text":
        props.text = plainText(body);
        break;
      case "SectionTitle":
        if (body.length !== 1 || body[0]?.type !== "paragraph")
          fail("syntax", "SectionTitle 需要一个段落", node);
        props.content = inline(body[0]!.children ?? []);
        break;
      case "RichText":
      case "Callout":
      case "Quote":
      case "Disclaimer":
      case "Footer":
        props.content = blocks(body);
        break;
      case "List":
      case "References": {
        const list = body[0];
        if (body.length !== 1 || list?.type !== "list")
          fail("syntax", `${type} 正文必须是一个 Markdown 列表`, node);
        if (type === "References")
          props.items = list!.children?.map((item) => {
            if (
              item.children?.length !== 1 ||
              item.children[0]?.type !== "paragraph"
            )
              fail("syntax", "参考资料每项应为单个段落", item);
            return inline(item.children![0]!.children ?? []);
          });
        else {
          props.items = list!.children?.map((item) =>
            blocks(item.children ?? []),
          );
          const ordered = list!.ordered ?? false;
          if ("ordered" in props && props.ordered !== ordered)
            fail("validation", "ordered 属性与正文列表类型不一致", node);
          if ("start" in props && props.start !== (list!.start ?? 1))
            fail("validation", "start 属性与正文列表起始序号不一致", node);
          props.ordered = ordered;
          props.start = list!.start ?? 1;
        }
        break;
      }
      default:
        if (body.length) fail("syntax", `${type} 不接受正文`, node);
    }
    return make(type, props, node, style);
  };
  const convert = (nodes: AstNode[]): ModuleNode[] =>
    nodes.flatMap((node): ModuleNode[] => {
      switch (node.type) {
        case "containerDirective":
        case "leafDirective":
          return [directive(node)];
        case "paragraph": {
          // Split standalone images and adjacent text in source order without dropping either.
          const output: ModuleNode[] = [];
          let run: AstNode[] = [];
          const flush = () => {
            if (!run.length) return;
            if (
              run.every((child) => child.type === "text") &&
              run
                .map((c) => c.value)
                .join("")
                .trim() === ""
            ) {
              run = [];
              return;
            }
            if (
              run.every(
                (child) => child.type === "text" || child.type === "break",
              )
            ) {
              const value = run
                .map((c) => (c.type === "break" ? "\n" : (c.value ?? "")))
                .join("");
              output.push(make("Text", { text: value }, node));
            } else
              output.push(
                make(
                  "RichText",
                  { content: [{ type: "paragraph", children: inline(run) }] },
                  node,
                ),
              );
            run = [];
          };
          for (const child of node.children ?? []) {
            if (child.type === "image") {
              flush();
              output.push(
                make(
                  "Image",
                  {
                    src: asset(child.url, child),
                    alt: child.alt ?? "",
                    ...(child.title ? { caption: child.title } : {}),
                  },
                  child,
                ),
              );
            } else run.push(child);
          }
          flush();
          return output;
        }
        case "heading":
          if (!node.depth || node.depth < 2 || node.depth > 4)
            fail(
              "unsupported",
              "正文标题支持二至四级，页面主标题请使用 ArticleHeader",
              node,
            );
          return [
            make(
              "SectionTitle",
              { level: node.depth, content: inline(node.children ?? []) },
              node,
            ),
          ];
        case "list":
          return [
            make(
              "List",
              {
                ordered: node.ordered ?? false,
                start: node.start ?? 1,
                items: node.children?.map((item) =>
                  blocks(item.children ?? []),
                ),
              },
              node,
            ),
          ];
        case "blockquote":
          return [
            make("Quote", { content: blocks(node.children ?? []) }, node),
          ];
        case "thematicBreak":
          return [make("Divider", {}, node)];
        default:
          return fail(
            "unsupported",
            `不支持的 Markdown 节点：${node.type}`,
            node,
          );
      }
    });

  try {
    if (!isPackagePath(file))
      fail("asset", "Markdown 文件路径必须为规范化的包内相对路径");
    if (new TextEncoder().encode(markdown).byteLength > LIMITS.sourceBytes)
      fail("limit", "单篇 Markdown 不能超过 1 MiB");
    const ast = processor.parse(markdown) as AstNode;
    // Bound AST size before any recursive conversion, and reject HTML everywhere.
    const stack = [{ node: ast, depth: 0 }];
    const directiveLines = new Set<number>();
    const closingLines = new Set<number>();
    let count = 0;
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      if (++count > LIMITS.nodes || depth > LIMITS.depth)
        fail("limit", "Markdown 超过节点数量或嵌套深度限制", node);
      if (node.type === "html") fail("unsupported", "不允许原始 HTML", node);
      if (node.type === "textDirective")
        fail("unsupported", "模块指令必须独占一行，使用 :: 或 :::", node);
      if (node.type === "containerDirective" || node.type === "leafDirective") {
        directiveLines.add(node.position?.start.line ?? 1);
        // remark normalizes attributes (including duplicate keys and __proto__). Check
        // source attribute names first, so normalization cannot silently hide bad input.
        const header = lines[(node.position?.start.line ?? 1) - 1] ?? "";
        const attributes = header.match(
          /\{((?:[^"'{}]|"[^"]*"|'[^']*')*)\}\s*$/,
        );
        if (header.includes("{") && !attributes)
          fail("syntax", "指令属性必须完整写在同一行", node);
        const names = new Set<string>();
        for (const match of (attributes?.[1] ?? "").matchAll(
          /(?:^|\s)([^\s=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+))?/g,
        )) {
          const name = match[1]!;
          if (["__proto__", "constructor", "prototype"].includes(name))
            fail("validation", `不允许属性 ${name}`, node);
          if (names.has(name)) fail("validation", `重复属性 ${name}`, node);
          names.add(name);
        }
      }
      if (node.type === "containerDirective") {
        const opening = lines[(node.position?.start.line ?? 1) - 1]
          ?.trim()
          .match(/^(:{3,})/);
        const closing = lines[(node.position?.end.line ?? 1) - 1]?.trim();
        if (
          !opening ||
          !closing ||
          !/^:{3,}$/.test(closing) ||
          closing.length < opening[1]!.length ||
          node.position?.start.line === node.position?.end.line
        ) {
          fail("syntax", `模块 ${node.name} 缺少正确的闭合冒号`, node);
        }
        closingLines.add(node.position?.end.line ?? 1);
      }
      for (const child of node.children ?? [])
        stack.push({ node: child, depth: depth + 1 });
    }
    const [frontmatter, ...body] = ast.children ?? [];
    if (frontmatter?.type !== "yaml")
      fail("frontmatter", "文件必须以 YAML Frontmatter 开始");
    // Malformed directives otherwise become innocent text in CommonMark. Do not
    // silently publish configuration typos as article content.
    for (
      let index = frontmatter!.position?.end.line ?? 0;
      index < lines.length;
      index++
    ) {
      const line = lines[index]!;
      if (
        (/^\s{0,3}:{2,}[A-Za-z]/.test(line) &&
          !directiveLines.has(index + 1)) ||
        (/^\s{0,3}:{3,}\s*$/.test(line) && !closingLines.has(index + 1))
      ) {
        throw new ParseFailure({
          code: "syntax",
          message: "模块指令语法错误或闭合冒号没有对应容器",
          file,
          line: index + 1,
          column: 1,
        });
      }
    }
    const lineCounter = new LineCounter();
    const doc = parseDocument(frontmatter!.value ?? "", {
      uniqueKeys: true,
      strict: true,
      lineCounter,
    });
    if (doc.errors.length || doc.warnings.length) {
      const problem = doc.errors[0] ?? doc.warnings[0]!;
      const offset = problem.linePos?.[0];
      throw new ParseFailure({
        code: "frontmatter",
        file,
        line: (offset?.line ?? 1) + 1,
        column: offset?.col ?? 1,
        message: problem.message,
      });
    }
    visit(doc, {
      Alias() {
        fail("frontmatter", "Frontmatter 不允许 YAML 别名", frontmatter);
      },
    });
    const meta = frontmatterSchema.safeParse(doc.toJS({ maxAliasCount: 0 }));
    if (!meta.success)
      return {
        ok: false,
        diagnostics: meta.error.issues.map((issue) => {
          const path = [...issue.path];
          let field = doc.getIn(path, true);
          while (!isNode(field) && path.length) {
            path.pop();
            field = doc.getIn(path, true);
          }
          const pos =
            isNode(field) && field.range
              ? lineCounter.linePos(field.range[0])
              : { line: 1, col: 1 };
          return {
            code: "frontmatter",
            file,
            line: pos.line + 1,
            column: pos.col,
            path: issue.path.join("."),
            message: issue.message,
          };
        }),
      };
    const { page, theme, ...metadata } = meta.data;
    const nodes = convert(body);
    const validated = pageSchema.safeParse({
      schemaVersion: 1,
      metadata,
      page: { ...page, height: "auto" },
      theme,
      nodes,
    });
    if (!validated.success)
      return {
        ok: false,
        diagnostics: validated.error.issues.map((issue) => {
          let current: unknown = { nodes };
          let source: SourceLocation | undefined;
          for (const key of issue.path) {
            if (current && typeof current === "object") {
              current = (current as Record<string | number, unknown>)[key];
              if (current && typeof current === "object" && "id" in current)
                source = locations.get(String(current.id)) ?? source;
            }
          }
          return {
            code: "validation",
            file,
            line: source?.line ?? 1,
            column: source?.column ?? 1,
            path: issue.path.join("."),
            message: issue.message,
          };
        }),
      };
    return {
      ok: true,
      page: validated.data,
      assets: [...assets.values()],
      diagnostics: [],
    };
  } catch (error) {
    if (error instanceof ParseFailure)
      return { ok: false, diagnostics: [error.diagnostic] };
    if (error instanceof ValidationFailure)
      return { ok: false, diagnostics: error.diagnostics };
    return {
      ok: false,
      diagnostics: [
        {
          code: "syntax",
          message: error instanceof Error ? error.message : "解析失败",
          file,
          line: 1,
          column: 1,
        },
      ],
    };
  }
}

class ValidationFailure extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => d.message).join("; "));
  }
}
