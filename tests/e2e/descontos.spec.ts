import { expect, test, type Locator } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";

// Story 4.3 — recálculo de descontos (CALCDSCT) contra a base dedicada do e2e.
// O spec cria seu próprio beneficiário (status S: o lote o ignora; CALCDSCT não
// verifica o status), seus descontos registrados e seus pagamentos numa competência
// exclusiva (1991-01) com números exclusivos; toda asserção se restringe a eles.

test.describe.configure({ mode: "serial" });

const CPF_NOSSO = completaDv("991430001");
const CPF_JOSE = "12345678062"; // seed
const COMP = 199101;
const PGTO_800 = 991301; // bruto 800,00 → sem teto
const PGTO_100 = 991302; // bruto 100,00 → teto 30 % dispara
const PGTO_JOSE = 991303;
const NOSSOS = { numPagamento: { in: [PGTO_800, PGTO_100, PGTO_JOSE] }, anoMesRef: COMP };

let db: PrismaClient;

async function limpar() {
  await db.pagamento.deleteMany({ where: NOSSOS });
  await db.beneficiario.deleteMany({ where: { numCpf: CPF_NOSSO } });
}

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  await limpar();
  const b = await db.beneficiario.create({
    data: {
      numCpf: CPF_NOSSO,
      nomeCompleto: "E2E DESCONTOS CALCDSCT",
      dtNascimento: 19800101,
      sexo: "F",
      codRegiao: 11,
      codPrograma: "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: "S",
      vlrRendaFamiliar: 80000,
      descontos: {
        create: [
          { occurrence: 1, tipoDesconto: "J", vlrDesconto: 2500, pctDesconto: "0.00", dtInicioDsct: 20250101, numProcesso: "PROC-E2E" },
          // Fora de vigência (fim no passado): não entra no loop.
          { occurrence: 2, tipoDesconto: "P", vlrDesconto: 5000, pctDesconto: "0.00", dtInicioDsct: 20190101, dtFimDsct: 20200101 },
          // Tipo desconhecido para CALCDSCT (NONE → IGNORE), mas dispara a verificação do teto.
          { occurrence: 3, tipoDesconto: "C", vlrDesconto: 0, pctDesconto: "5.00", dtInicioDsct: 20250101 },
          { occurrence: 4, tipoDesconto: "A", vlrDesconto: 1000, pctDesconto: "0.00", dtInicioDsct: 20250101 },
        ],
      },
    },
  });
  const base = { anoMesRef: COMP, tipoPgto: "N", sitPagamento: "G", dtGeracao: 19910101, hrGeracao: 100000, usrInclusao: "BATCH" };
  await db.pagamento.create({
    data: { ...base, numPagamento: PGTO_800, numCpf: b.numCpf, codPrograma: "PA01", vlrBruto: 80000, vlrLiquido: 77600, vlrDescontoTotal: 2400 },
  });
  await db.pagamento.create({
    data: { ...base, numPagamento: PGTO_100, numCpf: b.numCpf, codPrograma: "PA01", vlrBruto: 10000, vlrLiquido: 9700, vlrDescontoTotal: 300 },
  });
  await db.pagamento.create({
    data: { ...base, numPagamento: PGTO_JOSE, numCpf: CPF_JOSE, codPrograma: "PP01", vlrBruto: 80000, vlrLiquido: 77600, vlrDescontoTotal: 2400 },
  });
});

test.afterAll(async () => {
  await limpar();
  await db.$disconnect();
});

/** Valor (dd) do item rotulado (dt) no resumo. */
function item(resumo: Locator, rotulo: string): Locator {
  return resumo.locator("dt").filter({ hasText: new RegExp(`^${rotulo}$`) }).locator("xpath=following-sibling::dd[1]");
}

