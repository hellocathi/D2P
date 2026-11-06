import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { pageSchema, type ModuleNode } from "@d2p/contracts";
import { parseMarkdown } from "../src/index.js";

const head =
  '---\nid: test\ntitle: 健康知识\nauthor: 编辑部\npublishDate: "2026-11-05"\n---\n\n';
const parse = (body: string) =>
  parseMarkdown(head + body, { file: "article.md" });
const success = (body: string) => {
  const result = parse(body);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
};
const failure = (body: string) => {
  const result = parse(body);
  if (result.ok) throw new Error("Expected parsing to fail");
  return result.diagnostics;
};
const types = (nodes: ModuleNode[]): string[] =>
  nodes.flatMap((node) => [node.type, ...types(node.children ?? [])]);

describe("Markdown DSL", () => {
  it("converts normal Markdown without constructing HTML", () => {
    const result = success(
      "## 标题\n\n正文\n\n含有 **重点** 和 [来源](https://example.com) 的内容\n\n- 第一项\n- 第二项\n\n> 引用\n\n---",
    );
    expect(result.page.nodes.map((node) => node.type)).toEqual([
      "SectionTitle",
      "Text",
      "RichText",
      "List",
      "Quote",
      "Divider",
    ]);
    expect(pageSchema.safeParse(result.page).success).toBe(true);
    const rich = result.page.nodes[2];
    if (rich?.type !== "RichText") throw new Error("Missing RichText");
    expect(JSON.stringify(rich.props.content)).toContain("strong");
    expect(JSON.stringify(rich.props.content)).toContain("https://example.com");
  });
  it("preserves nested containers, styles and deterministic IDs", () => {
    const body =
      ':::::section{padding="lg" gap="md"}\n::::content-card{variant="elevated"}\n:::text{fontSize="24" fontWeight="700" color="$primary"}\n卡片正文\n:::\n::::\n:::::';
    const first = success(body).page;
    expect(first).toEqual(success(body).page);
    expect(types(first.nodes)).toEqual(["Section", "ContentCard", "Text"]);
    const section = first.nodes[0];
    expect(section?.style?.padding).toBe("lg");
    if (section?.type !== "Section") throw new Error("Missing Section");
    const text = section.children[0]?.children?.[0];
    expect(text?.style).toMatchObject({
      fontSize: 24,
      fontWeight: 700,
      color: "$primary",
    });
  });
  it("splits images and text in source order and checks available assets", () => {
    const result = parseMarkdown(
      head + '前文 ![示意图](../assets/a.png "图注") 后文',
      {
        file: "articles/a.md",
        availableAssets: ["assets/a.png"],
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.nodes.map((node) => node.type)).toEqual([
      "Text",
      "Image",
      "Text",
    ]);
    expect(result.assets).toEqual([{ kind: "package", path: "assets/a.png" }]);
    const missing = parseMarkdown(head + "![图](./missing.png)", {
      availableAssets: [],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe("asset");
  });
  it("supports structured nested lists and references", () => {
    const page = success(
      ":::rich-text\n- 一\n  - 子项\n- 二\n:::\n\n:::references\n1. [资料](https://example.com)\n:::",
    ).page;
    expect(types(page.nodes)).toEqual(["RichText", "References"]);
    expect(JSON.stringify(page.nodes)).toContain("子项");
  });
  it("keeps plain text with paragraphs and line breaks", () => {
    const node = success(":::text\n第一段\n\n第二段\n:::").page.nodes[0];
    if (node?.type !== "Text") throw new Error("Missing Text");
    expect(node.props.text).toBe("第一段\n\n第二段");
  });
  it("reports source position and field paths", () => {
    const diagnostic = failure('::spacer{height="900"}')[0]!;
    expect(diagnostic).toMatchObject({
      file: "article.md",
      line: 8,
      column: 1,
      path: "props.height",
      code: "validation",
    });
    const result = parseMarkdown(
      head.replace("2026-11-05", "2026-02-30") + "正文",
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics[0]).toMatchObject({
        line: 5,
        path: "publishDate",
      });
  });
  it.each([
    "<script>alert(1)</script>",
    "正文 <img src=x onerror=alert(1)>",
    "[危险](javascript:alert%281%29)",
    ":::unknown\n正文\n:::",
    '::text[正文]{onclick="bad"}',
    ":::text\n**不可丢弃的格式**\n:::",
    ":::rich-text\n![不支持](./a.png)\n:::",
    '::image{src="../escape.png" alt="图"}',
    '::image{src="./a.png"}',
    ':::section{padding="999px"}\n正文\n:::',
    ':::section{style="position:fixed"}\n正文\n:::',
    ':::section{variant="unknown"}\n正文\n:::',
    ":::row\n正文\n:::",
    ":::column\n正文\n:::",
    ":::image-grid\n正文\n:::",
    ":::section\n正文",
    ":text[正文]",
    "```js\nalert(1)\n```",
    "# 不支持主标题",
    ':::list{ordered="true"}\n- 无序\n:::',
    '::spacer{height="NaN"}',
    '::text[text]{content="override"}',
    '::spacer{__proto__="evil"}',
    '::spacer{constructor="evil"}',
    '::spacer{height="10" height="20"}',
    '::spacer{height="10}',
    ":::section{padding=",
    ":::",
  ])("rejects unsupported or invalid input: %s", (body) => {
    expect(failure(body).length).toBeGreaterThan(0);
  });
  it.each([
    "正文",
    head.replace("id: test", "id: test\nid: duplicate") + "正文",
    head.replace("title: 健康知识", "title: !evil 健康知识") + "正文",
    head
      .replace("title: 健康知识", "title: &title 健康知识")
      .replace("author: 编辑部", "author: *title") + "正文",
    head.replace("title: 健康知识", "title: [未闭合") + "正文",
    head.replace("author: 编辑部", "author: [编辑部]") + "正文",
  ])("rejects missing or malformed frontmatter", (source) =>
    expect(parseMarkdown(source).ok).toBe(false),
  );
  it("bounds source size, AST depth and validates input filename", () => {
    expect(parse("a".repeat(1_048_577)).ok).toBe(false);
    expect(parse(`${"> ".repeat(30)}text`).ok).toBe(false);
    expect(parseMarkdown(head + "正文", { file: "../article.md" }).ok).toBe(
      false,
    );
    expect(parse("").ok).toBe(false);
  });
  it("parses 50 independent pages and isolates malformed input", () => {
    const results = Array.from({ length: 50 }, (_, i) =>
      parseMarkdown(
        head.replace("id: test", `id: page-${i}`) +
          (i === 17 ? "::unknown" : `## 第 ${i} 篇\n\n科普内容`),
        { file: `${i}.md` },
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(49);
    expect(results[17]?.ok).toBe(false);
    expect(results[49]?.ok).toBe(true);
  });
  it("parses the shipped fixtures and collectively covers all 19 modules", async () => {
    const all: string[] = [];
    for (const fixture of ["basic", "complex"]) {
      const source = await readFile(
        new URL(`../../../examples/${fixture}/article.md`, import.meta.url),
        "utf8",
      );
      const result = parseMarkdown(source, {
        file: `${fixture}/article.md`,
        availableAssets: ["basic/assets/cover.png"],
      });
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
      all.push(...types(result.page.nodes));
    }
    expect(new Set(all).size).toBe(19);
  });
});
