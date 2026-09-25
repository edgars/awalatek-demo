import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";

// Story 7.1 — relatório analítico de pagamentos (RELPGT, somente leitura).
// Outros specs gravam pagamentos na mesma base em paralelo: este usa só as
// competências 1993-01 / 1993-02 e os números 97101+, e limpa por numPagamento.

test.describe.configure({ mode: "serial" });

const CPF_MARIA = "01234567890"; // seed: PA01
const CPF_JOSE = "12345678062"; // seed: PP01
const NUMS_EXTRA = Array.from({ length: 56 }, (_, i) => 97111 + i); // PT01 em 1993-02
const NUMS = [97101, 97102, 97103, 97104, 97105, ...NUMS_EXTRA];
const NOSSOS = { numPagamento: { in: NUMS } };

let db: PrismaClient;

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  const ana = await db.beneficiario.findFirst({ where: { nomeCompleto: "ANA PAULA SOUZA" }, select: { numCpf: true } });
  if (!ana) throw new Error("seed do e2e sem a beneficiária esperada");
  await db.pagamento.deleteMany({ where: NOSSOS });
  const base = { vlrBruto: 50000, vlrDescontoTotal: 1500, vlrLiquido: 48500, vlrAbono: 1000, tipoPgto: "N", sitPagamento: "G", dtGeracao: 19930101, hrGeracao: 101500, usrInclusao: "BATCH" };
  await db.pagamento.createMany({
    data: [
      { ...base, numPagamento: 97101, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199301 },
      { ...base, numPagamento: 97102, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199301, sitPagamento: "C", tipoPgto: "D", vlrBruto: 70000 },
      { ...base, numPagamento: 97103, numCpf: CPF_JOSE, codPrograma: "PP01", anoMesRef: 199301, sitPagamento: "P" },
      { ...base, numPagamento: 97104, numCpf: CPF_JOSE, codPrograma: "PP01", anoMesRef: 199302 },
      { ...base, numPagamento: 97105, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199302 },
      ...NUMS_EXTRA.map((n) => ({ ...base, numPagamento: n, numCpf: ana.numCpf, codPrograma: "PT01", anoMesRef: 199302 })),
    ],
  });
});

test.afterAll(async () => {
  await db?.pagamento.deleteMany({ where: NOSSOS });
  await db?.$disconnect();
});

async function gerar(page: Page, ini: string, fim: string, programa = "") {
  await page.getByLabel("Competência inicial").fill(ini);
  await page.getByLabel("Competência final").fill(fim);
  await page.getByLabel("Programa").selectOption(programa);
  await page.getByRole("button", { name: "Gerar relatório" }).click();
}

const subtotais = (page: Page) => page.getByTestId("subtotal-programa");

