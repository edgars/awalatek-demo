import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";
import { CHAVE_INEXISTENTE, RE_CHAVE, buscarNaLista, chaveDe, esperarHtmlSemCpf, esperarUrlSemCpf } from "./chave";

// Story 2.4 contra a base dedicada do e2e (seed: JOSE CARLOS PEREIRA, situação S, sem
// dependentes; ANA PAULA SOUZA, situação C). O cenário D6 usa um titular próprio (com 1
// dependente) em vez de MARIA: incluir dependentes muda o fator familiar que os specs de
// cálculo, lote e consulta assumem para ela.

test.describe.configure({ mode: "serial" });

const CPF_JOSE = "12345678062";
const CPF_ANA_CANCELADA = "23456789173";
const CPF_TITULAR_D6 = completaDv("993160001");

let db: PrismaClient;

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  // Titular isolado, recriado a cada execução (a base do e2e é recriada, mas o spec pode
  // ser repetido): situação S (não entra no lote), 1 dependente.
  await db.beneficiario.deleteMany({ where: { numCpf: CPF_TITULAR_D6 } });
  await db.beneficiario.create({
    data: {
      numCpf: CPF_TITULAR_D6,
      nomeCompleto: "TITULAR D6 E2E",
      dtNascimento: 19800101,
      sexo: "F",
      codRegiao: 11,
      codPrograma: "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: "S",
      vlrRendaFamiliar: 100000,
      numDependentes: 1,
      dependentes: { create: { occurrence: 1, nomeDependente: "DEP 1 E2E", dtNascDepend: 20150310, parentesco: "FI" } },
    },
  });
});

test.afterAll(async () => {
  await db?.$disconnect();
});

async function preencher(page: Page, d: { nome: string; parentesco: string; cpf?: string; nasc?: string }) {
  await page.getByLabel("Nome").fill(d.nome);
  if (d.nasc) await page.getByLabel("Data de nascimento").fill(d.nasc);
  await page.getByLabel("Parentesco").selectOption(d.parentesco);
  if (d.cpf) await page.getByLabel("CPF").fill(d.cpf);
}

