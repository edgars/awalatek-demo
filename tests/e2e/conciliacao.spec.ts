import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv, mascaraCpfLista } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";
import { arquivoRetorno, linhaControle } from "../fixtures/cnab240";

// Story 6.1 — conciliação bancária (BATCHCON) contra a base dedicada do e2e. O spec
// cria o seu beneficiário (status S: o lote o ignora) e os seus pagamentos numa
// competência exclusiva (1992-01) com números 96101+; as asserções de auditoria se
// restringem a esses números (idEntidade).

test.describe.configure({ mode: "serial" });

const CPF_NOSSO = completaDv("996101001");
const COMP = 199201;
const PGTO_OK = 96101; // líquido 150,00; banco 150,00, cód. 00 → P
const PGTO_DIV = 96102; // líquido 200,00; banco 200,02 → divergente
const DOC_INEXISTENTE = 96199;
const NUMS = [PGTO_OK, PGTO_DIV];
const CHAVES = NUMS.map(String);

let db: PrismaClient;

async function limpar() {
  await db.pagamento.deleteMany({ where: { numPagamento: { in: [...NUMS, DOC_INEXISTENTE] } } });
  await db.pagamento.deleteMany({ where: { numCpf: CPF_NOSSO } });
  await db.beneficiario.deleteMany({ where: { numCpf: CPF_NOSSO } });
}

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  await limpar();
  // Restos de uma execução anterior na mesma base (a auditoria só é gravada pelo sistema).
  await db.auditoria.deleteMany({ where: { tipoEntidade: "PAGAMENTO", idEntidade: { in: CHAVES } } });
  await db.beneficiario.create({
    data: {
      numCpf: CPF_NOSSO,
      nomeCompleto: "E2E CONCILIACAO BATCHCON",
      dtNascimento: 19800101,
      sexo: "M",
      codRegiao: 11,
      codPrograma: "PA01",
      dtCadastro: 19910101,
      sitBeneficiario: "S",
      vlrRendaFamiliar: 50000,
    },
  });
  const base = { numCpf: CPF_NOSSO, codPrograma: "PA01", anoMesRef: COMP, tipoPgto: "N", sitPagamento: "G", dtGeracao: 19920105, hrGeracao: 100000, usrInclusao: "BATCH" };
  await db.pagamento.createMany({
    data: [
      { ...base, numPagamento: PGTO_OK, vlrBruto: 15000, vlrLiquido: 15000 },
      { ...base, numPagamento: PGTO_DIV, vlrBruto: 20000, vlrLiquido: 20000 },
    ],
  });
});

test.afterAll(async () => {
  await limpar();
  await db?.$disconnect();
});

async function enviar(page: Page, conteudo: string, nome = "retorno.ret") {
  await page.getByLabel("Competência").fill("1992-01");
  await page.getByLabel("Arquivo de retorno").setInputFiles({ name: nome, mimeType: "text/plain", buffer: Buffer.from(conteudo, "latin1") });
  await page.getByRole("button", { name: "Conciliar" }).click();
}

function valorResumo(page: Page, rotulo: string) {
  return page.getByTestId("resumo-processo").locator("dt", { hasText: rotulo }).locator("xpath=following-sibling::dd[1]");
}

test("menu → tela; cancelar a confirmação não executa", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Conciliação bancária" }).click();
  await expect(page).toHaveURL(/\/conciliacao$/);
  await expect(page.getByRole("heading", { level: 1, name: "Conciliação bancária" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conciliação bancária" })).toHaveAttribute("aria-current", "page");

  await enviar(page, arquivoRetorno([{ cpf: CPF_NOSSO, numDoc: PGTO_OK, valor: 15000 }]));
  await expect(page.getByRole("alertdialog")).toContainText("competência 01/1992");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
  expect(await db.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_OK } })).toMatchObject({ sitPagamento: "G" });
});

test("arquivo sem detalhe → resumo com 0 conciliados e aviso", async ({ page }) => {
  await page.goto("/conciliacao");
  await enviar(page, [linhaControle("0"), linhaControle("9")].join("\n") + "\n", "vazio.txt");
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByTestId("resumo-processo")).toContainText("BATCHCON - RESUMO CONCILIACAO");
  await expect(page.getByTestId("aviso-conciliacao")).toContainText("arquivo sem registros de detalhe");
  await expect(valorResumo(page, "REGISTROS LIDOS")).toHaveText("2");
  await expect(valorResumo(page, "CONCILIADOS")).toHaveText("0");
});

test("conciliado + divergente + não encontrado → resumo, tabelas e auditoria", async ({ page }) => {
  await page.goto("/conciliacao");
  await enviar(
    page,
    arquivoRetorno([
      { cpf: CPF_NOSSO, numDoc: PGTO_OK, valor: 15000, codRet: "00", dtPgto: "19920110" },
      { cpf: CPF_NOSSO, numDoc: PGTO_DIV, valor: 20002 },
      { cpf: CPF_NOSSO, numDoc: DOC_INEXISTENTE, valor: 10000 },
    ]),
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("BATCHCON - RESUMO CONCILIACAO");
  await expect(resumo).toContainText("01/1992");
  await expect(valorResumo(page, "REGISTROS LIDOS")).toHaveText("7");
  await expect(valorResumo(page, "CONCILIADOS")).toHaveText("1");
  await expect(valorResumo(page, "DIVERGENTES")).toHaveText("1");
  await expect(valorResumo(page, "NAO ENCONTRADOS")).toHaveText("1");
  await expect(valorResumo(page, "REGISTROS AUDITORIA")).toHaveText("2");
  await expect(page.getByTestId("aviso-conciliacao")).toHaveCount(0);

  const cpfMascarado = mascaraCpfLista(CPF_NOSSO);
  const div = page.getByRole("table", { name: "Divergências" }).getByRole("row").filter({ hasText: String(PGTO_DIV) });
  await expect(div).toContainText(cpfMascarado);
  await expect(div).toContainText("R$ 200,00");
  await expect(div).toContainText("R$ 200,02");
  const nao = page.getByRole("table", { name: "Não encontrados" }).getByRole("row").filter({ hasText: String(DOC_INEXISTENTE) });
  await expect(nao).toContainText(cpfMascarado);
  await expect(page.getByText(CPF_NOSSO)).toHaveCount(0);

  const pagos = await db.pagamento.findMany({ where: { numPagamento: { in: NUMS } }, orderBy: { numPagamento: "asc" } });
  expect(pagos.map((p) => [p.numPagamento, p.sitPagamento, p.dtPagamento, p.codBanco, p.codRetornoBanco])).toEqual([
    [PGTO_OK, "P", 19920110, "1", "00"],
    [PGTO_DIV, "G", null, null, null],
  ]);
  const eventos = await db.auditoria.findMany({ where: { tipoEntidade: "PAGAMENTO", idEntidade: { in: CHAVES } }, orderBy: { numAuditoria: "asc" } });
  expect(eventos.map((e) => [e.idEntidade, e.codAcao, e.usrEvento, e.desAcao, e.valorAnterior, e.valorPosterior])).toEqual([
    [String(PGTO_OK), "CO", "BATCH", "CONCILIADO COD RET=00", null, null],
    [String(PGTO_DIV), "DV", "BATCH", "DIVERGENCIA VALOR SIFAP X BANCO", "200.00", "200.02"],
  ]);
  expect(new Set(eventos.map((e) => `${e.dtEvento}-${e.hrEvento}`)).size).toBe(1);

  await div.getByRole("link", { name: String(PGTO_DIV) }).click();
  await expect(page).toHaveURL(new RegExp(`/pagamentos/${PGTO_DIV}$`));
});
