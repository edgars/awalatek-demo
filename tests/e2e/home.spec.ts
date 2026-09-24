import { expect, test } from "@playwright/test";

test("home responde 200 e mostra SIFAP", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/SIFAP/);
  await expect(page.getByRole("heading", { level: 1, name: "SIFAP" })).toBeVisible();
});
