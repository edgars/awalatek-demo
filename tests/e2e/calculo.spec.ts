import { expect, test } from "@playwright/test";

// Story 4.1 contra a base dedicada do e2e. Seed: MARIA (012.345.678-90, A, PA01 tipo A,
// região 1, 1 dependente, renda 1.200,00) e JOSE (123.456.780-62, S).

const CPF_MARIA = "01234567890";

test("cálculo normal → CALCULO REALIZADO COM SUCESSO com resumo e link do pagamento", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Cálculo individual" }).click();
  await expect(page).toHaveURL(/\/calculo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cálculo de benefício" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cálculo individual" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  await page.getByLabel("Competência").fill("2026-09");
  await page.getByRole("button", { name: "Calcular" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("CALCULO REALIZADO COM SUCESSO");
  await expect(resumo).toContainText("***.***.678-90");
  await expect(resumo).toContainText("09/2026");
  await expect(resumo).toContainText("R$ 122,20");
  await expect(resumo).toContainText("N — Normal");
  await expect(resumo).not.toContainText("VLR 13O SALARIO");
  await expect(resumo.getByRole("link", { name: /Pagamento nº \d+/ })).toBeVisible();
});

test("dezembro com programa A → tipo D com 13º e abono", async ({ page }) => {
  await page.goto("/calculo");
  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  await page.getByLabel("Competência").fill("2026-12");
  await page.getByRole("button", { name: "Calcular" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("CALCULO REALIZADO COM SUCESSO");
  await expect(resumo).toContainText("D — Dezembro");
  await expect(resumo).toContainText("VLR 13O SALARIO");
  await expect(resumo).toContainText("R$ 202,50");
  await expect(resumo).toContainText("VLR ABONO");
  await expect(resumo).toContainText("R$ 18,33");
  await expect(resumo).toContainText("R$ 343,03");
});

test("beneficiário suspenso → BENEFICIARIO NAO ATIVO - STATUS: S", async ({ page }) => {
  await page.goto("/calculo");
  // JOSE CARLOS PEREIRA (seed, status S): base 123456780 + DV.
  await page.getByLabel("CPF do beneficiário").fill("12345678062");
  await page.getByLabel("Competência").fill("2026-09");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ATIVO - STATUS: S");
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
});
