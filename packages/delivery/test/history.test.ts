import { describe, it, expect } from "vitest";
import { mergeHistory, recordFromTask } from "../src/history";
import type { Task } from "../../batch/src";
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: "same.md",
    source: "",
    status: "success",
    progress: 100,
    attempt: 1,
    url: "https://example.com/same.png",
    title: "导出标题",
    format: "png",
    scale: 2,
    templateId: "poster-blue",
    completedAt: "2026-11-06T08:00:00Z",
    batchId: "batch-" + id,
    ...overrides,
  };
}
const record = (id: string, overrides: Partial<Task> = {}) =>
  recordFromTask(task(id, overrides))!;
describe("export history", () => {
  it("retains repeated exports of the same filename and URL across batches", () => {
    const history = mergeHistory([record("first")], [record("second")]);
    expect(history).toHaveLength(2);
    expect(history.map((r) => r.id)).toEqual(["second", "first"]);
    expect(history[0]!.url).toBe(history[1]!.url);
  });
  it("records task identity once when receiving repeated completion notifications", () => {
    expect(
      mergeHistory([record("a")], [record("a"), record("a")]),
    ).toHaveLength(1);
  });
  it("sorts by completion time and preserves legacy exports without inventing dates", () => {
    const old = recordFromTask({
      id: "old",
      name: "old.md",
      source: "",
      status: "success",
      progress: 100,
      attempt: 1,
      url: "https://example.test/old.png",
    })!;
    expect(old.exportedAt).toBeNull();
    expect(old.scale).toBeNull();
    const history = mergeHistory(
      [old, record("new")],
      [record("older", { completedAt: "2026-11-05T00:00:00Z" })],
    );
    expect(history.map((r) => r.id)).toEqual(["new", "older", "old"]);
  });
  it("does not record failed, cancelled or unfinished exports", () => {
    for (const status of [
      "pending",
      "parsing",
      "rendering",
      "capturing",
      "uploading",
      "failed",
      "cancelled",
    ] as const)
      expect(recordFromTask(task("a", { status }))).toBeUndefined();
    const success = task("a");
    delete success.url;
    expect(recordFromTask(success)).toBeUndefined();
  });
  it("captures metadata as a snapshot of the completed export", () => {
    const t = task("a");
    const r = recordFromTask(t)!;
    t.name = "changed.md";
    t.title = "new title";
    expect(r).toMatchObject({
      name: "same.md",
      title: "导出标题",
      format: "png",
      templateId: "poster-blue",
      scale: 2,
      batchId: "batch-a",
    });
  });
});
