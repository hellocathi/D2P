import { it, expect } from "vitest";
import {
  snapshotCreation,
  currentUrl,
  applyExport,
  mergeCreations,
} from "../src/creations";
const doc = {
  name: "same.md",
  source:
    '---\nid: demo\ntitle: 标题\nauthor: 编辑\npublishDate: "2026-11-06"\n---\n![图](./cover.png)',
};
it("saves independent image snapshots even when two works share the same filename", () => {
  const red = new Blob(["red"]);
  const blue = new Blob(["blue"]);
  const a = snapshotCreation(doc, { "cover.png": red }, "png", 1);
  const b = snapshotCreation(doc, { "cover.png": blue }, "png", 1);
  expect(a.id).not.toBe(b.id);
  expect(a.assets["cover.png"]).toBe(red);
  expect(b.assets["cover.png"]).toBe(blue);
  expect(mergeCreations([a], [b])).toHaveLength(2);
});
it("editing preserves work identity and invalidates an older export", () => {
  const a = snapshotCreation(
    doc,
    { "cover.png": new Blob(["image"]) },
    "png",
    2,
  );
  const exported = applyExport(
    [a],
    a.id,
    1,
    "https://example.test/1.png",
    "2026-11-06T00:00:00Z",
  )[0]!;
  expect(currentUrl(exported)).toBe("https://example.test/1.png");
  const newer = snapshotCreation(
    { ...doc, source: doc.source + "\n改动" },
    a.assets,
    "jpeg",
    1,
    exported,
  );
  expect(newer.id).toBe(a.id);
  expect(newer.revision).toBe(2);
  expect(currentUrl(newer)).toBeUndefined();
  expect(
    currentUrl(
      applyExport(
        [newer],
        a.id,
        1,
        "https://example.test/stale.png",
        "now",
      )[0]!,
    ),
  ).toBeUndefined();
});
it("requires referenced resources and excludes unrelated images", () => {
  expect(() => snapshotCreation(doc, {}, "png", 1)).toThrow("找不到素材");
  const a = snapshotCreation(
    doc,
    { "cover.png": new Blob(), unused: new Blob() },
    "png",
    1,
  );
  expect(Object.keys(a.assets)).toEqual(["cover.png"]);
});
