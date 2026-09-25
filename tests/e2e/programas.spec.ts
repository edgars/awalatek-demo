import { expect, test } from "@playwright/test";

// Fluxo F1 (story 1.1) contra a base dedicada do e2e (seed: PA01, PP01, PT01).

test.describe.configure({ mode: "serial" });

test("F1 — incluir, ver valor ajustado, consultar e adicionar uma faixa", async ({ page }) => {
  await page.goto("/programas");
  await expect(page.getByRole("heading", { level: 1, name: "Programas sociais" })).toBeVisible();
  await page.getByRole("link", { name: "Novo programa" }).first().click();
  await expect(page).toHaveURL(/\/programas\/novo$/);

  await page.getByLabel("Código do programa").fill("px01");
  await page.getByLabel("Nome").fill("Programa de Renda E2E");
  await page.getByLabel("Tipo").selectOption("A");
  await page.getByLabel("Valor base").fill("150,00");
  await page.getByLabel("Fator de reajuste").fill("0,0450");
  await page.getByLabel("Data início").fill("2026-01-01");
  await page.getByRole("button", { name: "Gravar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ 152,34");

  // Código duplicado: nada gravado, mensagem literal no painel.
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("PROGRAMA JA CADASTRADO");

  await page.goto("/programas/PX01");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PX01");
  await expect(page.getByText("Programa de Renda E2E")).toBeVisible();
  await expect(page.getByText("R$ 152,34")).toBeVisible();
  await expect(page.getByText("1,015624")).toBeVisible();
  await expect(page.getByText("Parâmetros informativos — o cálculo usa as tabelas legadas (D1)")).toBeVisible();
  // Sem ações de alterar/excluir o programa.
  await expect(page.getByRole("button", { name: /alterar|excluir|editar programa/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /alterar|excluir|editar programa/i })).toHaveCount(0);

  // Duas faixas; a faixa 2 primeiro com fator inválido (5 casas).
  await page.getByRole("button", { name: "Adicionar faixa" }).click();
  await page.getByRole("button", { name: "Adicionar faixa" }).click();
  await page.getByLabel("Renda fim (faixa 1)").fill("500,00");
  await page.getByLabel("Fator multiplicador (faixa 1)").fill("1,2");
  await page.getByLabel("Valor adicional (faixa 1)").fill("10,00");
  await page.getByLabel("Acumulativo (faixa 1)").selectOption("S");
  await page.getByLabel("Renda início (faixa 2)").fill("500,01");
  await page.getByLabel("Renda fim (faixa 2)").fill("900,00");
  await page.getByLabel("Fator multiplicador (faixa 2)").fill("1,23456");
  await page.getByRole("button", { name: "Gravar faixas" }).click();
  await expect(page.getByText(/^Faixa 2 — Fator multiplicador:/)).toBeVisible();
  await expect(page.getByLabel("Fator multiplicador (faixa 2)")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Fator multiplicador (faixa 2)").fill("1,5");
  await page.getByRole("button", { name: "Gravar faixas" }).click();
  await expect(page.getByText("Faixas de cálculo gravadas (2).")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Renda fim (faixa 1)")).toHaveValue("500,00");
  await expect(page.getByLabel("Fator multiplicador (faixa 1)")).toHaveValue("1,2000");
  await expect(page.getByLabel("Acumulativo (faixa 1)")).toHaveValue("S");
  await expect(page.getByLabel("Renda início (faixa 2)")).toHaveValue("500,01");
  await expect(page.getByLabel("Renda fim (faixa 2)")).toHaveValue("900,00");
  await expect(page.getByLabel("Fator multiplicador (faixa 2)")).toHaveValue("1,5000");
  await expect(page.getByLabel("Acumulativo (faixa 2)")).toHaveValue("N");

  // Parâmetro regional.
  await page.getByRole("button", { name: "Adicionar parâmetro" }).click();
  await page.getByLabel("Código região (parâmetro 1)").fill("03");
  await page.getByLabel("Fator regional (parâmetro 1)").fill("1,1");
  await page.getByLabel("Complemento (parâmetro 1)").fill("5,00");
  await page.getByLabel("Ativo (parâmetro 1)").selectOption("N");
  await page.getByRole("button", { name: "Gravar parâmetros" }).click();
  await expect(page.getByText("Parâmetros regionais gravados (1).")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Código região (parâmetro 1)")).toHaveValue("03");
  await expect(page.getByLabel("Fator regional (parâmetro 1)")).toHaveValue("1,1000");
  await expect(page.getByLabel("Complemento (parâmetro 1)")).toHaveValue("5,00");
  await expect(page.getByLabel("Ativo (parâmetro 1)")).toHaveValue("N");
});

test("tipo inválido é recusado no campo tipo", async ({ page }) => {
  await page.goto("/programas/novo");
  await page.getByLabel("Código do programa").fill("PX02");
  await page.getByLabel("Nome").fill("Sem tipo");
  await page.getByLabel("Valor base").fill("10,00");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByText("Tipo: informe A, P ou T").first()).toBeVisible();
  await expect(page.getByLabel("Tipo")).toHaveAttribute("aria-invalid", "true");
  await page.goto("/programas/PX02");
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA NAO ENCONTRADO");
});

test("consulta inexistente mostra PROGRAMA NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/programas/ZZZZ");
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA NAO ENCONTRADO");
});

test("busca por nome sem distinguir maiúsculas", async ({ page }) => {
  await page.goto("/programas?q=renda");
  const tabela = page.getByRole("table");
  await expect(tabela.getByRole("link", { name: "PP01" })).toBeVisible();
  await expect(tabela.getByRole("link", { name: "PA01" })).toHaveCount(0);
  await expect(tabela.getByRole("link", { name: "PT01" })).toHaveCount(0);
});
