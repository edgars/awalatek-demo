import { expect, test } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";

// Story 4.4 — consulta de pagamentos (somente leitura, ADR-009). O seed não tem
// pagamentos: o spec os grava direto na base do e2e antes de navegar.

test.describe.configure({ mode: "serial" });

const CPF_MARIA = "01234567890"; // seed: PA01
const CPF_JOSE = "12345678062"; // seed: PP01
const NUMS = [9001, 9002, 9003];

let db: PrismaClient;

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  const [maria, jose] = await Promise.all([
    db.beneficiario.findUnique({ where: { numCpf: CPF_MARIA }, select: { id: true } }),
    db.beneficiario.findUnique({ where: { numCpf: CPF_JOSE }, select: { id: true } }),
  ]);
  if (!maria || !jose) throw new Error("seed do e2e sem os beneficiários esperados");
  await db.pagamento.deleteMany({ where: { numPagamento: { in: NUMS } } });
  const base = { vlrLiquido: 48500, vlrDescontoTotal: 1500, tipoPgto: "N", dtGeracao: 20260901, hrGeracao: 101500, usrInclusao: "BATCH" };
  await db.pagamento.create({
    data: {
      ...base,
      numPagamento: 9001,
      numCpf: CPF_MARIA,
      codPrograma: "PA01",
      anoMesRef: 202609,
      vlrBruto: 50000,
      sitPagamento: "G",
      vlrCorrecao: 1234,
      dtCorrecao: 20260915,
      indCorrigido: "S",
      dtPagamento: 20260910,
      codBanco: "001",
      codRetornoBanco: "00",
      sitConciliacao: "C",
      descontos: {
        create: [
          { occurrence: 2, tipoDesconto: "S", vlrDesconto: 500, pctDesconto: "1.00", dtInicioDsct: 20260101 },
          { occurrence: 1, tipoDesconto: "J", vlrDesconto: 1000, pctDesconto: "0.00", numProcesso: "PROC123", dtInicioDsct: 20260101 },
        ],
      },
    },
  });
  await db.pagamento.create({
    data: { ...base, numPagamento: 9002, numCpf: CPF_JOSE, codPrograma: "PP01", anoMesRef: 202609, vlrBruto: 70000, sitPagamento: "P" },
  });
  await db.pagamento.create({
    data: { ...base, numPagamento: 9003, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 202608, vlrBruto: 50000, sitPagamento: "G", tipoPgto: "D" },
  });
});

test.afterAll(async () => {
  await db?.pagamento.deleteMany({ where: { numPagamento: { in: NUMS } } });
  await db?.$disconnect();
});

test("lista ordenada por Nº desc com CPF mascarado e filtro por CPF", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: "Pagamentos" }).click();
  await expect(page).toHaveURL(/\/pagamentos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pagamentos" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Pagamentos" })).toHaveAttribute("aria-current", "page");

  const tabela = page.getByRole("table");
  const linhas = tabela.getByRole("row");
  await expect(linhas).toHaveCount(4); // cabeçalho + 3
  await expect(linhas.nth(1)).toContainText("9003");
  await expect(linhas.nth(2)).toContainText("9002");
  await expect(linhas.nth(3)).toContainText("9001");
  await expect(linhas.nth(1)).toContainText("***.***.678-90");
  await expect(linhas.nth(1)).toContainText("2026-08");
  await expect(linhas.nth(1)).toContainText("D — Décimo");
  await expect(linhas.nth(2)).toContainText("R$ 700,00");
  await expect(linhas.nth(2)).toContainText("P — Pago");
  await expect(tabela).not.toContainText(CPF_MARIA);

  await page.getByLabel("CPF").fill("123.456.780-62");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/cpf=/);
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(1)).toContainText("9002");
});

test("filtro competência + situação", async ({ page }) => {
  await page.goto("/pagamentos");
  await page.getByLabel("Competência").fill("2026-09");
  await page.getByLabel("Situação").selectOption("G");
  await page.getByRole("button", { name: "Filtrar" }).click();
  const linhas = page.getByRole("table").getByRole("row");
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(1)).toContainText("9001");

  await page.goto("/pagamentos?competencia=2020-01");
  await expect(page.getByText("Nenhum pagamento")).toBeVisible();
});

test("detalhe com descontos na ordem de occurrence, correção e conciliação", async ({ page }) => {
  await page.goto("/pagamentos");
  await page.getByRole("link", { name: "9001", exact: true }).click();
  await expect(page).toHaveURL(/\/pagamentos\/9001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pagamento 9001" })).toBeVisible();
  await expect(page.getByText("R$ 500,00").first()).toBeVisible();

  const descontos = page.getByRole("table", { name: "Descontos aplicados" }).getByRole("row");
  await expect(descontos).toHaveCount(3);
  await expect(descontos.nth(1)).toContainText("J — Judicial");
  await expect(descontos.nth(1)).toContainText("R$ 10,00");
  await expect(descontos.nth(2)).toContainText("S — Sindical");

  const correcao = page.getByRole("definition").filter({ hasText: "R$ 12,34" });
  await expect(correcao).toBeVisible();
  await expect(page.getByText("S — Sim")).toBeVisible();
  await expect(page.getByText("10/09/2026")).toBeVisible();
  await expect(page.getByText("C — Conciliado")).toBeVisible();
});

test("pagamento inexistente → PAGAMENTO NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/pagamentos/999999");
  await expect(page.getByTestId("resultado-legado")).toContainText("PAGAMENTO NAO ENCONTRADO");
});

test("ADR-009: sem formulários nem ações de escrita", async ({ page, request }) => {
  for (const url of ["/pagamentos", "/pagamentos/9001"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Só o formulário de filtro (GET) na lista; nenhum POST / Server Action.
    await expect(page.locator('form:not([method="get"])')).toHaveCount(0);
    await expect(page.locator("form[action^='javascript']")).toHaveCount(0);
    await expect(page.locator('input[name^="$ACTION"]')).toHaveCount(0);
    const escrita = /alterar|editar|excluir|incluir|novo|gravar|cancelar|estornar|salvar/i;
    await expect(page.getByRole("button", { name: escrita })).toHaveCount(0);
    await expect(page.getByRole("link", { name: escrita })).toHaveCount(0);
  }

  // POST sem ação registrada: nenhuma escrita executada.
  const antes = await db.pagamento.count();
  for (const url of ["/pagamentos", "/pagamentos/9001"]) {
    const r = await request.post(url, { headers: { "Next-Action": "0000000000000000000000000000000000000000" }, data: "[]" });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    // POST de formulário comum: no máximo re-renderiza a página (leitura).
    await request.post(url, { form: { numPagamento: "9001", vlrBruto: "1", sitPagamento: "C" } });
  }
  for (const method of ["post", "put", "delete", "patch"] as const) {
    const r = await request[method]("/api/pagamentos", { data: {} });
    expect(r.status()).toBe(404);
  }
  expect(await db.pagamento.count()).toBe(antes);
  const p = await db.pagamento.findUnique({ where: { numPagamento: 9001 }, include: { descontos: true } });
  expect(p).toMatchObject({ vlrBruto: 50000, vlrLiquido: 48500, sitPagamento: "G" });
  expect(p?.descontos).toHaveLength(2);
});
