import { expect, test } from "@playwright/test";

// Story 2.2 contra a base dedicada do e2e (seed: MARIA APARECIDA DA SILVA, CPF 012.345.678-90, SP, A).

test("carregar beneficiário do seed e validar → V", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Cadastral" }).click();
  await expect(page).toHaveURL(/\/validacao\/cadastro$/);
  await expect(page.getByRole("heading", { level: 1, name: "Validação cadastral" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastral" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF").fill("01234567890");
  await page.getByRole("button", { name: "Carregar do cadastro" }).click();
  await expect(page.getByLabel("Nome")).toHaveValue("MARIA APARECIDA DA SILVA");
  await expect(page.getByLabel("CPF")).toHaveValue("012.345.678-90");
  await expect(page.getByLabel("Data de nascimento")).toHaveValue("1985-04-12");
  await expect(page.getByLabel("UF")).toHaveValue("SP");
  await expect(page.getByLabel("Situação")).toHaveValue("A");

  await page.getByRole("button", { name: "Validar" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("V — Válido");
  await expect(resultado.getByRole("listitem")).toHaveCount(0);
});

test("CPF inexistente ao carregar → BENEFICIARIO NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/validacao/cadastro");
  await page.getByLabel("CPF").fill("15975348625");
  await page.getByRole("button", { name: "Carregar do cadastro" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
});

test("dados com vários erros → I com lista numerada na ordem do legado", async ({ page }) => {
  await page.goto("/validacao/cadastro");
  await page.getByLabel("CPF").fill("01234567891");
  await page.getByLabel("Data de nascimento").fill("2999-01-01");
  // Nome vazio, UF em branco (não verificada), situação em branco.
  await page.getByRole("button", { name: "Validar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("I — Inválido");
  const itens = resultado.getByRole("listitem");
  await expect(itens).toHaveText([
    "CPF INVALIDO - DIGITO VERIFICADOR",
    "DATA NASCIMENTO INVALIDA",
    "NOME INVALIDO - DEVE TER NOME E SOBRENOME",
    "STATUS INVALIDO",
  ]);
  // O operador conserva o que digitou.
  await expect(page.getByLabel("CPF")).toHaveValue("012.345.678-91");
});
