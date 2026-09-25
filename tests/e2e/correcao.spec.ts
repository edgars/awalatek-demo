import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";

// Story 5.1 — correção retroativa (CALCCORR) contra a base do e2e. O seed não tem
// pagamentos: o spec grava os seus para FRANCISCO (situação I, nenhum outro spec o usa)
// em competências 2011–2012 e números 95101+, e só verifica esses dados.

test.describe.configure({ mode: "serial" });

const CPF_FRANCISCO = "34567890256"; // seed: base 345678902 + DV, PA01
const NUMS = [95101, 95102];
const NOSSOS = { numPagamento: { in: NUMS }, numCpf: CPF_FRANCISCO };

let db: PrismaClient;

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  const francisco = await db.beneficiario.findUnique({ where: { numCpf: CPF_FRANCISCO }, select: { id: true } });
  if (!francisco) throw new Error("seed do e2e sem o beneficiário esperado");
  // Por número (de cualquier CPF) y por CPF: ni un número ya usado ni restos de otra ejecución rompen el spec.
  await db.pagamento.deleteMany({ where: { OR: [{ numPagamento: { in: NUMS } }, { numCpf: CPF_FRANCISCO }] } });
  const base = { numCpf: CPF_FRANCISCO, codPrograma: "PA01", sitPagamento: "G", tipoPgto: "N", dtGeracao: 20260901, hrGeracao: 101500, usrInclusao: "BATCH" };
  await db.pagamento.createMany({
    data: [
      { ...base, numPagamento: 95101, anoMesRef: 201103, vlrBruto: 10000, vlrLiquido: 10000 }, // × 1,0079 → 100,79
      { ...base, numPagamento: 95102, anoMesRef: 201207, vlrBruto: 48500, vlrLiquido: 48500 }, // × 1,0043 → 487,08
    ],
  });
});

test.afterAll(async () => {
  await db?.$disconnect();
});

async function preencher(page: Page, ini: string, fim: string) {
  await page.getByLabel("CPF do beneficiário").fill(CPF_FRANCISCO);
  await page.getByLabel("Competência inicial").fill(ini);
  await page.getByLabel("Competência final").fill(fim);
  await page.getByRole("button", { name: "Corrigir" }).click();
}

test("período invertido → PERIODO INVALIDO - COMP INICIAL > FINAL, nada gravado", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Correção retroativa" }).click();
  await expect(page).toHaveURL(/\/correcao$/);
  await expect(page.getByRole("heading", { level: 1, name: "Correção retroativa" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Correção retroativa" })).toHaveAttribute("aria-current", "page");

  await preencher(page, "2012-05", "2012-01");
  await expect(page.getByTestId("resultado-legado")).toContainText("PERIODO INVALIDO - COMP INICIAL > FINAL");
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
  expect(await db.pagamento.count({ where: { ...NOSSOS, indCorrigido: "S" } })).toBe(0);
});

test("corrige os pagamentos do período → resumo e tabela com as diferenças", async ({ page }) => {
  await page.goto("/correcao");
  await preencher(page, "2011-01", "2012-12");

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("CORRECAO RETROATIVA FINALIZADA");
  await expect(resumo.getByRole("definition").first()).toHaveText("2");
  await expect(resumo).toContainText("R$ 2,87"); // 0,79 + 2,08 (soma das diferenças)

  const tabela = page.getByRole("table", { name: "Pagamentos corrigidos" });
  const l1 = tabela.getByRole("row").filter({ hasText: "95101" });
  await expect(l1).toContainText("03/2011");
  await expect(l1).toContainText("R$ 100,00");
  await expect(l1).toContainText("R$ 100,79");
  await expect(l1).toContainText("R$ 0,79");
  const l2 = tabela.getByRole("row").filter({ hasText: "95102" });
  await expect(l2).toContainText("07/2012");
  await expect(l2).toContainText("R$ 487,08");
  await expect(l2).toContainText("R$ 2,08");

  const gravados = await db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" } });
  expect(gravados.map((p) => [p.vlrCorrecao, p.indCorrigido])).toEqual([
    [10079, "S"],
    [48708, "S"],
  ]);

  await l1.getByRole("link", { name: "95101" }).click();
  await expect(page).toHaveURL(/\/pagamentos\/95101$/);
});

test("re-execução do mesmo período → 0 registros, nada muda", async ({ page }) => {
  const antes = await db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" } });
  await page.goto("/correcao");
  await preencher(page, "2011-01", "2012-12");

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("CORRECAO RETROATIVA FINALIZADA");
  await expect(resumo.getByRole("definition").first()).toHaveText("0");
  await expect(resumo).toContainText("R$ 0,00");
  await expect(page.getByRole("table", { name: "Pagamentos corrigidos" })).toHaveCount(0);
  expect(await db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" } })).toEqual(antes);
});