test("recalcula → DESCONTOS CALCULADOS, tabela com aplicado / fora de vigência / ignorado e aviso D13", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Cálculo de descontos" }).click();
  await expect(page).toHaveURL(/\/descontos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cálculo de descontos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cálculo de descontos" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF do beneficiário").fill(CPF_NOSSO);
  await page.getByLabel("Nº do pagamento").fill(String(PGTO_800));
  await page.getByRole("button", { name: "Calcular descontos" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("DESCONTOS CALCULADOS");
  await expect(item(resumo, "COMPETENCIA")).toHaveText("01/1991");
  await expect(item(resumo, "VLR BRUTO")).toHaveText("R$ 800,00");
  // 40,00 (contribuição 5 %) + 25,00 (J) + 10,00 (A) = 75,00 — abaixo do teto.
  await expect(item(resumo, "VLR DESCONTO")).toHaveText("R$ 75,00");
  await expect(item(resumo, "TETO 30%")).toHaveText("R$ 240,00");
  await expect(item(resumo, "CONTRIBUICAO SOCIAL")).toHaveText("R$ 40,00");

  const celulas = (occ: number) => resumo.getByTestId(`desconto-${occ}`).getByRole("cell");
  // Colunas: # · Tipo · Valor aplicado · % · Início · Fim · Processo · Situação
  await expect(celulas(1).nth(1)).toHaveText("J — Judicial");
  await expect(celulas(1).nth(2)).toHaveText("R$ 25,00");
  await expect(celulas(1).nth(3)).toHaveText("—"); // valor fixo: % não usado
  await expect(celulas(1).nth(7)).toHaveText("Aplicado");
  await expect(celulas(2).nth(2)).toHaveText("—");
  await expect(celulas(2).nth(7)).toHaveText("Fora de vigência");
  await expect(celulas(3).nth(1)).toHaveText("C — Contribuição");
  await expect(celulas(3).nth(2)).toHaveText("—");
  await expect(celulas(3).nth(7)).toHaveText("Ignorado (tipo)");
  await expect(celulas(4).nth(2)).toHaveText("R$ 10,00");
  await expect(celulas(4).nth(7)).toHaveText("Aplicado");
  await expect(resumo).not.toContainText("teto 30% aplicado");

  await expect(page.getByTestId("aviso-d13")).toContainText("O valor líquido não é recalculado (regra legada D13)");
  await expect(page.getByTestId("aviso-d13")).toContainText("R$ 776,00");

  const p = await db.pagamento.findUniqueOrThrow({
    where: { numPagamento: PGTO_800 },
    include: { descontos: { orderBy: { occurrence: "asc" } } },
  });
  expect(p.vlrDescontoTotal).toBe(7500);
  expect(p.vlrLiquido).toBe(77600);
  expect(p.usrUltAlteracao).toBe("E2EUSER");
  expect(p.descontos.map((d) => [d.occurrence, d.tipoDesconto, d.vlrDesconto])).toEqual([
    [1, "J", 2500],
    [2, "A", 1000],
  ]);
});

test("LEGACY-QUIRK(D2): não judicial que passa o teto → total = teto 30 % e nota na linha", async ({ page }) => {
  await page.goto("/descontos");
  await page.getByLabel("CPF do beneficiário").fill(CPF_NOSSO);
  await page.getByLabel("Nº do pagamento").fill(String(PGTO_100));
  await page.getByRole("button", { name: "Calcular descontos" }).click();

  const resumo = page.getByTestId("resumo-processo");
  await expect(resumo).toContainText("DESCONTOS CALCULADOS");
  await expect(item(resumo, "VLR BRUTO")).toHaveText("R$ 100,00");
  // 3,00 (contribuição 3 %) + 25,00 (J) = 28,00; + 10,00 (A) = 38,00 > 30,00 → 30,00.
  await expect(item(resumo, "VLR DESCONTO")).toHaveText("R$ 30,00");
  await expect(item(resumo, "TETO 30%")).toHaveText("R$ 30,00");
  await expect(resumo.getByTestId("desconto-4")).toContainText("teto 30% aplicado");
  await expect(resumo.getByTestId("desconto-1")).not.toContainText("teto 30% aplicado");

  const p = await db.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_100 } });
  expect(p.vlrDescontoTotal).toBe(3000);
  expect(p.vlrLiquido).toBe(9700);
});

test("pagamento de outro CPF → PAGAMENTO NAO ENCONTRADO e nada gravado", async ({ page }) => {
  await page.goto("/descontos");
  await page.getByLabel("CPF do beneficiário").fill(CPF_NOSSO);
  await page.getByLabel("Nº do pagamento").fill(String(PGTO_JOSE));
  await page.getByRole("button", { name: "Calcular descontos" }).click();

  await expect(page.getByTestId("resultado-legado")).toContainText("PAGAMENTO NAO ENCONTRADO");
  await expect(page.getByTestId("resumo-processo")).toHaveCount(0);
  const p = await db.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_JOSE }, include: { descontos: true } });
  expect(p.vlrDescontoTotal).toBe(2400);
  expect(p.usrUltAlteracao).toBe("");
  expect(p.descontos).toEqual([]);
});

test("erro de forma aparece só junto ao campo", async ({ page }) => {
  await page.goto("/descontos");
  await page.getByLabel("CPF do beneficiário").fill(CPF_NOSSO);
  await page.getByRole("button", { name: "Calcular descontos" }).click();
  await expect(page.getByText("Informe o número do pagamento.")).toHaveCount(1);
  await expect(page.getByTestId("resultado-legado")).toHaveCount(0);
});
