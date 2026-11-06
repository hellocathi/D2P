import { saveAndGenerate, saveAllAndGenerate } from "./helpers";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
test("export history accumulates identical exports, filters and survives reload", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  const generate = async () => {
    await page
      .getByRole("button", { name: "制作预览", exact: true })
      .first()
      .click();
    await saveAndGenerate(page);
    await expect(
      page.locator("td").filter({ hasText: /^成功 100%$/ }),
    ).toHaveCount(1, { timeout: 20000 });
    await page.getByRole("button", { name: "导出历史", exact: true }).click();
  };
  await generate();
  await expect(page.locator("[data-export-record]")).toHaveCount(1);
  const firstId = await page
    .locator("[data-export-record]")
    .getAttribute("data-export-record");
  await generate();
  await expect(page.locator("[data-export-record]")).toHaveCount(2);
  const ids = await page
    .locator("[data-export-record]")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-export-record")),
    );
  expect(new Set(ids).size).toBe(2);
  expect(ids[1]).toBe(firstId);
  const urls = await page
    .locator("a")
    .filter({ hasText: /^http/ })
    .allTextContents();
  expect(urls[0]).toBe(urls[1]);
  await page.getByLabel("导出记录范围").selectOption("current");
  await expect(page.locator("[data-export-record]")).toHaveCount(1);
  await page.getByLabel("导出记录范围").selectOption("all");
  await page.getByLabel("搜索导出记录").fill("does-not-exist");
  await expect(page.locator("[data-export-record]")).toHaveCount(0);
  await page.getByLabel("搜索导出记录").fill("article.md");
  await expect(page.locator("[data-export-record]")).toHaveCount(2);
  const [list] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 URL 清单" }).click(),
  ]);
  const csv = await readFile((await list.path())!, "utf8");
  expect(csv).toContain("导出时间");
  expect(csv.split("\r\n")).toHaveLength(3);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载图片 ZIP" }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(Object.keys(zip.files).filter((n) => n.endsWith(".png"))).toHaveLength(
    2,
  );
  await page.reload();
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  await expect(page.locator("[data-export-record]")).toHaveCount(2);
  await expect(page.locator("[data-export-record] time")).toHaveCount(2);
  await page.getByRole("button", { name: "加载示例", exact: true }).click();
  await expect(page.getByText("2 篇素材")).toBeVisible();
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  await expect(page.locator("[data-export-record]")).toHaveCount(2);
});
test("migrates completed records from the previous current-task store", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "保存全部素材" }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keyval", "readwrite");
      tx.objectStore("keyval").put(
        [
          {
            id: "legacy-record",
            name: "legacy.md",
            source: "",
            status: "success",
            progress: 100,
            attempt: 1,
            url: "https://example.test/legacy.png",
          },
        ],
        "d2p-tasks",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.route("https://example.test/**", (route) => route.abort());
  await page.reload();
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  await expect(
    page.locator('[data-export-record="legacy-record"]'),
  ).toContainText("历史记录 · 时间未知");
  await page.reload();
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  await expect(page.locator("[data-export-record]")).toHaveCount(1);
});
