import { test, expect } from "@playwright/test";

test("new templates create materials while editing updates the existing material", async ({ page }) => {
  await page.goto("/");
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: "首页", exact: true }).click();
    await page.getByRole("button", { name: "蓝色健康海报 整页背景", exact: false }).click();
    await expect(page.getByLabel("海报主标题", { exact: true })).not.toHaveValue("已编辑素材");
    await page.getByRole("button", { name: "保存制作", exact: true }).click();
    await expect(page.locator("[data-creation-record]")).toHaveCount(i);
  }
  await page.locator("[data-creation-record]").first().getByRole("button", { name: "查看 / 编辑" }).click();
  await page.getByLabel("海报主标题", { exact: true }).fill("已编辑素材");
  await page.getByRole("button", { name: "保存制作", exact: true }).click();
  await expect(page.locator("[data-creation-record]")).toHaveCount(3);
  await expect(page.locator("[data-creation-record]").first()).toContainText("已编辑素材");
  await page.reload();
  await page.getByRole("button", { name: "素材列表", exact: true }).click();
  await expect(page.locator("[data-creation-record]")).toHaveCount(3);
  await expect(page.locator("[data-creation-record]").first()).toContainText("已编辑素材");
});
