import { expect, test } from "@playwright/test";
import { createPrismaClient } from "../../src/server/db";

// Story 3.1 contra a base dedicada do e2e (seed):
// MARIA 012.345.678-90 (A, 1985) · FRANCISCO 345.678.902-56 (região 99, I).
// Beneficiários próprios deste spec (nenhum outro spec os toca), gravados em beforeAll:
// - CPF_SUSPENSO: S, 50 anos no ano corrente (independe do ano), sem NIS, renda 900,00.
// - CPF_SEM_DOCS: A, documentos ≠ S, renda 200,00, 1 dependente, com NIS.

const CPF_MARIA = "01234567890";
const CPF_SUSPENSO = "67890123540";
const CPF_SEM_DOCS = "78901234696";

test.beforeAll(async () => {
  const db = createPrismaClient("file:./e2e.db");
  const ano = new Date().getFullYear();
  const comum = { sexo: "F", codRegiao: 1, codPrograma: "PA01", dtCadastro: 20250101 };
  const registros = [
    { ...comum, numCpf: CPF_SUSPENSO, nomeCompleto: "E2E ELEGIBILIDADE SUSPENSO", dtNascimento: (ano - 50) * 10000 + 101,
      sitBeneficiario: "S", vlrRendaFamiliar: 90000, numDependentes: 0, nis: null, documentosOk: "S" },
    { ...comum, numCpf: CPF_SEM_DOCS, nomeCompleto: "E2E ELEGIBILIDADE SEM DOCS", dtNascimento: 19900101,
      sitBeneficiario: "A", vlrRendaFamiliar: 20000, numDependentes: 1, nis: "20000000009", documentosOk: "N" },
  ];
  try {
    for (const data of registros) {
      // Workers paralelos podem gravar o mesmo registro: em conflito (P2002), o upsert repetido vira update.
      const gravar = () => db.beneficiario.upsert({ where: { numCpf: data.numCpf }, create: data, update: data });
      await gravar().catch((e: { code?: string }) => (e.code === "P2002" ? gravar() : Promise.reject(e)));
    }
  } finally {
    await db.$disconnect();
  }
});

test("beneficiário A + programa compatível → ELEGÍVEL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Elegibilidade" }).click();
  await expect(page).toHaveURL(/\/elegibilidade$/);
  await expect(page.getByRole("heading", { level: 1, name: "Elegibilidade" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Elegibilidade" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  await page.getByLabel("Programa").selectOption("PT01");
  await page.getByRole("button", { name: "Verificar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("BENEFICIARIO ELEGIVEL PARA O PROGRAMA");
  await expect(page.getByTestId("selo-elegibilidade")).toHaveText("ELEGÍVEL");
  await expect(resultado.getByRole("listitem")).toHaveCount(0);
});

test("não elegível → NÃO ELEGÍVEL com os motivos numerados na ordem do legado", async ({ page }) => {
  await page.goto("/elegibilidade");
  await page.getByLabel("CPF do beneficiário").fill(CPF_SUSPENSO);
  await page.getByLabel("Programa").selectOption("PP01");
  await page.getByRole("button", { name: "Verificar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("BENEFICIARIO NAO ELEGIVEL - MOTIVOS:");
  await expect(page.getByTestId("selo-elegibilidade")).toHaveText("NÃO ELEGÍVEL");
  await expect(resultado.getByRole("listitem")).toHaveText([
    "BENEFICIARIO SUSPENSO",
    "RENDA FAMILIAR ACIMA DO TETO DO PROGRAMA",
    "PROG PREVIDENCIARIO: IDADE < 60",
    "NIS NAO CADASTRADO",
  ]);
  await expect(page.getByRole("link", { name: "Ir para Validação de documentos" })).toHaveCount(0);
});

test("DOCUMENTACAO INCOMPLETA (programa A) → link para Validação de documentos (F4)", async ({ page }) => {
  await page.goto("/elegibilidade");
  await page.getByLabel("CPF do beneficiário").fill(CPF_SEM_DOCS);
  await page.getByLabel("Programa").selectOption("PA01");
  await page.getByRole("button", { name: "Verificar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("BENEFICIARIO NAO ELEGIVEL - MOTIVOS:");
  await expect(resultado.getByRole("listitem")).toHaveText(["DOCUMENTACAO INCOMPLETA"]);
  const link = page.getByRole("link", { name: "Ir para Validação de documentos" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/validacao/documentos");
});

test("região 99 → BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL (CPF pré-preenchido por query string)", async ({ page }) => {
  await page.goto("/elegibilidade?cpf=34567890256&programa=PP01");
  await expect(page.getByLabel("CPF do beneficiário")).toHaveValue("345.678.902-56");
  await expect(page.getByLabel("Programa")).toHaveValue("PP01");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL");
  await expect(page.getByTestId("selo-elegibilidade")).toHaveText("ELEGÍVEL");
});

test("programa inexistente → PROGRAMA NAO ENCONTRADO, sem selo", async ({ page }) => {
  await page.goto("/elegibilidade");
  await page.getByLabel("CPF do beneficiário").fill(CPF_MARIA);
  // Simula uma lista desatualizada (programa removido depois de carregar a página).
  await page.getByLabel("Programa").evaluate((el) => {
    const opcao = document.createElement("option");
    opcao.value = "ZZ99";
    opcao.textContent = "ZZ99 – INEXISTENTE";
    el.appendChild(opcao);
  });
  await page.getByLabel("Programa").selectOption("ZZ99");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("PROGRAMA NAO ENCONTRADO");
  await expect(page.getByTestId("selo-elegibilidade")).toHaveCount(0);
});

test("CPF inexistente → BENEFICIARIO NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/elegibilidade");
  await page.getByLabel("CPF do beneficiário").fill("15975348625");
  await page.getByLabel("Programa").selectOption("PT01");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
  await expect(page.getByTestId("selo-elegibilidade")).toHaveCount(0);
});