test("incluir dois dependentes em série a partir da lista e rejeitar CPF duplicado", async ({ page }) => {
  // H2: a busca por CPF é enviada por POST e a URL leva só a chave opaca.
  await buscarNaLista(page, CPF_JOSE);
  await esperarUrlSemCpf(page, CPF_JOSE);
  // LGPD: o campo de busca fica vazio; só o aviso com o CPF mascarado.
  await expect(page.getByLabel("Buscar por CPF ou nome")).toHaveValue("");
  await expect(page.getByTestId("filtro-beneficiario")).toContainText("Filtrando por: ***.***.780-62");
  await esperarHtmlSemCpf(page, CPF_JOSE);
  await page.getByRole("link", { name: /Dependentes JOSE CARLOS PEREIRA/ }).click();
  await expect(page).toHaveURL(new RegExp(`/beneficiarios/${RE_CHAVE}/dependentes$`));
  await expect(page).toHaveURL(new RegExp(`/beneficiarios/${await chaveDe(CPF_JOSE)}/dependentes$`));
  await esperarUrlSemCpf(page, CPF_JOSE);
  await expect(page.getByRole("heading", { level: 1, name: "Dependentes" })).toBeVisible();
  const titular = page.getByLabel("Titular", { exact: true });
  await expect(titular).toContainText("***.***.780-62");
  await expect(titular).not.toContainText(CPF_JOSE);
  await expect(page.getByTestId("total-dependentes")).toHaveText("0");

  await preencher(page, { nome: "Carlos Filho E2E", parentesco: "FI", cpf: "52998224725", nasc: "2015-03-10" });
  await page.getByLabel("Sexo").selectOption("M");
  await page.getByRole("button", { name: "Gravar" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("DEPENDENTE INCLUIDO - TOTAL: 1");
  await expect(resultado).toContainText("INCLUIR OUTRO DEPENDENTE? (S/N)");
  await expect(page.getByTestId("total-dependentes")).toHaveText("1");
  const tabela = page.getByRole("table", { name: "Dependentes do titular" });
  await expect(tabela.getByRole("row", { name: /CARLOS FILHO E2E/ })).toContainText("***.***.247-25");
  await expect(tabela).toContainText("10/03/2015");

  await page.getByRole("button", { name: "Incluir outro dependente" }).click();
  await expect(page.getByLabel("Nome")).toHaveValue("");
  await preencher(page, { nome: "Maria Conjuge E2E", parentesco: "CO" });
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("DEPENDENTE INCLUIDO - TOTAL: 2");
  await expect(tabela.getByRole("row", { name: /MARIA CONJUGE E2E/ })).toContainText("CO — Cônjuge");

  // Duplicado: nada gravado, mensagem literal junto ao campo e no painel.
  await page.getByRole("button", { name: "Incluir outro dependente" }).click();
  await preencher(page, { nome: "Outro E2E", parentesco: "OU", cpf: "52998224725" });
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("DEPENDENTE JA CADASTRADO (CPF DUPLICADO)");
  await expect(page.getByLabel("CPF")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("total-dependentes")).toHaveText("2");

  // Nome vazio e sem parentesco: os dois mensagens.
  await page.getByLabel("Nome").fill("");
  await page.getByLabel("Parentesco").selectOption("");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("NOME DO DEPENDENTE OBRIGATORIO");
  await expect(resultado).toContainText("PARENTESCO INVALIDO");

  // Concluir volta para a lista, com o total atualizado.
  await preencher(page, { nome: "Irmao E2E", parentesco: "IR" });
  await page.getByLabel("CPF").fill("");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("DEPENDENTE INCLUIDO - TOTAL: 3");
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page).toHaveURL(/\/beneficiarios$/);
  await buscarNaLista(page, CPF_JOSE);
  await expect(page.getByRole("table").getByRole("row", { name: /JOSE CARLOS PEREIRA/ })).toContainText("3");
});

test("D6: após o 6.º dependente não oferece incluir outro", async ({ page }) => {
  // Titular próprio do spec (situação S, 1 dependente).
  await page.goto(`/beneficiarios/${await chaveDe(CPF_TITULAR_D6)}/dependentes`);
  await expect(page.getByTestId("total-dependentes")).toHaveText("1");
  const resultado = page.getByTestId("resultado-legado");
  for (let n = 2; n <= 6; n++) {
    if (n > 2) await page.getByRole("button", { name: "Incluir outro dependente" }).click();
    await preencher(page, { nome: `Dep ${n} E2E`, parentesco: "OU" });
    await page.getByRole("button", { name: "Gravar" }).click();
    await expect(resultado).toContainText(`DEPENDENTE INCLUIDO - TOTAL: ${n}`);
  }
  await expect(page.getByRole("button", { name: "Incluir outro dependente" })).toHaveCount(0);
  await expect(resultado).not.toContainText("INCLUIR OUTRO DEPENDENTE? (S/N)");
  await expect(resultado).toContainText("LIMITE DE DEPENDENTES ATINGIDO");
  await expect(page.getByRole("button", { name: "Concluir" })).toBeVisible();
});

test("titular cancelado: formulário bloqueado com a mensagem literal", async ({ page }) => {
  await page.goto(`/beneficiarios/${await chaveDe(CPF_ANA_CANCELADA)}/dependentes`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO");
  await expect(page.getByLabel("Nome")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Gravar" })).toBeDisabled();
});

test("GET /beneficiarios?q=<CPF> (link antigo) não busca nem ecoa o CPF: redireciona para a chave", async ({ page }) => {
  for (const q of [CPF_JOSE, "123.456.780-62"]) {
    await page.goto(`/beneficiarios?q=${encodeURIComponent(q)}`);
    await expect(page).toHaveURL(new RegExp(`/beneficiarios\\?benef=${RE_CHAVE}$`));
    await esperarUrlSemCpf(page, CPF_JOSE);
    await esperarHtmlSemCpf(page, CPF_JOSE);
    await expect(page.getByRole("table").getByRole("row", { name: /JOSE CARLOS PEREIRA/ })).toBeVisible();
    // Nenhum link gerado (paginação, ações) leva o CPF.
    for (const href of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      expect(href).not.toMatch(/\d{11}/);
    }
  }
  // "Limpar" tira o filtro.
  await page.getByTestId("filtro-beneficiario").getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/beneficiarios$/);
  await expect(page.getByTestId("filtro-beneficiario")).toHaveCount(0);

  // A chave opaca é dado pseudonimizado: o Referer não a leva para outros sites.
  expect((await page.request.get("/beneficiarios")).headers()["referrer-policy"]).toBe("same-origin");

  await page.goto("/beneficiarios?q=52998224725");
  await expect(page).toHaveURL(/\/beneficiarios\?benef=nao-encontrado$/);
  await expect(page.getByText("Nenhum beneficiário encontrado para o CPF informado.")).toBeVisible();
});

test("titular inexistente: mensagem literal", async ({ page }) => {
  await page.goto(`/beneficiarios/${CHAVE_INEXISTENTE}/dependentes`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
  // H2: a rota não aceita mais o CPF (nem de um titular existente).
  await page.goto(`/beneficiarios/${CPF_JOSE}/dependentes`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
});
