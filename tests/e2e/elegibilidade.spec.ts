import { expect, test } from "@playwright/test";

// Story 3.1 contra a base dedicada do e2e (seed):
// MARIA 012.345.678-90 (A, 1985) · JOSE 123.456.780-62 (S, 1970, sem NIS) · FRANCISCO 345.678.902-56 (região 99, I).

const CPF_MARIA = "01234567890";

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
  await page.getByLabel("CPF do beneficiário").fill("12345678062");
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
