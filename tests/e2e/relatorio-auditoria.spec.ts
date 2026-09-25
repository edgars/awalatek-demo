import { expect, test, type Page } from "@playwright/test";
import type { PrismaClient } from "@/generated/prisma/client";
import { registrarEvento, type EventoAuditoria } from "@/server/auditoria";
import { createPrismaClient } from "@/server/db";

// Story 7.3 — relatório de auditoria (RELAUDIT, somente leitura).
// Outros specs gravam auditoria na mesma base em paralelo: este usa só os usuários
// E2EAUD / E2EAUDX e datas de 1995, e filtra por eles nas asserções.
// Os eventos são gravados só pelo escritor único (`registrarEvento`), com o momento de 1995
// informado pelo chamador.

test.describe.configure({ mode: "serial" });

const USUARIOS = ["E2EAUD", "E2EAUDX"];
const NOSSOS = { usrEvento: { in: USUARIOS } };
const PERIODO_1995 = "dtIni=19950101&dtFim=19951231";

let db: PrismaClient;

async function evento(dt: number, hr: number, e: Partial<EventoAuditoria>) {
  await registrarEvento({ acao: "CN", tabela: "BENEFICIARIO", chave: "01234567890", usuario: "E2EAUD", descricao: "E2E CONSULTA", ...e, momento: { data: dt, hora: hr } }, db);
}

test.beforeAll(async () => {
  db = createPrismaClient("file:./e2e.db");
  await db.auditoria.deleteMany({ where: NOSSOS });
  await evento(19950310, 90503, { acao: "IN", chave: "E2E-IN", descricao: "E2E INCLUSAO DE BENEFICIARIO" });
  await evento(19950311, 100000, { acao: "CO", tabela: "PAGAMENTO", chave: "E2E-CO", descricao: "E2E CONCILIADO" });
  await evento(19950312, 100000, { acao: "DV", tabela: "PAGAMENTO", chave: "E2E-DV", descricao: "E2E DIVERGENCIA" });
  await evento(19950313, 100000, { acao: "EX", chave: "E2E-EX", descricao: "E2E EXCLUSAO" });
  await evento(19950314, 100000, { acao: "AL", usuario: "E2EAUDX", chave: "E2E-AL", descricao: "E2E ALTERACAO" });
  for (let i = 0; i < 56; i++) await evento(19950320, 120000 + i, { chave: `E2E-CN-${i}` });
});

test.afterAll(async () => {
  await db?.auditoria.deleteMany({ where: NOSSOS });
  await db?.$disconnect();
});

const tabela = (page: Page) => page.getByRole("table", { name: "Relatório de auditoria" });
const resumo = (page: Page) => page.getByTestId("resumo-auditoria");

