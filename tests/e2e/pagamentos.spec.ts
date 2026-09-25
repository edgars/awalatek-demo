import { expect, test } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { chaveDe } from "./chave";

// Story 4.4 — consulta de pagamentos (somente leitura, ADR-009). O seed não tem
// pagamentos: o spec os grava direto na base do e2e antes de navegar.
// Outros specs (p. ex. cálculo) gravam pagamentos reais na mesma base em paralelo:
// aqui só se usam competências que nenhum outro spec usa (1990-01 / 1990-02) e
// toda asserção de contagem é restrita a elas.

test.describe.configure({ mode: "serial" });

const CPF_MARIA = "01234567890"; // seed: PA01
const CPF_JOSE = "12345678062"; // seed: PP01
const COMP_A = 199001; // 3 pagamentos (lista, filtros, detalhe)
const COMP_B = 199002; // 12 pagamentos (paginação)
const NUMS_A = [9001, 9002, 9003];
const NUMS_B = Array.from({ length: 12 }, (_, i) => 9011 + i);
const NUMS = [...NUMS_A, ...NUMS_B];
const NOSSOS = { numPagamento: { in: NUMS }, anoMesRef: { in: [COMP_A, COMP_B] } };

let db: PrismaClient;

const nossosPagamentos = () =>
  db.pagamento.findMany({ where: NOSSOS, orderBy: { numPagamento: "asc" }, include: { descontos: { orderBy: { occurrence: "asc" } } } });

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  const [maria, jose] = await Promise.all([
    db.beneficiario.findUnique({ where: { numCpf: CPF_MARIA }, select: { id: true } }),
    db.beneficiario.findUnique({ where: { numCpf: CPF_JOSE }, select: { id: true } }),
  ]);
  if (!maria || !jose) throw new Error("seed do e2e sem os beneficiários esperados");
  await db.pagamento.deleteMany({ where: NOSSOS });
  const base = { vlrLiquido: 48500, vlrDescontoTotal: 1500, tipoPgto: "N", dtGeracao: 20260901, hrGeracao: 101500, usrInclusao: "BATCH" };
  await db.pagamento.create({
    data: {
      ...base,
      numPagamento: 9001,
      numCpf: CPF_MARIA,
      codPrograma: "PA01",
      anoMesRef: COMP_A,
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
    data: { ...base, numPagamento: 9002, numCpf: CPF_JOSE, codPrograma: "PP01", anoMesRef: COMP_A, vlrBruto: 70000, sitPagamento: "P" },
  });
  await db.pagamento.create({
    data: { ...base, numPagamento: 9003, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: COMP_A, vlrBruto: 50000, sitPagamento: "P", tipoPgto: "D" },
  });
  await db.pagamento.createMany({
    data: NUMS_B.map((n) => ({ ...base, numPagamento: n, numCpf: CPF_JOSE, codPrograma: "PP01", anoMesRef: COMP_B, vlrBruto: 50000, sitPagamento: "G" })),
  });
});

test.afterAll(async () => {
  await db?.pagamento.deleteMany({ where: NOSSOS });
  await db?.$disconnect();
});

