import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";

// Story 7.2 — relatório consolidado mensal (BATCHREL), somente leitura.
// O spec cria seus próprios beneficiários (status S: o lote os ignora) e pagamentos
// numa competência exclusiva (1994-01) com números exclusivos (98101+); outros specs
// rodam em paralelo na mesma base, então toda asserção é da competência 199401.

test.describe.configure({ mode: "serial" });

const COMP = 199401;
const REGIOES = [3, 7, 12, 18, 22, 99] as const;
const cpfRegiao = (r: number) => completaDv(`9720100${String(r).padStart(2, "0")}`);
const CPFS = REGIOES.map(cpfRegiao);
// Região → status (99 com status desconhecido X → GERADO).
const STATUS = ["G", "P", "C", "D", "E", "X"] as const;
const NUMS = [...REGIOES.map((_, i) => 98101 + i), 98110];
const NOSSOS = { numPagamento: { in: NUMS } };

let db: PrismaClient;

async function limpar() {
  await db.pagamento.deleteMany({ where: NOSSOS });
  await db.beneficiario.deleteMany({ where: { numCpf: { in: CPFS } } });
}

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  await limpar();
  for (const r of REGIOES) {
    await db.beneficiario.create({
      data: {
        numCpf: cpfRegiao(r),
        nomeCompleto: `E2E CONSOLIDADO REGIAO ${r}`,
        dtNascimento: 19800101,
        sexo: "F",
        codRegiao: r,
        codPrograma: "PA01",
        dtCadastro: 20250101,
        sitBeneficiario: "S",
        vlrRendaFamiliar: 80000,
      },
    });
  }
  const base = { codPrograma: "PA01", tipoPgto: "N", dtGeracao: 19940101, hrGeracao: 100000, usrInclusao: "BATCH" };
  await db.pagamento.createMany({
    data: REGIOES.map((r, i) => ({
      ...base,
      numPagamento: 98101 + i,
      numCpf: cpfRegiao(r),
      anoMesRef: COMP,
      vlrBruto: 10000 * (i + 1),
      vlrDescontoTotal: 100 * (i + 1),
      vlrLiquido: 9900 * (i + 1),
      sitPagamento: STATUS[i] ?? "G",
    })),
  });
  // Outra competência: não entra no relatório de 1994-01.
  await db.pagamento.create({
    data: { ...base, numPagamento: 98110, numCpf: cpfRegiao(3), anoMesRef: 199402, vlrBruto: 99999, vlrDescontoTotal: 0, vlrLiquido: 99999, sitPagamento: "G" },
  });
});

test.afterAll(async () => {
  await limpar();
  await db?.$disconnect();
});

const celulas = (page: Page, tabela: string, nome: string) =>
  page
    .getByRole("table", { name: tabela })
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: nome, exact: true }) })
    .getByRole("cell");

test("menu → filtro de competência → totais por região, situação e gerais", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: "Consolidado" }).click();
  await expect(page).toHaveURL(/\/relatorios\/consolidado$/);
  await expect(page.getByRole("heading", { level: 1, name: "Relatório consolidado" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Consolidado" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Informe a competência para gerar o relatório.")).toBeVisible();

  await page.getByLabel("Competência").fill("1994-01");
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page).toHaveURL(/competencia=199401/);
  await expect(page.getByText("Competência 01/1994")).toBeVisible();

  // LEGACY-QUIRK(D10): 22 e 99 caem em CENTRO-OESTE.
  await expect(celulas(page, "Por região", "NORTE")).toHaveText(["1", "R$ 100,00", "R$ 1,00", "R$ 99,00"]);
  await expect(celulas(page, "Por região", "NORDESTE")).toHaveText(["1", "R$ 200,00", "R$ 2,00", "R$ 198,00"]);
  await expect(celulas(page, "Por região", "SUDESTE")).toHaveText(["1", "R$ 300,00", "R$ 3,00", "R$ 297,00"]);
  await expect(celulas(page, "Por região", "SUL")).toHaveText(["1", "R$ 400,00", "R$ 4,00", "R$ 396,00"]);
  await expect(celulas(page, "Por região", "CENTRO-OESTE")).toHaveText(["2", "R$ 1.100,00", "R$ 11,00", "R$ 1.089,00"]);

  // Status X → GERADO.
  await expect(celulas(page, "Por situação", "GERADO")).toHaveText(["2", "R$ 700,00"]);
  await expect(celulas(page, "Por situação", "PAGO")).toHaveText(["1", "R$ 200,00"]);
  await expect(celulas(page, "Por situação", "CANCELADO")).toHaveText(["1", "R$ 300,00"]);
  await expect(celulas(page, "Por situação", "DEVOLVIDO")).toHaveText(["1", "R$ 400,00"]);
  await expect(celulas(page, "Por situação", "ESTORNADO")).toHaveText(["1", "R$ 500,00"]);

  await expect(celulas(page, "Totais gerais", "TOTAL GERAL")).toHaveText(["6", "R$ 2.100,00", "R$ 21,00", "R$ 2.079,00"]);

  // Versão imprimível: cabeçalho literal do legado só em @media print.
  const cab = page.getByTestId("cabecalho-impressao");
  await expect(cab).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(cab).toBeVisible();
  await expect(cab).toContainText("SIFAP - RELATORIO CONSOLIDADO MENSAL");
  await expect(cab).toContainText("COMPETENCIA: 199401");
  await expect(cab).toContainText("DATA:");
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeHidden();
  await expect(page.getByRole("search")).toBeHidden();
});

test("competência sem pagamentos → todas as linhas em zero", async ({ page }) => {
  await page.goto("/relatorios/consolidado?competencia=199312");
  for (const nome of ["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE"]) {
    await expect(celulas(page, "Por região", nome)).toHaveText(["0", "R$ 0,00", "R$ 0,00", "R$ 0,00"]);
  }
  for (const nome of ["GERADO", "PAGO", "CANCELADO", "DEVOLVIDO", "ESTORNADO"]) {
    await expect(celulas(page, "Por situação", nome)).toHaveText(["0", "R$ 0,00"]);
  }
  await expect(celulas(page, "Totais gerais", "TOTAL GERAL")).toHaveText(["0", "R$ 0,00", "R$ 0,00", "R$ 0,00"]);
});

for (const valor of ["199413", "invalido", "1994-1"]) {
  test(`competência presente mas inválida (${valor}) → "Competência inválida."`, async ({ page }) => {
    await page.goto(`/relatorios/consolidado?competencia=${valor}`);
    await expect(page.getByText("Competência inválida.")).toBeVisible();
    await expect(page.getByText("Informe a competência para gerar o relatório.")).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
  });
}

test("sem o parâmetro → pede a competência, sem erro", async ({ page }) => {
  await page.goto("/relatorios/consolidado");
  await expect(page.getByText("Informe a competência para gerar o relatório.")).toBeVisible();
  await expect(page.getByText("Competência inválida.")).toHaveCount(0);
});
