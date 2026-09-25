import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { competenciaDaData } from "@/domain/calculo/motor";
import { hoje, intParaCompetencia } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";

// Story 4.2 — lote mensal (BATCHPGT) contra a base dedicada do e2e. A competência é
// a do dia (a tela não aceita outra). Outros specs gravam pagamentos e beneficiários
// na mesma base em paralelo, então as asserções se limitam à competência do dia e aos
// pagamentos do próprio lote (usrInclusao BATCH), sem contar totais globais.

test.describe.configure({ mode: "serial" });

const CPF_MARIA = "01234567890"; // único A do seed
const COMPETENCIA = competenciaDaData(hoje().data);
const COMPETENCIA_ISO = intParaCompetencia(COMPETENCIA) ?? "";
const COMPETENCIA_TEXTO = `${COMPETENCIA_ISO.slice(5, 7)}/${COMPETENCIA_ISO.slice(0, 4)}`;

let db: PrismaClient;

test.beforeAll(() => {
  db = createPrismaClient("file:./e2e.db");
});

test.afterAll(async () => {
  await db?.$disconnect();
});

async function executarLote(page: Page) {
  await page.getByRole("button", { name: "Executar lote" }).click();
  const confirmacao = page.getByRole("alertdialog");
  await expect(confirmacao).toContainText(`Gerar pagamentos da competência ${COMPETENCIA_ISO} para todos os beneficiários ativos?`);
  await confirmacao.getByRole("button", { name: "Confirmar" }).click();
  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("BATCHPGT - RESUMO PROCESSAMENTO");
  return resumo;
}

/** Pagamentos do lote na competência do dia, agrupados por CPF. */
async function pagamentosDoLotePorCpf(): Promise<Map<string, number>> {
  const linhas = await db.pagamento.findMany({ where: { anoMesRef: COMPETENCIA, usrInclusao: "BATCH" }, select: { numCpf: true } });
  const porCpf = new Map<string, number>();
  for (const l of linhas) porCpf.set(l.numCpf, (porCpf.get(l.numCpf) ?? 0) + 1);
  return porCpf;
}

test("menu → competência atual; cancelar a confirmação não executa", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Lote mensal" }).click();
  await expect(page).toHaveURL(/\/lote$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lote mensal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lote mensal" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("competencia-lote")).toHaveText(COMPETENCIA_ISO);
  await expect(page.getByTestId("pagamentos-existentes")).toHaveText(/^\d+$/);

  await page.getByRole("button", { name: "Executar lote" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Gerar pagamentos da competência ${COMPETENCIA_ISO}`);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
});

test("executar com confirmação → resumo; segunda execução não duplica pagamentos", async ({ page }) => {
  await page.goto("/lote");
  const resumo = await executarLote(page);
  await expect(resumo).toContainText(COMPETENCIA_TEXTO);
  for (const rotulo of ["TOTAL PROCESSADOS", "PAGTOS GERADOS", "IGNORADOS", "ERROS", "VLR TOTAL BRUTO", "VLR TOTAL DESC", "VLR TOTAL LIQUIDO", "VLR TOTAL ABONO"]) {
    await expect(resumo).toContainText(rotulo);
  }
  // MARIA (ativa) tem pagamento na competência: do lote ou de um cálculo individual prévio.
  expect(await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } })).toBeGreaterThanOrEqual(1);
  const mariaAntes = await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } });
  const antes = await pagamentosDoLotePorCpf();
  // A contagem de existentes na tela é atualizada após a execução.
  await expect(page.getByTestId("pagamentos-existentes")).not.toHaveText("0");

  await page.reload();
  const segundo = await executarLote(page);
  await expect(segundo).toContainText(COMPETENCIA_TEXTO);
  const depois = await pagamentosDoLotePorCpf();
  // Nenhum CPF que já tinha pagamento do lote ganhou outro; nenhum CPF tem dois.
  for (const [cpf, n] of antes) expect(depois.get(cpf), cpf).toBe(n);
  for (const n of depois.values()) expect(n).toBe(1);
  expect(await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } })).toBe(mariaAntes);
});