test("menu Relatórios → Auditoria; defaults 01/01/1997 a hoje, saída T", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const grupo = menu.locator("div").filter({ has: page.getByRole("heading", { name: "Relatórios" }) });
  await grupo.getByRole("link", { name: "Auditoria" }).click();
  await expect(page).toHaveURL(/\/relatorios\/auditoria$/);
  await expect(page.getByRole("heading", { level: 1, name: "Relatório de auditoria" })).toBeVisible();
  await expect(grupo.getByRole("link", { name: "Auditoria" })).toHaveAttribute("aria-current", "page");

  await expect(page.getByLabel("Data inicial")).toHaveValue("1997-01-01");
  await expect(page.getByLabel("Data final")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel("Ação", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Saída")).toHaveValue("T");
  await expect(page.getByText(/SIFAP - TRILHA DE AUDITORIA · PERIODO: 19970101 A \d{8}/)).toBeVisible();
  await expect(resumo(page)).toContainText("RESUMO AUDITORIA");
  // Os eventos de 1995 ficam fora do período padrão.
  await expect(page.getByRole("cell", { name: "E2EAUD", exact: true })).toHaveCount(0);
});

test("período de 1995: EX oculto, resumo por ação e paginação 54 + 6", async ({ page }) => {
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}`);
  await expect(page.getByText("60 eventos · página 1 de 2")).toBeVisible();
  await expect(tabela(page).getByRole("row")).toHaveCount(55); // cabeçalho + 54
  const primeira = tabela(page).getByRole("row").nth(1);
  await expect(primeira).toContainText("10/03/1995");
  await expect(primeira).toContainText("09:05:03");
  await expect(primeira).toContainText("E2EAUD");
  await expect(primeira).toContainText("INCLUSAO");
  await expect(primeira).toContainText("BENEFICIARIO");
  await expect(primeira).toContainText("E2E-IN");
  await expect(page.getByRole("columnheader", { name: "Descrição" })).toHaveCount(0);
  await expect(page.getByText("E2E-EX")).toHaveCount(0);

  const r = resumo(page);
  await expect(r).toContainText("TOTAL REGISTROS....:61");
  await expect(r).toContainText("EXIBIDOS...........:60");
  await expect(r).toContainText("FILTRADOS..........:1");
  await expect(r).toContainText("INCLUSOES........:1");
  await expect(r).toContainText("ALTERACOES.......:1");
  await expect(r).toContainText("CONSULTAS........:56");
  await expect(r).toContainText("CONCILIACOES.....:1");
  await expect(r).toContainText("DIVERGENCIAS.....:1");
  await expect(r).toContainText("OUTRAS...........:0");

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByText("60 eventos · página 2 de 2")).toBeVisible();
  await expect(tabela(page).getByRole("row")).toHaveCount(7); // cabeçalho + 6
});

test("filtros pelo formulário: ação IN + usuário E2EAUD", async ({ page }) => {
  await page.goto("/relatorios/auditoria");
  await page.getByLabel("Data inicial").fill("1995-01-01");
  await page.getByLabel("Data final").fill("1995-12-31");
  await page.getByLabel("Ação", { exact: true }).selectOption("IN");
  await page.getByLabel("Usuário").fill("E2EAUD");
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page).toHaveURL(/dtIni=19950101.*dtFim=19951231.*acao=IN.*usuario=E2EAUD/);
  await expect(tabela(page).getByRole("row")).toHaveCount(2);
  await expect(tabela(page).getByRole("row").nth(1)).toContainText("INCLUSAO");
  await expect(resumo(page)).toContainText("EXIBIDOS...........:1");
  await expect(resumo(page)).toContainText("FILTRADOS..........:60");
  await expect(page.getByLabel("Ação", { exact: true })).toHaveValue("IN");
  await expect(page.getByLabel("Usuário")).toHaveValue("E2EAUD");

  // Usuário por igualdade: E2EAUDX não casa com E2EAUD, e vice-versa.
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&usuario=E2EAUDX`);
  await expect(tabela(page).getByRole("row")).toHaveCount(2);
  await expect(tabela(page).getByRole("row").nth(1)).toContainText("ALTERACAO");

  // Tabela + ação CO.
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&acao=CO&tabela=PAGAMENTO`);
  await expect(tabela(page).getByRole("row")).toHaveCount(2);
  await expect(tabela(page).getByRole("row").nth(1)).toContainText("CONCILIACAO");
});

test("saída I: coluna descrição e versão para impressão com o cabeçalho literal", async ({ page }) => {
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&acao=DV`);
  await page.getByLabel("Saída").selectOption("I");
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page).toHaveURL(/saida=I/);
  await expect(page.getByRole("columnheader", { name: "Descrição" })).toBeVisible();
  await expect(tabela(page).getByRole("row").nth(1)).toContainText("E2E DIVERGENCIA");

  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&saida=I`);
  await page.getByRole("link", { name: "Versão para impressão" }).click();
  await expect(page).toHaveURL(/impressao=1/);
  const versao = page.getByTestId("versao-impressao");
  const cabecalhos = versao.getByTestId("cabecalho-relatorio");
  await expect(cabecalhos).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect(cabecalhos.nth(i)).toContainText("SIFAP - TRILHA DE AUDITORIA");
    await expect(cabecalhos.nth(i)).toContainText(`PAG: ${i + 1}`);
    await expect(cabecalhos.nth(i)).toContainText("PERIODO: 19950101 A 19951231");
    await expect(cabecalhos.nth(i)).toContainText(/DATA: \d{8}/);
    await expect(cabecalhos.nth(i)).toContainText("DESCRICAO");
    // IMPRIME-CAB-AUDIT: linha de guiões antes e depois dos títulos (saída I: 120).
    await expect(cabecalhos.nth(i).locator("p", { hasText: /^-{120}$/ })).toHaveCount(2);
  }
  // O resumo vem depois da última folha, fora do contêiner das folhas (não sai sozinho numa página extra).
  await expect(versao.getByTestId("folhas-relatorio").locator("section.folha-relatorio")).toHaveCount(2);
  await expect(versao.getByTestId("folhas-relatorio").getByTestId("resumo-auditoria")).toHaveCount(0);
  await expect(versao.getByTestId("resumo-auditoria")).toContainText("EXIBIDOS...........:60");

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Voltar ao relatório" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

test("filtros preservados nos links gerados; página além do fim; Limpar volta aos defaults", async ({ page }) => {
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&acao=CN&saida=I`);
  await expect(resumo(page)).toContainText("EXIBIDOS...........:56");
  // Na tela, o botão da versão imprimível e a paginação não saem na impressão.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("link", { name: "Versão para impressão" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Paginação" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("link", { name: "Versão para impressão" }).click();
  await expect(page).toHaveURL(/impressao=1/);
  await expect(page).toHaveURL(/acao=CN/);
  await expect(page).toHaveURL(/saida=I/);
  await expect(page.getByTestId("versao-impressao").getByTestId("resumo-auditoria")).toContainText("EXIBIDOS...........:56");
  await page.getByRole("link", { name: "Voltar ao relatório" }).click();
  await expect(page).not.toHaveURL(/impressao=1/);
  await expect(page).toHaveURL(/acao=CN/);
  await expect(page.getByLabel("Ação", { exact: true })).toHaveValue("CN");

  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&pagina=99`);
  await expect(page.getByText("60 eventos · página 2 de 2")).toBeVisible();
  await expect(tabela(page).getByRole("row")).toHaveCount(7);

  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&acao=IN&usuario=E2EAUD&tabela=BENEFICIARIO`);
  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/relatorios\/auditoria$/);
  await expect(page.getByLabel("Data inicial")).toHaveValue("1997-01-01");
  await expect(page.getByLabel("Ação", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Usuário")).toHaveValue("");
  await expect(page.getByLabel("Tabela")).toHaveValue("");
  await expect(page.getByLabel("Saída")).toHaveValue("T");
});

