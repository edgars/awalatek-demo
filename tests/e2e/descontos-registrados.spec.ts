import { expect, test } from "@playwright/test";

// Story 2.5 contra a base dedicada do e2e (seed: JOSE CARLOS PEREIRA, CPF 123.456.780-62, sem descontos).

test.describe.configure({ mode: "serial" });

const URL_JOSE = "/beneficiarios/12345678062/descontos";

test("gravar dois descontos, recarregar e ver vigência", async ({ page }) => {
  await page.goto("/beneficiarios?q=jose");
  await page.getByRole("link", { name: "Descontos JOSE CARLOS PEREIRA" }).click();
  await expect(page).toHaveURL(new RegExp(`${URL_JOSE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Descontos do beneficiário" })).toBeVisible();
  // LGPD: CPF mascarado no cabeçalho.
  await expect(page.getByText("***.***.780-62")).toBeVisible();
  await expect(page.getByText("Nenhum desconto registrado.")).toBeVisible();

  await page.getByRole("button", { name: "Adicionar desconto" }).click();
  await page.getByRole("button", { name: "Adicionar desconto" }).click();

  await page.getByLabel("Tipo (desconto 1)").selectOption("J");
  await page.getByLabel("Valor (desconto 1)").fill("25,00");
  await page.getByLabel("Início (desconto 1)").fill("2020-01-01");
  await page.getByLabel("Nº processo (desconto 1)").fill("123");

  await page.getByLabel("Tipo (desconto 2)").selectOption("S");
  await page.getByLabel("Início (desconto 2)").fill("2020-01-01");
  await page.getByLabel("Fim (desconto 2)").fill("2021-12-31");

  await page.getByRole("button", { name: "Gravar descontos" }).click();
  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("Descontos gravados (2).");
  await expect(page.getByTestId("desconto-1")).toContainText("Vigente hoje");
  await expect(page.getByTestId("desconto-2")).toContainText("Não vigente");

  await page.reload();
  await expect(page.getByLabel("Tipo (desconto 1)")).toHaveValue("J");
  await expect(page.getByLabel("Valor (desconto 1)")).toHaveValue("25,00");
  await expect(page.getByLabel("Nº processo (desconto 1)")).toHaveValue("123");
  await expect(page.getByLabel("Início (desconto 1)")).toHaveValue("2020-01-01");
  await expect(page.getByLabel("Fim (desconto 1)")).toHaveValue("");
  await expect(page.getByLabel("Tipo (desconto 2)")).toHaveValue("S");
  await expect(page.getByLabel("Fim (desconto 2)")).toHaveValue("2021-12-31");
  await expect(page.getByTestId("desconto-1")).toContainText("Vigente hoje");
  await expect(page.getByTestId("desconto-2")).toContainText("Não vigente");
});

test("J sem nº do processo → erro na fila, nada gravado", async ({ page }) => {
  await page.goto(URL_JOSE);
  await page.getByLabel("Nº processo (desconto 1)").fill("");
  await page.getByRole("button", { name: "Gravar descontos" }).click();

  const resultado = page.getByTestId("resultado-legado");
  await expect(resultado).toContainText("Desconto 1 — Nº processo: obrigatório para desconto judicial (J)");
  await expect(page.getByLabel("Nº processo (desconto 1)")).toHaveAttribute("aria-invalid", "true");

  await page.reload();
  await expect(page.getByLabel("Nº processo (desconto 1)")).toHaveValue("123");
});

test("beneficiário inexistente → BENEFICIARIO NAO ENCONTRADO", async ({ page }) => {
  await page.goto("/beneficiarios/15975348625/descontos");
  await expect(page.getByTestId("resultado-legado")).toContainText("BENEFICIARIO NAO ENCONTRADO");
});
