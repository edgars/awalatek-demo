import { expect, test, type Page } from "@playwright/test";

// Story 1.2 — alteração, desativação e reativação de programa. Usa um programa próprio
// (Z1xx), criado aqui, para não afetar PA01/PP01/PT01 usados pelos demais specs.

test.describe.configure({ mode: "serial" });

async function criarPrograma(page: Page, cod: string) {
  await page.goto("/programas/novo");
  await page.getByLabel("Código do programa").fill(cod);
  await page.getByLabel("Nome").fill(`Programa Alteracao ${cod}`);
  await page.getByLabel("Tipo").selectOption("A");
  await page.getByLabel("Valor base").fill("150,00");
  await page.getByLabel("Fator de reajuste").fill("0,0450");
  await page.getByLabel("Data início").fill("2026-01-01");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ 152,34");
}

test("editar: nome sem recalcular, depois valor base recalculado pelo fator K", async ({ page }) => {
  await criarPrograma(page, "Z101");

  await page.goto("/programas?q=Z101");
  await page.getByRole("link", { name: "Editar programa Z101" }).click();
  await expect(page).toHaveURL(/\/programas\/Z101\/editar$/);
  await expect(page.getByLabel("Código do programa")).toHaveValue("Z101");
  await expect(page.getByLabel("Código do programa")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Nome")).toHaveValue("Programa Alteracao Z101");
  await expect(page.getByLabel("Fator de reajuste")).toHaveValue("0,0450");
  await expect(page.getByLabel("Valor base")).toHaveValue("");
  await expect(page.getByText("Valor base gravado (ajustado): R$ 152,34")).toBeVisible();

  // Só o nome e as idades: valor base intacto (sem aplicar FATOR-K de novo).
  await page.getByLabel("Nome").fill("Programa Editado Z101");
  await page.getByLabel("Idade mínima").fill("18");
  await page.getByRole("button", { name: "Gravar" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("Programa alterado com sucesso.");

  // Segunda gravação na mesma página: a versão foi atualizada, sem conflito.
  await page.getByLabel("Valor base").fill("200,00");
  await page.getByLabel("Fator de reajuste").fill("0,05");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("Programa alterado com sucesso. VLR AJUSTADO: R$ 203,47");

  await page.goto("/programas/Z101");
  await expect(page.getByText("Programa Editado Z101")).toBeVisible();
  await expect(page.getByText("R$ 203,47")).toBeVisible();
  await expect(page.getByText("1,017360")).toBeVisible();
});

test("editar: validação da inclusão e fator sem valor base; nada gravado", async ({ page }) => {
  await page.goto("/programas/Z101/editar");
  await page.getByLabel("Nome").fill("");
  await page.getByLabel("Idade máxima").fill("abc");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByText("Nome: obrigatório").first()).toBeVisible();
  await expect(page.getByLabel("Nome")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Idade máxima: valor inválido").first()).toBeVisible();

  await page.getByLabel("Nome").fill("Nome Que Nao Grava");
  await page.getByLabel("Idade máxima").fill("0");
  await page.getByLabel("Fator de reajuste").fill("0,1");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByText("Valor base: informe o valor base para recalcular com o novo fator de reajuste").first()).toBeVisible();

  await page.goto("/programas/Z101");
  await expect(page.getByText("Nome Que Nao Grava")).toHaveCount(0);
});

test("concorrência: versão desatualizada é recusada", async ({ page, context }) => {
  await page.goto("/programas/Z101/editar");
  const outra = await context.newPage();
  await outra.goto("/programas/Z101/editar");
  await outra.getByLabel("Nome").fill("Alterado Na Outra Aba");
  await outra.getByRole("button", { name: "Gravar" }).click();
  await expect(outra.getByTestId("resultado-legado")).toContainText("Programa alterado com sucesso.");

  await page.getByLabel("Nome").fill("Alteracao Atrasada");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("Programa alterado por outro usuário. Recarregue a página.");
});

test("desativar com confirmação (badge I) e reativar", async ({ page }) => {
  await page.goto("/programas/Z101");
  await expect(page.getByText("A — Ativo")).toBeVisible();

  // Cancelar não altera nada.
  await page.getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Desativar o programa Z101? Beneficiários deste programa deixam de ser pagos no lote e são inelegíveis (PROGRAMA INATIVO).",
  );
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("A — Ativo")).toBeVisible();

  await page.getByRole("button", { name: "Desativar" }).click();
  await page.getByRole("button", { name: "Confirmar desativar" }).click();
  await expect(page.getByTestId("resultado-situacao")).toContainText("Programa Z101 desativado.");
  await expect(page.getByText("I — Inativo")).toBeVisible();

  await page.goto("/programas?q=Z101");
  await expect(page.getByRole("table").getByText("I — Inativo")).toBeVisible();

  await page.goto("/programas/Z101");
  await page.getByRole("button", { name: "Reativar" }).click();
  await page.getByRole("button", { name: "Confirmar reativar" }).click();
  await expect(page.getByTestId("resultado-situacao")).toContainText("Programa Z101 reativado.");
  await expect(page.getByText("A — Ativo")).toBeVisible();
  await expect(page.getByRole("button", { name: /excluir/i })).toHaveCount(0);
});

test("alterar inexistente → PROGRAMA NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/programas/ZZZZ/editar");
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA NAO ENCONTRADO");
});
