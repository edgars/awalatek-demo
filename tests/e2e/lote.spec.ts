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

/** Competência do dia, calculada no momento do teste (não no carregamento do módulo). */
function competenciaAtual() {
  const competencia = competenciaDaData(hoje().data);
  const iso = intParaCompetencia(competencia) ?? "";
  return { competencia, iso, texto: `${iso.slice(5, 7)}/${iso.slice(0, 4)}` };
}

let db: PrismaClient;

test.beforeAll(() => {
  db = createPrismaClient("file:./e2e.db");
});

test.afterAll(async () => {
  await db?.$disconnect();
});

async function executarLote(page: Page, COMPETENCIA_ISO: string) {
  await page.getByRole("button", { name: "Executar lote" }).click();
  const confirmacao = page.getByRole("alertdialog");
  await expect(confirmacao).toContainText(`Gerar pagamentos da competência ${COMPETENCIA_ISO} para todos os beneficiários ativos?`);
  await confirmacao.getByRole("button", { name: "Confirmar" }).click();
  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("BATCHPGT - RESUMO PROCESSAMENTO");
  return resumo;
}

/** Pagamentos do lote na competência do dia, agrupados por CPF. */
async function pagamentosDoLotePorCpf(COMPETENCIA: number): Promise<Map<string, number>> {
  const linhas = await db.pagamento.findMany({ where: { anoMesRef: COMPETENCIA, usrInclusao: "BATCH" }, select: { numCpf: true } });
  const porCpf = new Map<string, number>();
  for (const l of linhas) porCpf.set(l.numCpf, (porCpf.get(l.numCpf) ?? 0) + 1);
  return porCpf;
}

/** Valor de um item do ResumoProcesso (dt → dd seguinte). */
function valorResumo(page: Page, rotulo: string) {
  return page.getByTestId("resumo-processo").locator("dt", { hasText: new RegExp(`^${rotulo}$`) }).locator("xpath=following-sibling::dd[1]");
}

test("menu → competência atual; cancelar a confirmação não executa", async ({ page }) => {
  const { iso: COMPETENCIA_ISO } = competenciaAtual();
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
  const { competencia: COMPETENCIA, iso: COMPETENCIA_ISO, texto: COMPETENCIA_TEXTO } = competenciaAtual();
  await page.goto("/lote");
  const resumo = await executarLote(page, COMPETENCIA_ISO);
  await expect(resumo).toContainText(COMPETENCIA_TEXTO);
  for (const rotulo of ["TOTAL PROCESSADOS", "PAGTOS GERADOS", "IGNORADOS", "ERROS", "VLR TOTAL BRUTO", "VLR TOTAL DESC", "VLR TOTAL LIQUIDO", "VLR TOTAL ABONO"]) {
    await expect(resumo).toContainText(rotulo);
  }
  // MARIA (ativa) tem pagamento na competência: do lote ou de um cálculo individual prévio.
  expect(await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } })).toBeGreaterThanOrEqual(1);
  const mariaAntes = await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } });
  const antes = await pagamentosDoLotePorCpf(COMPETENCIA);
  // A contagem de existentes na tela é atualizada após a execução (outros specs podem
  // gravar em paralelo, então compara com a base no momento da leitura).
  await expect
    .poll(async () => {
      const tela = await page.getByTestId("pagamentos-existentes").textContent();
      return Number(tela) === (await db.pagamento.count({ where: { anoMesRef: COMPETENCIA } }));
    })
    .toBe(true);

  // Re-execução: todos ignorados. Outro spec pode criar um beneficiário ativo entre as
  // execuções (e ele é gerado uma vez); nesse caso re-executa até nada ser gerado (máx. 3).
  for (let tentativa = 1; ; tentativa++) {
    await page.reload();
    const segundo = await executarLote(page, COMPETENCIA_ISO);
    await expect(segundo).toContainText(COMPETENCIA_TEXTO);
    const gerados = Number(await valorResumo(page, "PAGTOS GERADOS").textContent());
    if (gerados === 0 || tentativa === 3) break;
  }
  await expect(valorResumo(page, "PAGTOS GERADOS")).toHaveText("0");
  // MARIA já tem pagamento na competência → aviso de competência já processada.
  await expect(page.getByTestId("aviso-lote")).toBeVisible();
  await expect(valorResumo(page, "IGNORADOS")).toHaveText((await valorResumo(page, "TOTAL PROCESSADOS").textContent()) ?? "-");
  const depois = await pagamentosDoLotePorCpf(COMPETENCIA);
  // Nenhum CPF que já tinha pagamento do lote ganhou outro; nenhum CPF tem dois.
  for (const [cpf, n] of antes) expect(depois.get(cpf), cpf).toBe(n);
  for (const n of depois.values()) expect(n).toBe(1);
  expect(await db.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: COMPETENCIA } })).toBe(mariaAntes);
});
