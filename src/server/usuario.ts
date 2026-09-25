// Usuário operativo das gravações (somente servidor: lê `process.env`). Módulo único,
// antes duplicado em cada caso de uso. Os componentes cliente não devem importá-lo
// (o pacote `server-only` não está instalado; o teste de falhas verifica essa regra).

/** Usuário operativo (`SIFAP_USER`, 8 posições). Ausente → erro (tratado como falha inesperada). */
export function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}
