import { saveAndGenerate, saveAllAndGenerate } from "./helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
test("poster slots, uploaded images, portable material pack, and exported geometry", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "制作预览", exact: true })
    .first()
    .click();
  await page.getByLabel("选择模板").selectOption("poster-blue");
  await page.getByLabel("海报主标题", { exact: true }).fill("健康海报测试");
  await page
    .getByLabel("坑位 1 正文", { exact: true })
    .fill("自动撑高的长文字。".repeat(100));
  await page
    .getByLabel("主视觉图片", { exact: true })
    .setInputFiles("examples/basic/assets/cover.png");
  await expect(page.getByRole("button", { name: "保存制作" })).toBeEnabled();
  await page
    .getByLabel("坑位 2 图片", { exact: true })
    .setInputFiles("examples/basic/assets/cover.png");
  await expect(page.getByRole("button", { name: "保存制作" })).toBeEnabled();
  await page
    .getByText("图片铺满坑位内部（隐藏该坑位文字）", { exact: true })
    .nth(1)
    .locator("input")
    .check();
  await expect(page.locator('[data-slot="card-2"] img')).toHaveCount(1);
  await page.getByLabel("选择模板").selectOption("poster-pink");
  await expect(page.locator('[data-poster="pink"]')).toContainText(
    "健康海报测试",
  );
  await page.getByRole("button", { name: "添加白色坑位" }).click();
  await page.getByLabel("坑位 5 标题", { exact: true }).fill("新增白色框");
  await expect(page.locator('[data-slot="card-5"]')).toContainText(
    "新增白色框",
  );
  const [archive] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出可编辑素材包" }).click(),
  ]);
  const buffer = await readFile((await archive.path())!);
  await page.reload();
  await page
    .getByLabel("导入素材", { exact: true })
    .setInputFiles({ name: "saved.zip", mimeType: "application/zip", buffer });
  await page
    .getByRole("button", { name: "制作预览", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("选择模板")).toHaveValue("poster-pink");
  await expect(page.getByLabel("坑位 5 标题", { exact: true })).toHaveValue(
    "新增白色框",
  );
  await page.getByLabel("导出倍率").selectOption("1");
  const size = await page
    .locator("[data-poster]")
    .evaluate((el) => ({ width: el.scrollWidth, height: el.scrollHeight }));
  await page.screenshot({
    path: "test-results/poster-editor.png",
    fullPage: true,
  });
  await saveAndGenerate(page);
  await expect(
    page.locator("td").filter({ hasText: /^成功 100%$/ }),
  ).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator("[data-export-host]")).toHaveCount(0);
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  const url = await page
    .locator("a")
    .filter({ hasText: /^http/ })
    .getAttribute("href");
  const response = await page.request.get(url!);
  const bytes = await response.body();
  const png = PNG.sync.read(bytes);
  expect(png.width).toBe(size.width);
  expect(Math.abs(png.height - size.height)).toBeLessThanOrEqual(1);
  expect(png.height).toBeGreaterThan(2500);
  await import("node:fs/promises").then((fs) =>
    fs.writeFile("test-results/poster-output.png", bytes),
  );
});
test("blue poster export preserves clean white slot backgrounds", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "制作预览", exact: true })
    .first()
    .click();
  await page.getByLabel("选择模板").selectOption("poster-blue");
  await expect(page.locator('[data-poster="blue"]')).toBeVisible();
  const rect = await page.locator('[data-slot="card-1"]').evaluate((el) => {
    const a = el.closest("[data-poster]")!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x - a.x),
      y: Math.round(r.y - a.y),
      width: Math.floor(r.width),
      height: Math.floor(r.height),
    };
  });
  await page.getByLabel("导出倍率").selectOption("1");
  await saveAndGenerate(page);
  await expect(
    page.locator("td").filter({ hasText: /^成功 100%$/ }),
  ).toHaveCount(1, { timeout: 30000 });
  await page.getByRole("button", { name: "导出历史", exact: true }).click();
  const url = await page
    .locator("a")
    .filter({ hasText: /^http/ })
    .getAttribute("href");
  const png = PNG.sync.read(await (await page.request.get(url!)).body());
  let white = 0,
    total = 0;
  for (let y = rect.y + 10; y < rect.y + rect.height - 10; y++)
    for (let x = rect.x + 10; x < rect.x + rect.width - 10; x++) {
      const i = (y * png.width + x) * 4;
      if (
        png.data[i]! > 220 &&
        png.data[i + 1]! > 220 &&
        png.data[i + 2]! > 220
      )
        white++;
      total++;
    }
  expect(white / total).toBeGreaterThan(0.7);
});
