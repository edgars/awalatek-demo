import { expect, test } from "@playwright/test";
import { RE_CHAVE, esperarHtmlSemCpf, esperarUrlSemCpf } from "./chave";

const CPF_LUCIA = "45678901320";

// Story 2.6 contra a base dedicada do e2e (seed sem pagamentos).
// MARIA (CPF 012.345.678-90, NIS 10000000001) pode receber pagamentos do e2e de cálculo
// em paralelo, por isso o histórico vazio é verificado com LUCIA (sem cálculo no e2e).

test("menu Consulta → busca por CPF: ficha com CPF mascarado (D7) e situação", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Consulta" }).click();
  await expect(page).toHaveURL(/\/consulta$/);
  await expect(page.getByRole("heading", { level: 1, name: "Consulta de beneficiário" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "CPF" })).toBeChecked();

  await page.getByLabel("CPF do beneficiário").fill("01234567890");
  await page.getByRole("button", { name: "Consultar" }).click();

  await expect(page.getByTestId("cpf-mascarado")).toHaveText("012.***.***-**");
  const ficha = page.getByRole("definition");
  await expect(ficha.filter({ hasText: "MARIA APARECIDA DA SILVA" })).toBeVisible();
  await expect(page.getByTestId("situacao")).toHaveText("A - ATIVO");
  await expect(ficha.filter({ hasText: "10000000001" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de pagamentos (últimos 12)" })).toBeVisible();
});

test("busca por NIS → mesma ficha", async ({ page }) => {
  await page.goto("/consulta");
  await page.getByRole("radio", { name: "NIS" }).check();
  await page.getByLabel("NIS do beneficiário").fill("10000000003");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("definition").filter({ hasText: "ANA PAULA SOUZA" })).toBeVisible();
  await expect(page.getByTestId("situacao")).toHaveText("C - CANCELADO");
});

test("CPF inexistente → BENEFICIARIO NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/consulta");
  await page.getByLabel("CPF do beneficiário").fill("52998224725");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
  await expect(page.getByTestId("cpf-mascarado")).toHaveCount(0);
});

test("lista → Consultar: beneficiário sem pagamentos → NENHUM PAGAMENTO ENCONTRADO", async ({ page }) => {
  await page.goto("/beneficiarios?q=LUCIA");
  const link = page.getByRole("link", { name: "Consultar LUCIA HELENA OLIVEIRA" });
  await expect(link).not.toContainText(/\d{3}/);
  await link.click();
  // H2: a URL leva a chave opaca, nunca o CPF.
  await expect(page).toHaveURL(new RegExp(`/consulta\\?benef=${RE_CHAVE}$`));
  await esperarUrlSemCpf(page, CPF_LUCIA);
  // LGPD: campo vazio; aviso só com a máscara da própria ficha; o CPF completo não está no HTML.
  await expect(page.getByLabel("CPF do beneficiário")).toHaveValue("");
  await expect(page.getByTestId("filtro-beneficiario")).toContainText("Filtrando por:");
  await esperarHtmlSemCpf(page, CPF_LUCIA);
  await expect(page.getByRole("definition").filter({ hasText: "LUCIA HELENA OLIVEIRA" })).toBeVisible();
  await expect(page.getByTestId("cpf-mascarado")).toHaveText(/^\*\*\*\.\*\*\*\.\d{3}-\d{2}$/);
  await expect(page.getByTestId("situacao")).toHaveText("D - DESLIGADO");
  await expect(page.getByTestId("resultado-legado")).toContainText("NENHUM PAGAMENTO ENCONTRADO");

  // Busca manual depois de chegar por ?benef=: a URL volta a /consulta e o resultado permanece.
  await page.getByLabel("CPF do beneficiário").fill("01234567890");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByTestId("cpf-mascarado")).toHaveText("012.***.***-**");
  await expect(page).toHaveURL(/\/consulta$/);
  await expect(page.getByTestId("cpf-mascarado")).toHaveText("012.***.***-**");
  await expect(page.getByTestId("filtro-beneficiario")).toHaveCount(0);

  // Trocar CPF/NIS limpa o painel.
  await page.getByRole("radio", { name: "NIS" }).check();
  await expect(page.getByTestId("cpf-mascarado")).toHaveCount(0);
});