test("lista ordenada por Nº desc com CPF mascarado e filtro por CPF", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  // "Relatórios" também tem um item "Pagamentos" (story 7.1): escopo no grupo.
  const grupo = menu.locator("div").filter({ has: page.getByRole("heading", { name: "Cálculo e Pagamentos" }) });
  await grupo.getByRole("link", { name: "Pagamentos" }).click();
  await expect(page).toHaveURL(/\/pagamentos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pagamentos" })).toBeVisible();
  await expect(grupo.getByRole("link", { name: "Pagamentos" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Competência").fill("1990-01");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/competencia=1990-01/);

  const tabela = page.getByRole("table");
  const linhas = tabela.getByRole("row");
  await expect(linhas).toHaveCount(4); // cabeçalho + 3
  await expect(linhas.nth(1)).toContainText("9003");
  await expect(linhas.nth(2)).toContainText("9002");
  await expect(linhas.nth(3)).toContainText("9001");
  await expect(linhas.nth(1)).toContainText("***.***.678-90");
  await expect(linhas.nth(1)).toContainText("1990-01");
  await expect(linhas.nth(1)).toContainText("D — Décimo");
  await expect(linhas.nth(2)).toContainText("R$ 700,00");
  await expect(linhas.nth(2)).toContainText("P — Pago");
  await expect(tabela).not.toContainText(CPF_MARIA);

  await page.getByLabel("CPF").fill("123.456.780-62");
  await page.getByRole("button", { name: "Filtrar" }).click();
  // H2: o filtro por CPF vai por POST e a URL leva a chave opaca, nunca o CPF.
  await expect(page).toHaveURL(new RegExp(`benef=${await chaveDe(CPF_JOSE)}.*competencia=1990-01`));
  expect(page.url()).not.toContain(CPF_JOSE);
  expect(page.url()).not.toMatch(/\d{11}/);
  await expect(page.getByLabel("CPF")).toHaveValue("123.456.780-62");
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(1)).toContainText("9002");
});

test("filtro competência + situação; vazio; CPF incompleto", async ({ page }) => {
  await page.goto("/pagamentos");
  await page.getByLabel("Competência").fill("1990-01");
  await page.getByLabel("Situação").selectOption("G");
  await page.getByRole("button", { name: "Filtrar" }).click();
  const linhas = page.getByRole("table").getByRole("row");
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(1)).toContainText("9001");

  await page.goto("/pagamentos?competencia=1989-12");
  await expect(page.getByText("Nenhum pagamento")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  await page.goto("/pagamentos");
  await page.getByLabel("CPF").fill("012345");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/benef=cpf-incompleto/);
  await expect(page.getByText("Informe o CPF completo (11 dígitos).")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  // CPF completo sem beneficiário: nenhuma coincidência (e o CPF não vai para a URL).
  await page.goto("/pagamentos");
  await page.getByLabel("CPF").fill("529.982.247-25");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/benef=nao-encontrado/);
  expect(page.url()).not.toMatch(/\d{11}/);
  await expect(page.getByText("Nenhum pagamento")).toBeVisible();

  // H2: o parâmetro antigo ?cpf= é ignorado (o CPF não é lido da URL).
  await page.goto(`/pagamentos?cpf=${CPF_JOSE}&competencia=1990-01`);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(4); // cabeçalho + 3 (sem filtro de CPF)
});

test("paginação mantém os filtros", async ({ page }) => {
  await page.goto("/pagamentos?competencia=1990-02&situacao=G");
  const linhas = page.getByRole("table").getByRole("row");
  await expect(linhas).toHaveCount(11); // cabeçalho + 10
  await expect(linhas.nth(1)).toContainText("9022");
  await expect(page.getByText("12 registros · página 1 de 2")).toBeVisible();

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  const url = new URL(page.url());
  expect(url.searchParams.get("competencia")).toBe("1990-02");
  expect(url.searchParams.get("situacao")).toBe("G");
  expect(url.searchParams.get("pagina")).toBe("2");
  await expect(linhas).toHaveCount(3); // cabeçalho + 2
  await expect(linhas.nth(1)).toContainText("9012");
  await expect(linhas.nth(2)).toContainText("9011");
  for (const i of [1, 2]) {
    await expect(linhas.nth(i)).toContainText("1990-02");
    await expect(linhas.nth(i)).toContainText("G — Gerado");
  }
  await expect(page.getByLabel("Competência")).toHaveValue("1990-02");
});

test("detalhe com descontos na ordem de occurrence, correção e conciliação", async ({ page }) => {
  await page.goto("/pagamentos?competencia=1990-01");
  await page.getByRole("link", { name: "9001", exact: true }).click();
  await expect(page).toHaveURL(/\/pagamentos\/9001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pagamento 9001" })).toBeVisible();
  await expect(page.getByText("R$ 500,00").first()).toBeVisible();

  const descontos = page.getByRole("table", { name: "Descontos aplicados" }).getByRole("row");
  await expect(descontos).toHaveCount(3);
  await expect(descontos.nth(1)).toContainText("J — Judicial");
  await expect(descontos.nth(1)).toContainText("R$ 10,00");
  await expect(descontos.nth(2)).toContainText("S — Sindical");
  await expect(descontos.nth(2)).toContainText("1,00 %");
  await expect(descontos.nth(2)).toContainText("01/01/2026 a indeterminado");

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

test("ADR-009: sem formulários nem ações de escrita (filtro só de leitura)", async ({ page, request }) => {
  for (const url of ["/pagamentos", "/pagamentos/9001"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // H2 (LGPD): o filtro da lista é enviado por POST (Server Action só de leitura que troca o
    // CPF pela chave opaca e redireciona). Fora dele, nenhum POST / Server Action; no detalhe, nenhum.
    const FILTRO = '[aria-label="Filtros de pagamentos"]';
    await expect(page.locator(`form${FILTRO}`)).toHaveCount(url === "/pagamentos" ? 1 : 0);
    await expect(page.locator(`form:not([method="get"]):not(${FILTRO})`)).toHaveCount(0);
    await expect(page.locator(`form[action^='javascript']:not(${FILTRO})`)).toHaveCount(0);
    await expect(page.locator(`form:not(${FILTRO}) input[name^="$ACTION"]`)).toHaveCount(0);
    await expect(page.locator(`input[name^="$ACTION"]:not(form${FILTRO} *)`)).toHaveCount(0);
    if (url === "/pagamentos") await expect(page.locator(`form${FILTRO}`).getByRole("button")).toHaveText(["Filtrar"]);
    const escrita = /alterar|editar|excluir|incluir|novo|gravar|cancelar|estornar|salvar/i;
    await expect(page.getByRole("button", { name: escrita })).toHaveCount(0);
    await expect(page.getByRole("link", { name: escrita })).toHaveCount(0);
  }

  // POST sem ação registrada: nenhuma escrita executada nos pagamentos deste spec.
  const antes = await nossosPagamentos();
  expect(antes).toHaveLength(NUMS.length);
  // O filtro (POST) só lê: filtrar por CPF/competência/situação não altera nenhum pagamento.
  await page.goto("/pagamentos");
  await page.getByLabel("CPF").fill(CPF_MARIA);
  await page.getByLabel("Competência").fill("1990-01");
  await page.getByLabel("Situação").selectOption("G");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  expect(await nossosPagamentos()).toEqual(antes);
  for (const url of ["/pagamentos", "/pagamentos/9001"]) {
    const r = await request.post(url, { headers: { "Next-Action": "0000000000000000000000000000000000000000" }, data: "[]" });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    // POST de formulário comum: sem ação registrada, só re-renderiza a página (leitura).
    const f = await request.post(url, { form: { numPagamento: "9001", vlrBruto: "1", sitPagamento: "C" } });
    expect(f.status()).toBe(200);
    expect(await f.text()).not.toContain("SUCESSO");
  }
  for (const method of ["post", "put", "delete", "patch"] as const) {
    const r = await request[method]("/api/pagamentos", { data: {} });
    expect(r.status()).toBe(404);
  }
  expect(await nossosPagamentos()).toEqual(antes);
});
