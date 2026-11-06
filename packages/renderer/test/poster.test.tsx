import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarkdown } from "@d2p/markdown";
import { posterSchema, defaultPoster } from "@d2p/contracts";
import { PageRenderer } from "../src";
const result = parseMarkdown(
  '---\nid: p\ntitle: 健康主题\nauthor: 编辑\npublishDate: "2026-11-06"\n---\n正文',
);
if (!result.ok) throw Error("fixture");
const page = result.page;
it("composes full poster frames without mutating Markdown content", () => {
  const data = defaultPoster(page);
  data.cards[0]!.body = "长文字".repeat(1000);
  const original = JSON.stringify(page);
  for (const templateId of ["poster-blue", "poster-pink"] as const) {
    const html = renderToStaticMarkup(
      <PageRenderer
        page={page}
        poster={data}
        templateId={templateId}
        resolve={(a) => a.path}
      />,
    );
    expect(html).toContain('data-slot="card-4"');
    expect(html).toContain(data.cards[0]!.body);
    expect(html).toContain("width:750px");
    expect(html).not.toContain("height:1600px");
  }
  expect(JSON.stringify(page)).toBe(original);
});
it("replaces only the inside of a white slot with an image", () => {
  const data = defaultPoster(page);
  data.cards[0]!.image = { kind: "package", path: "diagram.png" };
  data.cards[0]!.imageOnly = true;
  const html = renderToStaticMarkup(
    <PageRenderer
      page={page}
      poster={data}
      templateId="poster-blue"
      resolve={(a) => "https://example.test/" + a.path}
    />,
  );
  expect(html).toContain("https://example.test/diagram.png");
  expect(html).not.toContain(data.cards[0]!.body);
  expect(html).toContain(data.cards[1]!.body);
});
it("validates slot data and disallows arbitrary CSS or HTML configuration", () => {
  const data = defaultPoster(page);
  expect(
    posterSchema.safeParse({ ...data, style: "position:fixed" }).success,
  ).toBe(false);
  expect(posterSchema.safeParse({ ...data, cards: [] }).success).toBe(false);
  expect(
    posterSchema.safeParse({
      ...data,
      backgroundImage: { kind: "remote", path: "javascript:evil()" },
    }).success,
  ).toBe(false);
  data.title = "<script>not executable</script>";
  expect(
    renderToStaticMarkup(
      <PageRenderer
        page={page}
        poster={data}
        templateId="poster-pink"
        resolve={(a) => a.path}
      />,
    ),
  ).toContain("&lt;script&gt;");
});
