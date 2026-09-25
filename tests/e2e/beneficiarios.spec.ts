import { expect, test, type Page } from "@playwright/test";
import { CHAVE_INEXISTENTE, RE_CHAVE, chaveDe, esperarUrlSemCpf } from "./chave";

// Story 2.1 contra a base dedicada do e2e (seed: 5 beneficiários, programas PA01, PP01, PT01).

test.describe.configure({ mode: "serial" });

async function preencherInclusao(page: Page, d: { cpf: string; nome: string; nasc: string; sexo: string; programa: string }) {
  await page.goto("/beneficiarios/novo");
  await expect(page.getByRole("heading", { level: 1, name: "Novo beneficiário" })).toBeVisible();
  await page.getByLabel("CPF").fill(d.cpf);
  await page.getByLabel("Nome").fill(d.nome);
  await page.getByLabel("Data de nascimento").fill(d.nasc);
  await page.getByLabel("Sexo").selectOption(d.sexo);
  await page.getByLabel("Programa").selectOption(d.programa);
}

test("incluir beneficiário e vê-lo na lista com CPF mascarado, sem excluir", async ({ page }) => {
  await page.goto("/beneficiarios");
  await expect(page.getByRole("heading", { level: 1, name: "Beneficiários" })).toBeVisible();
  await page.getByRole("link", { name: "Novo beneficiário" }).first().click();
  await expect(page).toHaveURL(/\/beneficiarios\/novo$/);

  await preencherInclusao(page, { cpf: "32165498791", nome: "Beatriz Nova E2E", nasc: "1985-04-12", sexo: "F", programa: "PA01" });
  await expect(page.getByLabel("CPF")).toHaveValue("321.654.987-91");
  await page.getByLabel("UF").selectOption("SP");
  await page.getByLabel("Renda familiar").fill("800,00");
  await page.getByRole("button", { name: "Gravar" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("BENEFICIARIO INCLUIDO COM SUCESSO");
  await expect(resultado).toContainText("A — Ativo");

  // Duplicado: nada gravado, mensagem literal.
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("BENEFICIARIO JA CADASTRADO");

  await page.goto("/beneficiarios?q=beatriz");
  const tabela = page.getByRole("table");
  await expect(tabela.getByRole("row", { name: /BEATRIZ NOVA E2E/ })).toContainText("***.***.987-91");
  await expect(tabela).not.toContainText("321.654.987-91");
  await expect(tabela).not.toContainText("32165498791");
  await expect(page.getByRole("button", { name: /excluir/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /excluir/i })).toHaveCount(0);
});

test("primeiro erro ganha: CPF e nome vazios → só CPF OBRIGATORIO", async ({ page }) => {
  await page.goto("/beneficiarios/novo");
  await page.getByRole("button", { name: "Gravar" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("CPF OBRIGATORIO");
  await expect(resultado.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByLabel("CPF")).toHaveAttribute("aria-invalid", "true");

  // CPF com DV inválido.
  await page.getByLabel("CPF").fill("01234567891");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("CPF INVALIDO - DIGITO VERIFICADOR INCORRETO");
});

test("maior de 75: inclusão com status S e alteração mantém S (D5)", async ({ page }) => {
  await preencherInclusao(page, { cpf: "74185296355", nome: "Joao Idoso E2E", nasc: "1940-01-01", sexo: "M", programa: "PP01" });
  await page.getByRole("button", { name: "Gravar" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("BENEFICIARIO INCLUIDO COM SUCESSO");
  await expect(resultado).toContainText("S — Suspenso");
  await expect(page.getByText("Situação ajustada para SUSPENSO (idade > 75 — regra legada)")).toBeVisible();

  // H2: o link "Ver/editar" leva a chave opaca, não o CPF.
  const chave = await chaveDe("74185296355");
  await expect(page.getByRole("link", { name: "Ver/editar beneficiário" })).toHaveAttribute("href", `/beneficiarios/${chave}/editar`);
  await page.getByRole("link", { name: "Ver/editar beneficiário" }).click();
  await expect(page).toHaveURL(new RegExp(`/beneficiarios/${RE_CHAVE}/editar$`));
  await esperarUrlSemCpf(page, "74185296355");
  await expect(page.getByRole("heading", { level: 1, name: "Alterar beneficiário" })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Data de nascimento")).toHaveValue("01/01/1940");
  await expect(page.getByLabel("Data de nascimento")).toHaveAttribute("readonly", "");
  await page.getByLabel("Município").fill("RECIFE");
  await page.getByLabel("Situação").selectOption("A");
  await page.getByRole("button", { name: "Gravar" }).click();

  await expect(resultado).toContainText("BENEFICIARIO ALTERADO COM SUCESSO");
  await expect(resultado).toContainText("S — Suspenso");
  await expect(page.getByText("Situação ajustada para SUSPENSO (idade > 75 — regra legada)")).toBeVisible();
  await expect(page.getByLabel("Situação")).toHaveValue("S");

  // Segunda alteração na mesma tela usa a nova versão (sem erro de concorrência).
  await page.getByLabel("Município").fill("OLINDA");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("BENEFICIARIO ALTERADO COM SUCESSO");

  await page.reload();
  await expect(page.getByLabel("Município")).toHaveValue("OLINDA");
  await expect(page.getByLabel("Situação")).toHaveValue("S");
});

test("alteração de beneficiário inexistente mostra mensagem literal", async ({ page }) => {
  await page.goto(`/beneficiarios/${CHAVE_INEXISTENTE}/editar`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO");
  // H2: a rota não aceita mais o CPF (nem de um beneficiário existente).
  await page.goto("/beneficiarios/34567890256/editar");
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO");
});

test("alteração preserva campos não modificados (CEP, endereço, renda)", async ({ page }) => {
  // Beneficiário do seed (FRANCISCO DAS CHAGAS LIMA), sem CEP/endereço no seed: primeiro são definidos.
  const url = `/beneficiarios/${await chaveDe("34567890256")}/editar`;
  const resultado = page.getByTestId("resultado-legado");
  await page.goto(url);
  await page.getByLabel("CEP").fill("01310100");
  await page.getByLabel("Endereço").fill("AV PAULISTA, 1000");
  await page.getByLabel("Renda familiar").fill("1.234,56");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("BENEFICIARIO ALTERADO COM SUCESSO");

  await page.reload();
  await page.getByLabel("Município").fill("CAMPINAS");
  await page.getByRole("button", { name: "Gravar" }).click();
  await expect(resultado).toContainText("BENEFICIARIO ALTERADO COM SUCESSO");

  await page.reload();
  await expect(page.getByLabel("Município")).toHaveValue("CAMPINAS");
  await expect(page.getByLabel("CEP")).toHaveValue("01310-100");
  await expect(page.getByLabel("Endereço")).toHaveValue("AV PAULISTA, 1000");
  await expect(page.getByLabel("Renda familiar")).toHaveValue("1.234,56");
  await expect(page.getByLabel("Situação")).toHaveValue("I");
});