test("menu Relatórios → filtros; corte por programa, descrições, máscara e total geral", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const grupo = menu.locator("div").filter({ has: page.getByRole("heading", { name: "Relatórios" }) });
  await grupo.getByRole("link", { name: "Pagamentos" }).click();
  await expect(page).toHaveURL(/\/relatorios\/pagamentos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Relatório de pagamentos" })).toBeVisible();
  await expect(grupo.getByRole("link", { name: "Pagamentos" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Informe a competência inicial e a final.")).toBeVisible();

  await gerar(page, "1993-01", "1993-01");
  await expect(page).toHaveURL(/compIni=199301.*compFim=199301/);
  const tabela = page.getByRole("table", { name: "Relatório de pagamentos" });
  const linhas = tabela.getByRole("row");
  await expect(linhas).toHaveCount(6); // cabeçalho + 3 detalhes + 2 subtotais
  await expect(linhas.nth(1)).toContainText("1993-01");
  await expect(linhas.nth(1)).toContainText("***.345.678-90");
  await expect(linhas.nth(1)).toContainText("MARIA APARECIDA DA SILVA");
  await expect(linhas.nth(1)).toContainText("NORMAL");
  await expect(linhas.nth(1)).toContainText("GERADO");
  await expect(linhas.nth(2)).toContainText("DECIMO");
  await expect(linhas.nth(2)).toContainText("CANCELAD");
  await expect(linhas.nth(3)).toContainText("SUBTOTAL PROGRAMA: PA01 · QTD: 2");
  await expect(linhas.nth(3)).toContainText("R$ 1.200,00");
  await expect(linhas.nth(3)).toContainText("R$ 970,00");
  await expect(linhas.nth(4)).toContainText("***.456.780-62");
  await expect(linhas.nth(4)).toContainText("PAGO");
  await expect(linhas.nth(5)).toContainText("SUBTOTAL PROGRAMA: PP01 · QTD: 1");
  await expect(tabela).not.toContainText(CPF_MARIA);
  await expect(tabela).not.toContainText(CPF_JOSE);

  const total = page.getByTestId("total-geral");
  await expect(total).toContainText("TOTAL GERAL QTD:3");
  await expect(total).toContainText("R$ 1.700,00");
  await expect(total).toContainText("R$ 45,00");
  await expect(total).toContainText("R$ 1.455,00");
  await expect(total).toContainText("TOTAL ABONO:R$ 30,00");
});

test("filtro de programa: PP01 em 1993-01..1993-02 funde os registros consecutivos", async ({ page }) => {
  await page.goto("/relatorios/pagamentos");
  await gerar(page, "1993-01", "1993-02", "PP01");
  await expect(page).toHaveURL(/programa=PP01/);
  await expect(subtotais(page)).toHaveCount(1);
  await expect(subtotais(page)).toContainText("SUBTOTAL PROGRAMA: PP01 · QTD: 2");
  await expect(page.getByTestId("total-geral")).toContainText("TOTAL GERAL QTD:2");
  await expect(page.getByLabel("Programa")).toHaveValue("PP01");
});

test("tramos por competência e paginação de 66 linhas na tela", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199301&compFim=199302");
  await expect(page.getByText("61 pagamentos · página 1 de 2")).toBeVisible();
  // Corte entre registros consecutivos: PA01 e PP01 aparecem uma vez por competência.
  await expect(subtotais(page)).toHaveCount(4);
  for (const [i, prog] of ["PA01", "PP01", "PA01", "PP01"].entries()) {
    await expect(subtotais(page).nth(i)).toContainText(`SUBTOTAL PROGRAMA: ${prog}`);
  }
  // 43 detalhes + 4 subtotais na página 1 (cabeçalho em 6, subtotal soma 3).
  await expect(page.getByRole("table", { name: "Relatório de pagamentos" }).getByRole("row")).toHaveCount(48);

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByText("61 pagamentos · página 2 de 2")).toBeVisible();
  await expect(page.getByRole("table", { name: "Relatório de pagamentos" }).getByRole("row")).toHaveCount(20); // cab. + 18 + subtotal
  await expect(subtotais(page)).toHaveCount(1);
  await expect(subtotais(page)).toContainText("SUBTOTAL PROGRAMA: PT01 · QTD: 56");
  await expect(page.getByTestId("total-geral")).toContainText("TOTAL GERAL QTD:61");
});

test("versão para impressão: todas as páginas com o cabeçalho literal", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199301&compFim=199302");
  await page.getByRole("link", { name: "Versão para impressão" }).click();
  await expect(page).toHaveURL(/impressao=1/);
  const versao = page.getByTestId("versao-impressao");
  const cabecalhos = versao.getByTestId("cabecalho-relatorio");
  await expect(cabecalhos).toHaveCount(2);
  for (const [i, c] of [0, 1].entries()) {
    await expect(cabecalhos.nth(c)).toContainText("SIFAP - RELATORIO ANALITICO DE PAGAMENTOS");
    await expect(cabecalhos.nth(c)).toContainText(`PAG: ${i + 1}`);
    await expect(cabecalhos.nth(c)).toContainText("PERIODO: 199301 A 199302");
    await expect(cabecalhos.nth(c)).toContainText(/DATA: \d{8}/);
  }
  await expect(versao.getByTestId("subtotal-programa")).toHaveCount(5);
  await expect(versao.getByTestId("total-geral")).toContainText("TOTAL GERAL QTD:61");
  await expect(page.getByRole("button", { name: "Imprimir" })).toBeVisible();

  // Em mídia de impressão a barra lateral some.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Voltar ao relatório" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("link", { name: "Voltar ao relatório" }).click();
  await expect(page).not.toHaveURL(/impressao=1/);
});