test("usuário e tabela em minúsculas casam com os valores gravados", async ({ page }) => {
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&usuario=e2eaudx&tabela=beneficiario`);
  await expect(tabela(page).getByRole("row")).toHaveCount(2);
  await expect(tabela(page).getByRole("row").nth(1)).toContainText("ALTERACAO");
  await expect(page.getByLabel("Usuário")).toHaveValue("E2EAUDX");
});

test("validação: período invertido e ação inválida", async ({ page }) => {
  await page.goto("/relatorios/auditoria?dtIni=19951231&dtFim=19950101");
  await expect(page.getByText("Data inicial maior que a final.")).toBeVisible();
  await expect(resumo(page)).toHaveCount(0);

  await page.goto(`/relatorios/auditoria?${PERIODO_1995}&acao=EX`);
  await expect(page.getByText("Ação inválida.")).toBeVisible();
  await expect(resumo(page)).toHaveCount(0);
  // O valor enviado volta ao campo, ao lado do erro.
  await expect(page.getByLabel("Ação", { exact: true })).toHaveValue("EX");

  await page.goto("/relatorios/auditoria?dtIni=19950231&dtFim=19951231&usuario=ABCDEFGHIJ");
  await expect(page.getByText("Data inválida.")).toBeVisible();
  await expect(page.getByText("Informado: 19950231")).toBeVisible();
  await expect(page.getByText("Usuário inválido (máximo 8 caracteres).")).toBeVisible();
  await expect(page.getByLabel("Usuário")).toHaveValue("ABCDEFGHIJ");
  await expect(page.getByLabel("Data final")).toHaveValue("1995-12-31");
  await expect(resumo(page)).toHaveCount(0);
});

test("somente leitura: nenhum formulário de escrita nem Server Action", async ({ page }) => {
  await page.goto(`/relatorios/auditoria?${PERIODO_1995}`);
  await expect(resumo(page)).toBeVisible();
  await expect(page.locator('form:not([method="get"])')).toHaveCount(0);
  await expect(page.locator('input[name^="$ACTION"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /excluir|editar|incluir|salvar/i })).toHaveCount(0);
  const antes = await db.auditoria.findMany({ where: NOSSOS, orderBy: { numAuditoria: "asc" } });
  const r = await page.request.post("/relatorios/auditoria", { headers: { "Next-Action": "0000000000000000000000000000000000000000" }, data: "[]" });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(await db.auditoria.findMany({ where: NOSSOS, orderBy: { numAuditoria: "asc" } })).toEqual(antes);
});
