import { expect, test } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";

// Story 1.2 — alteração, desativação e reativação de programa. Usa programas próprios
// (Z101 ativo, Z102 encerrado), recriados via Prisma antes de cada teste e removidos no
// fim (com a auditoria deles), para não afetar PA01/PP01/PT01 nem depender da ordem.

test.describe.configure({ mode: "serial" });

const CODIGOS = ["Z101", "Z102"];
let db: PrismaClient;

async function limpar() {
  await db.auditoria.deleteMany({ where: { tipoEntidade: "PROGRAMA", idEntidade: { in: CODIGOS } } });
  await db.programaSocial.deleteMany({ where: { codPrograma: { in: CODIGOS } } });
}

function programa(cod: string, sitPrograma: string) {
  // Mesmos valores que a inclusão grava para 150,00 com fator 0,0450 (FATOR-K 1,015624).
  return {
    codPrograma: cod,
    nomePrograma: `Programa Alteracao ${cod}`,
    tipoPrograma: "A",
    dtCriacao: 20260101,
    dtEncerramento: 0,
    sitPrograma,
    vlrBaseIndividual: 15234,
    fatorReajuste: "0.0450",
    fatorK: "1.015624",
    dtInclusao: 20260101,
    usrInclusao: "E2EUSER",
  };
}

test.beforeAll(() => {
  db = createPrismaClient("file:./e2e.db");
});

test.beforeEach(async () => {
  await limpar();
  await db.programaSocial.createMany({ data: [programa("Z101", "A"), programa("Z102", "E")] });
});

test.afterAll(async () => {
  await limpar();
  await db.$disconnect();
});

test("editar: nome sem recalcular, depois valor base recalculado; o formulário mostra o gravado", async ({ page }) => {
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
  await expect(page.getByText("Valor base gravado (ajustado): R$ 152,34")).toBeVisible();

  // Segunda gravação na mesma página: a versão foi atualizada, sem conflito.
  await page.getByLabel("Valor base").fill("200,00");
  await page.getByLabel("Fator de reajuste").fill("0,05");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("Programa alterado com sucesso. VLR AJUSTADO: R$ 203,47");
  // O formulário reflete o que o servidor gravou: referência nova, valor base vazio, fator canônico.
  await expect(page.getByText("Valor base gravado (ajustado): R$ 203,47")).toBeVisible();
  await expect(page.getByLabel("Valor base")).toHaveValue("");
  await expect(page.getByLabel("Fator de reajuste")).toHaveValue("0,0500");
  await expect(page.getByLabel("Nome")).toHaveValue("Programa Editado Z101");

  // Gravar de novo sem mudar nada: nada a gravar.
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("Nenhuma alteração a gravar.");

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

test("concorrência: versão desatualizada é recusada e Recarregar traz o gravado", async ({ page, context }) => {
  await page.goto("/programas/Z101/editar");
  const outra = await context.newPage();
  await outra.goto("/programas/Z101/editar");
  await outra.getByLabel("Nome").fill("Alterado Na Outra Aba");
  await outra.getByRole("button", { name: "Gravar" }).click();
  await expect(outra.getByTestId("resultado-legado")).toContainText("Programa alterado com sucesso.");

  await page.getByLabel("Nome").fill("Alteracao Atrasada");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("Programa alterado por outro usuário. Recarregue a página.");
  await page.getByRole("button", { name: "Recarregar" }).click();
  await expect(page.getByLabel("Nome")).toHaveValue("Alterado Na Outra Aba");
});

test("desativar com confirmação (foco, Escape, badge I) e reativar", async ({ page }) => {
  await page.goto("/programas/Z101");
  await expect(page.getByText("A — Ativo")).toBeVisible();

  // Abrir: foco em "Confirmar"; Escape cancela e devolve o foco ao botão.
  await page.getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Desativar o programa Z101? Beneficiários deste programa deixam de ser pagos no lote e são inelegíveis (PROGRAMA INATIVO).",
  );
  await expect(page.getByRole("button", { name: "Confirmar desativar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desativar" })).toBeFocused();

  // Cancelar também não altera nada.
  await page.getByRole("button", { name: "Desativar" }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: "Desativar" })).toBeFocused();
  await expect(page.getByText("A — Ativo")).toBeVisible();

  await page.getByRole("button", { name: "Desativar" }).click();
  await page.getByRole("button", { name: "Confirmar desativar" }).click();
  await expect(page.getByTestId("resultado-situacao")).toContainText("Programa Z101 desativado.");
  await expect(page.getByText("I — Inativo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reativar" })).toBeFocused();

  await page.goto("/programas?q=Z101");
  await expect(page.getByRole("table").getByText("I — Inativo")).toBeVisible();

  await page.goto("/programas/Z101");
  await page.getByRole("button", { name: "Reativar" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Reativar o programa Z101?");
  await page.getByRole("button", { name: "Confirmar reativar" }).click();
  await expect(page.getByTestId("resultado-situacao")).toContainText("Programa Z101 reativado.");
  await expect(page.getByText("A — Ativo")).toBeVisible();
  await expect(page.getByRole("button", { name: /excluir/i })).toHaveCount(0);
});

test("encerrado (E): sem Editar nem Reativar; /editar recusa", async ({ page }) => {
  await page.goto("/programas/Z102");
  await expect(page.getByText("E — Encerrado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reativar|desativar/i })).toHaveCount(0);

  await page.goto("/programas?q=Z102");
  await expect(page.getByRole("link", { name: "Editar programa Z102" })).toHaveCount(0);

  await page.goto("/programas/Z102/editar");
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA ENCERRADO NAO PODE SER ALTERADO");
  await expect(page.getByLabel("Nome")).toHaveCount(0);
});

test("alterar inexistente → PROGRAMA NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/programas/ZZZZ/editar");
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA NAO ENCONTRADO");
});
