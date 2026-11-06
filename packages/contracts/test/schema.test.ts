import { describe, expect, it } from "vitest";
import {
  controlledStyleSchema,
  dateSchema,
  directiveTypes,
  frontmatterSchema,
  modulePropsSchemas,
  pageSchema,
  resolveAssetRef,
  type ModuleNode,
  type PageSchema,
} from "../src/index.js";

const page = (
  nodes: unknown[] = [{ id: "a", type: "Text", props: { text: "健康科普" } }],
) => ({
  schemaVersion: 1,
  metadata: {
    id: "demo",
    title: "健康知识",
    author: "编辑部",
    publishDate: "2026-11-05",
  },
  page: { width: 750, height: "auto", background: "#FFFFFF" },
  theme: { primary: "#176B87", text: "#243447" },
  nodes,
});

describe("PageSchema contracts", () => {
  it("registers every module named in the requirements", () => {
    expect(new Set(Object.keys(modulePropsSchemas))).toEqual(
      new Set([
        "ArticleHeader",
        "Hero",
        "Section",
        "SectionTitle",
        "ContentCard",
        "Text",
        "RichText",
        "Image",
        "ImageGrid",
        "List",
        "Callout",
        "Quote",
        "Row",
        "Column",
        "Divider",
        "Spacer",
        "References",
        "Disclaimer",
        "Footer",
      ]),
    );
    expect(new Set(Object.values(directiveTypes))).toEqual(
      new Set(Object.keys(modulePropsSchemas)),
    );
  });
  it("defaults frontmatter and validates a complete page", () => {
    const parsed = frontmatterSchema.parse(page().metadata);
    expect(parsed.page.width).toBe(750);
    expect(pageSchema.parse(page()).page.height).toBe("auto");
  });
  it.each([
    "2025-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-01",
    "not-a-date",
  ])("rejects invalid date %s", (date) =>
    expect(dateSchema.safeParse(date).success).toBe(false),
  );
  it("accepts real leap day", () =>
    expect(dateSchema.safeParse("2024-02-29").success).toBe(true));
  it.each([
    { position: "fixed" },
    { background: "url(https://evil.test/a)" },
    { color: "red" },
    { padding: 999 },
    { fontSize: 100 },
    { fontWeight: 900 },
    { margin: "-1px" },
  ])("rejects unsafe or out-of-range styles %j", (style) => {
    expect(controlledStyleSchema.safeParse(style).success).toBe(false);
  });
  it("rejects unknown properties, variants, leaf children and wrong node props", () => {
    for (const node of [
      { id: "a", type: "Text", props: { text: "x", onclick: "alert(1)" } },
      { id: "a", type: "Text", props: { text: "x", variant: "unknown" } },
      { id: "a", type: "Text", props: { text: "x" }, children: [] },
      { id: "a", type: "Spacer", props: { text: "x" } },
    ])
      expect(pageSchema.safeParse(page([node])).success).toBe(false);
  });
  it("validates layout parent/child rules and unique IDs", () => {
    const image = {
      id: "im",
      type: "Image",
      props: { src: { kind: "package", path: "cover.png" }, alt: "封面" },
    };
    expect(
      pageSchema.safeParse(
        page([{ id: "grid", type: "ImageGrid", props: {}, children: [image] }]),
      ).success,
    ).toBe(true);
    const text = { id: "t", type: "Text", props: { text: "x" } };
    for (const nodes of [
      [text, text],
      [{ id: "c", type: "Column", props: {}, children: [text] }],
      [{ id: "r", type: "Row", props: {}, children: [text] }],
      [{ id: "g", type: "ImageGrid", props: {}, children: [] }],
      [{ id: "g", type: "ImageGrid", props: {}, children: [text] }],
    ])
      expect(pageSchema.safeParse(page(nodes)).success).toBe(false);
  });
  it("rejects cyclic, excessively deep and oversized untrusted JSON before recursion", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.child = cyclic;
    expect(pageSchema.safeParse(cyclic).success).toBe(false);
    let node: unknown = { id: "leaf", type: "Text", props: { text: "x" } };
    for (let i = 0; i < 200; i++)
      node = { id: `c-${i}`, type: "Section", props: {}, children: [node] };
    expect(() => pageSchema.safeParse(page([node]))).not.toThrow();
    expect(pageSchema.safeParse(page([node])).success).toBe(false);
    expect(
      pageSchema.safeParse(page(Array.from({ length: 5001 }, () => ({}))))
        .success,
    ).toBe(false);
  });
  it("rejects alias colors in theme to prevent token cycles", () => {
    const value = page();
    value.theme.primary = "$primary";
    expect(pageSchema.safeParse(value).success).toBe(false);
  });
  it("keeps type and props correlated at compile time", () => {
    const node: ModuleNode = { id: "x", type: "Text", props: { text: "x" } };
    if (node.type === "Text") expect(node.props.text).toBe("x");
    const invalid: ModuleNode = {
      id: "bad",
      type: "Text",
      // @ts-expect-error Text cannot use image properties.
      props: { src: { kind: "package", path: "a.png" }, alt: "x" },
    };
    void invalid;
    const validated: PageSchema = pageSchema.parse(page());
    expect(validated.nodes).toHaveLength(1);
  });
});

describe("asset resolution", () => {
  it("resolves paths relative to the Markdown directory", () => {
    expect(resolveAssetRef("../assets/封面.png", "articles/a.md")).toEqual({
      kind: "package",
      path: "assets/封面.png",
    });
    expect(resolveAssetRef("./cover%20one.png", "article.md").path).toBe(
      "cover one.png",
    );
    expect(
      resolveAssetRef("https://cdn.example.com/a.png", "article.md").kind,
    ).toBe("remote");
  });
  it.each([
    "../x.png",
    "%2e%2e/x.png",
    "%252e%252e/x.png",
    "/a.png",
    "C:\\a.png",
    "//evil.test/a",
    "javascript:alert(1)",
    "data:image/png,x",
    "https://u:p@evil.test/a",
    "https:\\evil.test/a",
    "a.png?x=1",
  ])("rejects unsafe asset %s", (value) => {
    expect(() => resolveAssetRef(value, "article.md")).toThrow();
  });
});
