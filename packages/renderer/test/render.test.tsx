import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarkdown } from "@d2p/markdown";
import { PageRenderer } from "../src/index";
it("renders nested structured content with escaped text", () => {
  const r = parseMarkdown(
    '---\nid: a\ntitle: Test\nauthor: A\npublishDate: "2026-11-05"\n---\n::::section\n:::rich-text\n**重点** &lt;script&gt;\n:::\n::::',
  );
  if (!r.ok) throw Error(JSON.stringify(r));
  const html = renderToStaticMarkup(
    <PageRenderer page={r.page} resolve={(a) => a.path} />,
  );
  expect(html).toContain("<strong>重点</strong>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("width:750px");
});
it("switches independent templates without changing the parsed content", () => {
  const r = parseMarkdown(
    '---\nid: a\ntitle: Test\nauthor: A\npublishDate: "2026-11-05"\n---\n## 内容标题\n\n文案',
  );
  if (!r.ok) throw Error("parse failed");
  const original = JSON.stringify(r.page);
  const renders = (["classic", "journal", "campaign"] as const).map(
    (templateId) =>
      renderToStaticMarkup(
        <PageRenderer
          page={r.page}
          templateId={templateId}
          resolve={(a) => a.path}
        />,
      ),
  );
  expect(new Set(renders).size).toBe(3);
  for (const html of renders) expect(html).toContain("内容标题");
  expect(JSON.stringify(r.page)).toBe(original);
});
