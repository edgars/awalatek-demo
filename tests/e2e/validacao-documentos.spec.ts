import { expect, test } from "@playwright/test";

// Story 2.3 — VALDOCS na tela /validacao/documentos (flag D4 desativado por padrão).

test("documentos válidos → V", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: "Documentos" }).click();
  await expect(page).toHaveURL(/\/validacao\/documentos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Validação de documentos" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Documentos" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF").fill("01234567890");
  await page.getByLabel("RG").fill("123456789");
  await page.getByLabel("Título de eleitor").fill("123456789012");
  await page.getByLabel("CTPS").fill("1234567");
  await page.getByRole("button", { name: "Validar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("V — Válido");
  await expect(resultado.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByTestId("selo-doc-especial")).toHaveCount(0);
});

test("CPF inválido e RG curto → I com 2 erros na ordem CPF, RG", async ({ page }) => {
  await page.goto("/validacao/documentos");
  await page.getByLabel("CPF").fill("01234567891");
  await page.getByLabel("RG").fill("1234");
  await page.getByRole("button", { name: "Validar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("I — Inválido");
  await expect(resultado.getByRole("listitem")).toHaveText(["CPF INVALIDO", "RG INVALIDO OU FORMATO INCORRETO"]);
  // O operador conserva o que digitou.
  await expect(page.getByLabel("CPF")).toHaveValue("012.345.678-91");
});

test("prefixo especial sem o flag → sem selo e erros mantidos", async ({ page }) => {
  await page.goto("/validacao/documentos");
  await page.getByLabel("CPF").fill("00100000000");
  await page.getByRole("button", { name: "Validar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado.getByRole("listitem")).toHaveText(["CPF INVALIDO", "RG INVALIDO OU FORMATO INCORRETO"]);
  await expect(page.getByTestId("selo-doc-especial")).toHaveCount(0);
});
