import { expect, test, type Page } from "@playwright/test";
import { CHAVE_INEXISTENTE, RE_CHAVE, buscarNaLista, chaveDe, esperarUrlSemCpf } from "./chave";

// Story 2.4 contra a base dedicada do e2e (seed: JOSE CARLOS PEREIRA, situação S, sem
// dependentes; ANA PAULA SOUZA, situação C).

test.describe.configure({ mode: "serial" });

const CPF_JOSE = "12345678062";
const CPF_ANA_CANCELADA = "23456789173";

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
  await expect(page.getByLabel("Buscar por CPF ou nome")).toHaveValue("123.456.780-62");
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
  // Seed: MARIA APARECIDA DA SILVA, situação A, 1 dependente.
  await page.goto(`/beneficiarios/${await chaveDe("01234567890")}/dependentes`);
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

test("titular inexistente: mensagem literal", async ({ page }) => {
  await page.goto(`/beneficiarios/${CHAVE_INEXISTENTE}/dependentes`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
  // H2: a rota não aceita mais o CPF (nem de um titular existente).
  await page.goto(`/beneficiarios/${CPF_JOSE}/dependentes`);
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
});
