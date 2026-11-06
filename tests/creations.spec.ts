import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
const markdown = (title: string) =>
  `---\nid: demo\ntitle: ${title}\nauthor: 编辑\npublishDate: "2026-11-06"\n---\n::article-header\n\n![素材](./cover.png)`;
test("save, reopen and select works to generate URLs from each work own assets", async ({
  page,
}) => {
  test.setTimeout(60000);
  let uploads = 0,
    downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/uploads", (route) => {
    uploads++;
    return route.continue();
  });
  await page.goto("/");
  for (const [title, r, b] of [
    ["作品 A", 255, 0],
    ["作品 B", 0, 255],
  ] as const) {
    const png = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = r;
      png.data[i + 1] = 0;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
    await page.getByLabel("导入素材", { exact: true }).setInputFiles([
      {
        name: "same.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(markdown(title)),
      },
      { name: "cover.png", mimeType: "image/png", buffer: PNG.sync.write(png) },
    ]);
    await page.getByLabel("导出倍率").selectOption("1");
    await page.getByRole("button", { name: "保存制作", exact: true }).click();
  }
  await expect(page.locator("[data-creation-record]")).toHaveCount(2);
  expect(uploads).toBe(0);
  const a = page
    .locator("[data-creation-record]")
    .filter({ has: page.getByRole("button", { name: "作品 A", exact: true }) });
  await a.getByRole("button", { name: "查看 / 编辑" }).click();
  await expect(page.getByLabel("Markdown 配置")).toHaveValue(
    markdown("作品 A"),
  );
  await page
    .getByLabel("Markdown 配置")
    .fill(markdown("作品 A") + "\n\n已经修改");
  await page.getByRole("button", { name: "保存制作", exact: true }).click();
  await expect(page.locator("[data-creation-record]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("[data-creation-record]")).toHaveCount(2);
  await page.getByLabel("全选制作记录", { exact: true }).check();
  await page.getByRole("button", { name: "批量生成 URL", exact: true }).click();
  await expect(
    page.locator("[data-creation-status]").filter({ hasText: "已生成 URL" }),
  ).toHaveCount(2, { timeout: 30000 });
  expect(uploads).toBe(2);
  expect(downloads).toBe(0);
  for (const [title, r, b] of [
    ["作品 A", 255, 0],
    ["作品 B", 0, 255],
  ] as const) {
    const row = page
      .locator("[data-creation-record]")
      .filter({ has: page.getByRole("button", { name: title, exact: true }) });
    const url = await row.locator("a").getAttribute("href");
    const image = PNG.sync.read(await (await page.request.get(url!)).body());
    const i =
      (Math.floor(image.height / 2) * image.width +
        Math.floor(image.width / 2)) *
      4;
    expect([...image.data.subarray(i, i + 3)]).toEqual([r, 0, b]);
  }
  await page.getByRole("button", { name: "批量生成 URL", exact: true }).click();
  expect(uploads).toBe(2);
  const [single] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator("[data-creation-record]")
      .first()
      .getByRole("button", { name: "下载图片", exact: true })
      .click(),
  ]);
  expect(single.suggestedFilename()).toMatch(/\.png$/);
  const [archive] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载所选图片 ZIP" }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await archive.path())!));
  expect(Object.keys(zip.files).filter((k) => k.endsWith(".png"))).toHaveLength(
    2,
  );
  await page.reload();
  await expect(
    page.locator("[data-creation-status]").filter({ hasText: "已生成 URL" }),
  ).toHaveCount(2);
  await page
    .locator("[data-creation-record]")
    .first()
    .getByRole("button", { name: "查看 / 编辑" })
    .click();
  await page.getByLabel("Markdown 配置").fill(markdown("更新后的作品"));
  await page.getByRole("button", { name: "保存制作", exact: true }).click();
  const changed = page.locator("[data-creation-record]").filter({
    has: page.getByRole("button", { name: "更新后的作品", exact: true }),
  });
  await expect(changed.locator("[data-creation-status]")).toHaveText(
    "已修改 · 待导出",
  );
  await expect(
    changed.getByRole("button", { name: "下载图片", exact: true }),
  ).toBeDisabled();
  await changed.getByRole("button", { name: "生成 URL", exact: true }).click();
  await expect(changed.locator("[data-creation-status]")).toHaveText(
    "已生成 URL",
    { timeout: 30000 },
  );
  expect(uploads).toBe(3);
});
test("an unsaved preview remains a draft after reload", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "新建制作", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "新建制作", exact: true }).click();
  await page.getByLabel("Markdown 配置").fill(markdown("未保存的草稿"));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "新建制作", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("[data-creation-record]")).toHaveCount(0);
});
test("failed URL generation persists and retry after reload reuses the generated image", async ({
  page,
}) => {
  test.setTimeout(45000);
  let requests = 0;
  await page.route("**/api/uploads", async (route) => {
    if (++requests === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"模拟上传失败"}',
      });
    else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "制作预览", exact: true }).click();
  await page.getByRole("button", { name: "保存制作", exact: true }).click();
  let row = page.locator("[data-creation-record]");
  await row.getByRole("button", { name: "生成 URL", exact: true }).click();
  await expect(row.locator("[data-creation-status]")).toHaveText("导出失败", {
    timeout: 20000,
  });
  await page.reload();
  row = page.locator("[data-creation-record]");
  await expect(row.locator("[data-creation-status]")).toHaveText("导出失败");
  await expect(
    row.getByRole("button", { name: "生成 URL", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.dataset.captures = "0";
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of Array.from(record.addedNodes))
          if (node instanceof HTMLElement && node.dataset.exportHost)
            document.documentElement.dataset.captures = String(
              Number(document.documentElement.dataset.captures) + 1,
            );
    }).observe(document.body, { childList: true });
  });
  await row.getByRole("button", { name: "生成 URL", exact: true }).click();
  await expect(row.locator("[data-creation-status]")).toHaveText("已生成 URL", {
    timeout: 20000,
  });
  expect(requests).toBe(2);
  expect(
    await page.evaluate(() => document.documentElement.dataset.captures),
  ).toBe("0");
  await expect(row.getByRole("alert")).toHaveCount(0);
});
