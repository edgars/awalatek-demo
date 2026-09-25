import { expect, type Page } from "@playwright/test";
import { createPrismaClient } from "@/server/db";

// H2 (LGPD): as URLs identificam o beneficiário pela chave opaca (`chavePublica`),
// nunca pelo CPF. Utilitários comuns dos specs que navegam para essas telas.

/** Chave opaca bem formada que não pertence a nenhum beneficiário. */
export const CHAVE_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

/** Fonte de RegExp de uma chave opaca (UUID). */
export const RE_CHAVE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

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
  expect(page.url()).not.toContain(cpf);
  expect(page.url()).not.toMatch(/\d{11}/);
}

/** Busca na lista de beneficiários pelo formulário (POST): o CPF não vai para a URL. */
export async function buscarNaLista(page: Page, termo: string): Promise<void> {
  await page.goto("/beneficiarios");
  await page.getByLabel("Buscar por CPF ou nome").fill(termo);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/beneficiarios\?(benef|q)=/);
}
