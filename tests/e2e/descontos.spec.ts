import { expect, test } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";

// Story 4.3 — recálculo de descontos (CALCDSCT) contra a base dedicada do e2e.
// Seed: MARIA (012.345.678-90) com 1 desconto registrado J de 25,00 (início 01/03/2025, sem fim);
// JOSE (123.456.780-62). O spec grava seus próprios pagamentos numa competência exclusiva
// (1991-01) e com números exclusivos; toda asserção se restringe a eles.

test.describe.configure({ mode: "serial" });

const CPF_MARIA = "01234567890";
const CPF_JOSE = "12345678062";
const COMP = 199101;
const PGTO_MARIA = 991301;
const PGTO_JOSE = 991302;
const NOSSOS = { numPagamento: { in: [PGTO_MARIA, PGTO_JOSE] }, anoMesRef: COMP };

let db: PrismaClient;

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  await db.pagamento.deleteMany({ where: NOSSOS });
  const base = {
    anoMesRef: COMP,
    vlrBruto: 80000,
    vlrLiquido: 77600,
    vlrDescontoTotal: 2400,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 19910101,
    hrGeracao: 100000,
    usrInclusao: "BATCH",
  };
  await db.pagamento.create({ data: { ...base, numPagamento: PGTO_MARIA, numCpf: CPF_MARIA, codPrograma: "PA01" } });
  await db.pagamento.create({ data: { ...base, numPagamento: PGTO_JOSE, numCpf: CPF_JOSE, codPrograma: "PP01" } });
});

test.afterAll(async () => {
  await db.pagamento.deleteMany({ where: NOSSOS });
  await db.$disconnect();
});

test("recalcula os descontos → DESCONTOS CALCULADOS, tabela e aviso D13", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Cálculo de descontos" }).click();
  await expect(page).toHaveURL(/\/descontos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cálculo de descontos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cálculo de descontos" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  await page.getByLabel("Nº do pagamento").fill(String(PGTO_MARIA));
  await page.getByRole("button", { name: "Calcular descontos" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("DESCONTOS CALCULADOS");
  await expect(resumo).toContainText("***.***.678-90");
  await expect(resumo).toContainText("01/1991");
  await expect(resumo).toContainText("R$ 800,00"); // bruto
  await expect(resumo).toContainText("R$ 65,00"); // 40,00 (contribuição 5 %) + 25,00 (J)
  await expect(resumo).toContainText("R$ 240,00"); // teto 30 %
  await expect(resumo).toContainText("R$ 40,00"); // contribuição
  const linha = resumo.getByTestId("desconto-1");
  await expect(linha).toContainText("J — Judicial");
  await expect(linha).toContainText("R$ 25,00");
  await expect(linha).toContainText("Aplicado");
  await expect(page.getByTestId("aviso-d13")).toContainText("O valor líquido não é recalculado (regra legada D13)");
  await expect(page.getByTestId("aviso-d13")).toContainText("R$ 776,00");

  const p = await db.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_MARIA }, include: { descontos: true } });
  expect(p.vlrDescontoTotal).toBe(6500);
  expect(p.vlrLiquido).toBe(77600);
  expect(p.usrUltAlteracao).toBe("E2EUSER");
  expect(p.descontos.map((d) => [d.occurrence, d.tipoDesconto, d.vlrDesconto])).toEqual([[1, "J", 2500]]);
});

test("pagamento de outro CPF → PAGAMENTO NAO ENCONTRADO e nada gravado", async ({ page }) => {
  await page.goto("/descontos");
  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  await page.getByLabel("Nº do pagamento").fill(String(PGTO_JOSE));
  await page.getByRole("button", { name: "Calcular descontos" }).click();

  await expect(page.getByTestId("resultado-legado")).toContainText("PAGAMENTO NAO ENCONTRADO");
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
  const p = await db.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_JOSE }, include: { descontos: true } });
  expect(p.vlrDescontoTotal).toBe(2400);
  expect(p.usrUltAlteracao).toBe("");
  expect(p.descontos).toEqual([]);
});
