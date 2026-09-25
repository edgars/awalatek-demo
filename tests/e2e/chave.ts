import { expect, type Page } from "@playwright/test";
import { FORMATO_CHAVE_PUBLICA } from "@/domain/chavePublica";
import { createPrismaClient } from "@/server/db";

// H2 (LGPD): as URLs identificam o beneficiário pela chave opaca (`chavePublica`),
// nunca pelo CPF. Utilitários comuns dos specs que navegam para essas telas.

/** Chave opaca bem formada que não pertence a nenhum beneficiário. */
export const CHAVE_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

/** Fonte de RegExp de uma chave opaca (UUID), derivada do formato do servidor (sem âncoras). */
export const RE_CHAVE = FORMATO_CHAVE_PUBLICA.source.replace(/^\^|\$$/g, "");

/** Chave opaca do beneficiário com esse CPF, lida da base do e2e. */
export async function chaveDe(cpf: string): Promise<string> {
  const db = createPrismaClient("file:./e2e.db");
  try {
    const b = await db.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } });
    return b.chavePublica;
  } finally {
    await db.$disconnect();
  }
}

/** A URL atual não contém o CPF (nem 11 dígitos seguidos). */
export async function esperarUrlSemCpf(page: Page, cpf: string): Promise<void> {
  await expect(page).not.toHaveURL(new RegExp(cpf));
  await expect(page).not.toHaveURL(/\d{11}/);
}

/** O HTML da página não contém o CPF completo (nem com máscara de digitação). */
export async function esperarHtmlSemCpf(page: Page, cpf: string): Promise<void> {
  const html = await page.content();
  expect(html).not.toContain(cpf);
  expect(html).not.toContain(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
}

/** Busca na lista de beneficiários pelo formulário (POST): o CPF não vai para a URL. */
export async function buscarNaLista(page: Page, termo: string): Promise<void> {
  await page.goto("/beneficiarios");
  await page.getByLabel("Buscar por CPF ou nome").fill(termo);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/beneficiarios\?(benef|q)=/);
}
