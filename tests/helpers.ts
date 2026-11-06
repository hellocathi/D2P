import { expect, type Page } from "@playwright/test";
export async function saveAndGenerate(page: Page) {
  await page.getByRole("button", { name: "保存制作", exact: true }).click();
  const row = page.locator("[data-creation-record]").first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "生成 URL", exact: true }).click();
  await page.getByRole("button", { name: "导出进度", exact: true }).click();
}
export async function saveAllAndGenerate(page: Page, count: number) {
  await page.getByRole("button", { name: "保存全部素材", exact: true }).click();
  await expect(page.locator("[data-creation-record]")).toHaveCount(count);
  await page.getByLabel("全选制作记录", { exact: true }).check();
  await page.getByRole("button", { name: "批量生成 URL", exact: true }).click();
  await page.getByRole("button", { name: "导出进度", exact: true }).click();
}