test("página além do fim → última página", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199301&compFim=199302&pagina=99");
  await expect(page.getByText("61 pagamentos · página 2 de 2")).toBeVisible();
  await expect(subtotais(page)).toHaveCount(1);
  await expect(subtotais(page)).toContainText("SUBTOTAL PROGRAMA: PT01 · QTD: 56");
});

test("Limpar zera os campos e volta ao aviso", async ({ page }) => {
  await page.goto("/relatorios/pagamentos");
  await gerar(page, "1993-01", "1993-02", "PP01");
  await expect(subtotais(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/relatorios\/pagamentos$/);
  await expect(page.getByText("Informe a competência inicial e a final.")).toBeVisible();
  await expect(page.getByLabel("Competência inicial")).toHaveValue("");
  await expect(page.getByLabel("Competência final")).toHaveValue("");
  await expect(page.getByLabel("Programa")).toHaveValue("");
  await expect(page.getByTestId("total-geral")).toHaveCount(0);
});

test("validação dos filtros: período invertido, competência e programa inválidos", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199302&compFim=199301");
  await expect(page.getByText("Competência inicial maior que a final.")).toBeVisible();
  await expect(page.getByText("Informe a competência inicial e a final.")).toHaveCount(0);
  await expect(page.getByText("Nenhum pagamento no período")).toHaveCount(0);
  await expect(page.getByTestId("total-geral")).toHaveCount(0);

  await page.goto("/relatorios/pagamentos?compIni=1993-13&compFim=199301");
  await expect(page.getByText("Competência inválida.")).toHaveCount(1);
  await expect(page.getByText("Informe a competência inicial e a final.")).toHaveCount(0);
  await expect(page.getByTestId("total-geral")).toHaveCount(0);

  await page.goto("/relatorios/pagamentos?compIni=199301&compFim=199301&programa=%21%21");
  await expect(page.getByText("Programa inválido.")).toBeVisible();
  await expect(page.getByTestId("total-geral")).toHaveCount(0);

  // Código válido mas fora da lista: vira opção extra e o select reflete o filtro.
  await page.goto("/relatorios/pagamentos?compIni=199301&compFim=199301&programa=ZZ99");
  await expect(page.getByLabel("Programa")).toHaveValue("ZZ99");
  await expect(page.getByText("Nenhum pagamento no período")).toBeVisible();
});

test("versão para impressão de período vazio mostra o estado vazio", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199303&compFim=199303&impressao=1");
  const versao = page.getByTestId("versao-impressao");
  await expect(versao.getByText("Nenhum pagamento no período")).toBeVisible();
  await expect(versao.getByTestId("cabecalho-relatorio")).toHaveCount(0);
  await expect(versao.getByTestId("total-geral")).toContainText("TOTAL GERAL QTD:0");
});

test("período sem pagamentos: estado vazio e totais zero; somente leitura", async ({ page }) => {
  await page.goto("/relatorios/pagamentos?compIni=199303&compFim=199303");
  await expect(page.getByText("Nenhum pagamento no período")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByTestId("total-geral")).toContainText("TOTAL GERAL QTD:0");
  await expect(page.getByTestId("total-geral")).toContainText("TOTAL ABONO:R$ 0,00");

  // Só o formulário de filtro (GET); nenhuma Server Action.
  await expect(page.locator('form:not([method="get"])')).toHaveCount(0);
  await expect(page.locator('input[name^="$ACTION"]')).toHaveCount(0);
  const antes = await db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" } });
  const r = await page.request.post("/relatorios/pagamentos", { headers: { "Next-Action": "0000000000000000000000000000000000000000" }, data: "[]" });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(await db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" } })).toEqual(antes);
});
