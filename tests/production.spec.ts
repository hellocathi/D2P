import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
test("templates, 30 real captures, upload retry, ZIP and resource cleanup", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "编辑与预览", exact: true })
    .first()
    .click();
  await page.getByLabel("选择模板").selectOption("journal");
  await expect(page.locator("[data-page-id]")).toContainText(
    "健康生活 · 专题阅读",
  );
  await page.getByLabel("选择模板").selectOption("campaign");
  await expect(page.locator("[data-page-id]")).toContainText(
    "关爱健康 · 主题精选",
  );
  const image = await readFile("examples/basic/assets/cover.png");
  const files = Array.from({ length: 30 }, (_, i) => ({
    name: `article-${i}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `---\nid: page-${i}\ntitle: 素材 ${i}\nauthor: 测试\npublishDate: "2026-11-06"\n---\n::article-header\n\n![封面](./cover.png)\n\n${("正文内容。".repeat(20) + "\n\n").repeat((i % 3) + 1)}\n${'::spacer{height="400"}\n\n'.repeat(i === 29 ? 12 : 1)}\n:::section{background="#FF0000"}\n底部结束标记 ${i}\n:::`,
    ),
  }));
  const inputZip = new JSZip();
  for (const file of files) inputZip.file(file.name, file.buffer);
  inputZip.file("cover.png", image);
  await page.getByLabel("导入素材", { exact: true }).setInputFiles([
    {
      name: "materials.zip",
      mimeType: "application/zip",
      buffer: await inputZip.generateAsync({ type: "nodebuffer" }),
    },
  ]);
  await expect(page.getByText("30 篇素材")).toBeVisible();
  await page.getByLabel("导出倍率").selectOption("1");
  await page.getByLabel("上传模式").selectOption("mock");
  let requests = 0;
  await page.route("**/api/uploads", async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"模拟暂时故障"}',
      });
    else await route.continue();
  });
  await page.evaluate(() => {
    document.documentElement.dataset.captures = "0";
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes))
          if (n instanceof HTMLElement && n.dataset.exportHost)
            document.documentElement.dataset.captures = String(
              Number(document.documentElement.dataset.captures) + 1,
            );
    }).observe(document.body, { childList: true });
  });
  await page.getByRole("button", { name: "批量生成全部" }).click();
  await expect(
    page.getByRole("heading", { name: "批量生产 30 / 30" }),
  ).toBeVisible({ timeout: 180000 });
  await expect(
    page.locator("td").filter({ hasText: /^成功 100%$/ }),
  ).toHaveCount(29);
  await page.getByRole("button", { name: "重试失败 / 取消任务" }).click();
  await expect(
    page.locator("td").filter({ hasText: /^成功 100%$/ }),
  ).toHaveCount(30, { timeout: 15000 });
  expect(requests).toBe(31);
  expect(
    await page.evaluate(() => document.documentElement.dataset.captures),
  ).toBe("30");
  await expect(page.locator("[data-export-host]")).toHaveCount(0);
  await page.getByRole("button", { name: "结果管理", exact: true }).click();
  const links = page.locator("a").filter({ hasText: /^http/ });
  await expect(links).toHaveCount(30);
  const url = await links.last().getAttribute("href");
  const response = await page.request.get(url!);
  expect(response.status()).toBe(200);
  const png = PNG.sync.read(await response.body());
  expect(png.width).toBe(750);
  expect(png.height).toBeGreaterThan(4800);
  const offset = ((png.height - 5) * png.width + 10) * 4;
  expect([...png.data.subarray(offset, offset + 3)]).toEqual([255, 0, 0]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载图片 ZIP" }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(Object.keys(zip.files).filter((f) => f.endsWith(".png"))).toHaveLength(
    30,
  );
  expect(await zip.file("results.csv")!.async("string")).toContain(url!);
  await page.screenshot({ path: "test-results/results.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "结果管理", exact: true }).click();
  await expect(page.locator("a").filter({ hasText: /^http/ })).toHaveCount(30);
});
test("JPEG export and failed image release the offscreen renderer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("导入素材", { exact: true }).setInputFiles([
    {
      name: "jpeg.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        '---\nid: jpeg\ntitle: JPEG\nauthor: Test\npublishDate: "2026-11-06"\n---\n::article-header',
      ),
    },
  ]);
  await page.getByLabel("图片格式").selectOption("jpeg");
  await page.getByRole("button", { name: "批量生成全部" }).click();
  await expect(
    page.locator("td").filter({ hasText: /^成功 100%$/ }),
  ).toHaveCount(1, { timeout: 30000 });
  await page.getByRole("button", { name: "结果管理", exact: true }).click();
  await expect(page.locator("a").filter({ hasText: /^http/ })).toHaveAttribute(
    "href",
    /\.jpg$/,
  );
  await page.getByLabel("导入素材", { exact: true }).setInputFiles([
    {
      name: "broken.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        '---\nid: bad\ntitle: Image\nauthor: Test\npublishDate: "2026-11-06"\n---\n![错误](https://example.com/nonexistent.png)',
      ),
    },
  ]);
  await page.route("https://example.com/**", (route) => route.abort());
  await page.getByRole("button", { name: "批量生成全部" }).click();
  await expect(
    page.locator("td").filter({ hasText: "图片加载失败" }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator("[data-export-host]")).toHaveCount(0);
});
test('font failure reports an error and removes the offscreen host', async ({page}) => {await page.goto('/');await expect(page.getByRole('button',{name:'批量生成全部'})).toBeEnabled();await page.evaluate(()=>Object.defineProperty(document.fonts,'check',{value:()=>false}));await page.getByRole('button',{name:'批量生成全部'}).click();await expect(page.locator('td').filter({hasText:'字体不可用'})).toHaveCount(1);await expect(page.locator('[data-export-host]')).toHaveCount(0)});
